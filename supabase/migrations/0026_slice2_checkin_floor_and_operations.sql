-- ============================================================================
-- PAWTRACKR WEB: SLICE 2 — CHECK-IN, FLOOR STAGES, WAIVERS & OPERATIONS
-- Migration: 0024_slice2_checkin_floor_and_operations.sql
-- Workflows Covered: WF01, WF04, WF09, WF10, WF12, WF18, WF23, WF24
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXPAND VISIT LIFECYCLE STATES & UPDATE STATION EXCLUSION GIST
-- ----------------------------------------------------------------------------

-- Drop old status check and install full 27-state lifecycle constraint
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_status_check;
ALTER TABLE public.visits ADD CONSTRAINT visits_status_check CHECK (
    status IN (
        'requested',
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
        'paid',
        'completed',
        'cancelled',
        'no_show',
        'late',
        'rescheduled_pending',
        'change_pending',
        'paused',
        'refused',
        'partly_completed',
        'incident_open',
        'payment_unknown',
        'failed',
        'refunded',
        'waiver_hold',
        'released_unpaid'
    )
);

-- Update station exclusion constraint to cover active in-service stages
SET search_path = public, extensions;
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
        'paused'
    ));
RESET search_path;

-- ----------------------------------------------------------------------------
-- 2. VISIT CHECK-IN, WAIVER, SAFETY, STAGE & PICKUP COLUMNS
-- ----------------------------------------------------------------------------

ALTER TABLE public.visits
    ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS authorized_collector_name TEXT,
    ADD COLUMN IF NOT EXISTS authorized_collector_phone TEXT,
    ADD COLUMN IF NOT EXISTS waiver_id UUID REFERENCES public.digital_waivers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS waiver_status TEXT DEFAULT 'none' CHECK (waiver_status IN ('none', 'signed', 'verified', 'refused')),
    ADD COLUMN IF NOT EXISTS safety_notes_acknowledged_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS safety_notes_acknowledged_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS stage_notes JSONB DEFAULT '[]'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ready_notified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS released_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS released_to_name TEXT,
    ADD COLUMN IF NOT EXISTS unpaid_release_override_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unpaid_release_reason TEXT,
    ADD COLUMN IF NOT EXISTS late_arrival_minutes INT DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visits_waiver_id ON public.visits (waiver_id);
CREATE INDEX IF NOT EXISTS idx_visits_checked_in ON public.visits (business_id, checked_in_at) WHERE checked_in_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visits_ready ON public.visits (business_id, ready_at) WHERE ready_at IS NOT NULL;

-- Multi-tenant reference validation triggers on new staff references
CREATE OR REPLACE TRIGGER trg_visits_checked_in_by_same_tenant
BEFORE INSERT OR UPDATE OF business_id, checked_in_by ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('checked_in_by', 'staff_members');

CREATE OR REPLACE TRIGGER trg_visits_released_by_same_tenant
BEFORE INSERT OR UPDATE OF business_id, released_by ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('released_by', 'staff_members');

CREATE OR REPLACE TRIGGER trg_visits_safety_ack_by_same_tenant
BEFORE INSERT OR UPDATE OF business_id, safety_notes_acknowledged_by ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('safety_notes_acknowledged_by', 'staff_members');

