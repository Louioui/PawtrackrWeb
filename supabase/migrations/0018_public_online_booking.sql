-- Public online booking. Pet parents are anonymous, so they get no table
-- access at all. They can call exactly two functions, both keyed by the
-- salon's public slug, and neither returns another customer's data or which
-- groomer is busy.
--
-- Availability and booking both go through private.salon_schedule and
-- private.visit_window_error (migration 0016), and the insert is still checked
-- by the availability trigger and the overlap exclusion constraint, so an
-- online booking can never land where a staff booking could not.
--
-- Abuse limits enforced here (the API adds a per-address rate limit on top):
--   * start must be at least 60 minutes ahead and within 90 days
--   * one phone number may hold at most 4 upcoming online bookings per salon
--   * a salon accepts at most 60 online bookings per rolling hour
--
-- SQLSTATEs: PW020 salon or service not bookable online, PW021 invalid
-- details, PW022 slot no longer available, PW023 booking limit reached.

CREATE INDEX IF NOT EXISTS visits_business_schedule_idx
    ON public.visits (business_id, scheduled_time);

-- Resolves a slug and service to what booking needs. Raises PW020 unless the
-- salon is active and the service is fully configured.
CREATE OR REPLACE FUNCTION private.online_booking_context(
    p_slug text, p_package_id text,
    OUT business_id uuid, OUT service_name text, OUT duration_minutes integer,
    OUT price numeric, OUT zone text, OUT open_clock text, OUT close_clock text,
    OUT buffer_minutes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    service jsonb;
    schedule record;
BEGIN
    SELECT b.id INTO business_id
    FROM public.businesses b
    WHERE b.slug = p_slug AND b.subscription_status IN ('active', 'trialing');

    IF business_id IS NOT NULL THEN
        SELECT item INTO service
        FROM public.business_configs c,
             jsonb_array_elements(
                 CASE WHEN jsonb_typeof(c.custom_settings -> 'packages') = 'array'
                      THEN c.custom_settings -> 'packages' ELSE '[]'::jsonb END) AS item
        WHERE c.business_id = online_booking_context.business_id
          AND c.currency = 'USD'
          AND item ->> 'id' = p_package_id
        LIMIT 1;
    END IF;

    IF service IS NULL
        OR jsonb_typeof(service -> 'name') IS DISTINCT FROM 'string' OR btrim(service ->> 'name') = ''
        OR jsonb_typeof(service -> 'durationMinutes') IS DISTINCT FROM 'number'
        OR (service ->> 'durationMinutes') !~ '^[0-9]{1,4}$'
        OR (service ->> 'durationMinutes')::integer NOT BETWEEN 1 AND 1440
        OR jsonb_typeof(service -> 'price') IS DISTINCT FROM 'number'
        OR (service ->> 'price') !~ '^[0-9]{1,5}(\.[0-9]{1,2})?$' THEN
        RAISE EXCEPTION 'This salon or service is not available for online booking'
            USING ERRCODE = 'PW020';
    END IF;

    BEGIN
        SELECT * INTO schedule FROM private.salon_schedule(business_id);
    EXCEPTION WHEN SQLSTATE 'PW003' THEN
        RAISE EXCEPTION 'This salon or service is not available for online booking'
            USING ERRCODE = 'PW020';
    END;
    IF schedule.buffer_minutes IS NULL THEN
        RAISE EXCEPTION 'This salon or service is not available for online booking'
            USING ERRCODE = 'PW020';
    END IF;

    service_name := btrim(service ->> 'name');
    duration_minutes := (service ->> 'durationMinutes')::integer;
    price := (service ->> 'price')::numeric(10,2);
    zone := schedule.zone;
    open_clock := schedule.open_clock;
    close_clock := schedule.close_clock;
    buffer_minutes := schedule.buffer_minutes;
END;
$$;
REVOKE ALL ON FUNCTION private.online_booking_context(text, text) FROM PUBLIC, anon, authenticated;

-- True when the groomer has no active reservation overlapping [p_start, p_end)
-- and the window passes salon hours and that groomer's shifts.
CREATE OR REPLACE FUNCTION private.groomer_is_free(
    p_business_id uuid, p_staff_id uuid, p_zone text, p_open text, p_close text,
    p_start timestamptz, p_end timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT private.visit_window_error(p_business_id, p_staff_id, p_zone, p_open, p_close, p_start, p_end) IS NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.visits v
           WHERE v.business_id = p_business_id
             AND v.staff_id = p_staff_id
             AND v.status IN ('booked', 'dropped_off', 'bathing', 'styling', 'ready')
             AND tstzrange(v.scheduled_time, v.reservation_end, '[)') && tstzrange(p_start, p_end, '[)')
       );
$$;
REVOKE ALL ON FUNCTION private.groomer_is_free(uuid, uuid, text, text, text, timestamptz, timestamptz)
    FROM PUBLIC, anon, authenticated;

-- Open start times for one service on one salon-local date, on a 30-minute
-- grid. A time is listed when at least one active groomer can take it.
CREATE OR REPLACE FUNCTION public.public_booking_slots(p_slug text, p_package_id text, p_date date)
RETURNS TABLE (slot_start timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    ctx record;
    candidate timestamptz;
    candidate_end timestamptz;
    minute_of_day integer;
    close_minute integer;
BEGIN
    IF p_slug IS NULL OR p_package_id IS NULL OR p_date IS NULL
        OR p_date < (now() - interval '1 day')::date OR p_date > (now() + interval '91 days')::date THEN
        RETURN;
    END IF;
    SELECT * INTO ctx FROM private.online_booking_context(p_slug, p_package_id);

    minute_of_day := split_part(ctx.open_clock, ':', 1)::integer * 60 + split_part(ctx.open_clock, ':', 2)::integer;
    minute_of_day := ((minute_of_day + 29) / 30) * 30;
    close_minute := split_part(ctx.close_clock, ':', 1)::integer * 60 + split_part(ctx.close_clock, ':', 2)::integer;

    WHILE minute_of_day + ctx.duration_minutes + ctx.buffer_minutes <= close_minute LOOP
        candidate := private.salon_local_instant(
            p_date,
            lpad((minute_of_day / 60)::text, 2, '0') || ':' || lpad((minute_of_day % 60)::text, 2, '0'),
            ctx.zone);
        IF candidate IS NOT NULL
            AND candidate >= now() + interval '60 minutes'
            AND candidate <= now() + interval '90 days' THEN
            candidate_end := candidate + (ctx.duration_minutes + ctx.buffer_minutes) * interval '1 minute';
            IF EXISTS (
                SELECT 1 FROM public.staff_members s
                WHERE s.business_id = ctx.business_id AND s.role = 'groomer' AND s.is_active
                  AND private.groomer_is_free(ctx.business_id, s.id, ctx.zone, ctx.open_clock,
                                              ctx.close_clock, candidate, candidate_end)
            ) THEN
                slot_start := candidate;
                RETURN NEXT;
            END IF;
        END IF;
        minute_of_day := minute_of_day + 30;
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.public_booking_slots(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_booking_slots(text, text, date) TO anon, authenticated;

-- Books one pet into one open slot and returns a confirmation. The groomer is
-- chosen here (fewest reservations that local day, then stable order); the
-- caller never picks or learns who.
--
-- A returning customer is recognised only when phone digits AND name both
-- match an existing client, so a stranger who knows a phone number cannot
-- attach a pet to someone else's record. Nothing about an existing client is
-- returned either way.
CREATE OR REPLACE FUNCTION public.public_book_appointment(
    p_slug text, p_package_id text, p_start timestamptz,
    p_client_name text, p_client_phone text, p_client_email text,
    p_pet_name text, p_breed text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    ctx record;
    client_name text := btrim(COALESCE(p_client_name, ''));
    phone_digits text := regexp_replace(COALESCE(p_client_phone, ''), '[^0-9]', '', 'g');
    client_email text := NULLIF(lower(btrim(COALESCE(p_client_email, ''))), '');
    pet_name text := btrim(COALESCE(p_pet_name, ''));
    breed text := btrim(COALESCE(p_breed, ''));
    visit_end timestamptz;
    local_day date;
    groomer uuid;
    target_client uuid;
    target_pet uuid;
    new_visit uuid;
BEGIN
    IF p_slug IS NULL OR p_package_id IS NULL OR p_start IS NULL THEN
        RAISE EXCEPTION 'Booking details are incomplete' USING ERRCODE = 'PW021';
    END IF;
    SELECT * INTO ctx FROM private.online_booking_context(p_slug, p_package_id);

    IF length(client_name) NOT BETWEEN 2 AND 120
        OR length(phone_digits) NOT BETWEEN 10 AND 15
        OR (client_email IS NOT NULL AND (length(client_email) > 320 OR client_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
        OR length(pet_name) NOT BETWEEN 1 AND 80
        OR length(breed) NOT BETWEEN 1 AND 80
        OR date_trunc('minute', p_start) <> p_start THEN
        RAISE EXCEPTION 'Name, phone, email, pet, or time is invalid' USING ERRCODE = 'PW021';
    END IF;
    IF p_start < now() + interval '60 minutes' OR p_start > now() + interval '90 days' THEN
        RAISE EXCEPTION 'That time is no longer available' USING ERRCODE = 'PW022';
    END IF;

    -- Serialise online bookings per salon so the limits below cannot be raced.
    PERFORM pg_advisory_xact_lock(hashtextextended('pawtrackr-online-booking:' || ctx.business_id::text, 0));

    IF (SELECT count(*) FROM public.visits v
        WHERE v.business_id = ctx.business_id AND v.booking_source = 'online'
          AND v.created_at > now() - interval '1 hour') >= 60
       OR (SELECT count(*) FROM public.visits v
           JOIN public.clients c ON c.id = v.client_id
           WHERE v.business_id = ctx.business_id AND v.booking_source = 'online'
             AND v.status = 'booked' AND v.scheduled_time > now()
             AND regexp_replace(c.phone, '[^0-9]', '', 'g') = phone_digits) >= 4 THEN
        RAISE EXCEPTION 'The online booking limit has been reached; please contact the salon'
            USING ERRCODE = 'PW023';
    END IF;

    visit_end := p_start + (ctx.duration_minutes + ctx.buffer_minutes) * interval '1 minute';
    local_day := (p_start AT TIME ZONE ctx.zone)::date;

    SELECT s.id INTO groomer
    FROM public.staff_members s
    WHERE s.business_id = ctx.business_id AND s.role = 'groomer' AND s.is_active
      AND private.groomer_is_free(ctx.business_id, s.id, ctx.zone, ctx.open_clock, ctx.close_clock,
                                  p_start, visit_end)
    ORDER BY (SELECT count(*) FROM public.visits v
              WHERE v.business_id = ctx.business_id AND v.staff_id = s.id
                AND v.status IN ('booked', 'dropped_off', 'bathing', 'styling', 'ready')
                AND (v.scheduled_time AT TIME ZONE ctx.zone)::date = local_day),
             s.created_at, s.id
    LIMIT 1;
    IF groomer IS NULL THEN
        RAISE EXCEPTION 'That time is no longer available' USING ERRCODE = 'PW022';
    END IF;

    SELECT c.id INTO target_client
    FROM public.clients c
    WHERE c.business_id = ctx.business_id
      AND regexp_replace(c.phone, '[^0-9]', '', 'g') = phone_digits
      AND lower(btrim(c.name)) = lower(client_name)
    ORDER BY c.created_at
    LIMIT 1;
    IF target_client IS NULL THEN
        INSERT INTO public.clients (business_id, name, phone, email)
        VALUES (ctx.business_id, client_name, phone_digits, client_email)
        RETURNING id INTO target_client;
    END IF;

    SELECT p.id INTO target_pet
    FROM public.pets p
    WHERE p.business_id = ctx.business_id AND p.client_id = target_client
      AND lower(btrim(p.name)) = lower(pet_name)
    ORDER BY p.created_at
    LIMIT 1;
    IF target_pet IS NULL THEN
        INSERT INTO public.pets (business_id, client_id, name, breed)
        VALUES (ctx.business_id, target_client, pet_name, breed)
        RETURNING id INTO target_pet;
    END IF;

    BEGIN
        INSERT INTO public.visits (business_id, client_id, pet_id, staff_id, status, booking_source,
            service_package, total_amount, scheduled_time, duration_minutes, booking_buffer_minutes)
        VALUES (ctx.business_id, target_client, target_pet, groomer, 'booked', 'online',
            ctx.service_name, ctx.price, p_start, ctx.duration_minutes, ctx.buffer_minutes)
        RETURNING id INTO new_visit;
    EXCEPTION
        WHEN exclusion_violation OR SQLSTATE 'PW001' OR SQLSTATE 'PW002' THEN
            RAISE EXCEPTION 'That time is no longer available' USING ERRCODE = 'PW022';
    END;

    RETURN jsonb_build_object(
        'reference', upper(substr(replace(new_visit::text, '-', ''), 1, 8)),
        'status', 'booked',
        'service', ctx.service_name,
        'starts_at', p_start,
        'ends_at', p_start + ctx.duration_minutes * interval '1 minute',
        'time_zone', ctx.zone,
        'price', ctx.price
    );
END;
$$;
REVOKE ALL ON FUNCTION public.public_book_appointment(text, text, timestamptz, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_book_appointment(text, text, timestamptz, text, text, text, text, text)
    TO anon, authenticated;
