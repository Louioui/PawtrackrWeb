-- ============================================================================
-- PAWTRACKR WEB: SLICE 3 — POS CHECKOUT, SETTLEMENT, SURCHARGES & EXCEPTIONS
-- Migration: 0025_slice3_pos_surcharges_and_exceptions.sql
-- Workflows: WF02, WF05, WF06, WF11, WF14, WF15
-- ============================================================================

-- 1. VISIT SURCHARGES (WF11 Extra-Work Approval Flow)
CREATE TABLE IF NOT EXISTS public.visit_surcharges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL CHECK (reason IN ('matted_coat', 'behavioral_handling', 'flea_tick', 'special_shampoo', 'extra_time', 'other')),
    extra_time_minutes INT DEFAULT 15 NOT NULL CHECK (extra_time_minutes >= 0),
    notes TEXT,
    photo_url TEXT,
    status TEXT DEFAULT 'requested' NOT NULL CHECK (status IN ('requested', 'approved', 'declined', 'expired')),
    requested_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    resolved_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    deadline_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now() + interval '30 minutes'),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visit_surcharges_visit
    ON public.visit_surcharges(business_id, visit_id);

ALTER TABLE public.visit_surcharges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for visit_surcharges"
    ON public.visit_surcharges FOR ALL
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());


-- 2. INCIDENT REPORTS (WF05 / WF14 Safety Stops & Injuries)
CREATE TABLE IF NOT EXISTS public.incident_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    reported_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    incident_type TEXT NOT NULL CHECK (incident_type IN ('dog_bite', 'skin_tear', 'seizure', 'equipment_failure', 'severe_distress', 'other')),
    severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'severe', 'critical')),
    first_aid_administered TEXT NOT NULL,
    vet_contacted BOOLEAN DEFAULT false NOT NULL,
    client_contacted_at TIMESTAMPTZ,
    witness_notes TEXT,
    is_locked BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_business_visit
    ON public.incident_reports(business_id, visit_id);

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

-- Incident reports are read-only for manager and owner, never accessible to regular bathers or public
CREATE POLICY "Tenant isolation for incident_reports"
    ON public.incident_reports FOR ALL
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

-- Incident report immutability triggers: cannot be modified once created; deletion only via tenant cascade (WF05 / WF14)
CREATE OR REPLACE FUNCTION private.prevent_incident_report_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Incident reports are legally immutable once submitted and cannot be updated'
        USING ERRCODE = 'PW040';
END;
$$;

CREATE OR REPLACE FUNCTION private.prevent_incident_report_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = OLD.business_id) THEN
        RAISE EXCEPTION 'Incident reports are legally immutable once submitted and cannot be deleted'
            USING ERRCODE = 'PW040';
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_incident_report_update ON public.incident_reports;
CREATE TRIGGER trg_prevent_incident_report_update
BEFORE UPDATE ON public.incident_reports
FOR EACH ROW EXECUTE FUNCTION private.prevent_incident_report_update();

DROP TRIGGER IF EXISTS trg_prevent_incident_report_delete ON public.incident_reports;
CREATE TRIGGER trg_prevent_incident_report_delete
BEFORE DELETE ON public.incident_reports
FOR EACH ROW EXECUTE FUNCTION private.prevent_incident_report_delete();


-- 3. REFUND RECORDS (WF15 Owner/Manager Dispute & Refund Ledger)
CREATE TABLE IF NOT EXISTS public.refund_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    approved_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'completed' NOT NULL CHECK (status IN ('pending', 'completed', 'declined')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refund_records_business
    ON public.refund_records(business_id, transaction_id);

ALTER TABLE public.refund_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for refund_records"
    ON public.refund_records FOR ALL
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());


-- ============================================================================
-- 4. ATOMIC OPERATIONAL RPCS FOR POS, SETTLEMENT & EXCEPTIONS
-- ============================================================================