-- ----------------------------------------------------------------------------
-- 3. DAILY SALON DAYS TABLE (WF18: OPENING CHECK & DAY LOG)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.daily_salon_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    salon_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('open', 'closed')),
    opened_at TIMESTAMPTZ,
    opened_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    opening_checklist JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT daily_salon_days_tenant_date_unique UNIQUE (business_id, salon_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_salon_days_lookup ON public.daily_salon_days(business_id, salon_date);

ALTER TABLE public.daily_salon_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_salon_days FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.daily_salon_days TO authenticated;

CREATE POLICY "Tenant isolation for daily_salon_days"
    ON public.daily_salon_days FOR ALL TO authenticated
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

CREATE OR REPLACE TRIGGER trg_daily_salon_days_opened_by_same_tenant
BEFORE INSERT OR UPDATE OF business_id, opened_by ON public.daily_salon_days
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('opened_by', 'staff_members');

CREATE OR REPLACE TRIGGER trg_daily_salon_days_closed_by_same_tenant
BEFORE INSERT OR UPDATE OF business_id, closed_by ON public.daily_salon_days
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('closed_by', 'staff_members');

-- ----------------------------------------------------------------------------
-- 4. STAFF INVITATIONS TABLE (WF04: STAFF LIFECYCLE & INVITATIONS)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'front_desk', 'senior_groomer', 'groomer', 'bather')),
    token TEXT NOT NULL UNIQUE,
    invited_by UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '7 days'),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_tenant ON public.staff_invitations(business_id, email);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_token ON public.staff_invitations(token);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_invitations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_invitations TO authenticated;

CREATE POLICY "Tenant isolation for staff_invitations"
    ON public.staff_invitations FOR ALL TO authenticated
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

-- ----------------------------------------------------------------------------
-- 5. ATOMIC OPERATIONAL RPCS (WF01, WF09, WF10, WF18)
-- ----------------------------------------------------------------------------

-- 5.1 Manager Open Day RPC
CREATE OR REPLACE FUNCTION public.manager_open_day(
    p_salon_date DATE,
    p_checklist JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_staff_id UUID;
    v_business_id UUID;
    v_staff_role TEXT;
    v_result JSONB;
BEGIN
    SELECT id, business_id, role
    INTO v_staff_id, v_business_id, v_staff_role
    FROM public.staff_members
    WHERE auth_user_id = auth.uid() AND is_active = true
    LIMIT 1;

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff membership required' USING ERRCODE = 'PW001';
    END IF;

    IF v_staff_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only an owner or manager can open the salon day' USING ERRCODE = 'PW025';
    END IF;

    INSERT INTO public.daily_salon_days (
        business_id, salon_date, status, opened_at, opened_by, opening_checklist, updated_at
    )
    VALUES (
        v_business_id, p_salon_date, 'open', timezone('utc'::text, now()), v_staff_id, p_checklist, timezone('utc'::text, now())
    )
    ON CONFLICT (business_id, salon_date)
    DO UPDATE SET
        status = 'open',
        opened_at = timezone('utc'::text, now()),
        opened_by = v_staff_id,
        opening_checklist = p_checklist,
        updated_at = timezone('utc'::text, now())
    RETURNING jsonb_build_object(
        'id', id,
        'salon_date', salon_date,
        'status', status,
        'opened_at', opened_at,
        'opened_by', opened_by,
        'opening_checklist', opening_checklist
    ) INTO v_result;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id, source_version,
        actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF18', 'day.opened', 'daily_salon_days', (v_result->>'id')::text, 1,
        auth.uid(), v_staff_role, 'closed', 'open', 'Manager verified opening checklist and opened day.', p_checklist
    );

    RETURN v_result;
END;
$$;

