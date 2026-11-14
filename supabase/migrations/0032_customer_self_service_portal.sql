-- ============================================================================
-- 0032: Customer Self-Service Portal (WF02 / WF14)
--
-- Enables authenticated pet parents or anonymous public customers with a valid
-- 8-character booking reference and matching phone number to:
--   1. Look up appointment details, salon policy, and live visit status.
--   2. Cancel upcoming bookings self-service subject to salon 24h advance policy.
--   3. Reschedule bookings into open GiST-locked slots self-service.
--
-- All actions write append-only audit events to public.workflow_events.
-- ============================================================================

-- 1. Internal implementation: Lookup booking by reference and phone
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
           COALESCE(c.time_zone, 'America/New_York') AS zone,
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

    -- Pet parents can self-cancel or self-reschedule online if the visit is still in 'booked' status
    -- and at least 24 hours remain before the scheduled start time.
    can_manage := (v_rec.status = 'booked' AND v_rec.scheduled_time > now() + interval '24 hours');

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
        'policy_notice', 'Appointments can be modified or cancelled online up to 24 hours in advance. For changes within 24 hours, please contact the salon directly.'
    );
END;
$$;

REVOKE ALL ON FUNCTION private.customer_booking_lookup_internal(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.customer_booking_lookup_internal(text, text, text) TO anon, authenticated, service_role;

-- 2. Public wrapper: Lookup booking
CREATE OR REPLACE FUNCTION public.public_get_booking_by_reference(
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
BEGIN
    RETURN private.customer_booking_lookup_internal(p_slug, p_reference, p_phone);
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_booking_by_reference(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_booking_by_reference(text, text, text) TO anon, authenticated, service_role;


-- 3. Internal implementation: Cancel booking
CREATE OR REPLACE FUNCTION private.customer_cancel_booking_internal(
    p_slug text,
    p_reference text,
    p_phone text,
    p_reason text DEFAULT NULL
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
    clean_reason text := btrim(COALESCE(p_reason, ''));
    biz record;
    v_rec record;
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

    SELECT b.id, b.name, b.slug
    INTO biz
    FROM public.businesses b
    WHERE b.slug = clean_slug AND b.subscription_status IN ('active', 'trialing');

    IF biz.id IS NULL THEN
        RAISE EXCEPTION 'Salon not found or inactive' USING ERRCODE = 'PW020';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('pawtrackr-online-booking:' || biz.id::text, 0));

    SELECT v.id, v.status, v.scheduled_time, v.service_package, p.name AS pet_name
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

    IF v_rec.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'reference', clean_ref,
            'status', 'cancelled',
            'already_cancelled', true,
            'message', 'This appointment has already been cancelled.'
        );
    END IF;

    IF v_rec.status <> 'booked' THEN
        RAISE EXCEPTION 'Only upcoming appointments in booked status can be cancelled online' USING ERRCODE = 'PW031';
    END IF;

    IF v_rec.scheduled_time <= now() + interval '24 hours' THEN
        RAISE EXCEPTION 'Cancellations within 24 hours must be handled directly with the salon' USING ERRCODE = 'PW032';
    END IF;

    UPDATE public.visits
    SET status = 'cancelled',
        station_id = NULL
    WHERE id = v_rec.id;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        biz.id, 'WF14', 'booking.cancelled', 'visit', v_rec.id::text,
        1, 'customer', 'booked', 'cancelled',
        COALESCE(NULLIF(clean_reason, ''), 'Customer self-service online cancellation'),
        jsonb_build_object(
            'reference', clean_ref,
            'original_scheduled_time', v_rec.scheduled_time,
            'service', v_rec.service_package,
            'pet_name', v_rec.pet_name
        )
    );

    RETURN jsonb_build_object(
        'reference', clean_ref,
        'status', 'cancelled',
        'cancelled_at', now(),
        'service', v_rec.service_package,
        'pet_name', v_rec.pet_name,
        'salon_name', biz.name
    );
END;
$$;

REVOKE ALL ON FUNCTION private.customer_cancel_booking_internal(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.customer_cancel_booking_internal(text, text, text, text) TO anon, authenticated, service_role;

-- 4. Public wrapper: Cancel booking
CREATE OR REPLACE FUNCTION public.public_cancel_booking(
    p_slug text,
    p_reference text,
    p_phone text,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN private.customer_cancel_booking_internal(p_slug, p_reference, p_phone, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.public_cancel_booking(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_cancel_booking(text, text, text, text) TO anon, authenticated, service_role;


-- 5. Internal implementation: Reschedule booking
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
           COALESCE(c.time_zone, 'America/New_York') AS zone,
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

    -- If rescheduling to the exact same minute, no change is needed
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

    -- Prefer currently assigned groomer if available for the new slot
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
                    AND v.status IN ('booked', 'dropped_off', 'bathing', 'styling', 'ready')
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

-- 6. Public wrapper: Reschedule booking
CREATE OR REPLACE FUNCTION public.public_reschedule_booking(
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
BEGIN
    RETURN private.customer_reschedule_booking_internal(p_slug, p_reference, p_phone, p_new_start);
END;
$$;

REVOKE ALL ON FUNCTION public.public_reschedule_booking(text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_reschedule_booking(text, text, text, timestamptz) TO anon, authenticated, service_role;
