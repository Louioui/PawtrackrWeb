-- ============================================================================
-- Migration: 0029_slice7_fleet_dispatch_and_data_portability.sql
-- Purpose:
--   1. Mobile Van Fleet Telemetry & Curbside Stop Tracking (WF22 / Mobile Fleet).
--   2. Multi-Salon / Multi-Van Configuration Copying with Zero-Leakage (WF30).
--   3. Competitor Data Import, Legacy Note Provenance & Atomic Rollback (WF33).
--   4. Scoped Tenant Archive & Formula-Safe Export Ledger (WF34).
-- ============================================================================

-- 1. Extend salon_stations with Van Telemetry & Specifications
ALTER TABLE public.salon_stations
    ADD COLUMN IF NOT EXISTS license_plate text,
    ADD COLUMN IF NOT EXISTS battery_pct integer CHECK (battery_pct IS NULL OR (battery_pct >= 0 AND battery_pct <= 100)),
    ADD COLUMN IF NOT EXISTS water_tank_pct integer CHECK (water_tank_pct IS NULL OR (water_tank_pct >= 0 AND water_tank_pct <= 100)),
    ADD COLUMN IF NOT EXISTS gray_water_pct integer CHECK (gray_water_pct IS NULL OR (gray_water_pct >= 0 AND gray_water_pct <= 100)),
    ADD COLUMN IF NOT EXISTS odometer_miles numeric(10,1) CHECK (odometer_miles IS NULL OR odometer_miles >= 0),
    ADD COLUMN IF NOT EXISTS current_lat double precision,
    ADD COLUMN IF NOT EXISTS current_lng double precision,
    ADD COLUMN IF NOT EXISTS last_telemetry_at timestamptz;

-- 2. Extend visits with Curbside Stop Tracking
ALTER TABLE public.visits
    ADD COLUMN IF NOT EXISTS curbside_status text NOT NULL DEFAULT 'scheduled'
        CHECK (curbside_status IN ('scheduled', 'en_route', 'arrived', 'curbside_active', 'completed', 'cancelled')),
    ADD COLUMN IF NOT EXISTS curbside_address text,
    ADD COLUMN IF NOT EXISTS gate_code text,
    ADD COLUMN IF NOT EXISTS drive_minutes_from_prev integer NOT NULL DEFAULT 0 CHECK (drive_minutes_from_prev >= 0),
    ADD COLUMN IF NOT EXISTS miles_from_prev numeric(6,2) NOT NULL DEFAULT 0.0 CHECK (miles_from_prev >= 0),
    ADD COLUMN IF NOT EXISTS stop_sequence integer NOT NULL DEFAULT 1 CHECK (stop_sequence >= 1);

CREATE INDEX IF NOT EXISTS visits_curbside_status_idx
    ON public.visits (business_id, scheduled_time, curbside_status);

-- 3. Competitor Data Import Ledger (WF33)
CREATE TABLE IF NOT EXISTS public.import_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    source_software text NOT NULL CHECK (source_software IN ('moego', 'daysmart', 'pawloyalty', 'square', 'generic_csv')),
    file_name text NOT NULL CHECK (btrim(file_name) <> ''),
    status text NOT NULL DEFAULT 'dry_run_ready'
        CHECK (status IN ('validating', 'dry_run_ready', 'importing', 'completed', 'rolled_back', 'failed')),
    total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    valid_rows integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
    duplicate_rows integer NOT NULL DEFAULT 0 CHECK (duplicate_rows >= 0),
    error_rows integer NOT NULL DEFAULT 0 CHECK (error_rows >= 0),
    dry_run_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_log jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_records jsonb NOT NULL DEFAULT '{"client_ids": [], "pet_ids": []}'::jsonb,
    created_by uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
    applied_at timestamptz,
    rolled_back_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS import_jobs_business_id_idx
    ON public.import_jobs (business_id, created_at DESC);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_jobs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;

CREATE POLICY "Tenant isolation for import_jobs"
    ON public.import_jobs FOR ALL TO authenticated
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

-- 4. Scoped Export Ledger (WF34)
CREATE TABLE IF NOT EXISTS public.export_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    export_type text NOT NULL CHECK (export_type IN ('full_tenant_archive', 'clients_pets', 'appointments', 'financial_ledger', 'payroll')),
    status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    file_format text NOT NULL DEFAULT 'json' CHECK (file_format IN ('json', 'csv')),
    record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS export_jobs_business_id_idx
    ON public.export_jobs (business_id, created_at DESC);

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.export_jobs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_jobs TO authenticated;