-- 5.2 Check-in Visit RPC
CREATE OR REPLACE FUNCTION public.check_in_visit(
    p_visit_id UUID,
    p_collector_name TEXT,
    p_collector_phone TEXT DEFAULT NULL,
    p_weight_lbs NUMERIC DEFAULT NULL,
    p_waiver_id UUID DEFAULT NULL,
    p_waiver_status TEXT DEFAULT 'verified',
    p_is_late BOOLEAN DEFAULT FALSE,
    p_late_minutes INT DEFAULT 0,
    p_station_id UUID DEFAULT NULL,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_staff_id UUID;
    v_business_id UUID;
    v_actor_role TEXT;
    v_visit public.visits%ROWTYPE;
    v_pet_id UUID;
    v_status_before TEXT;
    v_updated_visit JSONB;
BEGIN
    SELECT id, business_id, role
    INTO v_actor_staff_id, v_business_id, v_actor_role
    FROM public.staff_members
    WHERE auth_user_id = auth.uid() AND is_active = true
    LIMIT 1;

    IF v_actor_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff membership required' USING ERRCODE = 'PW001';
    END IF;

    IF v_actor_role NOT IN ('owner', 'manager', 'front_desk') THEN
        RAISE EXCEPTION 'Check-in requires front desk, manager, or owner role' USING ERRCODE = 'PW026';
    END IF;

    SELECT * INTO v_visit
    FROM public.visits
    WHERE id = p_visit_id AND business_id = v_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'PW003';
    END IF;

    IF v_visit.status NOT IN ('booked', 'confirmed', 'dropped_off', 'late') THEN
        RAISE EXCEPTION 'Visit cannot be checked in from status %', v_visit.status USING ERRCODE = 'PW027';
    END IF;

    IF p_waiver_status = 'refused' THEN
        -- Refused waiver moves visit into waiver_hold
        UPDATE public.visits
        SET status = 'waiver_hold',
            waiver_status = 'refused',
            version = version + 1
        WHERE id = p_visit_id;

        INSERT INTO public.workflow_events (
            business_id, workflow_id, event_type, source_record_type, source_record_id, source_version,
            actor_user_id, actor_role, previous_state, new_state, reason, metadata
        ) VALUES (
            v_business_id, 'WF01', 'visit.waiver_hold', 'visits', p_visit_id::text, v_visit.version + 1,
            auth.uid(), v_actor_role, v_visit.status, 'waiver_hold', 'Customer refused required liability waiver.',
            '{}'::jsonb
        );

        RETURN jsonb_build_object('visit_id', p_visit_id, 'status', 'waiver_hold', 'waiver_status', 'refused');
    END IF;

    -- Update pet weight if logged
    IF p_weight_lbs IS NOT NULL AND p_weight_lbs > 0 THEN
        UPDATE public.pets
        SET weight_lbs = p_weight_lbs
        WHERE id = v_visit.pet_id AND business_id = v_business_id;
    END IF;

    v_status_before := v_visit.status;

    UPDATE public.visits
    SET status = 'checked_in',
        checked_in_at = timezone('utc'::text, now()),
        checked_in_by = v_actor_staff_id,
        authorized_collector_name = COALESCE(NULLIF(TRIM(p_collector_name), ''), v_visit.authorized_collector_name),
        authorized_collector_phone = COALESCE(NULLIF(TRIM(p_collector_phone), ''), v_visit.authorized_collector_phone),
        waiver_id = COALESCE(p_waiver_id, v_visit.waiver_id),
        waiver_status = p_waiver_status,
        weight_logged_lbs = COALESCE(p_weight_lbs, v_visit.weight_logged_lbs),
        station_id = COALESCE(p_station_id, v_visit.station_id),
        staff_id = COALESCE(p_staff_id, v_visit.staff_id),
        late_arrival_minutes = CASE WHEN p_is_late THEN GREATEST(p_late_minutes, 15) ELSE 0 END,
        version = version + 1
    WHERE id = p_visit_id
    RETURNING jsonb_build_object(
        'id', id,
        'status', status,
        'checked_in_at', checked_in_at,
        'checked_in_by', checked_in_by,
        'authorized_collector_name', authorized_collector_name,
        'authorized_collector_phone', authorized_collector_phone,
        'waiver_id', waiver_id,
        'waiver_status', waiver_status,
        'weight_logged_lbs', weight_logged_lbs,
        'station_id', station_id,
        'staff_id', staff_id,
        'version', version
    ) INTO v_updated_visit;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id, source_version,
        actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF01', 'visit.checked_in', 'visits', p_visit_id::text, v_visit.version + 1,
        auth.uid(), v_actor_role, v_status_before, 'checked_in',
        'Front desk verified waiver, weight, and authorized collector.',
        jsonb_build_object(
            'collector_name', p_collector_name,
            'is_late', p_is_late,
            'late_minutes', p_late_minutes
        )
    );

    RETURN v_updated_visit;
