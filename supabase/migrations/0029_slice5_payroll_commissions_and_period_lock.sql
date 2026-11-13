-- ============================================================================
-- PAWTRACKR WEB: SLICE 5 — PAYROLL, COMMISSIONS, TIP POOLS & PERIOD LOCK
-- Migration: 0027_slice5_payroll_commissions_and_period_lock.sql
-- Workflows: WF08, WF28, WF34
-- ============================================================================

-- 1. PAYROLL PERIODS (WF08)
-- Tracks bi-weekly, weekly, or monthly salon compensation periods with immutable lock state
CREATE TABLE IF NOT EXISTS public.payroll_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'locked', 'exported')),
    tip_pool_mode TEXT DEFAULT 'direct' NOT NULL CHECK (tip_pool_mode IN ('direct', 'bather_split')),
    bather_pool_pct NUMERIC(5,2) DEFAULT 15.00 NOT NULL CHECK (bather_pool_pct >= 0 AND bather_pool_pct <= 50),
    total_gross_cents BIGINT DEFAULT 0 NOT NULL,
    total_commission_cents BIGINT DEFAULT 0 NOT NULL,
    total_tips_cents BIGINT DEFAULT 0 NOT NULL,
    total_adjustments_cents BIGINT DEFAULT 0 NOT NULL,
    total_payout_cents BIGINT DEFAULT 0 NOT NULL,
    total_house_cents BIGINT DEFAULT 0 NOT NULL,
    locked_at TIMESTAMP WITH TIME ZONE,
    locked_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_payroll_period_dates CHECK (period_end >= period_start),
    CONSTRAINT unique_business_payroll_period UNIQUE (business_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_lookup 
    ON public.payroll_periods(business_id, period_start, period_end);

-- 2. PAYROLL RETROACTIVE ADJUSTMENTS (WF08)
-- Captures clawbacks or missed compensation for visits refunded after a period was already locked
CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
    payroll_period_id UUID REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
    visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
    amount_cents BIGINT NOT NULL,
    reason TEXT NOT NULL,
    applied_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_staff 
    ON public.payroll_adjustments(business_id, staff_id, payroll_period_id);

-- 3. LOCKED PERIOD IMMUTABILITY TRIGGER (PW060)
-- Once a payroll period is marked 'locked' or 'exported', its financial figures cannot be retroactively altered
CREATE OR REPLACE FUNCTION public.check_locked_payroll_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('locked', 'exported') AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = OLD.business_id) THEN
            RAISE EXCEPTION 'PW060: Cannot delete locked payroll period %', OLD.id
                USING ERRCODE = 'PW060';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Allow transition from 'locked' to 'exported' only
        IF OLD.status = 'locked' AND NEW.status = 'exported' THEN
            NEW.updated_at := timezone('utc'::text, now());
            RETURN NEW;
        END IF;

        IF OLD.status IN ('locked', 'exported') THEN
            RAISE EXCEPTION 'PW060: Locked payroll period % cannot be modified', OLD.id
                USING ERRCODE = 'PW060';
        END IF;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_payroll_mutation ON public.payroll_periods;
CREATE TRIGGER trg_prevent_locked_payroll_mutation
    BEFORE UPDATE OR DELETE ON public.payroll_periods
    FOR EACH ROW
    EXECUTE FUNCTION public.check_locked_payroll_mutation();

-- 4. ROW-LEVEL SECURITY
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff can view payroll periods"
    ON public.payroll_periods FOR SELECT
    USING (business_id = private.current_business_id());

CREATE POLICY "Tenant managers can manage payroll periods"
    ON public.payroll_periods FOR ALL
    USING (
        business_id = private.current_business_id()
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = auth.uid()
              AND sm.business_id = private.current_business_id()
              AND sm.role IN ('owner', 'manager')
        )
    )
    WITH CHECK (
        business_id = private.current_business_id()
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = auth.uid()
              AND sm.business_id = private.current_business_id()
              AND sm.role IN ('owner', 'manager')
        )
    );

