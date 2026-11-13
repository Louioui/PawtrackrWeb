-- ============================================================================
-- Migration: 0023_workflow_foundation_and_phase1_readiness.sql
-- Purpose:
--   1. Expand staff roles to the 6 Pawtrackr workflow roles.
--   2. Add salon operating_model, explicit booking_status ('draft' | 'published'
--      | 'paused'), trial_ends_at, and strict_shift_station_mode.
--   3. Create public.salon_stations (tables, tubs, dryers, vans) and enforce
--      non-overlapping station occupancy on public.visits via GiST exclusion.
--   4. Create public.staff_weekly_shifts and update visit availability checks
--      to support weekly salon hours, recurring weekly shifts, and strict
--      shift + station booking requirements.
--   5. Create append-only public.workflow_events audit ledger (WF00 / WF37).
--   6. Make salon provisioning idempotent on dropped-connection retries and add
--      idempotent public booking + attempt status lookup RPCs (WF14 / WF36)
--      behind the SECURITY INVOKER -> private SECURITY DEFINER boundary.
-- ============================================================================

-- 1. Six-role staff model & salon launch/lifecycle columns
ALTER TABLE public.staff_members
    DROP CONSTRAINT IF EXISTS staff_members_role_check;
ALTER TABLE public.staff_members
    ADD CONSTRAINT staff_members_role_check
    CHECK (role IN ('owner', 'manager', 'front_desk', 'senior_groomer', 'groomer', 'bather'));

ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS operating_model text NOT NULL DEFAULT 'salon'
        CHECK (operating_model IN ('salon', 'mobile_van', 'hybrid')),
    ADD COLUMN IF NOT EXISTS booking_status text NOT NULL DEFAULT 'published'
        CHECK (booking_status IN ('draft', 'published', 'paused')),
    ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

ALTER TABLE public.business_configs
    ADD COLUMN IF NOT EXISTS strict_shift_station_mode boolean NOT NULL DEFAULT false;

-- 2. Physical salon stations (tables, tubs, cage dryers, mobile vans)
CREATE TABLE IF NOT EXISTS public.salon_stations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
    station_type text NOT NULL DEFAULT 'table'
        CHECK (station_type IN ('table', 'tub', 'cage_dryer', 'van')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (business_id, name)
);

CREATE INDEX IF NOT EXISTS salon_stations_business_id_idx
    ON public.salon_stations (business_id);

ALTER TABLE public.salon_stations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.salon_stations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salon_stations TO authenticated;

CREATE POLICY "Tenant isolation for salon_stations"
    ON public.salon_stations FOR ALL TO authenticated
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

-- Link visits to stations, versioning, test-booking isolation, and idempotency keys
ALTER TABLE public.visits
    ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES public.salon_stations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_test_booking boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    ADD COLUMN IF NOT EXISTS booking_idempotency_key text
        CHECK (booking_idempotency_key IS NULL OR (length(booking_idempotency_key) BETWEEN 8 AND 120));

CREATE INDEX IF NOT EXISTS visits_station_id_idx
    ON public.visits (station_id);

CREATE UNIQUE INDEX IF NOT EXISTS visits_business_booking_idempotency_idx
    ON public.visits (business_id, booking_idempotency_key)
    WHERE booking_idempotency_key IS NOT NULL;

CREATE TRIGGER visits_station_business
BEFORE INSERT OR UPDATE OF business_id, station_id ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('station_id', 'salon_stations');

-- Increment visit version automatically on update so concurrent editors can detect stale writes
CREATE OR REPLACE FUNCTION private.bump_visit_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.version := COALESCE(OLD.version, 1) + 1;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.bump_visit_version() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_bump_visit_version
BEFORE UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION private.bump_visit_version();

-- Prevent concurrent double-booking of the same physical station
SET search_path = public, extensions;
ALTER TABLE public.visits
    ADD CONSTRAINT visits_no_overlapping_active_station_reservations
    EXCLUDE USING gist (
        business_id WITH =,
        station_id WITH =,
        tstzrange(scheduled_time, reservation_end, '[)') WITH &&
    ) WHERE (station_id IS NOT NULL AND status IN ('booked', 'dropped_off', 'bathing', 'styling', 'ready'));
RESET search_path;

