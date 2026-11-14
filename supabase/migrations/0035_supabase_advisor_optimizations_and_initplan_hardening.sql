-- ============================================================================
-- PAWTRACKR WEB: SUPABASE ADVISOR OPTIMIZATIONS & INITPLAN RLS HARDENING
-- Migration: 0035_supabase_advisor_optimizations_and_initplan_hardening.sql
-- Purpose:
--   1. Harden function search_path on trigger functions & internal RPCs
--      (prevent_closed_day_mutation, check_locked_payroll_mutation, verify_pet_document).
--   2. Revoke public/anon execute on trigger function check_locked_payroll_mutation.
--   3. Apply Postgres InitPlan subquery optimization on RLS policies ((SELECT auth.uid()),
--      (SELECT private.current_business_id())) to eliminate per-row re-evaluation overhead.
--   4. Scope RLS policies to explicit actions (FOR SELECT, FOR INSERT, FOR UPDATE, FOR DELETE)
--      and roles (TO authenticated) to eliminate multiple permissive policy warnings.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNCTION SEARCH_PATH & TRIGGER PRIVILEGE LOCKDOWN
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.prevent_closed_day_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.status = 'closed' THEN
        RAISE EXCEPTION 'Daily salon records are locked after closeout and cannot be modified'
            USING ERRCODE = 'PW051';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_closed_day_mutation() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.check_locked_payroll_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
        IF OLD.status = 'locked' AND NEW.status = 'exported' THEN
            NEW.updated_at := timezone('utc'::text, now());
            RETURN NEW;
        END IF;

        IF OLD.status IN ('locked', 'exported') THEN
            RAISE EXCEPTION 'PW060: Cannot modify payroll period % in locked/exported status', OLD.id
                USING ERRCODE = 'PW060';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_locked_payroll_mutation() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.verify_pet_document(
    p_document_id UUID,
    p_status TEXT,
    p_expires_at DATE DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT private.verify_pet_document_internal(p_document_id, p_status, p_expires_at, p_notes);
$$;
REVOKE ALL ON FUNCTION public.verify_pet_document(UUID, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_pet_document(UUID, TEXT, DATE, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. RLS INITPLAN & MULTIPLE PERMISSIVE POLICY HARDENING
-- ----------------------------------------------------------------------------

-- A. incident_reports
DROP POLICY IF EXISTS "Managers and owners can view incident_reports" ON public.incident_reports;
DROP POLICY IF EXISTS "Active staff can submit incident_reports" ON public.incident_reports;

CREATE POLICY "Managers and owners can view incident_reports"
    ON public.incident_reports FOR SELECT
    TO authenticated
    USING (
        business_id = (SELECT private.current_business_id())
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = (SELECT auth.uid())
              AND sm.business_id = (SELECT private.current_business_id())
              AND sm.role IN ('owner', 'manager')
              AND sm.is_active = true
        )
    );

CREATE POLICY "Active staff can submit incident_reports"
    ON public.incident_reports FOR INSERT
    TO authenticated
    WITH CHECK (
        business_id = (SELECT private.current_business_id())
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = (SELECT auth.uid())
              AND sm.business_id = (SELECT private.current_business_id())
              AND sm.is_active = true
        )
    );

-- B. payroll_periods
DROP POLICY IF EXISTS "Tenant staff can view payroll periods" ON public.payroll_periods;
DROP POLICY IF EXISTS "Tenant managers can manage payroll periods" ON public.payroll_periods;

CREATE POLICY "Tenant staff can view payroll periods"
    ON public.payroll_periods FOR SELECT
    TO authenticated
    USING (business_id = (SELECT private.current_business_id()));

CREATE POLICY "Tenant managers can insert payroll periods"
    ON public.payroll_periods FOR INSERT
    TO authenticated
    WITH CHECK (
        business_id = (SELECT private.current_business_id())
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = (SELECT auth.uid())
              AND sm.business_id = (SELECT private.current_business_id())
              AND sm.role IN ('owner', 'manager')
              AND sm.is_active = true
        )
    );

CREATE POLICY "Tenant managers can update payroll periods"
    ON public.payroll_periods FOR UPDATE
    TO authenticated
    USING (
        business_id = (SELECT private.current_business_id())
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = (SELECT auth.uid())
              AND sm.business_id = (SELECT private.current_business_id())
              AND sm.role IN ('owner', 'manager')
              AND sm.is_active = true
        )
    )
    WITH CHECK (
        business_id = (SELECT private.current_business_id())
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = (SELECT auth.uid())
              AND sm.business_id = (SELECT private.current_business_id())
              AND sm.role IN ('owner', 'manager')
              AND sm.is_active = true
        )
    );