CREATE POLICY "Tenant staff can view payroll adjustments"
    ON public.payroll_adjustments FOR SELECT
    USING (business_id = private.current_business_id());

CREATE POLICY "Tenant managers can manage payroll adjustments"
    ON public.payroll_adjustments FOR ALL
    USING (
        business_id = private.current_business_id()
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = auth.uid()
              AND sm.business_id = private.current_business_id()
              AND sm.role IN ('owner', 'manager')
        )
    )
    WITH CHECK (
        business_id = private.current_business_id()
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = auth.uid()
              AND sm.business_id = private.current_business_id()
              AND sm.role IN ('owner', 'manager')
        )
    );

-- 5. ATOMIC RPC: CALCULATE STAFF PAYROLL SUMMARY (WF28)
-- Exact integer-cent calculation across settled visits, tips, and bather pools
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
AS $$
DECLARE
    v_total_tips_collected BIGINT := 0;
    v_bather_count INT := 0;
    v_bather_pool_total BIGINT := 0;
    v_bather_pool_each BIGINT := 0;
    v_bather_pool_remainder BIGINT := 0;
BEGIN
    -- Count active bathers if in bather_split mode
    IF p_tip_pool_mode = 'bather_split' THEN
        SELECT COUNT(*) INTO v_bather_count
        FROM public.staff_members sm
        WHERE sm.business_id = p_business_id
          AND sm.role = 'bather';

        -- Calculate total tips collected from all settled transactions in period
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
          AND sm.role IN ('owner', 'senior_groomer', 'groomer', 'bather')
        GROUP BY sm.id, sm.name, sm.role, sm.commission_rate
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
        sv.s_id AS staff_id,
        sv.s_name AS staff_name,
        sv.s_role AS staff_role,
        sv.s_comm_rate AS commission_rate,
        sv.s_dogs AS dogs_groomed,
        sv.s_gross_cents AS gross_service_cents,
        -- Commission: gross * rate %
        ROUND(sv.s_gross_cents * (sv.s_comm_rate / 100.0))::BIGINT AS commission_cents,
        -- Direct tips
        CASE
            WHEN p_tip_pool_mode = 'bather_split' AND sv.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                ROUND(sv.s_tips_cents * ((100.0 - p_bather_pool_pct) / 100.0))::BIGINT
            WHEN sv.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                sv.s_tips_cents
            ELSE 0::BIGINT
        END AS direct_tips_cents,
        -- Bather pool tips
        CASE
            WHEN p_tip_pool_mode = 'bather_split' AND sv.s_role = 'bather' THEN
                v_bather_pool_each + (CASE WHEN sv.s_id = (SELECT s_id FROM staff_visits WHERE s_role = 'bather' LIMIT 1) THEN v_bather_pool_remainder ELSE 0 END)
            ELSE 0::BIGINT
        END AS pool_tips_cents,
        -- Total tips
        (
            CASE
                WHEN p_tip_pool_mode = 'bather_split' AND sv.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                    ROUND(sv.s_tips_cents * ((100.0 - p_bather_pool_pct) / 100.0))::BIGINT
                WHEN sv.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                    sv.s_tips_cents
                ELSE 0::BIGINT
            END
            +
            CASE
                WHEN p_tip_pool_mode = 'bather_split' AND sv.s_role = 'bather' THEN
                    v_bather_pool_each + (CASE WHEN sv.s_id = (SELECT s_id FROM staff_visits WHERE s_role = 'bather' LIMIT 1) THEN v_bather_pool_remainder ELSE 0 END)
                ELSE 0::BIGINT
            END
        ) AS total_tips_cents,
        -- Retroactive adjustments
        COALESCE(sa.a_retro_cents, 0::BIGINT) AS retro_adjustments_cents,
        -- Total payout = commission + tips + retro adjustments
        (
            ROUND(sv.s_gross_cents * (sv.s_comm_rate / 100.0))::BIGINT
            +
            (
                CASE
                    WHEN p_tip_pool_mode = 'bather_split' AND sv.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                        ROUND(sv.s_tips_cents * ((100.0 - p_bather_pool_pct) / 100.0))::BIGINT
                    WHEN sv.s_role IN ('owner', 'senior_groomer', 'groomer') THEN
                        sv.s_tips_cents
                    ELSE 0::BIGINT
                END
                +
                CASE
                    WHEN p_tip_pool_mode = 'bather_split' AND sv.s_role = 'bather' THEN
                        v_bather_pool_each + (CASE WHEN sv.s_id = (SELECT s_id FROM staff_visits WHERE s_role = 'bather' LIMIT 1) THEN v_bather_pool_remainder ELSE 0 END)
                    ELSE 0::BIGINT
                END
            )
            +
            COALESCE(sa.a_retro_cents, 0::BIGINT)
        ) AS total_payout_cents,
        -- House retained = gross - commission
        (sv.s_gross_cents - ROUND(sv.s_gross_cents * (sv.s_comm_rate / 100.0))::BIGINT) AS house_retained_cents
    FROM staff_visits sv
    LEFT JOIN staff_adjustments sa ON sa.a_staff_id = sv.s_id
    ORDER BY total_payout_cents DESC, sv.s_name ASC;