-- RPC 1: Record Atomic POS Checkout (WF06)
CREATE OR REPLACE FUNCTION public.record_pos_checkout(
    p_visit_id UUID,
    p_subtotal DECIMAL,
    p_discount DECIMAL,
    p_tax DECIMAL,
    p_tip DECIMAL,
    p_amount DECIMAL,
    p_payment_method TEXT,
    p_stripe_intent_id TEXT DEFAULT NULL,
    p_is_cash_settled BOOLEAN DEFAULT false
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
    v_visit RECORD;
    v_tx_id UUID;
    v_tx JSONB;
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

    -- POS Checkout requires front_desk, manager or owner
    IF v_staff_role NOT IN ('owner', 'manager', 'front_desk') THEN
        RAISE EXCEPTION 'Role % is not authorized to execute POS checkout', v_staff_role USING ERRCODE = 'PW021';
    END IF;

    -- Verify math invariant: amount = subtotal - discount + tax + tip
    IF p_discount > p_subtotal OR p_amount <> (p_subtotal - p_discount + p_tax + p_tip) THEN
        RAISE EXCEPTION 'POS cent breakdown does not balance: amount must equal subtotal - discount + tax + tip'
            USING ERRCODE = 'PW041';
    END IF;

    SELECT id, status, version INTO v_visit
    FROM public.visits
    WHERE id = p_visit_id AND business_id = v_business_id
    FOR UPDATE;

    IF v_visit.id IS NULL THEN
        RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'PW028';
    END IF;

    -- Only visits in service or ready can be checked out
    IF v_visit.status IN ('completed', 'cancelled', 'refunded') THEN
        RAISE EXCEPTION 'Cannot checkout visit in % status', v_visit.status USING ERRCODE = 'PW042';
    END IF;

    -- Handle cash tender settlement vs card pending
    IF p_payment_method = 'cash' AND p_is_cash_settled = true THEN
        INSERT INTO public.transactions (
            business_id,
            visit_id,
            subtotal,
            discount,
            tax,
            tip,
            amount,
            payment_method,
            status,
            settlement_status,
            settled_at,
            settlement_note
        ) VALUES (
            v_business_id,
            p_visit_id,
            p_subtotal,
            p_discount,
            p_tax,
            p_tip,
            p_amount,
            'cash',
            'completed',
            'settled',
            now(),
            'Cash received and drawer verified at checkout'
        ) RETURNING id INTO v_tx_id;

        -- Update visit to completed if already released, otherwise paid
        UPDATE public.visits
        SET status = CASE WHEN status = 'released_unpaid' THEN 'completed' ELSE 'paid' END,
            version = version + 1
        WHERE id = p_visit_id;

        -- Log settlement
        INSERT INTO public.workflow_events (
            business_id, workflow_id, event_type, source_record_type, source_record_id,
            source_version, actor_user_id, actor_role, previous_state, new_state, metadata
        ) VALUES (
            v_business_id, 'WF06', 'payment.settled', 'transaction', v_tx_id::text,
            v_visit.version + 1, v_user_id, v_staff_role, v_visit.status,
            CASE WHEN v_visit.status = 'released_unpaid' THEN 'completed' ELSE 'paid' END,
            jsonb_build_object('payment_method', 'cash', 'amount', p_amount)
        );
    ELSE
        -- Card / pending payment
        INSERT INTO public.transactions (
            business_id,
            visit_id,
            subtotal,
            discount,
            tax,
            tip,
            amount,
            payment_method,
            stripe_payment_intent_id,
            status,
            settlement_status
        ) VALUES (
            v_business_id,
            p_visit_id,
            p_subtotal,
            p_discount,
            p_tax,
            p_tip,
            p_amount,
            p_payment_method,
            p_stripe_intent_id,
            'pending',
            CASE WHEN p_stripe_intent_id IS NOT NULL THEN 'pending' ELSE 'unsettled' END
        ) RETURNING id INTO v_tx_id;

        -- Update visit to payment_pending
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


-- RPC 2: Surcharge Request (WF11)
CREATE OR REPLACE FUNCTION public.request_visit_surcharge(
    p_visit_id UUID,
    p_amount DECIMAL,
    p_reason TEXT,
    p_extra_time_minutes INT DEFAULT 15,
    p_notes TEXT DEFAULT NULL,
    p_photo_url TEXT DEFAULT NULL
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
    v_visit RECORD;
    v_surcharge_id UUID;
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

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff member profile not found' USING ERRCODE = 'PW010';
    END IF;

    SELECT id, status, version INTO v_visit
    FROM public.visits
    WHERE id = p_visit_id AND business_id = v_business_id
    FOR UPDATE;

    IF v_visit.id IS NULL THEN
        RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'PW028';
    END IF;

    INSERT INTO public.visit_surcharges (
        business_id, visit_id, amount, reason, extra_time_minutes, notes, photo_url, requested_by
    ) VALUES (
        v_business_id, p_visit_id, p_amount, p_reason, p_extra_time_minutes, p_notes, p_photo_url, v_staff_id
    ) RETURNING id INTO v_surcharge_id;

    -- Update visit to change_pending
    UPDATE public.visits
    SET status = 'change_pending',
        version = version + 1
    WHERE id = p_visit_id;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, metadata
    ) VALUES (
        v_business_id, 'WF11', 'surcharge.requested', 'visit_surcharge', v_surcharge_id::text,
        v_visit.version + 1, v_user_id, v_staff_role, v_visit.status, 'change_pending',
        jsonb_build_object('amount', p_amount, 'reason', p_reason, 'extra_time_minutes', p_extra_time_minutes)
    );

    SELECT to_jsonb(s) INTO v_res FROM public.visit_surcharges s WHERE s.id = v_surcharge_id;
    RETURN v_res;
END;
$$;


-- RPC 3: Resolve Visit Surcharge with Customer Consent Verification (WF11)
CREATE OR REPLACE FUNCTION public.resolve_visit_surcharge(
    p_surcharge_id UUID,
    p_approved BOOLEAN,
    p_client_consented BOOLEAN,
    p_resolution_note TEXT DEFAULT NULL
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
    v_surcharge RECORD;
    v_visit RECORD;
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

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff member profile not found' USING ERRCODE = 'PW010';
    END IF;

    SELECT id, visit_id, amount, extra_time_minutes, status INTO v_surcharge
    FROM public.visit_surcharges
    WHERE id = p_surcharge_id AND business_id = v_business_id
    FOR UPDATE;

    IF v_surcharge.id IS NULL THEN
        RAISE EXCEPTION 'Surcharge request not found' USING ERRCODE = 'PW028';
    END IF;

    IF v_surcharge.status <> 'requested' THEN
        RAISE EXCEPTION 'Surcharge request has already been resolved' USING ERRCODE = 'PW043';
    END IF;

    SELECT id, status, version INTO v_visit
    FROM public.visits
    WHERE id = v_surcharge.visit_id AND business_id = v_business_id
    FOR UPDATE;

    -- Core rule: no extra charge is applied without recorded customer consent
    IF p_approved = true AND p_client_consented <> true THEN
        RAISE EXCEPTION 'No extra charge can be applied without recorded client consent (WF11)'
            USING ERRCODE = 'PW044';
    END IF;

    IF p_approved = true THEN
        UPDATE public.visit_surcharges
        SET status = 'approved',
            resolved_by = v_staff_id,
            resolved_at = now(),
            notes = COALESCE(notes || E'\n', '') || COALESCE(p_resolution_note, 'Client approved extra work')
        WHERE id = p_surcharge_id;

        -- Update visit with approved extra charge & extra time, return visit to active floor care
        UPDATE public.visits
        SET total_amount = total_amount + v_surcharge.amount,
            duration_minutes = duration_minutes + v_surcharge.extra_time_minutes,
            status = 'styling',
            version = version + 1
        WHERE id = v_visit.id;

        INSERT INTO public.workflow_events (
            business_id, workflow_id, event_type, source_record_type, source_record_id,
            source_version, actor_user_id, actor_role, previous_state, new_state, metadata
        ) VALUES (
            v_business_id, 'WF11', 'surcharge.approved', 'visit_surcharge', p_surcharge_id::text,
            v_visit.version + 1, v_user_id, v_staff_role, v_visit.status, 'styling',
            jsonb_build_object('approved_amount', v_surcharge.amount, 'client_consented', true)
        );
    ELSE
        UPDATE public.visit_surcharges
        SET status = 'declined',
            resolved_by = v_staff_id,
            resolved_at = now(),
            notes = COALESCE(notes || E'\n', '') || COALESCE(p_resolution_note, 'Surcharge declined')
        WHERE id = p_surcharge_id;

        -- Return visit to styling without extra fee
        UPDATE public.visits
        SET status = 'styling',
            version = version + 1
        WHERE id = v_visit.id;

        INSERT INTO public.workflow_events (
            business_id, workflow_id, event_type, source_record_type, source_record_id,
            source_version, actor_user_id, actor_role, previous_state, new_state, metadata
        ) VALUES (
            v_business_id, 'WF11', 'surcharge.declined', 'visit_surcharge', p_surcharge_id::text,
            v_visit.version + 1, v_user_id, v_staff_role, v_visit.status, 'styling',
            jsonb_build_object('client_consented', false)
        );
    END IF;

    SELECT to_jsonb(s) INTO v_res FROM public.visit_surcharges s WHERE s.id = p_surcharge_id;
    RETURN v_res;
END;
$$;


-- RPC 4: Unsafe Service Interruption & Incident Documentation (WF05 / WF14)
CREATE OR REPLACE FUNCTION public.stop_service_safety_concern(
    p_visit_id UUID,
    p_reason TEXT,
    p_incident_type TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_first_aid TEXT DEFAULT NULL,
    p_vet_contacted BOOLEAN DEFAULT false,
    p_suggested_charge DECIMAL DEFAULT 0.00
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
    v_visit RECORD;
    v_incident_id UUID;
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

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff member profile not found' USING ERRCODE = 'PW010';
    END IF;

    SELECT id, pet_id, client_id, status, version INTO v_visit
    FROM public.visits
    WHERE id = p_visit_id AND business_id = v_business_id
    FOR UPDATE;

    IF v_visit.id IS NULL THEN
        RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'PW028';
    END IF;

    -- Invariant: Stopped visit is marked partly_completed (NEVER completed)
    UPDATE public.visits
    SET status = 'partly_completed',
        total_amount = CASE WHEN p_suggested_charge > 0 THEN p_suggested_charge ELSE total_amount END,
        version = version + 1
    WHERE id = p_visit_id;

    -- Create incident report if injury or hazard occurred
    IF p_incident_type IS NOT NULL AND p_first_aid IS NOT NULL THEN
        INSERT INTO public.incident_reports (
            business_id, visit_id, pet_id, client_id, reported_by, incident_type,
            severity, first_aid_administered, vet_contacted, witness_notes
        ) VALUES (
            v_business_id, p_visit_id, v_visit.pet_id, v_visit.client_id, v_staff_id,
            p_incident_type, COALESCE(p_severity, 'moderate'), p_first_aid, p_vet_contacted, p_reason
        ) RETURNING id INTO v_incident_id;

        INSERT INTO public.workflow_events (
            business_id, workflow_id, event_type, source_record_type, source_record_id,
            source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
        ) VALUES (
            v_business_id, 'WF05', 'incident.submitted', 'incident_report', v_incident_id::text,
            1, v_user_id, v_staff_role, NULL, 'locked', p_reason,
            jsonb_build_object('incident_type', p_incident_type, 'severity', p_severity)
        );
    END IF;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF14', 'visit.stopped', 'visit', p_visit_id::text,
        v_visit.version + 1, v_user_id, v_staff_role, v_visit.status, 'partly_completed', p_reason,
        jsonb_build_object('suggested_charge', p_suggested_charge, 'incident_reported', v_incident_id IS NOT NULL)
    );

    SELECT jsonb_build_object(
        'visit', to_jsonb(v),
        'incident_id', v_incident_id
    ) INTO v_res FROM public.visits v WHERE v.id = p_visit_id;
    RETURN v_res;
END;
$$;


-- RPC 5: Refund Transaction (WF15)
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

    -- Invariant: refunds require owner or manager approval
    IF v_staff_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Refunds require manager or owner authorization (WF15)' USING ERRCODE = 'PW045';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
        RAISE EXCEPTION 'A mandatory explanation reason is required for refunds (WF15)' USING ERRCODE = 'PW046';
    END IF;

    SELECT id, visit_id, amount, settlement_status INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id AND business_id = v_business_id
    FOR UPDATE;

    IF v_tx.id IS NULL THEN
        RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'PW028';
    END IF;

    IF p_amount > v_tx.amount THEN
        RAISE EXCEPTION 'Refund amount (%) exceeds original transaction amount (%)', p_amount, v_tx.amount
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

    -- Update transaction status and settlement status
    UPDATE public.transactions
    SET status = 'refunded',
        settlement_status = 'refunded',
        settlement_note = 'Refund approved: ' || p_reason
    WHERE id = p_transaction_id;

    -- Update visit to refunded
    UPDATE public.visits
    SET status = 'refunded',
        version = version + 1
    WHERE id = v_tx.visit_id;

    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id,
        source_version, actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF15', 'refund.approved', 'refund_record', v_refund_id::text,
        v_visit.version + 1, v_user_id, v_staff_role, v_visit.status, 'refunded', p_reason,
        jsonb_build_object('refund_amount', p_amount, 'transaction_id', p_transaction_id)
    );

    SELECT to_jsonb(r) INTO v_res FROM public.refund_records r WHERE r.id = v_refund_id;
    RETURN v_res;
END;
$$;