CREATE POLICY "Tenant managers can delete payroll periods"
    ON public.payroll_periods FOR DELETE
    TO authenticated
    USING (
        business_id = (SELECT private.current_business_id())
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = (SELECT auth.uid())
              AND sm.business_id = (SELECT private.current_business_id())
              AND sm.role IN ('owner', 'manager')
              AND sm.is_active = true
        )
    );

-- C. payroll_adjustments
DROP POLICY IF EXISTS "Tenant staff can view payroll adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Tenant managers can manage payroll adjustments" ON public.payroll_adjustments;

CREATE POLICY "Tenant staff can view payroll adjustments"
    ON public.payroll_adjustments FOR SELECT
    TO authenticated
    USING (business_id = (SELECT private.current_business_id()));

CREATE POLICY "Tenant managers can insert payroll adjustments"
    ON public.payroll_adjustments FOR INSERT
    TO authenticated
    WITH CHECK (
        business_id = (SELECT private.current_business_id())
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = (SELECT auth.uid())
              AND sm.business_id = (SELECT private.current_business_id())
              AND sm.role IN ('owner', 'manager')
              AND sm.is_active = true
        )
    );

CREATE POLICY "Tenant managers can update payroll adjustments"
    ON public.payroll_adjustments FOR UPDATE
    TO authenticated
    USING (
        business_id = (SELECT private.current_business_id())
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = (SELECT auth.uid())
              AND sm.business_id = (SELECT private.current_business_id())
              AND sm.role IN ('owner', 'manager')
              AND sm.is_active = true
        )
    )
    WITH CHECK (
        business_id = (SELECT private.current_business_id())
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = (SELECT auth.uid())
              AND sm.business_id = (SELECT private.current_business_id())
              AND sm.role IN ('owner', 'manager')
              AND sm.is_active = true
        )
    );

CREATE POLICY "Tenant managers can delete payroll adjustments"
    ON public.payroll_adjustments FOR DELETE
    TO authenticated
    USING (
        business_id = (SELECT private.current_business_id())
        AND EXISTS (
            SELECT 1 FROM public.staff_members sm
            WHERE sm.auth_user_id = (SELECT auth.uid())
              AND sm.business_id = (SELECT private.current_business_id())
              AND sm.role IN ('owner', 'manager')
              AND sm.is_active = true
        )
    );

-- D. waitlist_entries
DROP POLICY IF EXISTS "Tenant staff can view waitlist entries" ON public.waitlist_entries;
DROP POLICY IF EXISTS "Tenant staff can manage waitlist entries" ON public.waitlist_entries;

CREATE POLICY "Tenant staff can view waitlist entries"
    ON public.waitlist_entries FOR SELECT
    TO authenticated
    USING (business_id = (SELECT private.current_business_id()));

CREATE POLICY "Tenant staff can insert waitlist entries"
    ON public.waitlist_entries FOR INSERT
    TO authenticated
    WITH CHECK (business_id = (SELECT private.current_business_id()));

CREATE POLICY "Tenant staff can update waitlist entries"
    ON public.waitlist_entries FOR UPDATE
    TO authenticated
    USING (business_id = (SELECT private.current_business_id()))
    WITH CHECK (business_id = (SELECT private.current_business_id()));

CREATE POLICY "Tenant staff can delete waitlist entries"
    ON public.waitlist_entries FOR DELETE
    TO authenticated
    USING (business_id = (SELECT private.current_business_id()));

-- E. waitlist_offers
DROP POLICY IF EXISTS "Tenant staff can view waitlist offers" ON public.waitlist_offers;
DROP POLICY IF EXISTS "Tenant staff can manage waitlist offers" ON public.waitlist_offers;

CREATE POLICY "Tenant staff can view waitlist offers"
    ON public.waitlist_offers FOR SELECT
    TO authenticated
    USING (business_id = (SELECT private.current_business_id()));

CREATE POLICY "Tenant staff can insert waitlist offers"
    ON public.waitlist_offers FOR INSERT
    TO authenticated
    WITH CHECK (business_id = (SELECT private.current_business_id()));

CREATE POLICY "Tenant staff can update waitlist offers"
    ON public.waitlist_offers FOR UPDATE
    TO authenticated
    USING (business_id = (SELECT private.current_business_id()))
    WITH CHECK (business_id = (SELECT private.current_business_id()));

CREATE POLICY "Tenant staff can delete waitlist offers"
    ON public.waitlist_offers FOR DELETE
    TO authenticated
    USING (business_id = (SELECT private.current_business_id()));
