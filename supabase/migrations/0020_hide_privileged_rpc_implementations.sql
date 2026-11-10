-- Keep the public Data API signatures stable while moving the privileged
-- implementations out of the exposed public schema. The public wrappers run
-- with caller privileges and can reach only the narrowly granted private
-- implementation that backs that specific workflow.

CREATE OR REPLACE FUNCTION private.provision_salon_internal(
    p_salon_name text,
    p_slug text,
    p_time_zone text,
    p_owner_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    caller uuid := auth.uid();
    caller_email text := NULLIF(btrim(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'), '');
    salon_name text := btrim(COALESCE(p_salon_name, ''));
    owner_name text := btrim(COALESCE(p_owner_name, ''));
    new_business_id uuid;
BEGIN
    IF caller IS NULL THEN
        RAISE EXCEPTION 'A signed-in user is required' USING ERRCODE = 'PW010';
    END IF;
    IF EXISTS (SELECT 1 FROM public.staff_members WHERE auth_user_id = caller) THEN
        RAISE EXCEPTION 'This account already belongs to a salon' USING ERRCODE = 'PW011';
    END IF;
    IF caller_email IS NULL OR length(caller_email) > 320
        OR length(salon_name) NOT BETWEEN 2 AND 120
        OR length(owner_name) NOT BETWEEN 1 AND 120
        OR p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_slug) NOT BETWEEN 3 AND 60
        OR p_time_zone IS NULL
        OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_time_zone) THEN
        RAISE EXCEPTION 'Salon name, web address, owner name, or time zone is invalid'
            USING ERRCODE = 'PW012';
    END IF;

    INSERT INTO public.businesses (name, slug, owner_email, subscription_status)
    VALUES (salon_name, p_slug, caller_email, 'trialing')
    RETURNING id INTO new_business_id;

    INSERT INTO public.business_configs (business_id) VALUES (new_business_id);
    UPDATE public.business_configs
    SET custom_settings = custom_settings || jsonb_build_object('time_zone', p_time_zone)
    WHERE business_id = new_business_id;

    INSERT INTO public.staff_members (business_id, auth_user_id, name, email, role, is_active)
    VALUES (new_business_id, caller, owner_name, caller_email, 'owner', true);

    RETURN new_business_id;
END;
$$;
REVOKE ALL ON FUNCTION private.provision_salon_internal(text, text, text, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.provision_salon_internal(text, text, text, text)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.provision_salon(
    p_salon_name text,
    p_slug text,
    p_time_zone text,
    p_owner_name text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT private.provision_salon_internal(p_salon_name, p_slug, p_time_zone, p_owner_name);
$$;
REVOKE ALL ON FUNCTION public.provision_salon(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_salon(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.public_booking_slots_internal(
    p_slug text,
    p_package_id text,
    p_date date
)
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
REVOKE ALL ON FUNCTION private.public_booking_slots_internal(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.public_booking_slots_internal(text, text, date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_booking_slots(p_slug text, p_package_id text, p_date date)
RETURNS TABLE (slot_start timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT * FROM private.public_booking_slots_internal(p_slug, p_package_id, p_date);
$$;
REVOKE ALL ON FUNCTION public.public_booking_slots(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_booking_slots(text, text, date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION private.public_book_appointment_internal(
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
REVOKE ALL ON FUNCTION private.public_book_appointment_internal(text, text, timestamptz, text, text, text, text, text)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.public_book_appointment_internal(text, text, timestamptz, text, text, text, text, text)
    TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_book_appointment(
    p_slug text, p_package_id text, p_start timestamptz,
    p_client_name text, p_client_phone text, p_client_email text,
    p_pet_name text, p_breed text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT private.public_book_appointment_internal(
        p_slug, p_package_id, p_start, p_client_name, p_client_phone,
        p_client_email, p_pet_name, p_breed);
$$;
REVOKE ALL ON FUNCTION public.public_book_appointment(text, text, timestamptz, text, text, text, text, text)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_book_appointment(text, text, timestamptz, text, text, text, text, text)
    TO anon, authenticated;

-- The event ledger is intentionally inaccessible to client roles. Explicit
-- deny policies keep that contract visible to reviewers and database advisors;
-- the service-role webhook function remains the only writer.
CREATE POLICY stripe_webhook_events_no_client_read
ON public.stripe_webhook_events FOR SELECT
TO anon, authenticated
USING (false);

CREATE POLICY stripe_webhook_events_no_client_insert
ON public.stripe_webhook_events FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY stripe_webhook_events_no_client_update
ON public.stripe_webhook_events FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY stripe_webhook_events_no_client_delete
ON public.stripe_webhook_events FOR DELETE
TO anon, authenticated
USING (false);