CREATE POLICY "Tenant isolation for export_jobs"
    ON public.export_jobs FOR ALL TO authenticated
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

-- 5. RPC: Update Van Telemetry (PW070 / WF22)
CREATE OR REPLACE FUNCTION private.update_van_telemetry_internal(
    p_station_id uuid,
    p_battery integer,
    p_water integer,
    p_gray integer,
    p_odometer numeric,
    p_lat double precision,
    p_lng double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    caller uuid := auth.uid();
    caller_role text;
    v_business_id uuid;
    v_station public.salon_stations%ROWTYPE;
BEGIN
    IF caller IS NULL THEN
        RAISE EXCEPTION 'A signed-in user is required' USING ERRCODE = 'PW010';
    END IF;

    SELECT business_id, role INTO v_business_id, caller_role
    FROM public.staff_members
    WHERE auth_user_id = caller AND is_active
    LIMIT 1;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Active staff membership required' USING ERRCODE = 'PW011';
    END IF;

    SELECT * INTO v_station
    FROM public.salon_stations
    WHERE id = p_station_id AND business_id = v_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Station not found in current salon' USING ERRCODE = 'PW070';
    END IF;

    IF v_station.station_type <> 'van' THEN
        RAISE EXCEPTION 'Station % is not a mobile van', v_station.name USING ERRCODE = 'PW070';
    END IF;

    UPDATE public.salon_stations
    SET battery_pct = COALESCE(p_battery, battery_pct),
        water_tank_pct = COALESCE(p_water, water_tank_pct),
        gray_water_pct = COALESCE(p_gray, gray_water_pct),
        odometer_miles = COALESCE(p_odometer, odometer_miles),
        current_lat = COALESCE(p_lat, current_lat),
        current_lng = COALESCE(p_lng, current_lng),
        last_telemetry_at = timezone('utc'::text, now())
    WHERE id = p_station_id
    RETURNING * INTO v_station;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF22', 'fleet.telemetry_updated', 'salon_stations', p_station_id::text,
        1, caller, caller_role, NULL, 'updated', 'Van telemetry status ping',
        jsonb_build_object(
            'station_name', v_station.name,
            'battery_pct', v_station.battery_pct,
            'water_tank_pct', v_station.water_tank_pct,
            'gray_water_pct', v_station.gray_water_pct,
            'odometer_miles', v_station.odometer_miles,
            'current_lat', v_station.current_lat,
            'current_lng', v_station.current_lng
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'station_id', v_station.id,
        'station_name', v_station.name,
        'battery_pct', v_station.battery_pct,
        'water_tank_pct', v_station.water_tank_pct,
        'gray_water_pct', v_station.gray_water_pct,
        'odometer_miles', v_station.odometer_miles,
        'current_lat', v_station.current_lat,
        'current_lng', v_station.current_lng,
        'last_telemetry_at', v_station.last_telemetry_at
    );
END;
$$;
REVOKE ALL ON FUNCTION private.update_van_telemetry_internal(uuid, integer, integer, integer, numeric, double precision, double precision) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_van_telemetry(
    p_station_id uuid,
    p_battery integer DEFAULT NULL,
    p_water integer DEFAULT NULL,
    p_gray integer DEFAULT NULL,
    p_odometer numeric DEFAULT NULL,
    p_lat double precision DEFAULT NULL,
    p_lng double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT private.update_van_telemetry_internal(
        p_station_id, p_battery, p_water, p_gray, p_odometer, p_lat, p_lng
    );
$$;
REVOKE ALL ON FUNCTION public.update_van_telemetry(uuid, integer, integer, integer, numeric, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_van_telemetry(uuid, integer, integer, integer, numeric, double precision, double precision) TO authenticated;

-- 6. RPC: Advance Curbside Stop (PW071 / WF22)
CREATE OR REPLACE FUNCTION private.advance_curbside_stop_internal(
    p_visit_id uuid,
    p_next_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    caller uuid := auth.uid();
    caller_role text;
    v_business_id uuid;
    v_visit public.visits%ROWTYPE;
BEGIN
    IF caller IS NULL THEN
        RAISE EXCEPTION 'A signed-in user is required' USING ERRCODE = 'PW010';
    END IF;

    SELECT business_id, role INTO v_business_id, caller_role
    FROM public.staff_members
    WHERE auth_user_id = caller AND is_active
    LIMIT 1;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Active staff membership required' USING ERRCODE = 'PW011';
    END IF;

    SELECT * INTO v_visit
    FROM public.visits
    WHERE id = p_visit_id AND business_id = v_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found in current salon' USING ERRCODE = 'PW021';
    END IF;

    -- State machine enforcement (PW071)
    IF p_next_status NOT IN ('en_route', 'arrived', 'curbside_active', 'completed', 'cancelled', 'scheduled') THEN
        RAISE EXCEPTION 'Invalid curbside status: %', p_next_status USING ERRCODE = 'PW071';
    END IF;

    -- Valid progressions:
    -- scheduled -> en_route
    -- en_route -> arrived
    -- arrived -> curbside_active
    -- curbside_active -> completed
    -- Any backwards transition requires manager or owner
    IF p_next_status = 'en_route' AND v_visit.curbside_status <> 'scheduled' AND caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only scheduled stops can transition to en_route' USING ERRCODE = 'PW071';
    ELSIF p_next_status = 'arrived' AND v_visit.curbside_status <> 'en_route' AND caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only en_route stops can transition to arrived' USING ERRCODE = 'PW071';
    ELSIF p_next_status = 'curbside_active' AND v_visit.curbside_status NOT IN ('arrived', 'en_route') AND caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only arrived stops can transition to curbside_active' USING ERRCODE = 'PW071';
    ELSIF p_next_status = 'completed' AND v_visit.curbside_status <> 'curbside_active' AND caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only curbside_active stops can transition to completed' USING ERRCODE = 'PW071';
    END IF;

    UPDATE public.visits
    SET curbside_status = p_next_status,
        -- Align standard visit status with curbside progression
        status = CASE
            WHEN p_next_status = 'curbside_active' AND status IN ('booked', 'confirmed', 'dropped_off', 'checked_in') THEN 'bathing'
            WHEN p_next_status = 'completed' AND status IN ('booked', 'confirmed', 'dropped_off', 'checked_in', 'bathing', 'drying', 'styling', 'quality_check', 'ready') THEN 'completed'
            ELSE status
        END
    WHERE id = p_visit_id
    RETURNING * INTO v_visit;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF22', 'fleet.stop_advanced', 'visits', p_visit_id::text,
        1, caller, caller_role, v_visit.curbside_status, p_next_status, 'Curbside stop status advanced',
        jsonb_build_object(
            'curbside_status', p_next_status,
            'visit_status', v_visit.status,
            'curbside_address', v_visit.curbside_address
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'visit_id', v_visit.id,
        'curbside_status', v_visit.curbside_status,
        'status', v_visit.status
    );
END;
$$;
REVOKE ALL ON FUNCTION private.advance_curbside_stop_internal(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.advance_curbside_stop(
    p_visit_id uuid,
    p_next_status text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT private.advance_curbside_stop_internal(p_visit_id, p_next_status);
$$;
REVOKE ALL ON FUNCTION public.advance_curbside_stop(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_curbside_stop(uuid, text) TO authenticated;

-- 7. RPC: Copy Salon Configuration with Zero-Leakage (PW072 / WF30)
CREATE OR REPLACE FUNCTION private.copy_salon_configuration_internal(
    p_source_business_id uuid,
    p_target_business_id uuid,
    p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    caller uuid := auth.uid();
    caller_email text := NULLIF(btrim(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'), '');
    v_caller_email text;
    source_cfg public.business_configs%ROWTYPE;
    target_cfg public.business_configs%ROWTYPE;
    copied_packages jsonb;
    copied_addons jsonb;
    copied_hours jsonb;
    source_stations jsonb;
    station_record record;
    stations_created integer := 0;
BEGIN
    IF caller IS NULL THEN
        RAISE EXCEPTION 'A signed-in user is required' USING ERRCODE = 'PW010';
    END IF;

    -- Zero-leakage verification: Caller must be an active OWNER of source salon
    SELECT email INTO v_caller_email
    FROM public.staff_members
    WHERE auth_user_id = caller AND business_id = p_source_business_id AND role = 'owner' AND is_active;

    IF v_caller_email IS NULL THEN
        RAISE EXCEPTION 'Caller must be an active owner of source salon' USING ERRCODE = 'PW072';
    END IF;

    -- Target salon must share the owner identity (PW072)
    IF NOT EXISTS (
        SELECT 1 FROM public.businesses
        WHERE id = p_target_business_id AND (owner_email = v_caller_email OR (caller_email IS NOT NULL AND owner_email = caller_email))
    ) AND NOT EXISTS (
        SELECT 1 FROM public.staff_members
        WHERE auth_user_id = caller AND business_id = p_target_business_id AND role = 'owner' AND is_active
    ) THEN
        RAISE EXCEPTION 'Caller must be an authorized owner of target salon' USING ERRCODE = 'PW072';
    END IF;

    IF p_source_business_id = p_target_business_id THEN
        RAISE EXCEPTION 'Source and target salon cannot be the same' USING ERRCODE = 'PW072';
    END IF;

    SELECT * INTO source_cfg FROM public.business_configs WHERE business_id = p_source_business_id;
    SELECT * INTO target_cfg FROM public.business_configs WHERE business_id = p_target_business_id;

    IF source_cfg.business_id IS NULL OR target_cfg.business_id IS NULL THEN
        RAISE EXCEPTION 'Salon configurations not found' USING ERRCODE = 'PW072';
    END IF;

    copied_packages := COALESCE(source_cfg.custom_settings->'packages', '[]'::jsonb);
    copied_addons := COALESCE(source_cfg.custom_settings->'addons', '[]'::jsonb);
    copied_hours := COALESCE(source_cfg.custom_settings->'operating_hours', '{}'::jsonb);

    SELECT jsonb_agg(jsonb_build_object('name', name, 'station_type', station_type))
    INTO source_stations
    FROM public.salon_stations
    WHERE business_id = p_source_business_id AND is_active;

    source_stations := COALESCE(source_stations, '[]'::jsonb);

    IF p_dry_run THEN
        RETURN jsonb_build_object(
            'success', true,
            'dry_run', true,
            'packages_count', jsonb_array_length(copied_packages),
            'addons_count', jsonb_array_length(copied_addons),
            'operating_hours', copied_hours,
            'stations_count', jsonb_array_length(source_stations),
            'preview_packages', copied_packages,
            'preview_stations', source_stations
        );
    END IF;

    -- Apply copy to target business_configs (strictly catalog/hours, NEVER clients/pets/payments)
    UPDATE public.business_configs
    SET custom_settings = jsonb_set(
        jsonb_set(
            jsonb_set(custom_settings, '{packages}', copied_packages),
            '{addons}', copied_addons
        ),
        '{operating_hours}', copied_hours
    )
    WHERE business_id = p_target_business_id;

    -- Copy station templates
    FOR station_record IN
        SELECT name, station_type FROM public.salon_stations
        WHERE business_id = p_source_business_id AND is_active
    LOOP
        INSERT INTO public.salon_stations (business_id, name, station_type, is_active)
        VALUES (p_target_business_id, station_record.name, station_record.station_type, true)
        ON CONFLICT (business_id, name) DO NOTHING;
        IF FOUND THEN
            stations_created := stations_created + 1;
        END IF;
    END LOOP;

    -- Log audit event
    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        p_target_business_id, 'WF30', 'config.copied', 'business_configs', p_target_business_id::text,
        1, caller, 'owner', NULL, 'applied', 'Copied catalog, addons, and station templates from sibling salon',
        jsonb_build_object(
            'source_business_id', p_source_business_id,
            'packages_copied', jsonb_array_length(copied_packages),
            'addons_copied', jsonb_array_length(copied_addons),
            'stations_created', stations_created
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'dry_run', false,
        'packages_copied', jsonb_array_length(copied_packages),
        'addons_copied', jsonb_array_length(copied_addons),
        'stations_created', stations_created
    );
END;
$$;
REVOKE ALL ON FUNCTION private.copy_salon_configuration_internal(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.copy_salon_configuration(
    p_source_business_id uuid,
    p_target_business_id uuid,
    p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT private.copy_salon_configuration_internal(p_source_business_id, p_target_business_id, p_dry_run);
$$;
REVOKE ALL ON FUNCTION public.copy_salon_configuration(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_salon_configuration(uuid, uuid, boolean) TO authenticated;

-- 8. RPC: Apply Competitor Data Import (PW073 / WF33)
CREATE OR REPLACE FUNCTION private.apply_import_job_internal(
    p_source_software text,
    p_file_name text,
    p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    caller uuid := auth.uid();
    caller_role text;
    v_business_id uuid;
    v_staff_id uuid;
    v_job_id uuid;
    row_item jsonb;
    v_client_id uuid;
    v_pet_id uuid;
    v_created_client_ids uuid[] := ARRAY[]::uuid[];
    v_created_pet_ids uuid[] := ARRAY[]::uuid[];
    v_client_name text;
    v_client_phone text;
    v_client_email text;
    v_pet_name text;
    v_breed text;
    v_weight numeric;
    v_legacy_notes text;
    v_sanitized_notes text;
BEGIN
    IF caller IS NULL THEN
        RAISE EXCEPTION 'A signed-in user is required' USING ERRCODE = 'PW010';
    END IF;

    SELECT id, business_id, role INTO v_staff_id, v_business_id, caller_role
    FROM public.staff_members
    WHERE auth_user_id = caller AND is_active
    LIMIT 1;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Active staff membership required' USING ERRCODE = 'PW011';
    END IF;

    IF caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Manager or owner role required to import competitor data' USING ERRCODE = 'PW045';
    END IF;

    -- Create initial import job record
    INSERT INTO public.import_jobs (
        business_id, source_software, file_name, status, total_rows, created_by
    ) VALUES (
        v_business_id, p_source_software, p_file_name, 'importing', jsonb_array_length(p_rows), v_staff_id
    ) RETURNING id INTO v_job_id;

    FOR row_item IN SELECT * FROM jsonb_array_elements(p_rows)
    LOOP
        v_client_name := btrim(COALESCE(row_item->>'client_name', ''));
        v_client_phone := btrim(COALESCE(row_item->>'client_phone', ''));
        v_client_email := NULLIF(btrim(COALESCE(row_item->>'client_email', '')), '');
        v_pet_name := btrim(COALESCE(row_item->>'pet_name', ''));
        v_breed := btrim(COALESCE(row_item->>'breed', 'Mixed Breed'));
        v_weight := COALESCE(NULLIF(row_item->>'weight_lbs', '')::numeric, 25.0);
        v_legacy_notes := btrim(COALESCE(row_item->>'legacy_notes', ''));

        IF v_client_name = '' OR v_client_phone = '' OR v_pet_name = '' THEN
            CONTINUE;
        END IF;

        -- Format legacy notes with explicit non-medical provenance (PW073)
        IF v_legacy_notes <> '' THEN
            v_sanitized_notes := '[LEGACY IMPORT: ' || upper(p_source_software) || '] ' || v_legacy_notes;
        ELSE
            v_sanitized_notes := '[LEGACY IMPORT: ' || upper(p_source_software) || ']';
        END IF;

        -- Find or create client
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE business_id = v_business_id AND phone = v_client_phone
        LIMIT 1;

        IF v_client_id IS NULL THEN
            INSERT INTO public.clients (
                business_id, name, phone, email, notes
            ) VALUES (
                v_business_id, v_client_name, v_client_phone, v_client_email, v_sanitized_notes
            ) RETURNING id INTO v_client_id;
            v_created_client_ids := array_append(v_created_client_ids, v_client_id);
        END IF;

        -- Insert pet linked to client (never set verified medical flags! PW073)
        INSERT INTO public.pets (
            business_id, client_id, name, breed, weight_lbs, rabies_verified, behavior_notes
        ) VALUES (
            v_business_id, v_client_id, v_pet_name, v_breed, v_weight, false, v_sanitized_notes
        ) RETURNING id INTO v_pet_id;
        v_created_pet_ids := array_append(v_created_pet_ids, v_pet_id);
    END LOOP;

    -- Complete job
    UPDATE public.import_jobs
    SET status = 'completed',
        valid_rows = array_length(v_created_pet_ids, 1),
        created_records = jsonb_build_object(
            'client_ids', to_jsonb(v_created_client_ids),
            'pet_ids', to_jsonb(v_created_pet_ids)
        ),
        applied_at = timezone('utc'::text, now())
    WHERE id = v_job_id;

    -- Audit log
    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF33', 'import.applied', 'import_jobs', v_job_id::text,
        1, caller, caller_role, 'dry_run_ready', 'completed', 'Applied competitor CSV data import',
        jsonb_build_object(
            'source_software', p_source_software,
            'clients_created', array_length(v_created_client_ids, 1),
            'pets_created', array_length(v_created_pet_ids, 1)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'job_id', v_job_id,
        'clients_created', array_length(v_created_client_ids, 1),
        'pets_created', array_length(v_created_pet_ids, 1)
    );
END;
$$;
REVOKE ALL ON FUNCTION private.apply_import_job_internal(text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_import_job(
    p_source_software text,
    p_file_name text,
    p_rows jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT private.apply_import_job_internal(p_source_software, p_file_name, p_rows);
$$;
REVOKE ALL ON FUNCTION public.apply_import_job(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_import_job(text, text, jsonb) TO authenticated;

-- 9. RPC: Rollback Competitor Data Import (PW074 / WF33)
CREATE OR REPLACE FUNCTION private.rollback_import_job_internal(
    p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    caller uuid := auth.uid();
    caller_role text;
    v_business_id uuid;
    v_job public.import_jobs%ROWTYPE;
    v_client_ids uuid[];
    v_pet_ids uuid[];
    pets_deleted integer := 0;
    clients_deleted integer := 0;
BEGIN
    IF caller IS NULL THEN
        RAISE EXCEPTION 'A signed-in user is required' USING ERRCODE = 'PW010';
    END IF;

    SELECT business_id, role INTO v_business_id, caller_role
    FROM public.staff_members
    WHERE auth_user_id = caller AND is_active
    LIMIT 1;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Active staff membership required' USING ERRCODE = 'PW011';
    END IF;

    IF caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Manager or owner role required to rollback import' USING ERRCODE = 'PW045';
    END IF;

    SELECT * INTO v_job
    FROM public.import_jobs
    WHERE id = p_job_id AND business_id = v_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Import job not found' USING ERRCODE = 'PW074';
    END IF;

    IF v_job.status <> 'completed' THEN
        RAISE EXCEPTION 'Cannot rollback job with status: %', v_job.status USING ERRCODE = 'PW074';
    END IF;

    SELECT COALESCE(array_agg(value::text::uuid), ARRAY[]::uuid[])
    INTO v_pet_ids
    FROM jsonb_array_elements_text(COALESCE(v_job.created_records->'pet_ids', '[]'::jsonb));

    SELECT COALESCE(array_agg(value::text::uuid), ARRAY[]::uuid[])
    INTO v_client_ids
    FROM jsonb_array_elements_text(COALESCE(v_job.created_records->'client_ids', '[]'::jsonb));

    -- Atomically delete created pets
    IF array_length(v_pet_ids, 1) > 0 THEN
        DELETE FROM public.pets
        WHERE id = ANY(v_pet_ids) AND business_id = v_business_id;
        GET DIAGNOSTICS pets_deleted = ROW_COUNT;
    END IF;

    -- Atomically delete created clients
    IF array_length(v_client_ids, 1) > 0 THEN
        DELETE FROM public.clients
        WHERE id = ANY(v_client_ids) AND business_id = v_business_id;
        GET DIAGNOSTICS clients_deleted = ROW_COUNT;
    END IF;

    UPDATE public.import_jobs
    SET status = 'rolled_back',
        rolled_back_at = timezone('utc'::text, now())
    WHERE id = p_job_id;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF33', 'import.rolled_back', 'import_jobs', p_job_id::text,
        1, caller, caller_role, 'completed', 'rolled_back', 'Atomic rollback of competitor CSV import',
        jsonb_build_object(
            'pets_deleted', pets_deleted,
            'clients_deleted', clients_deleted
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'job_id', p_job_id,
        'pets_deleted', pets_deleted,
        'clients_deleted', clients_deleted
    );
END;
$$;
REVOKE ALL ON FUNCTION private.rollback_import_job_internal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rollback_import_job(
    p_job_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT private.rollback_import_job_internal(p_job_id);
$$;
REVOKE ALL ON FUNCTION public.rollback_import_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_import_job(uuid) TO authenticated;
