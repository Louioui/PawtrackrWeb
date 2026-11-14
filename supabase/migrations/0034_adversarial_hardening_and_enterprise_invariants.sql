-- ============================================================================
-- PAWTRACKR WEB: ADVERSARIAL HARDENING & ENTERPRISE DATABASE INVARIANTS
-- Migration: 0034_adversarial_hardening_and_enterprise_invariants.sql
-- Purpose:
--   1. Fix btree_gist tstzrange staff & station exclusion status-drift (SCH-01)
--      across all 12 active visit states and availability helpers.
--   2. Add btree_gist exclusion constraints on waitlist_offers for active
--      pending slot holds and prevent public booking overlap with held slots.
--   3. Fix runtime SQL crashes in private.customer_booking_lookup_internal
--      (c.custom_settings->>'time_zone') and public.advance_visit_stage
--      (pets.behavior_tags vs behavior_notes).
--   4. Remediate cross-tenant BOLA & privilege leaks on calculate_payroll_summary,
--      lock_payroll_period, expire_waitlist_offers, incident_reports RLS, and
--      all 0026-0033 SECURITY DEFINER RPCs.
--   5. Enforce negative-stock check constraints & atomic retail barcode/SKU
--      deduction RPC (deduct_retail_inventory_atomic).
--   6. Enforce split-tender integer-cent invariants, idempotent POS checkout,
--      cumulative over-refund protection, Stripe settlement visit progression,
--      progressive groomer commission tiers, and missing FK indexes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. STAFF & STATION GIST EXCLUSION + WAITLIST HOLD EXCLUSION (SCH-01)
-- ----------------------------------------------------------------------------
SET search_path = public, extensions;

ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_no_overlapping_active_staff_reservations;
ALTER TABLE public.visits
    ADD CONSTRAINT visits_no_overlapping_active_staff_reservations
    EXCLUDE USING gist (
        business_id WITH =,
        staff_id WITH =,
        tstzrange(scheduled_time, reservation_end, '[)') WITH &&
    ) WHERE (staff_id IS NOT NULL AND status IN (
        'booked',
        'confirmed',
        'dropped_off',
        'checked_in',
        'bathing',
        'drying',
        'styling',
        'quality_check',
        'ready',
        'payment_pending',
        'paused',
        'change_pending'
    ));

ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_no_overlapping_active_station_reservations;
ALTER TABLE public.visits
    ADD CONSTRAINT visits_no_overlapping_active_station_reservations
    EXCLUDE USING gist (
        business_id WITH =,
        station_id WITH =,
        tstzrange(scheduled_time, reservation_end, '[)') WITH &&
    ) WHERE (station_id IS NOT NULL AND status IN (
        'booked',
        'confirmed',
        'dropped_off',
        'checked_in',
        'bathing',
        'drying',
        'styling',
        'quality_check',
        'ready',
        'payment_pending',
        'paused',
        'change_pending'
    ));

ALTER TABLE public.waitlist_offers DROP CONSTRAINT IF EXISTS waitlist_offers_no_overlapping_pending_staff_holds;
ALTER TABLE public.waitlist_offers
    ADD CONSTRAINT waitlist_offers_no_overlapping_pending_staff_holds
    EXCLUDE USING gist (
        business_id WITH =,
        assigned_staff_id WITH =,
        tstzrange(offered_start, offered_end, '[)') WITH &&
    ) WHERE (assigned_staff_id IS NOT NULL AND status = 'pending');

ALTER TABLE public.waitlist_offers DROP CONSTRAINT IF EXISTS waitlist_offers_no_overlapping_pending_station_holds;
ALTER TABLE public.waitlist_offers
    ADD CONSTRAINT waitlist_offers_no_overlapping_pending_station_holds
    EXCLUDE USING gist (
        business_id WITH =,
        assigned_station_id WITH =,
        tstzrange(offered_start, offered_end, '[)') WITH &&
    ) WHERE (assigned_station_id IS NOT NULL AND status = 'pending');

RESET search_path;

-- Update enforce_visit_availability trigger to recognize all 12 active statuses
CREATE OR REPLACE FUNCTION private.enforce_visit_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    active_statuses constant text[] := ARRAY[
        'booked', 'confirmed', 'dropped_off', 'checked_in',
        'bathing', 'drying', 'styling', 'quality_check',
        'ready', 'payment_pending', 'paused', 'change_pending'
    ];
    schedule record;
    failure text;
BEGIN
    IF NEW.status IS NULL OR NOT (NEW.status = ANY (active_statuses)) THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
        AND OLD.status = ANY (active_statuses)
        AND NEW.business_id = OLD.business_id
        AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id
        AND NEW.scheduled_time = OLD.scheduled_time
        AND NEW.duration_minutes = OLD.duration_minutes
        AND NEW.booking_buffer_minutes = OLD.booking_buffer_minutes THEN
        RETURN NEW;
    END IF;

    SELECT * INTO schedule FROM private.salon_schedule(NEW.business_id);
    failure := private.visit_window_error(
        NEW.business_id, NEW.staff_id, schedule.zone, schedule.open_clock, schedule.close_clock,
        NEW.scheduled_time,
        NEW.scheduled_time + (NEW.duration_minutes + NEW.booking_buffer_minutes) * interval '1 minute');
    IF failure = 'PW001' THEN
        RAISE EXCEPTION 'Reservation is outside salon operating hours (% to % %)',
            schedule.open_clock, schedule.close_clock, schedule.zone
            USING ERRCODE = 'PW001';
    ELSIF failure = 'PW002' THEN
        RAISE EXCEPTION 'Groomer is on time off or not scheduled for the full reservation'
            USING ERRCODE = 'PW002';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_visit_availability() FROM PUBLIC, anon, authenticated;

-- Update groomer_is_free & free_station_for_window to respect all 12 active visit states AND active waitlist holds
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
             AND v.status IN (
                 'booked', 'confirmed', 'dropped_off', 'checked_in',
                 'bathing', 'drying', 'styling', 'quality_check',
                 'ready', 'payment_pending', 'paused', 'change_pending'
             )
             AND tstzrange(v.scheduled_time, v.reservation_end, '[)') && tstzrange(p_start, p_end, '[)')
       )
       AND NOT EXISTS (
           SELECT 1 FROM public.waitlist_offers wo
           WHERE wo.business_id = p_business_id
             AND wo.assigned_staff_id = p_staff_id
             AND wo.status = 'pending'
             AND wo.offer_expires_at > now()
             AND tstzrange(wo.offered_start, wo.offered_end, '[)') && tstzrange(p_start, p_end, '[)')
       );