-- 3. Recurring weekly groomer shifts (complementing dated overrides in staff_shifts)
CREATE TABLE IF NOT EXISTS public.staff_weekly_shifts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
    day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    end_time text NOT NULL CHECK (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND start_time < end_time),
    station_id uuid REFERENCES public.salon_stations(id) ON DELETE SET NULL,
    assigned_station text NOT NULL DEFAULT 'Table 1' CHECK (btrim(assigned_station) <> '' AND length(assigned_station) <= 80),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (business_id, staff_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS staff_weekly_shifts_business_day_idx
    ON public.staff_weekly_shifts (business_id, day_of_week);
CREATE INDEX IF NOT EXISTS staff_weekly_shifts_staff_id_idx
    ON public.staff_weekly_shifts (staff_id);
CREATE INDEX IF NOT EXISTS staff_weekly_shifts_station_id_idx
    ON public.staff_weekly_shifts (station_id);

ALTER TABLE public.staff_weekly_shifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_weekly_shifts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_weekly_shifts TO authenticated;

CREATE POLICY "Tenant isolation for staff_weekly_shifts"
    ON public.staff_weekly_shifts FOR ALL TO authenticated
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

CREATE TRIGGER weekly_shifts_staff_business
BEFORE INSERT OR UPDATE OF business_id, staff_id ON public.staff_weekly_shifts
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('staff_id', 'staff_members');

CREATE TRIGGER weekly_shifts_station_business
BEFORE INSERT OR UPDATE OF business_id, station_id ON public.staff_weekly_shifts
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('station_id', 'salon_stations');

-- 4. Append-only workflow event ledger (WF00 / WF37)
CREATE TABLE IF NOT EXISTS public.workflow_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    workflow_id text NOT NULL CHECK (btrim(workflow_id) <> '' AND length(workflow_id) <= 40),
    event_type text NOT NULL CHECK (btrim(event_type) <> '' AND length(event_type) <= 80),
    source_record_type text NOT NULL CHECK (btrim(source_record_type) <> '' AND length(source_record_type) <= 60),
    source_record_id text NOT NULL CHECK (btrim(source_record_id) <> '' AND length(source_record_id) <= 120),
    source_version integer NOT NULL DEFAULT 1 CHECK (source_version >= 1),
    actor_user_id uuid,
    actor_role text NOT NULL CHECK (btrim(actor_role) <> '' AND length(actor_role) <= 40),
    previous_state text,
    new_state text,
    reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS workflow_events_business_created_idx
    ON public.workflow_events (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_events_source_idx
    ON public.workflow_events (business_id, source_record_type, source_record_id);

ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workflow_events FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.workflow_events TO authenticated;

CREATE POLICY "Tenant staff can read workflow_events"
    ON public.workflow_events FOR SELECT TO authenticated
    USING (business_id = private.current_business_id());

CREATE POLICY "Tenant staff can append workflow_events"
    ON public.workflow_events FOR INSERT TO authenticated
    WITH CHECK (business_id = private.current_business_id());

CREATE POLICY "No client updates on workflow_events"
    ON public.workflow_events FOR UPDATE TO anon, authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "No client deletes on workflow_events"
    ON public.workflow_events FOR DELETE TO anon, authenticated
    USING (false);

CREATE OR REPLACE FUNCTION private.prevent_workflow_event_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'workflow_events is append-only; create a linked correction event instead'
        USING ERRCODE = 'PW040';
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_workflow_event_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.prevent_workflow_event_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Allow ON DELETE CASCADE when the parent business itself is being removed,
    -- while rejecting any direct deletion of audit history for an existing salon.
    IF EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = OLD.business_id) THEN
        RAISE EXCEPTION 'workflow_events is append-only; audit history cannot be deleted'
            USING ERRCODE = 'PW040';
    END IF;
    RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_workflow_event_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_workflow_events_no_update
BEFORE UPDATE ON public.workflow_events
FOR EACH STATEMENT EXECUTE FUNCTION private.prevent_workflow_event_update();

CREATE TRIGGER trg_workflow_events_no_delete
BEFORE DELETE ON public.workflow_events
FOR EACH ROW EXECUTE FUNCTION private.prevent_workflow_event_delete();

-- 5. Enhanced schedule, weekly-hours, shift-precedence, and station availability helpers
CREATE OR REPLACE FUNCTION private.visit_window_error(
    p_business_id uuid, p_staff_id uuid, p_zone text, p_open text, p_close text,
    p_start timestamptz, p_end timestamptz
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    clock_pattern constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
    local_start timestamp := p_start AT TIME ZONE p_zone;
    local_end timestamp := p_end AT TIME ZONE p_zone;
    dow integer;
    settings jsonb;
    strict_mode boolean := false;
    day_hours jsonb;
    eff_open text := p_open;
    eff_close text := p_close;
    dated_rows integer;
    has_time_off boolean;
    fits_dated_shift boolean;
    weekly_rows integer;
    fits_weekly_shift boolean;
BEGIN
    IF local_start::date <> local_end::date THEN
        RETURN 'PW001';
    END IF;

    SELECT c.custom_settings, COALESCE(c.strict_shift_station_mode, false)
    INTO settings, strict_mode
    FROM public.business_configs c
    WHERE c.business_id = p_business_id;

    dow := EXTRACT(DOW FROM local_start::date)::integer;
    IF jsonb_typeof(settings -> 'weekly_hours') = 'object' THEN
        day_hours := settings -> 'weekly_hours' -> (dow::text);
        IF jsonb_typeof(day_hours) = 'object' THEN
            IF COALESCE((day_hours ->> 'closed')::boolean, false) THEN
                RETURN 'PW001';
            END IF;
            IF (day_hours ->> 'open') ~ clock_pattern
                AND (day_hours ->> 'close') ~ clock_pattern
                AND (day_hours ->> 'open') < (day_hours ->> 'close') THEN
                eff_open := day_hours ->> 'open';
                eff_close := day_hours ->> 'close';
            END IF;
        END IF;
    END IF;

    IF local_start::time < eff_open::time OR local_end::time > eff_close::time THEN
        RETURN 'PW001';
    END IF;

    IF p_staff_id IS NULL THEN
        RETURN CASE WHEN strict_mode THEN 'PW002' ELSE NULL END;
    END IF;

    SELECT count(*),
           COALESCE(bool_or(status = 'time_off'), false),
           COALESCE(bool_or(
               status = 'scheduled'
               AND private.salon_local_instant(shift_date, start_time, p_zone) <= p_start
               AND private.salon_local_instant(shift_date, end_time, p_zone) >= p_end
           ), false)
    INTO dated_rows, has_time_off, fits_dated_shift
    FROM public.staff_shifts
    WHERE business_id = p_business_id
      AND staff_id = p_staff_id
      AND shift_date = local_start::date;

    IF has_time_off THEN
        RETURN 'PW002';
    END IF;
    IF dated_rows > 0 THEN
        RETURN CASE WHEN fits_dated_shift THEN NULL ELSE 'PW002' END;
    END IF;

    SELECT count(*),
           COALESCE(bool_or(
               private.salon_local_instant(local_start::date, start_time, p_zone) <= p_start
               AND private.salon_local_instant(local_start::date, end_time, p_zone) >= p_end
           ), false)
    INTO weekly_rows, fits_weekly_shift
    FROM public.staff_weekly_shifts
    WHERE business_id = p_business_id
      AND staff_id = p_staff_id
      AND day_of_week = dow
      AND is_active;

    IF weekly_rows > 0 THEN
        RETURN CASE WHEN fits_weekly_shift THEN NULL ELSE 'PW002' END;
    END IF;

    IF strict_mode THEN
        RETURN 'PW002';
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.visit_window_error(uuid, uuid, text, text, text, timestamptz, timestamptz)
    FROM PUBLIC, anon, authenticated;

-- Picks an available active station for [p_start, p_end), preferring any station
-- linked to the groomer's shift when free.
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
            AND v.status IN ('booked', 'dropped_off', 'bathing', 'styling', 'ready')
            AND tstzrange(v.scheduled_time, v.reservation_end, '[)') && tstzrange(p_start, p_end, '[)')
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

-- 6. Public booking catalog projection with booking_status & operating_model
ALTER TABLE public.booking_public_catalog
    ADD COLUMN IF NOT EXISTS booking_status text NOT NULL DEFAULT 'published'
        CHECK (booking_status IN ('draft', 'published', 'paused')),
    ADD COLUMN IF NOT EXISTS operating_model text NOT NULL DEFAULT 'salon'
        CHECK (operating_model IN ('salon', 'mobile_van', 'hybrid'));

CREATE OR REPLACE FUNCTION private.refresh_booking_public_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_business_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'businesses' THEN
        target_business_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        target_business_id := OLD.business_id;
    ELSE
        target_business_id := NEW.business_id;
    END IF;

    INSERT INTO public.booking_public_catalog (
        business_id, slug, name, city_state, packages, addons, operating_hours,
        active, time_zone, booking_status, operating_model
    )
    SELECT b.id, b.slug, b.name, b.city_state,
           COALESCE(c.custom_settings -> 'packages', '[]'::jsonb),
           COALESCE(c.custom_settings -> 'addons', '[]'::jsonb),
           COALESCE(c.custom_settings -> 'operating_hours', '{}'::jsonb),
           b.subscription_status IN ('active', 'trialing'),
           COALESCE(c.custom_settings ->> 'time_zone', 'UTC'),
           b.booking_status,
           b.operating_model
    FROM public.businesses b
    LEFT JOIN public.business_configs c ON c.business_id = b.id
    WHERE b.id = target_business_id
    ON CONFLICT (business_id) DO UPDATE SET
        slug = EXCLUDED.slug,
        name = EXCLUDED.name,
        city_state = EXCLUDED.city_state,
        packages = EXCLUDED.packages,
        addons = EXCLUDED.addons,
        operating_hours = EXCLUDED.operating_hours,
        active = EXCLUDED.active,
        time_zone = EXCLUDED.time_zone,
        booking_status = EXCLUDED.booking_status,
        operating_model = EXCLUDED.operating_model;
    RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION private.refresh_booking_public_catalog() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_booking_public_business ON public.businesses;
CREATE TRIGGER trg_booking_public_business
AFTER INSERT OR UPDATE OF slug, name, city_state, subscription_status, booking_status, operating_model
ON public.businesses
FOR EACH ROW EXECUTE FUNCTION private.refresh_booking_public_catalog();

UPDATE public.booking_public_catalog AS catalog
SET booking_status = b.booking_status,
    operating_model = b.operating_model
FROM public.businesses AS b
WHERE b.id = catalog.business_id;

-- Directory lists only published salons; direct service catalog keeps active
-- draft/paused salons readable so /portal/live/[slug] can show an honest status
-- message instead of an unexplained 404.
CREATE OR REPLACE VIEW public.booking_business_directory AS
SELECT business_id AS id, name, slug, city_state
FROM public.booking_public_catalog
WHERE active AND booking_status = 'published';

CREATE OR REPLACE VIEW public.booking_service_catalog AS
SELECT slug, packages, addons, operating_hours, time_zone, booking_status, operating_model, name
FROM public.booking_public_catalog
WHERE active;

DO $$ BEGIN
    IF current_setting('server_version_num')::integer >= 150000 THEN
        EXECUTE 'ALTER VIEW public.booking_business_directory SET (security_invoker = true)';
        EXECUTE 'ALTER VIEW public.booking_service_catalog SET (security_invoker = true)';
    END IF;
END $$;
REVOKE ALL ON public.booking_business_directory, public.booking_service_catalog FROM PUBLIC;
GRANT SELECT ON public.booking_business_directory, public.booking_service_catalog TO anon, authenticated;

-- 7. Idempotent salon provisioning with draft launch state & policy defaults
CREATE OR REPLACE FUNCTION private.provision_salon_with_model_internal(
    p_salon_name text,
    p_slug text,
    p_time_zone text,
    p_owner_name text,
    p_operating_model text
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
    op_model text := COALESCE(NULLIF(btrim(p_operating_model), ''), 'salon');
    existing_business uuid;
    new_business_id uuid;
BEGIN
    IF caller IS NULL THEN
        RAISE EXCEPTION 'A signed-in user is required' USING ERRCODE = 'PW010';
    END IF;
    IF caller_email IS NULL OR length(caller_email) > 320
        OR length(salon_name) NOT BETWEEN 2 AND 120
        OR length(owner_name) NOT BETWEEN 1 AND 120
        OR p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_slug) NOT BETWEEN 3 AND 60
        OR op_model NOT IN ('salon', 'mobile_van', 'hybrid')
        OR p_time_zone IS NULL
        OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_time_zone) THEN
        RAISE EXCEPTION 'Salon name, web address, owner name, operating model, or time zone is invalid'
            USING ERRCODE = 'PW012';
    END IF;

    -- Safe retry handling: if the response dropped after provisioning succeeded,
    -- repeating the exact same salon slug + name returns the existing salon id.
    -- Attempting to provision a second distinct salon still raises PW011.
    SELECT sm.business_id INTO existing_business
    FROM public.staff_members sm
    JOIN public.businesses b ON b.id = sm.business_id
    WHERE sm.auth_user_id = caller
      AND sm.role = 'owner'
      AND b.slug = p_slug
      AND lower(b.name) = lower(salon_name)
    LIMIT 1;

    IF existing_business IS NOT NULL THEN
        RETURN existing_business;
    END IF;

    IF EXISTS (SELECT 1 FROM public.staff_members WHERE auth_user_id = caller) THEN
        RAISE EXCEPTION 'This account already belongs to a salon' USING ERRCODE = 'PW011';
    END IF;

    INSERT INTO public.businesses (
        name, slug, owner_email, subscription_status, booking_status, operating_model, trial_ends_at
    )
    VALUES (
        salon_name, p_slug, caller_email, 'trialing', 'draft', op_model, now() + interval '30 days'
    )
    RETURNING id INTO new_business_id;

    INSERT INTO public.business_configs (business_id, tax_rate, strict_shift_station_mode)
    VALUES (new_business_id, 0.00, true);

    UPDATE public.business_configs
    SET custom_settings = custom_settings || jsonb_build_object(
        'time_zone', p_time_zone,
        'policies', jsonb_build_object(
            'trial_days', 30,
            'deposit_required', false,
            'booking_approval_mode', 'immediate',
            'tax_services', false,
            'cancellation_window_hours', 24,
            'tips_refundable', false,
            'chargeback_claws_back_commission', false,
            'receipt_link_ttl_days', 30
        )
    )
    WHERE business_id = new_business_id;

    INSERT INTO public.staff_members (business_id, auth_user_id, name, email, role, is_active)
    VALUES (new_business_id, caller, owner_name, caller_email, 'owner', true);

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        new_business_id, 'WF28', 'salon.provisioned', 'business', new_business_id::text,
        1, caller, 'owner', NULL, 'draft', 'Self-serve owner provisioning',
        jsonb_build_object('slug', p_slug, 'time_zone', p_time_zone, 'operating_model', op_model)
    );

    RETURN new_business_id;