END;
$$;

-- 5.3 Acknowledge Safety Notes RPC
CREATE OR REPLACE FUNCTION public.acknowledge_safety_notes(
    p_visit_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_staff_id UUID;
    v_business_id UUID;
    v_actor_role TEXT;
    v_visit public.visits%ROWTYPE;
BEGIN
    SELECT id, business_id, role
    INTO v_actor_staff_id, v_business_id, v_actor_role
    FROM public.staff_members
    WHERE auth_user_id = auth.uid() AND is_active = true
    LIMIT 1;

    IF v_actor_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff membership required' USING ERRCODE = 'PW001';
    END IF;

    SELECT * INTO v_visit
    FROM public.visits
    WHERE id = p_visit_id AND business_id = v_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'PW003';
    END IF;

    UPDATE public.visits
    SET safety_notes_acknowledged_at = timezone('utc'::text, now()),
        safety_notes_acknowledged_by = v_actor_staff_id,
        version = version + 1
    WHERE id = p_visit_id;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id, source_version,
        actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF09', 'visit.safety_acknowledged', 'visits', p_visit_id::text, v_visit.version + 1,
        auth.uid(), v_actor_role, v_visit.status, v_visit.status,
        'Staff acknowledged safety instructions prior to floor handling.',
        '{}'::jsonb
    );

    RETURN jsonb_build_object(
        'visit_id', p_visit_id,
        'safety_acknowledged', true,
        'acknowledged_at', timezone('utc'::text, now()),
        'acknowledged_by', v_actor_staff_id
    );
END;
$$;

-- 5.4 Advance Visit Stage RPC
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
    v_pet_behavior TEXT[];
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
    WHERE id = p_visit_id AND business_id = v_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'PW003';
    END IF;

    -- Optimistic concurrency check
    IF p_client_version IS NOT NULL AND v_visit.version <> p_client_version THEN
        RAISE EXCEPTION 'Concurrent modification detected (server version %, client version %). Refresh before proceeding.',
            v_visit.version, p_client_version USING ERRCODE = 'PW029';
    END IF;

    -- Safety check: Safety notes must be acknowledged before moving into any service stage
    IF v_visit.safety_notes_acknowledged_at IS NULL AND p_target_stage IN ('bathing', 'drying', 'styling', 'quality_check') THEN
        RAISE EXCEPTION 'Safety notes must be explicitly acknowledged before starting %', p_target_stage USING ERRCODE = 'PW030';
    END IF;

    -- Role restriction: Bathers can only advance bathing and drying
    IF v_actor_role = 'bather' AND p_target_stage NOT IN ('bathing', 'drying') THEN
        RAISE EXCEPTION 'Bathers can record bathing and drying stages only' USING ERRCODE = 'PW031';
    END IF;

    -- High-risk pet check: Bathers cannot handle bite-risk pets alone
    SELECT behavior_notes INTO v_pet_behavior
    FROM public.pets
    WHERE id = v_visit.pet_id;

    IF v_actor_role = 'bather' AND ('biter' = ANY(v_pet_behavior) OR 'aggressive' = ANY(v_pet_behavior)) THEN
        RAISE EXCEPTION 'High-risk (bite-risk) pets require Senior Groomer or Manager handling' USING ERRCODE = 'PW032';
    END IF;

    -- Prepare stage note entry
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