END;
$$;

-- 6. ATOMIC RPC: LOCK PAYROLL PERIOD (WF08)
-- Validates manager/owner role, totals the period, inserts or locks row, and records audit event
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

    -- Verify manager or owner role
    SELECT sm.id, sm.role INTO v_caller_staff_id, v_caller_role
    FROM public.staff_members sm
    WHERE sm.auth_user_id = auth.uid()
      AND sm.business_id = v_business_id
    LIMIT 1;

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'PW059: Only salon owners and managers can lock payroll periods'
            USING ERRCODE = 'P0059';
    END IF;

    IF p_period_end < p_period_start THEN
        RAISE EXCEPTION 'PW061: Payroll period end date must be on or after start date'
            USING ERRCODE = 'P0061';
    END IF;

    -- Check if period already locked
    SELECT pp.id, pp.status INTO v_period_id, v_existing_status
    FROM public.payroll_periods pp
    WHERE pp.business_id = v_business_id
      AND pp.period_start = p_period_start
      AND pp.period_end = p_period_end;

    IF v_existing_status IN ('locked', 'exported') THEN
        RAISE EXCEPTION 'PW062: Payroll period % to % is already locked', p_period_start, p_period_end
            USING ERRCODE = 'P0062';
    END IF;

    -- Compute aggregated totals from summary RPC
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
            business_id,
            period_start,
            period_end,
            status,
            tip_pool_mode,
            bather_pool_pct,
            total_gross_cents,
            total_commission_cents,
            total_tips_cents,
            total_adjustments_cents,
            total_payout_cents,
            total_house_cents,
            locked_at,
            locked_by,
            notes
        ) VALUES (
            v_business_id,
            p_period_start,
            p_period_end,
            'locked',
            p_tip_pool_mode,
            p_bather_pool_pct,
            v_gross_cents,
            v_commission_cents,
            v_tips_cents,
            v_adjustments_cents,
            v_payout_cents,
            v_house_cents,
            timezone('utc'::text, now()),
            v_caller_staff_id,
            p_notes
        ) RETURNING id INTO v_period_id;
    END IF;

    -- Append audit event in workflow_events (WF37)
    INSERT INTO public.workflow_events (
        business_id,
        workflow_id,
        event_type,
        source_record_type,
        source_record_id,
        source_version,
        actor_user_id,
        actor_role,
        previous_state,
        new_state,
        reason,
        metadata
    ) VALUES (
        v_business_id,
        'WF08',
        'payroll.period_locked',
        'payroll_period',
        v_period_id::text,
        1,
        auth.uid(),
        v_caller_role,
        'open',
        'locked',
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