$$;
REVOKE ALL ON FUNCTION private.groomer_is_free(uuid, uuid, text, text, text, timestamptz, timestamptz)
    FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.free_station_for_window(
    p_business_id uuid, p_staff_id uuid, p_zone text, p_start timestamptz, p_end timestamptz
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT st.id
    FROM public.salon_stations st
    WHERE st.business_id = p_business_id
      AND st.is_active
      AND NOT EXISTS (
          SELECT 1 FROM public.visits v
          WHERE v.business_id = p_business_id
            AND v.station_id = st.id
            AND v.status IN (
                'booked', 'confirmed', 'dropped_off', 'checked_in',
                'bathing', 'drying', 'styling', 'quality_check',
                'ready', 'payment_pending', 'paused', 'change_pending'
            )
            AND tstzrange(v.scheduled_time, v.reservation_end, '[)') && tstzrange(p_start, p_end, '[)')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.waitlist_offers wo
          WHERE wo.business_id = p_business_id
            AND wo.assigned_station_id = st.id
            AND wo.status = 'pending'
            AND wo.offer_expires_at > now()
            AND tstzrange(wo.offered_start, wo.offered_end, '[)') && tstzrange(p_start, p_end, '[)')
      )
    ORDER BY
      CASE WHEN EXISTS (
          SELECT 1 FROM public.staff_weekly_shifts ws
          WHERE ws.business_id = p_business_id
            AND ws.staff_id = p_staff_id
            AND ws.day_of_week = EXTRACT(DOW FROM (p_start AT TIME ZONE p_zone)::date)::integer
            AND ws.is_active
            AND ws.station_id = st.id
      ) THEN 0 ELSE 1 END,
      st.created_at, st.id
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.free_station_for_window(uuid, uuid, text, timestamptz, timestamptz)
    FROM PUBLIC, anon, authenticated;

-- Update public booking & customer reschedule load-balancing counts to include all 12 active statuses
CREATE OR REPLACE FUNCTION private.public_book_appointment_idempotent_internal(
    p_slug text, p_package_id text, p_start timestamptz,
    p_client_name text, p_client_phone text, p_client_email text,
    p_pet_name text, p_breed text, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    ctx record;
    strict_mode boolean := false;
    clean_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
    existing_visit record;
    client_name text := btrim(COALESCE(p_client_name, ''));
    phone_digits text := regexp_replace(COALESCE(p_client_phone, ''), '[^0-9]', '', 'g');
    client_email text := NULLIF(lower(btrim(COALESCE(p_client_email, ''))), '');
    pet_name text := btrim(COALESCE(p_pet_name, ''));
    breed text := btrim(COALESCE(p_breed, ''));
    visit_end timestamptz;
    local_day date;
    groomer uuid;
    station uuid;
    station_label text;
    target_client uuid;
    target_pet uuid;
    new_visit uuid;
BEGIN
    IF p_slug IS NULL OR p_package_id IS NULL OR p_start IS NULL THEN
        RAISE EXCEPTION 'Booking details are incomplete' USING ERRCODE = 'PW021';
    END IF;
    IF clean_key IS NOT NULL AND (length(clean_key) NOT BETWEEN 8 AND 120 OR clean_key !~ '^[A-Za-z0-9_-]+$') THEN
        RAISE EXCEPTION 'Booking idempotency token is invalid' USING ERRCODE = 'PW021';
    END IF;

    SELECT * INTO ctx FROM private.online_booking_context(p_slug, p_package_id);
    SELECT COALESCE(c.strict_shift_station_mode, false) INTO strict_mode
    FROM public.business_configs c
    WHERE c.business_id = ctx.business_id;

    PERFORM pg_advisory_xact_lock(hashtextextended('pawtrackr-online-booking:' || ctx.business_id::text, 0));

    IF clean_key IS NOT NULL THEN
        SELECT v.id, v.status, v.service_package, v.scheduled_time, v.duration_minutes, v.total_amount
        INTO existing_visit
        FROM public.visits v
        WHERE v.business_id = ctx.business_id
          AND v.booking_idempotency_key = clean_key
        LIMIT 1;

        IF existing_visit.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'reference', upper(substr(replace(existing_visit.id::text, '-', ''), 1, 8)),
                'status', existing_visit.status,
                'service', existing_visit.service_package,
                'starts_at', existing_visit.scheduled_time,
                'ends_at', existing_visit.scheduled_time + existing_visit.duration_minutes * interval '1 minute',
                'time_zone', ctx.zone,
                'price', existing_visit.total_amount,
                'deduplicated', true
            );
        END IF;
    END IF;

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

    IF (SELECT count(*) FROM public.visits v
        WHERE v.business_id = ctx.business_id AND v.booking_source = 'online'
          AND v.created_at > now() - interval '1 hour') >= 60
       OR (SELECT count(*) FROM public.visits v
           JOIN public.clients c ON c.id = v.client_id
           WHERE v.business_id = ctx.business_id AND v.booking_source = 'online'
             AND v.status IN ('booked', 'confirmed') AND v.scheduled_time > now()
             AND regexp_replace(c.phone, '[^0-9]', '', 'g') = phone_digits) >= 4 THEN
        RAISE EXCEPTION 'The online booking limit has been reached; please contact the salon'
            USING ERRCODE = 'PW023';
    END IF;

    visit_end := p_start + (ctx.duration_minutes + ctx.buffer_minutes) * interval '1 minute';
    local_day := (p_start AT TIME ZONE ctx.zone)::date;

    SELECT s.id INTO groomer
    FROM public.staff_members s
    WHERE s.business_id = ctx.business_id
      AND s.role IN ('groomer', 'senior_groomer')
      AND s.is_active
      AND private.groomer_is_free(ctx.business_id, s.id, ctx.zone, ctx.open_clock, ctx.close_clock,
                                  p_start, visit_end)
      AND (NOT strict_mode OR private.free_station_for_window(
          ctx.business_id, s.id, ctx.zone, p_start, visit_end) IS NOT NULL)
    ORDER BY (SELECT count(*) FROM public.visits v
              WHERE v.business_id = ctx.business_id AND v.staff_id = s.id
                AND v.status IN (
                    'booked', 'confirmed', 'dropped_off', 'checked_in',
                    'bathing', 'drying', 'styling', 'quality_check',
                    'ready', 'payment_pending', 'paused', 'change_pending'
                )
                AND (v.scheduled_time AT TIME ZONE ctx.zone)::date = local_day),
             s.created_at, s.id
    LIMIT 1;

    IF groomer IS NULL THEN
        RAISE EXCEPTION 'That time is no longer available' USING ERRCODE = 'PW022';
    END IF;

    station := private.free_station_for_window(ctx.business_id, groomer, ctx.zone, p_start, visit_end);
    IF strict_mode AND station IS NULL THEN
        RAISE EXCEPTION 'That time is no longer available' USING ERRCODE = 'PW022';
    END IF;
    IF station IS NOT NULL THEN
        SELECT st.name INTO station_label FROM public.salon_stations st WHERE st.id = station;
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
        INSERT INTO public.visits (
            business_id, client_id, pet_id, staff_id, station_id, status, booking_source,
            service_package, total_amount, scheduled_time, duration_minutes,
            booking_buffer_minutes, booking_idempotency_key
        )
        VALUES (
            ctx.business_id, target_client, target_pet, groomer, station, 'booked', 'online',
            ctx.service_name, ctx.price, p_start, ctx.duration_minutes,
            ctx.buffer_minutes, clean_key
        )
        RETURNING id INTO new_visit;
    EXCEPTION
        WHEN exclusion_violation OR SQLSTATE 'PW001' OR SQLSTATE 'PW002' THEN
            RAISE EXCEPTION 'That time is no longer available' USING ERRCODE = 'PW022';
    END;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        ctx.business_id, 'WF14', 'booking.created', 'visit', new_visit::text,
        1, NULL, 'customer', NULL, 'booked', 'Anonymous public online booking',
        jsonb_build_object(
            'service', ctx.service_name,
            'starts_at', p_start,
            'station', COALESCE(station_label, 'unassigned'),
            'price', ctx.price
        )
    );

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
REVOKE ALL ON FUNCTION private.public_book_appointment_idempotent_internal(
    text, text, timestamptz, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.public_book_appointment_idempotent_internal(
    text, text, timestamptz, text, text, text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION private.customer_reschedule_booking_internal(
    p_slug text,
    p_reference text,
    p_phone text,
    p_new_start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    clean_slug text := lower(btrim(COALESCE(p_slug, '')));
    clean_ref text := upper(btrim(COALESCE(p_reference, '')));
    phone_digits text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
    biz record;
    strict_mode boolean := false;
    v_rec record;
    new_end timestamptz;
    local_day date;
    new_groomer uuid;
    new_station uuid;
    station_label text;
BEGIN
    IF clean_slug !~ '^[a-z0-9-]{1,60}$' THEN
        RAISE EXCEPTION 'Invalid salon identifier' USING ERRCODE = 'PW020';
    END IF;
    IF clean_ref !~ '^[0-9A-F]{8}$' THEN
        RAISE EXCEPTION 'Invalid booking reference code' USING ERRCODE = 'PW021';
    END IF;
    IF length(phone_digits) NOT BETWEEN 10 AND 15 THEN
        RAISE EXCEPTION 'Phone number with area code is required' USING ERRCODE = 'PW021';
    END IF;
    IF p_new_start IS NULL OR date_trunc('minute', p_new_start) <> p_new_start THEN
        RAISE EXCEPTION 'A valid future appointment time is required' USING ERRCODE = 'PW021';
    END IF;
    IF p_new_start < now() + interval '60 minutes' OR p_new_start > now() + interval '90 days' THEN
        RAISE EXCEPTION 'That time is no longer available' USING ERRCODE = 'PW022';
    END IF;

    SELECT b.id, b.name, b.slug,
           COALESCE(NULLIF(btrim(c.custom_settings->>'time_zone'), ''), 'America/New_York') AS zone,
           COALESCE(c.custom_settings->'operating_hours'->>'open', '08:00') AS open_clock,
           COALESCE(c.custom_settings->'operating_hours'->>'close', '18:00') AS close_clock
    INTO biz
    FROM public.businesses b
    LEFT JOIN public.business_configs c ON c.business_id = b.id
    WHERE b.slug = clean_slug AND b.subscription_status IN ('active', 'trialing');

    IF biz.id IS NULL THEN
        RAISE EXCEPTION 'Salon not found or inactive' USING ERRCODE = 'PW020';
    END IF;

    SELECT COALESCE(c.strict_shift_station_mode, false) INTO strict_mode
    FROM public.business_configs c
    WHERE c.business_id = biz.id;

    PERFORM pg_advisory_xact_lock(hashtextextended('pawtrackr-online-booking:' || biz.id::text, 0));

    SELECT v.id, v.status, v.scheduled_time, v.duration_minutes, v.booking_buffer_minutes,
           v.service_package, v.total_amount, v.staff_id, p.name AS pet_name
    INTO v_rec
    FROM public.visits v
    JOIN public.clients c ON c.id = v.client_id
    JOIN public.pets p ON p.id = v.pet_id
    WHERE v.business_id = biz.id
      AND upper(substr(replace(v.id::text, '-', ''), 1, 8)) = clean_ref
      AND regexp_replace(c.phone, '[^0-9]', '', 'g') = phone_digits
    FOR UPDATE OF v;

    IF v_rec.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found or phone number does not match' USING ERRCODE = 'PW030';
    END IF;

    IF v_rec.status <> 'booked' THEN
        RAISE EXCEPTION 'Only appointments in booked status can be rescheduled online' USING ERRCODE = 'PW031';
    END IF;

    IF v_rec.scheduled_time <= now() + interval '24 hours' THEN
        RAISE EXCEPTION 'Rescheduling within 24 hours must be handled directly with the salon' USING ERRCODE = 'PW032';
    END IF;

    IF v_rec.scheduled_time = p_new_start THEN
        RETURN jsonb_build_object(
            'reference', clean_ref,
            'status', 'booked',
            'service', v_rec.service_package,
            'starts_at', v_rec.scheduled_time,
            'ends_at', v_rec.scheduled_time + (v_rec.duration_minutes * interval '1 minute'),
            'time_zone', biz.zone,
            'price', v_rec.total_amount,
            'salon_name', biz.name,
            'pet_name', v_rec.pet_name,
            'unchanged', true
        );
    END IF;

    new_end := p_new_start + (v_rec.duration_minutes + v_rec.booking_buffer_minutes) * interval '1 minute';
    local_day := (p_new_start AT TIME ZONE biz.zone)::date;

    IF v_rec.staff_id IS NOT NULL AND
       private.groomer_is_free(biz.id, v_rec.staff_id, biz.zone, biz.open_clock, biz.close_clock, p_new_start, new_end) AND
       (NOT strict_mode OR private.free_station_for_window(biz.id, v_rec.staff_id, biz.zone, p_new_start, new_end) IS NOT NULL) THEN
        new_groomer := v_rec.staff_id;
    ELSE
        SELECT s.id INTO new_groomer
        FROM public.staff_members s
        WHERE s.business_id = biz.id
          AND s.role IN ('groomer', 'senior_groomer')
          AND s.is_active
          AND private.groomer_is_free(biz.id, s.id, biz.zone, biz.open_clock, biz.close_clock, p_new_start, new_end)
          AND (NOT strict_mode OR private.free_station_for_window(biz.id, s.id, biz.zone, p_new_start, new_end) IS NOT NULL)
        ORDER BY (SELECT count(*) FROM public.visits v
                  WHERE v.business_id = biz.id AND v.staff_id = s.id
                    AND v.id <> v_rec.id
                    AND v.status IN (
                        'booked', 'confirmed', 'dropped_off', 'checked_in',
                        'bathing', 'drying', 'styling', 'quality_check',
                        'ready', 'payment_pending', 'paused', 'change_pending'
                    )
                    AND (v.scheduled_time AT TIME ZONE biz.zone)::date = local_day),
                 s.created_at, s.id
        LIMIT 1;
    END IF;

    IF new_groomer IS NULL THEN
        RAISE EXCEPTION 'That time is no longer available' USING ERRCODE = 'PW022';
    END IF;

    new_station := private.free_station_for_window(biz.id, new_groomer, biz.zone, p_new_start, new_end);
    IF strict_mode AND new_station IS NULL THEN
        RAISE EXCEPTION 'That time is no longer available' USING ERRCODE = 'PW022';
    END IF;
    IF new_station IS NOT NULL THEN
        SELECT st.name INTO station_label FROM public.salon_stations st WHERE st.id = new_station;
    END IF;

    BEGIN
        UPDATE public.visits
        SET scheduled_time = p_new_start,
            staff_id = new_groomer,
            station_id = new_station
        WHERE id = v_rec.id;
    EXCEPTION
        WHEN exclusion_violation OR SQLSTATE 'PW001' OR SQLSTATE 'PW002' THEN
            RAISE EXCEPTION 'That time is no longer available' USING ERRCODE = 'PW022';
    END;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        biz.id, 'WF14', 'booking.rescheduled', 'visit', v_rec.id::text,
        1, 'customer', 'booked', 'booked',
        'Customer self-service online reschedule',
        jsonb_build_object(
            'reference', clean_ref,
            'previous_scheduled_time', v_rec.scheduled_time,
            'new_scheduled_time', p_new_start,
            'station', COALESCE(station_label, 'unassigned'),
            'service', v_rec.service_package,
            'pet_name', v_rec.pet_name
        )
    );

    RETURN jsonb_build_object(
        'reference', clean_ref,
        'status', 'booked',
        'service', v_rec.service_package,
        'starts_at', p_new_start,
        'ends_at', p_new_start + (v_rec.duration_minutes * interval '1 minute'),
        'time_zone', biz.zone,
        'price', v_rec.total_amount,
        'salon_name', biz.name,
        'pet_name', v_rec.pet_name
    );
END;
$$;
REVOKE ALL ON FUNCTION private.customer_reschedule_booking_internal(text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.customer_reschedule_booking_internal(text, text, text, timestamptz) TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. FIX RUNTIME SQL CRASH BUGS IN 0026 & 0033
-- ----------------------------------------------------------------------------

-- 2.1 Fix private.customer_booking_lookup_internal (0033 referenced non-existent c.time_zone)
CREATE OR REPLACE FUNCTION private.customer_booking_lookup_internal(
    p_slug text,
    p_reference text,
    p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    clean_slug text := lower(btrim(COALESCE(p_slug, '')));
    clean_ref text := upper(btrim(COALESCE(p_reference, '')));
    phone_digits text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
    biz record;
    v_rec record;
    rc record;
    can_manage boolean := false;
BEGIN
    IF clean_slug !~ '^[a-z0-9-]{1,60}$' THEN
        RAISE EXCEPTION 'Invalid salon identifier' USING ERRCODE = 'PW020';
    END IF;
    IF clean_ref !~ '^[0-9A-F]{8}$' THEN
        RAISE EXCEPTION 'Invalid booking reference code' USING ERRCODE = 'PW021';
    END IF;
    IF length(phone_digits) NOT BETWEEN 10 AND 15 THEN
        RAISE EXCEPTION 'Phone number with area code is required' USING ERRCODE = 'PW021';
    END IF;

    SELECT b.id, b.name, b.slug, b.phone, b.city_state,
           COALESCE(NULLIF(btrim(c.custom_settings->>'time_zone'), ''), 'America/New_York') AS zone,
           COALESCE(c.custom_settings->'operating_hours'->>'open', '08:00') AS open_clock,
           COALESCE(c.custom_settings->'operating_hours'->>'close', '18:00') AS close_clock
    INTO biz
    FROM public.businesses b
    LEFT JOIN public.business_configs c ON c.business_id = b.id
    WHERE b.slug = clean_slug AND b.subscription_status IN ('active', 'trialing');

    IF biz.id IS NULL THEN
        RAISE EXCEPTION 'Salon not found or inactive' USING ERRCODE = 'PW020';
    END IF;

    SELECT v.id, v.status, v.service_package, v.total_amount, v.scheduled_time,
           v.duration_minutes, v.booking_buffer_minutes, v.created_at,
           c.name AS client_name, c.phone AS client_phone,
           p.name AS pet_name, p.breed AS pet_breed,
           s.name AS staff_name, st.name AS station_name
    INTO v_rec
    FROM public.visits v
    JOIN public.clients c ON c.id = v.client_id
    JOIN public.pets p ON p.id = v.pet_id
    LEFT JOIN public.staff_members s ON s.id = v.staff_id
    LEFT JOIN public.salon_stations st ON st.id = v.station_id
    WHERE v.business_id = biz.id
      AND upper(substr(replace(v.id::text, '-', ''), 1, 8)) = clean_ref
      AND regexp_replace(c.phone, '[^0-9]', '', 'g') = phone_digits
    ORDER BY v.created_at DESC
    LIMIT 1;

    IF v_rec.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found or phone number does not match' USING ERRCODE = 'PW030';
    END IF;

    can_manage := (v_rec.status = 'booked' AND v_rec.scheduled_time > now() + interval '24 hours');

    SELECT id, coat_condition, behavior_tags, care_notes, recommendations, photos, published_at
    INTO rc
    FROM public.report_cards
    WHERE business_id = biz.id AND visit_id = v_rec.id AND status = 'published'
    LIMIT 1;

    RETURN jsonb_build_object(
        'reference', clean_ref,
        'visit_id', v_rec.id,
        'status', v_rec.status,
        'service', v_rec.service_package,
        'price', v_rec.total_amount,
        'starts_at', v_rec.scheduled_time,
        'ends_at', v_rec.scheduled_time + (v_rec.duration_minutes * interval '1 minute'),
        'duration_minutes', v_rec.duration_minutes,
        'time_zone', biz.zone,
        'salon_name', biz.name,
        'salon_slug', biz.slug,
        'salon_phone', biz.phone,
        'salon_address', biz.city_state,
        'client_name', v_rec.client_name,
        'pet_name', v_rec.pet_name,
        'pet_breed', v_rec.pet_breed,
        'staff_name', v_rec.staff_name,
        'station_name', v_rec.station_name,
        'can_reschedule', can_manage,
        'can_cancel', can_manage,
        'policy_notice', 'Appointments can be modified or cancelled online up to 24 hours in advance. For changes within 24 hours, please contact the salon directly.',
        'report_card', CASE WHEN rc.id IS NOT NULL THEN jsonb_build_object(
            'id', rc.id,
            'coat_condition', rc.coat_condition,
            'behavior_tags', rc.behavior_tags,
            'care_notes', rc.care_notes,
            'recommendations', rc.recommendations,
            'photos', rc.photos,
            'published_at', rc.published_at
        ) ELSE NULL END
    );
END;
$$;
REVOKE ALL ON FUNCTION private.customer_booking_lookup_internal(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.customer_booking_lookup_internal(text, text, text) TO anon, authenticated, service_role;

-- 2.2 Fix public.advance_visit_stage (0026 selected TEXT behavior_notes into TEXT[] variable)
CREATE OR REPLACE FUNCTION public.advance_visit_stage(
    p_visit_id UUID,
    p_target_stage TEXT,
    p_care_note TEXT DEFAULT NULL,
    p_client_version INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_staff_id UUID;
    v_actor_name TEXT;
    v_business_id UUID;
    v_actor_role TEXT;
    v_visit public.visits%ROWTYPE;
    v_pet_behavior TEXT[] := '{}'::text[];
    v_pet_notes TEXT := '';
    v_stage_entry JSONB;
    v_updated_visit JSONB;
BEGIN
    SELECT id, business_id, role, name
    INTO v_actor_staff_id, v_business_id, v_actor_role, v_actor_name
    FROM public.staff_members
    WHERE auth_user_id = auth.uid() AND is_active = true
    LIMIT 1;

    IF v_actor_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff membership required' USING ERRCODE = 'PW001';
    END IF;

    IF p_target_stage NOT IN ('bathing', 'drying', 'styling', 'quality_check', 'ready', 'paused') THEN
        RAISE EXCEPTION 'Invalid floor stage: %', p_target_stage USING ERRCODE = 'PW028';
    END IF;

    SELECT * INTO v_visit
    FROM public.visits
    WHERE id = p_visit_id AND business_id = v_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'PW003';
    END IF;

    IF p_client_version IS NOT NULL AND v_visit.version <> p_client_version THEN
        RAISE EXCEPTION 'Concurrent modification detected (server version %, client version %). Refresh before proceeding.',
            v_visit.version, p_client_version USING ERRCODE = 'PW029';
    END IF;

    IF v_visit.safety_notes_acknowledged_at IS NULL AND p_target_stage IN ('bathing', 'drying', 'styling', 'quality_check') THEN
        RAISE EXCEPTION 'Safety notes must be explicitly acknowledged before starting %', p_target_stage USING ERRCODE = 'PW030';
    END IF;

    IF v_actor_role = 'bather' AND p_target_stage NOT IN ('bathing', 'drying') THEN
        RAISE EXCEPTION 'Bathers can record bathing and drying stages only' USING ERRCODE = 'PW031';
    END IF;

    SELECT COALESCE(behavior_tags, '{}'::text[]), lower(COALESCE(behavior_notes, ''))
    INTO v_pet_behavior, v_pet_notes
    FROM public.pets
    WHERE id = v_visit.pet_id AND business_id = v_business_id;

    IF v_actor_role = 'bather' AND (
        'biter' = ANY(v_pet_behavior)
        OR 'aggressive' = ANY(v_pet_behavior)
        OR v_pet_notes ~ '\m(biter|bite risk|aggressive)\M'
    ) THEN
        RAISE EXCEPTION 'High-risk (bite-risk) pets require Senior Groomer or Manager handling' USING ERRCODE = 'PW032';
    END IF;

    v_stage_entry := jsonb_build_object(
        'stage', p_target_stage,
        'actor_id', v_actor_staff_id,
        'actor_name', COALESCE(v_actor_name, 'Staff'),
        'timestamp', timezone('utc'::text, now()),
        'note', NULLIF(TRIM(p_care_note), '')
    );

    UPDATE public.visits
    SET status = p_target_stage,
        ready_at = CASE WHEN p_target_stage = 'ready' THEN timezone('utc'::text, now()) ELSE ready_at END,
        stage_notes = stage_notes || v_stage_entry,
        version = version + 1
    WHERE id = p_visit_id
    RETURNING jsonb_build_object(
        'id', id,
        'status', status,
        'ready_at', ready_at,
        'stage_notes', stage_notes,
        'version', version
    ) INTO v_updated_visit;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id, source_version,
        actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF09', 'visit.stage_changed', 'visits', p_visit_id::text, v_visit.version + 1,
        auth.uid(), v_actor_role, v_visit.status, p_target_stage,
        COALESCE(p_care_note, 'Groomer advanced floor stage to ' || p_target_stage),
        jsonb_build_object('stage', p_target_stage, 'actor_name', v_actor_name)
    );

    RETURN v_updated_visit;
END;
$$;
REVOKE ALL ON FUNCTION public.advance_visit_stage(UUID, TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_visit_stage(UUID, TEXT, TEXT, INT) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. PROGRESSIVE COMMISSION TIERS & CROSS-TENANT PAYROLL BOLA REMEDIATION
-- ----------------------------------------------------------------------------

ALTER TABLE public.staff_members
    ADD COLUMN IF NOT EXISTS commission_tiers JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(commission_tiers) = 'array');

CREATE OR REPLACE FUNCTION public.calculate_progressive_commission_cents(
    p_gross_cents BIGINT,
    p_flat_rate NUMERIC,
    p_tiers JSONB DEFAULT '[]'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_gross BIGINT := GREATEST(COALESCE(p_gross_cents, 0), 0);
    v_prev_cap BIGINT := 0;
    v_cap BIGINT;
    v_rate NUMERIC;
    v_slice BIGINT;
    v_total BIGINT := 0;
    v_tier RECORD;
BEGIN
    IF v_gross <= 0 THEN
        RETURN 0;
    END IF;

    IF p_tiers IS NULL OR jsonb_typeof(p_tiers) <> 'array' OR jsonb_array_length(p_tiers) = 0 THEN
        RETURN ROUND(v_gross * (GREATEST(COALESCE(p_flat_rate, 0), 0) / 100.0))::BIGINT;
    END IF;

    FOR v_tier IN
        SELECT
            COALESCE(
                NULLIF(elem->>'up_to_cents', '')::BIGINT,
                NULLIF(elem->>'upToCents', '')::BIGINT,
                9223372036854775807::BIGINT
            ) AS cap_cents,
            GREATEST(
                0::NUMERIC,
                LEAST(
                    100::NUMERIC,
                    COALESCE(
                        NULLIF(elem->>'rate_pct', '')::NUMERIC,
                        NULLIF(elem->>'ratePct', '')::NUMERIC,
                        COALESCE(p_flat_rate, 0)
                    )
                )
            ) AS rate_pct
        FROM jsonb_array_elements(p_tiers) AS elem
        WHERE jsonb_typeof(elem) = 'object'
        ORDER BY 1 ASC
    LOOP
        v_cap := v_tier.cap_cents;
        v_rate := v_tier.rate_pct;
        IF v_cap > v_prev_cap AND v_gross > v_prev_cap THEN
            v_slice := LEAST(v_gross, v_cap) - v_prev_cap;
            v_total := v_total + ROUND(v_slice * (v_rate / 100.0))::BIGINT;
            v_prev_cap := v_cap;
        END IF;
        EXIT WHEN v_gross <= v_prev_cap;
    END LOOP;

    -- If gross exceeds highest bounded tier, apply flat_rate to remaining overflow
    IF v_gross > v_prev_cap THEN
        v_slice := v_gross - v_prev_cap;
        v_total := v_total + ROUND(v_slice * (GREATEST(COALESCE(p_flat_rate, 0), 0) / 100.0))::BIGINT;
    END IF;

    RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.calculate_progressive_commission_cents(BIGINT, NUMERIC, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_progressive_commission_cents(BIGINT, NUMERIC, JSONB) TO authenticated, service_role;

-- Harden calculate_payroll_summary against cross-tenant BOLA, inactive staff, and search_path hijacking
CREATE OR REPLACE FUNCTION public.calculate_payroll_summary(
    p_business_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_tip_pool_mode TEXT DEFAULT 'direct',
    p_bather_pool_pct NUMERIC DEFAULT 15.00
)
RETURNS TABLE (
    staff_id UUID,
    staff_name TEXT,
    staff_role TEXT,
    commission_rate NUMERIC,
    dogs_groomed BIGINT,
    gross_service_cents BIGINT,
    commission_cents BIGINT,
    direct_tips_cents BIGINT,
    pool_tips_cents BIGINT,
    total_tips_cents BIGINT,
    retro_adjustments_cents BIGINT,
    total_payout_cents BIGINT,
    house_retained_cents BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_business_id UUID;
    v_caller_role TEXT;
    v_total_tips_collected BIGINT := 0;
    v_bather_count INT := 0;
    v_bather_pool_total BIGINT := 0;
    v_bather_pool_each BIGINT := 0;
    v_bather_pool_remainder BIGINT := 0;
BEGIN
    IF p_business_id IS NULL THEN
        RAISE EXCEPTION 'PW058: Business identifier is required' USING ERRCODE = 'P0058';
    END IF;

    -- Enforce strict tenant & RBAC isolation for API roles or any session carrying a JWT subject
    IF current_user IN ('anon', 'authenticated') OR auth.uid() IS NOT NULL THEN
        v_caller_business_id := private.current_business_id();
        IF v_caller_business_id IS NULL OR v_caller_business_id <> p_business_id THEN
            RAISE EXCEPTION 'PW058: Cross-tenant payroll access is prohibited' USING ERRCODE = 'P0058';
        END IF;

        SELECT sm.role INTO v_caller_role
        FROM public.staff_members sm
        WHERE sm.auth_user_id = auth.uid()
          AND sm.business_id = p_business_id
          AND sm.is_active = true
        LIMIT 1;

        IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'manager') THEN
            RAISE EXCEPTION 'PW059: Payroll summary requires active owner or manager authorization'
                USING ERRCODE = 'P0059';
        END IF;
    END IF;

    IF p_tip_pool_mode = 'bather_split' THEN
        SELECT COUNT(*) INTO v_bather_count
        FROM public.staff_members sm
        WHERE sm.business_id = p_business_id
          AND sm.role = 'bather'
          AND sm.is_active = true;

        SELECT COALESCE(SUM(ROUND(tx.tip * 100)::BIGINT), 0)
        INTO v_total_tips_collected
        FROM public.transactions tx
        JOIN public.visits v ON v.id = tx.visit_id
        WHERE tx.business_id = p_business_id
          AND tx.status = 'completed'
          AND v.created_at::DATE >= p_start_date
          AND v.created_at::DATE <= p_end_date;

        IF v_bather_count > 0 AND v_total_tips_collected > 0 THEN
            v_bather_pool_total := ROUND(v_total_tips_collected * (p_bather_pool_pct / 100.0))::BIGINT;
            v_bather_pool_each := v_bather_pool_total / v_bather_count;
            v_bather_pool_remainder := v_bather_pool_total % v_bather_count;
        END IF;
    END IF;

    RETURN QUERY
    WITH staff_visits AS (
        SELECT
            sm.id AS s_id,
            sm.name AS s_name,
            sm.role AS s_role,
            sm.commission_rate AS s_comm_rate,
            sm.commission_tiers AS s_comm_tiers,
            COUNT(DISTINCT v.id) AS s_dogs,
            COALESCE(SUM(ROUND((tx.subtotal - tx.discount) * 100)::BIGINT), 0)::BIGINT AS s_gross_cents,
            COALESCE(SUM(ROUND(tx.tip * 100)::BIGINT), 0)::BIGINT AS s_tips_cents
        FROM public.staff_members sm
        LEFT JOIN public.visits v
            ON v.staff_id = sm.id
            AND v.business_id = p_business_id
            AND v.status IN ('paid', 'completed')
            AND v.created_at::DATE >= p_start_date
            AND v.created_at::DATE <= p_end_date
        LEFT JOIN public.transactions tx
            ON tx.visit_id = v.id
            AND tx.business_id = p_business_id
            AND tx.status = 'completed'
        WHERE sm.business_id = p_business_id
          AND sm.is_active = true
          AND sm.role IN ('owner', 'senior_groomer', 'groomer', 'bather')
        GROUP BY sm.id, sm.name, sm.role, sm.commission_rate, sm.commission_tiers
    ),
    staff_commissions AS (
        SELECT
            sv.*,
            public.calculate_progressive_commission_cents(sv.s_gross_cents, sv.s_comm_rate, sv.s_comm_tiers) AS s_comm_cents
        FROM staff_visits sv
    ),
    staff_adjustments AS (
        SELECT
            pa.staff_id AS a_staff_id,
            COALESCE(SUM(pa.amount_cents), 0)::BIGINT AS a_retro_cents
        FROM public.payroll_adjustments pa
        WHERE pa.business_id = p_business_id
          AND pa.created_at::DATE >= p_start_date
          AND pa.created_at::DATE <= p_end_date
        GROUP BY pa.staff_id
    )
    SELECT
        sc.s_id AS staff_id,
        sc.s_name AS staff_name,
        sc.s_role AS staff_role,
        sc.s_comm_rate AS commission_rate,
        sc.s_dogs AS dogs_groomed,
        sc.s_gross_cents AS gross_service_cents,
        sc.s_comm_cents AS commission_cents,
        CASE
            WHEN p_tip_pool_mode = 'bather_split' AND sc.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                ROUND(sc.s_tips_cents * ((100.0 - p_bather_pool_pct) / 100.0))::BIGINT
            WHEN sc.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                sc.s_tips_cents
            ELSE 0::BIGINT
        END AS direct_tips_cents,
        CASE
            WHEN p_tip_pool_mode = 'bather_split' AND sc.s_role = 'bather' THEN
                v_bather_pool_each + (CASE WHEN sc.s_id = (SELECT s_id FROM staff_commissions WHERE s_role = 'bather' ORDER BY s_id LIMIT 1) THEN v_bather_pool_remainder ELSE 0 END)
            ELSE 0::BIGINT
        END AS pool_tips_cents,
        (
            CASE
                WHEN p_tip_pool_mode = 'bather_split' AND sc.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                    ROUND(sc.s_tips_cents * ((100.0 - p_bather_pool_pct) / 100.0))::BIGINT
                WHEN sc.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                    sc.s_tips_cents
                ELSE 0::BIGINT
            END
            +
            CASE
                WHEN p_tip_pool_mode = 'bather_split' AND sc.s_role = 'bather' THEN
                    v_bather_pool_each + (CASE WHEN sc.s_id = (SELECT s_id FROM staff_commissions WHERE s_role = 'bather' ORDER BY s_id LIMIT 1) THEN v_bather_pool_remainder ELSE 0 END)
                ELSE 0::BIGINT
            END
        ) AS total_tips_cents,
        COALESCE(sa.a_retro_cents, 0::BIGINT) AS retro_adjustments_cents,
        (
            sc.s_comm_cents
            +
            (
                CASE
                    WHEN p_tip_pool_mode = 'bather_split' AND sc.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                        ROUND(sc.s_tips_cents * ((100.0 - p_bather_pool_pct) / 100.0))::BIGINT
                    WHEN sc.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                        sc.s_tips_cents
                    ELSE 0::BIGINT
                END
                +
                CASE
                    WHEN p_tip_pool_mode = 'bather_split' AND sc.s_role = 'bather' THEN
                        v_bather_pool_each + (CASE WHEN sc.s_id = (SELECT s_id FROM staff_commissions WHERE s_role = 'bather' ORDER BY s_id LIMIT 1) THEN v_bather_pool_remainder ELSE 0 END)
                    ELSE 0::BIGINT
                END
            )
            +
            COALESCE(sa.a_retro_cents, 0::BIGINT)
        ) AS total_payout_cents,
        (sc.s_gross_cents - sc.s_comm_cents) AS house_retained_cents
    FROM staff_commissions sc
    LEFT JOIN staff_adjustments sa ON sa.a_staff_id = sc.s_id
    ORDER BY total_payout_cents DESC, sc.s_name ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.calculate_payroll_summary(UUID, DATE, DATE, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_payroll_summary(UUID, DATE, DATE, TEXT, NUMERIC) TO authenticated, service_role;

-- Harden lock_payroll_period: require sm.is_active = true & explicit search_path
CREATE OR REPLACE FUNCTION public.lock_payroll_period(
    p_period_start DATE,
    p_period_end DATE,
    p_tip_pool_mode TEXT DEFAULT 'direct',
    p_bather_pool_pct NUMERIC DEFAULT 15.00,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_business_id UUID;
    v_caller_staff_id UUID;
    v_caller_role TEXT;
    v_period_id UUID;
    v_existing_status TEXT;
    v_gross_cents BIGINT := 0;
    v_commission_cents BIGINT := 0;
    v_tips_cents BIGINT := 0;
    v_adjustments_cents BIGINT := 0;
    v_payout_cents BIGINT := 0;
    v_house_cents BIGINT := 0;
BEGIN
    v_business_id := private.current_business_id();
    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'PW058: No authenticated tenant context' USING ERRCODE = 'P0058';
    END IF;

    SELECT sm.id, sm.role INTO v_caller_staff_id, v_caller_role
    FROM public.staff_members sm
    WHERE sm.auth_user_id = auth.uid()
      AND sm.business_id = v_business_id
      AND sm.is_active = true
    LIMIT 1;

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'PW059: Only active salon owners and managers can lock payroll periods'
            USING ERRCODE = 'P0059';
    END IF;

    IF p_period_end < p_period_start THEN
        RAISE EXCEPTION 'PW061: Payroll period end date must be on or after start date'
            USING ERRCODE = 'P0061';
    END IF;

    SELECT pp.id, pp.status INTO v_period_id, v_existing_status
    FROM public.payroll_periods pp
    WHERE pp.business_id = v_business_id
      AND pp.period_start = p_period_start
      AND pp.period_end = p_period_end
    FOR UPDATE;

    IF v_existing_status IN ('locked', 'exported') THEN
        RAISE EXCEPTION 'PW062: Payroll period % to % is already locked', p_period_start, p_period_end
            USING ERRCODE = 'P0062';
    END IF;

    SELECT
        COALESCE(SUM(s.gross_service_cents), 0),
        COALESCE(SUM(s.commission_cents), 0),
        COALESCE(SUM(s.total_tips_cents), 0),
        COALESCE(SUM(s.retro_adjustments_cents), 0),
        COALESCE(SUM(s.total_payout_cents), 0),
        COALESCE(SUM(s.house_retained_cents), 0)
    INTO
        v_gross_cents,
        v_commission_cents,
        v_tips_cents,
        v_adjustments_cents,
        v_payout_cents,
        v_house_cents
    FROM public.calculate_payroll_summary(
        v_business_id,
        p_period_start,
        p_period_end,
        p_tip_pool_mode,
        p_bather_pool_pct
    ) s;

    IF v_period_id IS NOT NULL THEN
        UPDATE public.payroll_periods
        SET status = 'locked',
            tip_pool_mode = p_tip_pool_mode,
            bather_pool_pct = p_bather_pool_pct,
            total_gross_cents = v_gross_cents,
            total_commission_cents = v_commission_cents,
            total_tips_cents = v_tips_cents,
            total_adjustments_cents = v_adjustments_cents,
            total_payout_cents = v_payout_cents,
            total_house_cents = v_house_cents,
            locked_at = timezone('utc'::text, now()),
            locked_by = v_caller_staff_id,
            notes = p_notes
        WHERE id = v_period_id;
    ELSE
        INSERT INTO public.payroll_periods (
            business_id, period_start, period_end, status, tip_pool_mode, bather_pool_pct,
            total_gross_cents, total_commission_cents, total_tips_cents,
            total_adjustments_cents, total_payout_cents, total_house_cents,
            locked_at, locked_by, notes
        ) VALUES (
            v_business_id, p_period_start, p_period_end, 'locked', p_tip_pool_mode, p_bather_pool_pct,
            v_gross_cents, v_commission_cents, v_tips_cents,
            v_adjustments_cents, v_payout_cents, v_house_cents,
            timezone('utc'::text, now()), v_caller_staff_id, p_notes
        ) RETURNING id INTO v_period_id;
    END IF;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF08', 'payroll.period_locked', 'payroll_period', v_period_id::text,
        1, auth.uid(), v_caller_role, 'open', 'locked',
        COALESCE(p_notes, 'Bi-weekly payroll period closeout and ledger lock'),
        jsonb_build_object(
            'period_start', p_period_start,
            'period_end', p_period_end,
            'tip_pool_mode', p_tip_pool_mode,
            'bather_pool_pct', p_bather_pool_pct,
            'total_gross_cents', v_gross_cents,
            'total_commission_cents', v_commission_cents,
            'total_tips_cents', v_tips_cents,
            'total_payout_cents', v_payout_cents,
            'total_house_cents', v_house_cents,
            'actor_staff_id', v_caller_staff_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'period_id', v_period_id,
        'period_start', p_period_start,
        'period_end', p_period_end,
        'status', 'locked',
        'total_gross_cents', v_gross_cents,
        'total_commission_cents', v_commission_cents,
        'total_tips_cents', v_tips_cents,
        'total_payout_cents', v_payout_cents,
        'total_house_cents', v_house_cents
    );
END;
$$;
REVOKE ALL ON FUNCTION public.lock_payroll_period(DATE, DATE, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_payroll_period(DATE, DATE, TEXT, NUMERIC, TEXT) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. RLS & PRIVILEGE HARDENING ACROSS 0026-0033 TABLES & RPCS
-- ----------------------------------------------------------------------------

-- 4.1 Incident reports: read-only for active owner/manager; insert allowed for active tenant staff via floor safety workflow
DROP POLICY IF EXISTS "Tenant isolation for incident_reports" ON public.incident_reports;
DROP POLICY IF EXISTS "Managers and owners can view incident_reports" ON public.incident_reports;
DROP POLICY IF EXISTS "Active staff can submit incident_reports" ON public.incident_reports;

CREATE POLICY "Managers and owners can view incident_reports"
    ON public.incident_reports FOR SELECT TO authenticated
    USING (
        business_id = private.current_business_id()
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = auth.uid()
              AND sm.business_id = private.current_business_id()
              AND sm.is_active = true
              AND sm.role IN ('owner', 'manager')
        )
    );

CREATE POLICY "Active staff can submit incident_reports"
    ON public.incident_reports FOR INSERT TO authenticated
    WITH CHECK (business_id = private.current_business_id());

ALTER FUNCTION private.prevent_incident_report_update() SET search_path = pg_catalog, pg_temp;
REVOKE ALL ON FUNCTION private.prevent_incident_report_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prevent_incident_report_delete() FROM PUBLIC, anon, authenticated;

-- 4.2 Payroll RLS: require sm.is_active = true and bind TO authenticated
DROP POLICY IF EXISTS "Tenant staff can view payroll periods" ON public.payroll_periods;
DROP POLICY IF EXISTS "Tenant managers can manage payroll periods" ON public.payroll_periods;
CREATE POLICY "Tenant staff can view payroll periods"
    ON public.payroll_periods FOR SELECT TO authenticated
    USING (business_id = private.current_business_id());

CREATE POLICY "Tenant managers can manage payroll periods"
    ON public.payroll_periods FOR ALL TO authenticated
    USING (
        business_id = private.current_business_id()
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = auth.uid()
              AND sm.business_id = private.current_business_id()
              AND sm.is_active = true
              AND sm.role IN ('owner', 'manager')
        )
    )
    WITH CHECK (
        business_id = private.current_business_id()
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = auth.uid()
              AND sm.business_id = private.current_business_id()
              AND sm.is_active = true
              AND sm.role IN ('owner', 'manager')
        )
    );

DROP POLICY IF EXISTS "Tenant staff can view payroll adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Tenant managers can manage payroll adjustments" ON public.payroll_adjustments;
CREATE POLICY "Tenant staff can view payroll adjustments"
    ON public.payroll_adjustments FOR SELECT TO authenticated
    USING (business_id = private.current_business_id());

CREATE POLICY "Tenant managers can manage payroll adjustments"
    ON public.payroll_adjustments FOR ALL TO authenticated
    USING (
        business_id = private.current_business_id()
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = auth.uid()
              AND sm.business_id = private.current_business_id()
              AND sm.is_active = true
              AND sm.role IN ('owner', 'manager')
        )
    )
    WITH CHECK (
        business_id = private.current_business_id()
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = auth.uid()
              AND sm.business_id = private.current_business_id()
              AND sm.is_active = true
              AND sm.role IN ('owner', 'manager')
        )
    );

-- 4.3 Harden waitlist RPCs (tenant-scoped expiration sweep + exclusion violation handling)
CREATE OR REPLACE FUNCTION public.generate_waitlist_offer(
    p_waitlist_entry_id UUID,
    p_offered_start TIMESTAMPTZ,
    p_offered_end TIMESTAMPTZ,
    p_assigned_staff_id UUID,
    p_assigned_station_id UUID DEFAULT NULL,
    p_hold_duration_minutes INT DEFAULT 120
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_business_id UUID;
    v_user_id UUID;
    v_staff_id UUID;
    v_staff_role TEXT;
    v_entry RECORD;
    v_offer_id UUID;
    v_expires_at TIMESTAMPTZ;
    v_claim_token TEXT;
    v_hold_minutes INT;
BEGIN
    v_business_id := private.current_business_id();
    v_user_id := auth.uid();

    IF v_business_id IS NULL OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'A verified staff session is required' USING ERRCODE = 'PW010';
    END IF;

    SELECT id, role INTO v_staff_id, v_staff_role
    FROM public.staff_members
    WHERE auth_user_id = v_user_id AND business_id = v_business_id AND is_active = true;

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff member profile not found' USING ERRCODE = 'PW010';
    END IF;

    SELECT * INTO v_entry
    FROM public.waitlist_entries
    WHERE id = p_waitlist_entry_id AND business_id = v_business_id
    FOR UPDATE;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'Waitlist entry not found' USING ERRCODE = 'PW021';
    END IF;

    IF v_entry.status NOT IN ('active', 'offered') THEN
        RAISE EXCEPTION 'Waitlist entry is not eligible for new slot offers (status: %)', v_entry.status
            USING ERRCODE = 'PW021';
    END IF;

    -- Prevent offering a slot that is already occupied by an active visit
    IF EXISTS (
        SELECT 1 FROM public.visits v
        WHERE v.business_id = v_business_id
          AND (v.staff_id = p_assigned_staff_id OR (p_assigned_station_id IS NOT NULL AND v.station_id = p_assigned_station_id))
          AND v.status IN (
              'booked', 'confirmed', 'dropped_off', 'checked_in',
              'bathing', 'drying', 'styling', 'quality_check',
              'ready', 'payment_pending', 'paused', 'change_pending'
          )
          AND tstzrange(v.scheduled_time, v.reservation_end, '[)') && tstzrange(p_offered_start, p_offered_end, '[)')
    ) THEN
        RAISE EXCEPTION 'That slot is already occupied by an active appointment' USING ERRCODE = 'PW022';
    END IF;

    v_hold_minutes := COALESCE(p_hold_duration_minutes, 120);
    IF v_hold_minutes < 15 OR v_hold_minutes > 1440 THEN
        v_hold_minutes := 120;
    END IF;

    v_expires_at := timezone('utc'::text, now()) + (v_hold_minutes || ' minutes')::interval;
    v_claim_token := encode(gen_random_bytes(16), 'hex');

    BEGIN
        INSERT INTO public.waitlist_offers (
            business_id, waitlist_entry_id, offered_start, offered_end,
            assigned_staff_id, assigned_station_id, offer_expires_at, status, claim_token
        ) VALUES (
            v_business_id, p_waitlist_entry_id, p_offered_start, p_offered_end,
            p_assigned_staff_id, p_assigned_station_id, v_expires_at, 'pending', v_claim_token
        ) RETURNING id INTO v_offer_id;
    EXCEPTION
        WHEN exclusion_violation THEN
            RAISE EXCEPTION 'Another pending waitlist offer already holds this staff or station slot'
                USING ERRCODE = 'PW022';
    END;

    UPDATE public.waitlist_entries
    SET status = 'offered', updated_at = timezone('utc'::text, now())
    WHERE id = p_waitlist_entry_id;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, reason, metadata
    ) VALUES (
        v_business_id, 'WF15', 'waitlist.offered', 'waitlist_offer', v_offer_id::text,
        1, v_user_id, v_staff_role, 'Generated versioned slot hold offer',
        jsonb_build_object(
            'waitlist_entry_id', p_waitlist_entry_id,
            'offered_start', p_offered_start,
            'offered_end', p_offered_end,
            'assigned_staff_id', p_assigned_staff_id,
            'assigned_station_id', p_assigned_station_id,
            'expires_at', v_expires_at
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'offer_id', v_offer_id,
        'claim_token', v_claim_token,
        'expires_at', v_expires_at,
        'hold_minutes', v_hold_minutes
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_waitlist_offers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_business_id UUID := private.current_business_id();
    v_expired_count INT := 0;
    v_offer RECORD;
BEGIN
    IF current_user = 'authenticated' AND v_caller_business_id IS NULL THEN
        RAISE EXCEPTION 'Active staff membership required' USING ERRCODE = 'PW010';
    END IF;

    FOR v_offer IN
        SELECT id, waitlist_entry_id, business_id
        FROM public.waitlist_offers
        WHERE status = 'pending'
          AND offer_expires_at <= timezone('utc'::text, now())
          AND (v_caller_business_id IS NULL OR business_id = v_caller_business_id)
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.waitlist_offers
        SET status = 'expired', updated_at = timezone('utc'::text, now())
        WHERE id = v_offer.id;

        UPDATE public.waitlist_entries
        SET status = 'active', updated_at = timezone('utc'::text, now())
        WHERE id = v_offer.waitlist_entry_id;

        INSERT INTO public.workflow_events (
            business_id, workflow_id, event_type, source_record_type, source_record_id,
            source_version, actor_role, reason, metadata
        ) VALUES (
            v_offer.business_id, 'WF15', 'waitlist.offer_expired', 'waitlist_offer', v_offer.id::text,
            1, 'system', 'Waitlist slot hold offer window elapsed without acceptance',
            jsonb_build_object('waitlist_entry_id', v_offer.waitlist_entry_id)
        );

        v_expired_count := v_expired_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'expired_offers_count', v_expired_count
    );
END;
$$;

-- Revoke PUBLIC/anon access across 0026-0030 tables & SECURITY DEFINER functions
REVOKE ALL ON public.visit_surcharges, public.incident_reports, public.refund_records,
    public.payroll_periods, public.payroll_adjustments,
    public.waitlist_entries, public.waitlist_offers FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_surcharges, public.refund_records,
    public.payroll_periods, public.payroll_adjustments,
    public.waitlist_entries, public.waitlist_offers TO authenticated;
GRANT SELECT, INSERT ON public.incident_reports TO authenticated;

REVOKE ALL ON FUNCTION public.manager_open_day(DATE, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_open_day(DATE, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_in_visit(UUID, TEXT, TEXT, NUMERIC, UUID, TEXT, BOOLEAN, INT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_visit(UUID, TEXT, TEXT, NUMERIC, UUID, TEXT, BOOLEAN, INT, UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.acknowledge_safety_notes(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_safety_notes(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_visit(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_visit(UUID, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.request_visit_surcharge(UUID, DECIMAL, TEXT, INT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_visit_surcharge(UUID, DECIMAL, TEXT, INT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_visit_surcharge(UUID, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_visit_surcharge(UUID, BOOLEAN, BOOLEAN, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.stop_service_safety_concern(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, DECIMAL) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stop_service_safety_concern(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, DECIMAL) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.close_salon_day(DATE, INT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_salon_day(DATE, INT, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_report_card_draft(UUID, TEXT, JSONB, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_report_card_draft(UUID, TEXT, JSONB, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.publish_report_card(UUID, TEXT, JSONB, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_report_card(UUID, TEXT, JSONB, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_client_communication(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_communication(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_waitlist_entry(UUID, UUID, TEXT, UUID, DATE[], TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_waitlist_entry(UUID, UUID, TEXT, UUID, DATE[], TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.generate_waitlist_offer(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_waitlist_offer(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, INT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_waitlist_offer(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_offer(UUID, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.expire_waitlist_offers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_waitlist_offers() TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 5. RETAIL INVENTORY BARCODE / NEGATIVE-STOCK GUARDRAILS & ATOMIC DEDUCTION
-- ----------------------------------------------------------------------------

UPDATE public.retail_inventory SET stock_quantity = 0 WHERE stock_quantity < 0;
UPDATE public.retail_inventory SET reorder_threshold = 0 WHERE reorder_threshold < 0;
UPDATE public.retail_inventory SET retail_commission_pct = LEAST(100, GREATEST(0, retail_commission_pct))
WHERE retail_commission_pct < 0 OR retail_commission_pct > 100;

ALTER TABLE public.retail_inventory
    ADD COLUMN IF NOT EXISTS barcode TEXT,
    ADD COLUMN IF NOT EXISTS sku_code TEXT;

ALTER TABLE public.retail_inventory DROP CONSTRAINT IF EXISTS retail_inventory_non_negative_stock;
ALTER TABLE public.retail_inventory DROP CONSTRAINT IF EXISTS retail_inventory_non_negative_reorder;
ALTER TABLE public.retail_inventory DROP CONSTRAINT IF EXISTS retail_inventory_commission_bounds;

ALTER TABLE public.retail_inventory
    ADD CONSTRAINT retail_inventory_non_negative_stock CHECK (stock_quantity >= 0),
    ADD CONSTRAINT retail_inventory_non_negative_reorder CHECK (reorder_threshold >= 0),
    ADD CONSTRAINT retail_inventory_commission_bounds CHECK (retail_commission_pct >= 0 AND retail_commission_pct <= 100);

CREATE UNIQUE INDEX IF NOT EXISTS retail_inventory_business_barcode_unique
    ON public.retail_inventory (business_id, barcode)
    WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS retail_inventory_business_sku_unique
    ON public.retail_inventory (business_id, sku);

UPDATE public.gift_cards_and_credits SET remaining_visits = 0 WHERE remaining_visits < 0;
ALTER TABLE public.gift_cards_and_credits DROP CONSTRAINT IF EXISTS gift_cards_non_negative_remaining_visits;
ALTER TABLE public.gift_cards_and_credits
    ADD CONSTRAINT gift_cards_non_negative_remaining_visits CHECK (remaining_visits IS NULL OR remaining_visits >= 0);

CREATE OR REPLACE FUNCTION public.deduct_retail_inventory_atomic(
    p_sku_or_barcode TEXT,
    p_quantity INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_business_id UUID := private.current_business_id();
    v_user_id UUID := auth.uid();
    v_staff_id UUID;
    v_staff_role TEXT;
    v_code TEXT := btrim(COALESCE(p_sku_or_barcode, ''));
    v_item RECORD;
    v_existing RECORD;
BEGIN
    IF v_business_id IS NULL OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'A verified staff session is required' USING ERRCODE = 'PW010';
    END IF;

    SELECT id, role INTO v_staff_id, v_staff_role
    FROM public.staff_members
    WHERE auth_user_id = v_user_id AND business_id = v_business_id AND is_active = true
    LIMIT 1;

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff membership required' USING ERRCODE = 'PW010';
    END IF;

    IF v_code = '' OR p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 500 THEN
        RAISE EXCEPTION 'Valid SKU/barcode and positive quantity (1-500) are required' USING ERRCODE = 'PW021';
    END IF;

    UPDATE public.retail_inventory
    SET stock_quantity = stock_quantity - p_quantity
    WHERE business_id = v_business_id
      AND (sku = v_code OR barcode = v_code OR sku_code = v_code)
      AND stock_quantity >= p_quantity
    RETURNING id, sku, barcode, name, category, price_dollars, stock_quantity, reorder_threshold, retail_commission_pct
    INTO v_item;

    IF v_item.id IS NULL THEN
        SELECT id, stock_quantity INTO v_existing
        FROM public.retail_inventory
        WHERE business_id = v_business_id
          AND (sku = v_code OR barcode = v_code OR sku_code = v_code)
        LIMIT 1;

        IF v_existing.id IS NULL THEN
            RAISE EXCEPTION 'Retail SKU or barcode (%) not found', v_code USING ERRCODE = 'PW028';
        ELSE
            RAISE EXCEPTION 'Insufficient retail stock (available: %, requested: %) — negative inventory is prohibited',
                v_existing.stock_quantity, p_quantity USING ERRCODE = 'PW075';
        END IF;
    END IF;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF06', 'inventory.deducted', 'retail_inventory', v_item.id::text,
        1, v_user_id, v_staff_role, (v_item.stock_quantity + p_quantity)::text, v_item.stock_quantity::text,
        'Atomic POS barcode/SKU retail deduction',
        jsonb_build_object(
            'sku', v_item.sku,
            'barcode', v_item.barcode,
            'quantity_deducted', p_quantity,
            'remaining_stock', v_item.stock_quantity
        )
    );

    RETURN jsonb_build_object(
        'id', v_item.id,
        'sku', v_item.sku,
        'barcode', v_item.barcode,
        'name', v_item.name,
        'category', v_item.category,
        'price_cents', ROUND(v_item.price_dollars * 100)::INT,
        'price_dollars', v_item.price_dollars,
        'stock_quantity', v_item.stock_quantity,
        'reorder_threshold', v_item.reorder_threshold,
        'retail_commission_pct', v_item.retail_commission_pct,
        'low_stock_alert', (v_item.stock_quantity <= v_item.reorder_threshold)
    );
END;
$$;
REVOKE ALL ON FUNCTION public.deduct_retail_inventory_atomic(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_retail_inventory_atomic(TEXT, INT) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 6. POS SPLIT-TENDER CENTS, IDEMPOTENCY, OVER-REFUND CAP & STRIPE PROGRESSION
-- ----------------------------------------------------------------------------

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS cash_tender_cents INTEGER CHECK (cash_tender_cents IS NULL OR cash_tender_cents >= 0),
    ADD COLUMN IF NOT EXISTS card_tender_cents INTEGER CHECK (card_tender_cents IS NULL OR card_tender_cents >= 0),
    ADD COLUMN IF NOT EXISTS gift_card_tender_cents INTEGER CHECK (gift_card_tender_cents IS NULL OR gift_card_tender_cents >= 0),
    ADD COLUMN IF NOT EXISTS credit_tender_cents INTEGER CHECK (credit_tender_cents IS NULL OR credit_tender_cents >= 0),
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_split_tender_cent_balance;
ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_split_tender_cent_balance
    CHECK (
        payment_method <> 'split'
        OR (
            cash_tender_cents IS NULL
            AND card_tender_cents IS NULL
            AND gift_card_tender_cents IS NULL
            AND credit_tender_cents IS NULL
        )
        OR (
            COALESCE(cash_tender_cents, 0)
            + COALESCE(card_tender_cents, 0)
            + COALESCE(gift_card_tender_cents, 0)
            + COALESCE(credit_tender_cents, 0)
            = ROUND(amount * 100)::INTEGER
        )
    );

CREATE UNIQUE INDEX IF NOT EXISTS transactions_business_idempotency_key_unique
    ON public.transactions (business_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Replace 9-arg record_pos_checkout cleanly with backwards-compatible 14-arg signature
DROP FUNCTION IF EXISTS public.record_pos_checkout(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.record_pos_checkout(
    p_visit_id UUID,
    p_subtotal DECIMAL,
    p_discount DECIMAL,
    p_tax DECIMAL,
    p_tip DECIMAL,
    p_amount DECIMAL,
    p_payment_method TEXT,
    p_stripe_intent_id TEXT DEFAULT NULL,
    p_is_cash_settled BOOLEAN DEFAULT false,
    p_idempotency_key TEXT DEFAULT NULL,
    p_cash_tender_cents INT DEFAULT NULL,
    p_card_tender_cents INT DEFAULT NULL,
    p_gift_card_tender_cents INT DEFAULT NULL,
    p_credit_tender_cents INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_business_id UUID;
    v_user_id UUID;
    v_staff_id UUID;
    v_staff_role TEXT;
    v_clean_key TEXT := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
    v_existing_tx JSONB;
    v_visit RECORD;
    v_tx_id UUID;
    v_tx JSONB;
    v_amount_cents INT;
    v_settles_immediately BOOLEAN;
BEGIN
    v_business_id := private.current_business_id();
    v_user_id := auth.uid();

    IF v_business_id IS NULL OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'A verified staff session is required' USING ERRCODE = 'PW010';
    END IF;

    SELECT id, role INTO v_staff_id, v_staff_role
    FROM public.staff_members
    WHERE auth_user_id = v_user_id AND business_id = v_business_id AND is_active = true;

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff member profile not found' USING ERRCODE = 'PW010';
    END IF;

    IF v_staff_role NOT IN ('owner', 'manager', 'front_desk') THEN
        RAISE EXCEPTION 'Role % is not authorized to execute POS checkout', v_staff_role USING ERRCODE = 'PW021';
    END IF;

    -- Idempotent replay check prior to mutating visit or ledger
    IF v_clean_key IS NOT NULL THEN
        SELECT to_jsonb(t) INTO v_existing_tx
        FROM public.transactions t
        WHERE t.business_id = v_business_id
          AND t.idempotency_key = v_clean_key
        LIMIT 1;

        IF v_existing_tx IS NOT NULL THEN
            RETURN v_existing_tx || jsonb_build_object('deduplicated', true);
        END IF;
    END IF;

    IF p_subtotal < 0 OR p_discount < 0 OR p_tax < 0 OR p_tip < 0 OR p_amount < 0
       OR p_discount > p_subtotal
       OR p_amount <> (p_subtotal - p_discount + p_tax + p_tip) THEN
        RAISE EXCEPTION 'POS cent breakdown does not balance: amount must equal subtotal - discount + tax + tip'
            USING ERRCODE = 'PW041';
    END IF;

    v_amount_cents := ROUND(p_amount * 100)::INT;

    IF p_payment_method = 'split' AND (
        p_cash_tender_cents IS NOT NULL
        OR p_card_tender_cents IS NOT NULL
        OR p_gift_card_tender_cents IS NOT NULL
        OR p_credit_tender_cents IS NOT NULL
    ) THEN
        IF COALESCE(p_cash_tender_cents, 0) < 0
           OR COALESCE(p_card_tender_cents, 0) < 0
           OR COALESCE(p_gift_card_tender_cents, 0) < 0
           OR COALESCE(p_credit_tender_cents, 0) < 0
           OR (
               COALESCE(p_cash_tender_cents, 0)
               + COALESCE(p_card_tender_cents, 0)
               + COALESCE(p_gift_card_tender_cents, 0)
               + COALESCE(p_credit_tender_cents, 0)
           ) <> v_amount_cents THEN
            RAISE EXCEPTION 'Split-tender cent allocations must sum exactly to % cents', v_amount_cents
                USING ERRCODE = 'PW041';
        END IF;
    END IF;

    SELECT id, status, version INTO v_visit
    FROM public.visits
    WHERE id = p_visit_id AND business_id = v_business_id
    FOR UPDATE;

    IF v_visit.id IS NULL THEN
        RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'PW028';
    END IF;

    IF v_visit.status IN ('completed', 'cancelled', 'refunded') THEN
        RAISE EXCEPTION 'Cannot checkout visit in % status', v_visit.status USING ERRCODE = 'PW042';
    END IF;

    v_settles_immediately := (
        (p_payment_method = 'cash' AND p_is_cash_settled = true)
        OR (p_payment_method = 'split' AND p_is_cash_settled = true AND COALESCE(p_card_tender_cents, 0) = 0 AND p_stripe_intent_id IS NULL)
    );

    IF v_settles_immediately THEN
        INSERT INTO public.transactions (
            business_id, visit_id, subtotal, discount, tax, tip, amount,
            payment_method, status, settlement_status, settled_at, settlement_note,
            idempotency_key, cash_tender_cents, card_tender_cents, gift_card_tender_cents, credit_tender_cents
        ) VALUES (
            v_business_id, p_visit_id, p_subtotal, p_discount, p_tax, p_tip, p_amount,
            p_payment_method, 'completed', 'settled', now(),
            CASE WHEN p_payment_method = 'split' THEN 'Split non-card tender settled at checkout'
                 ELSE 'Cash received and drawer verified at checkout' END,
            v_clean_key,
            CASE WHEN p_payment_method = 'cash' THEN COALESCE(p_cash_tender_cents, v_amount_cents) ELSE p_cash_tender_cents END,
            p_card_tender_cents, p_gift_card_tender_cents, p_credit_tender_cents
        ) RETURNING id INTO v_tx_id;

        UPDATE public.visits
        SET status = CASE WHEN status = 'released_unpaid' THEN 'completed' ELSE 'paid' END,
            version = version + 1
        WHERE id = p_visit_id;

        INSERT INTO public.workflow_events (
            business_id, workflow_id, event_type, source_record_type, source_record_id,
            source_version, actor_user_id, actor_role, previous_state, new_state, metadata
        ) VALUES (
            v_business_id, 'WF06', 'payment.settled', 'transaction', v_tx_id::text,
            v_visit.version + 1, v_user_id, v_staff_role, v_visit.status,
            CASE WHEN v_visit.status = 'released_unpaid' THEN 'completed' ELSE 'paid' END,
            jsonb_build_object('payment_method', p_payment_method, 'amount', p_amount)
        );
    ELSE
        INSERT INTO public.transactions (
            business_id, visit_id, subtotal, discount, tax, tip, amount,
            payment_method, stripe_payment_intent_id, status, settlement_status,
            idempotency_key, cash_tender_cents, card_tender_cents, gift_card_tender_cents, credit_tender_cents
        ) VALUES (
            v_business_id, p_visit_id, p_subtotal, p_discount, p_tax, p_tip, p_amount,
            p_payment_method, p_stripe_intent_id, 'pending',
            CASE WHEN p_stripe_intent_id IS NOT NULL THEN 'pending' ELSE 'unsettled' END,
            v_clean_key, p_cash_tender_cents, p_card_tender_cents, p_gift_card_tender_cents, p_credit_tender_cents
        ) RETURNING id INTO v_tx_id;

        UPDATE public.visits
        SET status = 'payment_pending',
            version = version + 1
        WHERE id = p_visit_id;

        INSERT INTO public.workflow_events (
            business_id, workflow_id, event_type, source_record_type, source_record_id,
            source_version, actor_user_id, actor_role, previous_state, new_state, metadata
        ) VALUES (
            v_business_id, 'WF06', 'payment.recorded', 'transaction', v_tx_id::text,
            v_visit.version + 1, v_user_id, v_staff_role, v_visit.status, 'payment_pending',
            jsonb_build_object('payment_method', p_payment_method, 'amount', p_amount)
        );
    END IF;

    SELECT to_jsonb(t) INTO v_tx
    FROM public.transactions t
    WHERE t.id = v_tx_id;

    RETURN v_tx;
END;
$$;
REVOKE ALL ON FUNCTION public.record_pos_checkout(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT, BOOLEAN, TEXT, INT, INT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_pos_checkout(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT, BOOLEAN, TEXT, INT, INT, INT, INT) TO authenticated, service_role;

-- Update close_salon_day to include settled split-tender cash drawer cents
CREATE OR REPLACE FUNCTION public.close_salon_day(
    p_salon_date DATE,
    p_counted_cash_cents INT,
    p_variance_reason TEXT DEFAULT NULL,
    p_closeout_summary JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_business_id UUID;
    v_user_id UUID;
    v_staff_id UUID;
    v_staff_role TEXT;
    v_day RECORD;
    v_unresolved_count INT;
    v_expected_cash_cents INT;
    v_cash_variance_cents INT;
BEGIN
    v_business_id := private.current_business_id();
    v_user_id := auth.uid();

    IF v_business_id IS NULL OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'A verified staff session is required' USING ERRCODE = 'PW010';
    END IF;

    SELECT id, role INTO v_staff_id, v_staff_role
    FROM public.staff_members
    WHERE auth_user_id = v_user_id AND business_id = v_business_id AND is_active = true;

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff member profile not found' USING ERRCODE = 'PW010';
    END IF;

    IF v_staff_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only an owner or manager can close the salon day (WF08)'
            USING ERRCODE = 'PW050';
    END IF;

    IF p_counted_cash_cents < 0 THEN
        RAISE EXCEPTION 'Counted cash cannot be negative' USING ERRCODE = 'PW021';
    END IF;

    SELECT id, status INTO v_day
    FROM public.daily_salon_days
    WHERE business_id = v_business_id AND salon_date = p_salon_date
    FOR UPDATE;

    IF v_day.id IS NULL THEN
        RAISE EXCEPTION 'Salon day % has not been opened or does not exist', p_salon_date
            USING ERRCODE = 'PW028';
    END IF;

    IF v_day.status = 'closed' THEN
        RAISE EXCEPTION 'Salon day % is already closed', p_salon_date
            USING ERRCODE = 'PW051';
    END IF;

    SELECT count(*) INTO v_unresolved_count
    FROM public.visits v
    LEFT JOIN public.business_configs bc ON bc.business_id = v.business_id
    WHERE v.business_id = v_business_id
      AND (v.scheduled_time AT TIME ZONE COALESCE(bc.custom_settings->>'time_zone', 'UTC'))::DATE = p_salon_date
      AND v.status NOT IN ('completed', 'cancelled', 'no_show', 'partly_completed', 'released_unpaid', 'refunded', 'refused');

    IF v_unresolved_count > 0 THEN
        RAISE EXCEPTION 'Cannot close day: % visit(s) remain open or in progress', v_unresolved_count
            USING ERRCODE = 'PW048';
    END IF;

    SELECT COALESCE(SUM(
        CASE
            WHEN t.payment_method = 'cash' THEN ROUND(t.amount * 100)::INT
            WHEN t.payment_method = 'split' THEN COALESCE(t.cash_tender_cents, 0)
            ELSE 0
        END
    ), 0)::INT INTO v_expected_cash_cents
    FROM public.transactions t
    JOIN public.visits v ON v.id = t.visit_id
    LEFT JOIN public.business_configs bc ON bc.business_id = v.business_id
    WHERE t.business_id = v_business_id
      AND (v.scheduled_time AT TIME ZONE COALESCE(bc.custom_settings->>'time_zone', 'UTC'))::DATE = p_salon_date
      AND t.payment_method IN ('cash', 'split')
      AND t.status = 'completed'
      AND t.settlement_status = 'settled';

    v_cash_variance_cents := p_counted_cash_cents - v_expected_cash_cents;

    IF v_cash_variance_cents <> 0 AND (p_variance_reason IS NULL OR TRIM(p_variance_reason) = '') THEN
        RAISE EXCEPTION 'A mandatory explanation reason is required when cash drawer has a variance (WF08)'
            USING ERRCODE = 'PW049';
    END IF;

    UPDATE public.daily_salon_days
    SET status = 'closed',
        closed_at = timezone('utc'::text, now()),
        closed_by = v_staff_id,
        expected_cash_cents = v_expected_cash_cents,
        counted_cash_cents = p_counted_cash_cents,
        cash_variance_cents = v_cash_variance_cents,
        variance_reason = NULLIF(TRIM(p_variance_reason), ''),
        closeout_summary = p_closeout_summary,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_day.id;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id, source_version,
        actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF08', 'day.closed', 'daily_salon_days', v_day.id::text, 1,
        v_user_id, v_staff_role, 'open', 'closed',
        COALESCE(NULLIF(TRIM(p_variance_reason), ''), 'End-of-day register closeout completed and day locked.'),
        jsonb_build_object(
            'salon_date', p_salon_date,
            'expected_cash_cents', v_expected_cash_cents,
            'counted_cash_cents', p_counted_cash_cents,
            'variance_cents', v_cash_variance_cents,
            'summary', p_closeout_summary
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'day_id', v_day.id,
        'salon_date', p_salon_date,
        'status', 'closed',
        'expected_cash_cents', v_expected_cash_cents,
        'counted_cash_cents', p_counted_cash_cents,
        'variance_cents', v_cash_variance_cents,
        'closed_at', timezone('utc'::text, now())
    );
END;
$$;
REVOKE ALL ON FUNCTION public.close_salon_day(DATE, INT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_salon_day(DATE, INT, TEXT, JSONB) TO authenticated, service_role;

-- Harden process_visit_refund against unsettled transactions and cumulative over-refunds
CREATE OR REPLACE FUNCTION public.process_visit_refund(
    p_transaction_id UUID,
    p_amount DECIMAL,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_business_id UUID;
    v_user_id UUID;
    v_staff_id UUID;
    v_staff_role TEXT;
    v_tx RECORD;
    v_visit RECORD;
    v_prior_refunded DECIMAL(10,2) := 0;
    v_refund_id UUID;
    v_res JSONB;
BEGIN
    v_business_id := private.current_business_id();
    v_user_id := auth.uid();

    IF v_business_id IS NULL OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'A verified staff session is required' USING ERRCODE = 'PW010';
    END IF;

    SELECT id, role INTO v_staff_id, v_staff_role
    FROM public.staff_members
    WHERE auth_user_id = v_user_id AND business_id = v_business_id AND is_active = true;

    IF v_staff_role IS NULL OR v_staff_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Refunds require manager or owner authorization (WF15)' USING ERRCODE = 'PW045';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
        RAISE EXCEPTION 'A mandatory explanation reason is required for refunds (WF15)' USING ERRCODE = 'PW046';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Refund amount must be strictly positive' USING ERRCODE = 'PW047';
    END IF;

    SELECT id, visit_id, amount, settlement_status INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id AND business_id = v_business_id
    FOR UPDATE;

    IF v_tx.id IS NULL THEN
        RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'PW028';
    END IF;

    IF v_tx.settlement_status NOT IN ('settled', 'refunded') THEN
        RAISE EXCEPTION 'Cannot refund an unsettled or failed transaction (status: %)', v_tx.settlement_status
            USING ERRCODE = 'PW047';
    END IF;

    SELECT COALESCE(SUM(r.amount), 0) INTO v_prior_refunded
    FROM public.refund_records r
    WHERE r.transaction_id = p_transaction_id
      AND r.business_id = v_business_id
      AND r.status IN ('pending', 'completed');

    IF (v_prior_refunded + p_amount) > v_tx.amount THEN
        RAISE EXCEPTION 'Cumulative refund amount (%) exceeds original transaction amount (%)',
            (v_prior_refunded + p_amount), v_tx.amount
            USING ERRCODE = 'PW047';
    END IF;

    SELECT id, status, version INTO v_visit
    FROM public.visits
    WHERE id = v_tx.visit_id AND business_id = v_business_id
    FOR UPDATE;

    INSERT INTO public.refund_records (
        business_id, transaction_id, visit_id, amount, reason, approved_by
    ) VALUES (
        v_business_id, p_transaction_id, v_tx.visit_id, p_amount, p_reason, v_staff_id
    ) RETURNING id INTO v_refund_id;

    UPDATE public.transactions
    SET status = CASE WHEN (v_prior_refunded + p_amount) >= v_tx.amount THEN 'refunded' ELSE status END,
        settlement_status = CASE WHEN (v_prior_refunded + p_amount) >= v_tx.amount THEN 'refunded' ELSE settlement_status END,
        settlement_note = 'Refund approved: ' || p_reason
    WHERE id = p_transaction_id;

    IF (v_prior_refunded + p_amount) >= v_tx.amount THEN
        UPDATE public.visits
        SET status = 'refunded',
            version = version + 1
        WHERE id = v_tx.visit_id;
    END IF;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF15', 'refund.approved', 'refund_record', v_refund_id::text,
        COALESCE(v_visit.version, 0) + 1, v_user_id, v_staff_role, v_visit.status,
        CASE WHEN (v_prior_refunded + p_amount) >= v_tx.amount THEN 'refunded' ELSE v_visit.status END,
        p_reason,
        jsonb_build_object(
            'refund_amount', p_amount,
            'cumulative_refunded', v_prior_refunded + p_amount,
            'transaction_id', p_transaction_id
        )
    );

    SELECT to_jsonb(r) INTO v_res FROM public.refund_records r WHERE r.id = v_refund_id;
    RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.process_visit_refund(UUID, DECIMAL, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_visit_refund(UUID, DECIMAL, TEXT) TO authenticated, service_role;

-- Update apply_stripe_payment_event so card/split checkouts transition visits from payment_pending to paid/completed
CREATE OR REPLACE FUNCTION public.apply_stripe_payment_event(
    p_event_id text, p_event_type text, p_payment_intent_id text,
    p_amount_cents bigint, p_currency text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target record;
    expected_cents bigint;
    result_outcome text;
BEGIN
    IF p_event_id IS NULL OR p_event_type IS NULL OR p_payment_intent_id IS NULL THEN
        RAISE EXCEPTION 'Event id, type and payment intent are required' USING ERRCODE = 'PW031';
    END IF;

    INSERT INTO public.stripe_webhook_events (event_id, event_type, payment_intent_id, outcome)
    VALUES (p_event_id, p_event_type, p_payment_intent_id, 'processing')
    ON CONFLICT (event_id) DO NOTHING;
    IF NOT FOUND THEN
        RETURN 'duplicate';
    END IF;

    SELECT id, visit_id, amount, payment_method, card_tender_cents, status, settlement_status
    INTO target
    FROM public.transactions
    WHERE stripe_payment_intent_id = p_payment_intent_id
    FOR UPDATE;

    IF target.id IS NULL THEN
        result_outcome := 'unknown_payment';
    ELSIF p_event_type = 'payment_intent.succeeded' THEN
        expected_cents := CASE
            WHEN target.payment_method = 'split' AND target.card_tender_cents IS NOT NULL THEN target.card_tender_cents::bigint
            ELSE ROUND(target.amount * 100)::bigint
        END;

        IF target.settlement_status = 'refunded' THEN
            result_outcome := 'ignored';
        ELSIF lower(COALESCE(p_currency, '')) = 'usd' AND p_amount_cents = expected_cents THEN
            UPDATE public.transactions
            SET settlement_status = 'settled',
                settled_at = now(),
                settlement_note = NULL,
                status = CASE
                    WHEN status = 'pending' AND NOT EXISTS (
                        SELECT 1 FROM public.transactions t2
                        WHERE t2.visit_id = target.visit_id
                          AND t2.id <> target.id
                          AND t2.status = 'completed'
                    ) THEN 'completed'
                    ELSE status
                END
            WHERE id = target.id;

            IF target.visit_id IS NOT NULL THEN
                UPDATE public.visits
                SET status = CASE
                        WHEN status = 'released_unpaid' THEN 'completed'
                        WHEN status = 'payment_pending' AND released_at IS NOT NULL THEN 'completed'
                        WHEN status = 'payment_pending' THEN 'paid'
                        ELSE status
                    END,
                    version = version + 1
                WHERE id = target.visit_id
                  AND status IN ('payment_pending', 'released_unpaid');
            END IF;

            result_outcome := 'settled';
        ELSE
            UPDATE public.transactions
            SET settlement_status = 'failed', settled_at = NULL,
                settlement_note = 'Stripe confirmed a different amount or currency than the recorded checkout'
            WHERE id = target.id;
            result_outcome := 'amount_mismatch';
        END IF;
    ELSIF p_event_type = 'payment_intent.payment_failed' THEN
        IF target.settlement_status IN ('settled', 'refunded') THEN
            result_outcome := 'ignored';
        ELSE
            UPDATE public.transactions
            SET settlement_status = 'failed', settled_at = NULL, settlement_note = 'Stripe reported the payment failed'
            WHERE id = target.id;
            result_outcome := 'failed';
        END IF;
    ELSIF p_event_type = 'charge.refunded' THEN
        UPDATE public.transactions
        SET settlement_status = 'refunded', settlement_note = 'Stripe reported a refund'
        WHERE id = target.id;
        result_outcome := 'refunded';
    ELSE
        result_outcome := 'ignored';
    END IF;

    UPDATE public.stripe_webhook_events SET outcome = result_outcome
    WHERE event_id = p_event_id;
    RETURN result_outcome;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_stripe_payment_event(text, text, text, bigint, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_payment_event(text, text, text, bigint, text) TO service_role;


-- ----------------------------------------------------------------------------
-- 7. MISSING FOREIGN KEY & COMPOSITE PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_visits_waiver_id
    ON public.visits (waiver_id) WHERE waiver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visit_surcharges_requested_by
    ON public.visit_surcharges (requested_by) WHERE requested_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visit_surcharges_resolved_by
    ON public.visit_surcharges (resolved_by) WHERE resolved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incident_reports_pet_id
    ON public.incident_reports (pet_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_client_id
    ON public.incident_reports (client_id);
CREATE INDEX IF NOT EXISTS idx_refund_records_visit_id
    ON public.refund_records (visit_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_pet_id
    ON public.report_cards (pet_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_client_id
    ON public.report_cards (client_id);
CREATE INDEX IF NOT EXISTS idx_client_communications_visit_id
    ON public.client_communications (visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_preferred_staff
    ON public.waitlist_entries (preferred_staff_id) WHERE preferred_staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waitlist_offers_assigned_staff
    ON public.waitlist_offers (assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_offers_claimed_visit
    ON public.waitlist_offers (claimed_visit_id) WHERE claimed_visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pet_documents_client_id
    ON public.pet_documents (client_id);
