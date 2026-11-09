-- ============================================================================
-- PAWTRACKR WEB: WAIVERS, STORAGE BUCKET RLS & STAFF COMMISSION LEDGER
-- Migration: 0002_waivers_storage_and_payroll.sql
-- ============================================================================

-- 1. Add commission_rate to staff_members for automated payroll splits
ALTER TABLE public.staff_members
ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 50.00 NOT NULL
CHECK (commission_rate >= 0 AND commission_rate <= 100);

-- 2. Digital Liability Waivers (Matted Coat, Senior Care & Bite Risk E-Signatures)
CREATE TABLE IF NOT EXISTS public.digital_waivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
    waiver_types TEXT[] NOT NULL DEFAULT '{matted_coat}'::text[], -- e.g. ['matted_coat', 'senior_care', 'aggressive_handling']
    agreed_terms_text TEXT NOT NULL,
    signer_name TEXT NOT NULL,
    signature_data_url TEXT NOT NULL,
    verification_hash TEXT NOT NULL,
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_waivers_business_pet
    ON public.digital_waivers(business_id, pet_id);

ALTER TABLE public.digital_waivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for digital_waivers"
    ON public.digital_waivers FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 3. Multi-Tenant Supabase Storage Bucket for Before & After Photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('grooming-photos', 'grooming-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Folder path must begin with the authenticated salon's business_id
-- e.g., grooming-photos/11111111-1111-4111-8111-111111111111/pet-101/after.jpg
CREATE POLICY "Public can view grooming report card photos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'grooming-photos');

CREATE POLICY "Tenant staff can upload photos only to their own business_id folder"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'grooming-photos'
        AND (storage.foldername(name))[1] = public.current_business_id()::text
    );

-- 4. Atomic Staff Commission & Tip Split Payroll RPC
CREATE OR REPLACE FUNCTION public.get_staff_payroll_ledger(
    p_business_id UUID
)
RETURNS TABLE (
    staff_id UUID,
    staff_name TEXT,
    staff_role TEXT,
    commission_rate DECIMAL(5,2),
    completed_visits_count BIGINT,
    gross_service_revenue DECIMAL(10,2),
    commission_payout DECIMAL(10,2),
    tips_collected DECIMAL(10,2),
    total_staff_payout DECIMAL(10,2)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        sm.id AS staff_id,
        sm.name AS staff_name,
        sm.role AS staff_role,
        sm.commission_rate,
        COUNT(DISTINCT v.id) AS completed_visits_count,
        COALESCE(SUM(tx.subtotal - tx.discount), 0.00)::DECIMAL(10,2) AS gross_service_revenue,
        ROUND(COALESCE(SUM((tx.subtotal - tx.discount) * (sm.commission_rate / 100.0)), 0.00), 2)::DECIMAL(10,2) AS commission_payout,
        COALESCE(SUM(tx.tip), 0.00)::DECIMAL(10,2) AS tips_collected,
        ROUND(
            COALESCE(SUM((tx.subtotal - tx.discount) * (sm.commission_rate / 100.0)), 0.00) +
            COALESCE(SUM(tx.tip), 0.00),
            2
        )::DECIMAL(10,2) AS total_staff_payout
    FROM public.staff_members sm
    LEFT JOIN public.visits v
        ON v.staff_id = sm.id
        AND v.business_id = p_business_id
        AND v.status = 'completed'
    LEFT JOIN public.transactions tx
        ON tx.visit_id = v.id
        AND tx.business_id = p_business_id
        AND tx.status = 'completed'
    WHERE sm.business_id = p_business_id
      AND sm.role IN ('owner', 'groomer')
    GROUP BY sm.id, sm.name, sm.role, sm.commission_rate
    ORDER BY total_staff_payout DESC;
$$;