-- 5.5 Release Visit RPC (WF10: Pickup Verification & Unpaid Override)
CREATE OR REPLACE FUNCTION public.release_visit(
    p_visit_id UUID,
    p_released_to_name TEXT,
    p_unpaid_override BOOLEAN DEFAULT FALSE,
    p_unpaid_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_staff_id UUID;
    v_business_id UUID;
    v_actor_role TEXT;
    v_visit public.visits%ROWTYPE;
    v_target_status TEXT;
    v_updated_visit JSONB;
BEGIN
    SELECT id, business_id, role
    INTO v_actor_staff_id, v_business_id, v_actor_role
    FROM public.staff_members
    WHERE auth_user_id = auth.uid() AND is_active = true
    LIMIT 1;

    IF v_actor_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff membership required' USING ERRCODE = 'PW001';
    END IF;

    IF v_actor_role NOT IN ('owner', 'manager', 'front_desk') THEN
        RAISE EXCEPTION 'Pet release requires front desk, manager, or owner role' USING ERRCODE = 'PW033';
    END IF;

    SELECT * INTO v_visit
    FROM public.visits
    WHERE id = p_visit_id AND business_id = v_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'PW003';
    END IF;

    IF v_visit.status NOT IN ('ready', 'paid', 'payment_pending') THEN
        RAISE EXCEPTION 'Visit in status % cannot be released', v_visit.status USING ERRCODE = 'PW034';
    END IF;

    -- Check payment settlement vs. manager unpaid release override
    IF v_visit.status = 'paid' THEN
        v_target_status := 'completed';
    ELSE
        -- Payment has not been settled
        IF NOT p_unpaid_override THEN
            RAISE EXCEPTION 'Payment is pending. Unpaid release requires explicit manager authorization' USING ERRCODE = 'PW035';
        END IF;

        IF v_actor_role NOT IN ('owner', 'manager') THEN
            RAISE EXCEPTION 'Only a manager or owner can authorize an unpaid pet release' USING ERRCODE = 'PW036';
        END IF;

        IF NULLIF(TRIM(p_unpaid_reason), '') IS NULL THEN
            RAISE EXCEPTION 'A recorded reason is required for an unpaid pet release' USING ERRCODE = 'PW037';
        END IF;

        v_target_status := 'released_unpaid';
    END IF;

    UPDATE public.visits
    SET status = v_target_status,
        released_at = timezone('utc'::text, now()),
        released_by = v_actor_staff_id,
        released_to_name = TRIM(p_released_to_name),
        unpaid_release_override_by = CASE WHEN v_target_status = 'released_unpaid' THEN v_actor_staff_id ELSE NULL END,
        unpaid_release_reason = CASE WHEN v_target_status = 'released_unpaid' THEN TRIM(p_unpaid_reason) ELSE NULL END,
        version = version + 1
    WHERE id = p_visit_id
    RETURNING jsonb_build_object(
        'id', id,
        'status', status,
        'released_at', released_at,
        'released_by', released_by,
        'released_to_name', released_to_name,
        'unpaid_release_reason', unpaid_release_reason,
        'version', version
    ) INTO v_updated_visit;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id, source_version,
        actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF10', 'visit.released', 'visits', p_visit_id::text, v_visit.version + 1,
        auth.uid(), v_actor_role, v_visit.status, v_target_status,
        CASE WHEN v_target_status = 'released_unpaid'
             THEN 'Manager override: Released unpaid. Reason: ' || p_unpaid_reason
             ELSE 'Pet released to verified collector.' END,
        jsonb_build_object(
            'released_to', p_released_to_name,
            'is_unpaid', v_target_status = 'released_unpaid',
            'unpaid_reason', p_unpaid_reason
        )
    );

    RETURN v_updated_visit;
END;
$$;

-- Grant execution permissions
REVOKE ALL ON FUNCTION public.manager_open_day(DATE, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_open_day(DATE, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.check_in_visit(UUID, TEXT, TEXT, NUMERIC, UUID, TEXT, BOOLEAN, INT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_visit(UUID, TEXT, TEXT, NUMERIC, UUID, TEXT, BOOLEAN, INT, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.acknowledge_safety_notes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_safety_notes(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.advance_visit_stage(UUID, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_visit_stage(UUID, TEXT, TEXT, INT) TO authenticated;

REVOKE ALL ON FUNCTION public.release_visit(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_visit(UUID, TEXT, BOOLEAN, TEXT) TO authenticated;