END;
$$;
REVOKE ALL ON FUNCTION private.provision_salon_with_model_internal(text, text, text, text, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.provision_salon_with_model_internal(text, text, text, text, text)
    TO authenticated;

CREATE OR REPLACE FUNCTION private.provision_salon_internal(
    p_salon_name text,
    p_slug text,
    p_time_zone text,
    p_owner_name text
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT private.provision_salon_with_model_internal(p_salon_name, p_slug, p_time_zone, p_owner_name, 'salon');
$$;
REVOKE ALL ON FUNCTION private.provision_salon_internal(text, text, text, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.provision_salon_internal(text, text, text, text)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.provision_salon_with_model(
    p_salon_name text,
    p_slug text,
    p_time_zone text,
    p_owner_name text,
    p_operating_model text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT private.provision_salon_with_model_internal(
        p_salon_name, p_slug, p_time_zone, p_owner_name, p_operating_model
    );
$$;
REVOKE ALL ON FUNCTION public.provision_salon_with_model(text, text, text, text, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_salon_with_model(text, text, text, text, text)
    TO authenticated;

-- 8. Public booking publish gate, station enforcement, and idempotent retries
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
    salon_booking_status text;
    service jsonb;
    schedule record;
BEGIN
    SELECT b.id, b.booking_status INTO business_id, salon_booking_status
    FROM public.businesses b
    WHERE b.slug = p_slug AND b.subscription_status IN ('active', 'trialing');

    IF business_id IS NOT NULL AND salon_booking_status <> 'published' THEN
        RAISE EXCEPTION 'This salon is not taking online bookings right now'
            USING ERRCODE = 'PW024';
    END IF;

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
    clock_pattern constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
    ctx record;
    settings jsonb;
    day_hours jsonb;
    eff_open text;
    eff_close text;
    strict_mode boolean := false;
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
    SELECT c.custom_settings, COALESCE(c.strict_shift_station_mode, false)
    INTO settings, strict_mode
    FROM public.business_configs c
    WHERE c.business_id = ctx.business_id;

    eff_open := ctx.open_clock;
    eff_close := ctx.close_clock;
    IF jsonb_typeof(settings -> 'weekly_hours') = 'object' THEN
        day_hours := settings -> 'weekly_hours' -> (EXTRACT(DOW FROM p_date)::integer::text);
        IF jsonb_typeof(day_hours) = 'object' THEN
            IF COALESCE((day_hours ->> 'closed')::boolean, false) THEN
                RETURN;
            END IF;
            IF (day_hours ->> 'open') ~ clock_pattern
                AND (day_hours ->> 'close') ~ clock_pattern
                AND (day_hours ->> 'open') < (day_hours ->> 'close') THEN
                eff_open := day_hours ->> 'open';
                eff_close := day_hours ->> 'close';
            END IF;
        END IF;
    END IF;

    minute_of_day := split_part(eff_open, ':', 1)::integer * 60 + split_part(eff_open, ':', 2)::integer;
    minute_of_day := ((minute_of_day + 29) / 30) * 30;
    close_minute := split_part(eff_close, ':', 1)::integer * 60 + split_part(eff_close, ':', 2)::integer;

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
                WHERE s.business_id = ctx.business_id
                  AND s.role IN ('groomer', 'senior_groomer')
                  AND s.is_active
                  AND private.groomer_is_free(ctx.business_id, s.id, ctx.zone, ctx.open_clock,
                                              ctx.close_clock, candidate, candidate_end)
                  AND (NOT strict_mode OR private.free_station_for_window(
                      ctx.business_id, s.id, ctx.zone, candidate, candidate_end) IS NOT NULL)
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

    -- If a previous submit with this idempotency key already succeeded before a
    -- dropped connection or double-click, return the exact saved confirmation.
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
             AND v.status = 'booked' AND v.scheduled_time > now()
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
                AND v.status IN ('booked', 'dropped_off', 'bathing', 'styling', 'ready')
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

-- Keep the original 8-argument implementation delegating to the unified logic
CREATE OR REPLACE FUNCTION private.public_book_appointment_internal(
    p_slug text, p_package_id text, p_start timestamptz,
    p_client_name text, p_client_phone text, p_client_email text,
    p_pet_name text, p_breed text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT private.public_book_appointment_idempotent_internal(
        p_slug, p_package_id, p_start, p_client_name, p_client_phone,
        p_client_email, p_pet_name, p_breed, NULL
    );
$$;
REVOKE ALL ON FUNCTION private.public_book_appointment_internal(
    text, text, timestamptz, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.public_book_appointment_internal(
    text, text, timestamptz, text, text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_book_appointment_idempotent(
    p_slug text, p_package_id text, p_start timestamptz,
    p_client_name text, p_client_phone text, p_client_email text,
    p_pet_name text, p_breed text, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT private.public_book_appointment_idempotent_internal(
        p_slug, p_package_id, p_start, p_client_name, p_client_phone,
        p_client_email, p_pet_name, p_breed, p_idempotency_key
    );
$$;
REVOKE ALL ON FUNCTION public.public_book_appointment_idempotent(
    text, text, timestamptz, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_book_appointment_idempotent(
    text, text, timestamptz, text, text, text, text, text, text) TO anon, authenticated;

-- Dropped-connection recovery lookup: checks whether an opaque idempotency token
-- already created a booking for this salon without leaking customer PII.
CREATE OR REPLACE FUNCTION private.public_booking_attempt_status_internal(
    p_slug text,
    p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    clean_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
    target_business uuid;
    zone text;
    found record;
BEGIN
    IF p_slug IS NULL OR clean_key IS NULL
        OR length(clean_key) NOT BETWEEN 16 AND 120
        OR clean_key !~ '^[A-Za-z0-9_-]+$' THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT b.id, COALESCE(c.custom_settings ->> 'time_zone', 'UTC')
    INTO target_business, zone
    FROM public.businesses b
    LEFT JOIN public.business_configs c ON c.business_id = b.id
    WHERE b.slug = p_slug AND b.subscription_status IN ('active', 'trialing');

    IF target_business IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT v.id, v.status, v.service_package, v.scheduled_time, v.duration_minutes, v.total_amount
    INTO found
    FROM public.visits v
    WHERE v.business_id = target_business
      AND v.booking_idempotency_key = clean_key
    LIMIT 1;

    IF found.id IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'booking', jsonb_build_object(
            'reference', upper(substr(replace(found.id::text, '-', ''), 1, 8)),
            'status', found.status,
            'service', found.service_package,
            'starts_at', found.scheduled_time,
            'ends_at', found.scheduled_time + found.duration_minutes * interval '1 minute',
            'time_zone', zone,
            'price', found.total_amount
        )
    );
END;
$$;
REVOKE ALL ON FUNCTION private.public_booking_attempt_status_internal(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.public_booking_attempt_status_internal(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_booking_attempt_status(
    p_slug text,
    p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT private.public_booking_attempt_status_internal(p_slug, p_idempotency_key);
$$;
REVOKE ALL ON FUNCTION public.public_booking_attempt_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_booking_attempt_status(text, text) TO anon, authenticated;
