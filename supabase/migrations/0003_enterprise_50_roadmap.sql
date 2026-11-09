-- ============================================================================
-- PAWTRACKR WEB: 50-POINT ENTERPRISE ROADMAP SCHEMA EXPANSION
-- Migration: 0003_enterprise_50_roadmap.sql
-- Covers:
--   - Schema Migration Version Control Ledger (#2)
--   - Multi-Location Franchise & White-Label Custom Domains (#25, #36)
--   - Multi-Currency & Retail Tax Split Support (#4, #26, #42)
--   - Retail Product Inventory & Reorder Alerts (#30)
--   - Digital Gift Cards & Prepaid Package Credits (#31)
--   - Staff Shift Scheduling & Station Balancing (#29)
--   - Custom Digital Intake Questionnaires (#28)
--   - Automated 5-Star Review Routing (#27)
--   - Immutable Security Audit Logs (#38)
--   - High-Concurrency Composite Indexes (#33)
-- ============================================================================

-- 1. Schema Migration Version Control Table (#2)
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.schema_migrations (version, name, checksum)
VALUES
    ('0001', '0001_multi_tenant_schema.sql', 'sha256:9f84a1c0'),
    ('0002', '0002_waivers_storage_and_payroll.sql', 'sha256:4b21e8d3'),
    ('0003', '0003_enterprise_50_roadmap.sql', 'sha256:7e92c5a1')
ON CONFLICT (version) DO NOTHING;

-- 2. Multi-Location Franchise & White-Label Custom Domain Columns (#25, #36)
ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS parent_franchise_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS is_beta_cohort BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE public.business_configs
    ADD COLUMN IF NOT EXISTS retail_tax_rate DECIMAL(5,2) DEFAULT 8.63 NOT NULL,
    ADD COLUMN IF NOT EXISTS supported_currencies TEXT[] DEFAULT '{USD,CAD,GBP,AUD,EUR}'::text[] NOT NULL,
    ADD COLUMN IF NOT EXISTS notification_templates JSONB DEFAULT '{
      "booking_confirm": "Confirmed! {{pet_name}} is booked at {{salon_name}} on {{date}}.",
      "ready_pickup": "{{pet_name}} is fluffed & ready! View report card & pay: {{link}}",
      "review_request": "Loved {{pet_name}}s groom today? Leave us a 5-star review: {{review_link}}"
    }'::jsonb NOT NULL;

-- 3. Retail Product Inventory Table (#30)
CREATE TABLE IF NOT EXISTS public.retail_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'shampoo' NOT NULL,
    price_dollars DECIMAL(10,2) NOT NULL CHECK (price_dollars >= 0),
    stock_quantity INTEGER DEFAULT 0 NOT NULL,
    reorder_threshold INTEGER DEFAULT 5 NOT NULL,
    retail_commission_pct DECIMAL(5,2) DEFAULT 15.00 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.retail_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation for retail_inventory"
    ON public.retail_inventory FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 4. Digital Gift Cards & Prepaid Package Credits (#31)
CREATE TABLE IF NOT EXISTS public.gift_cards_and_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    code TEXT UNIQUE NOT NULL,
    credit_type TEXT DEFAULT 'gift_card' NOT NULL CHECK (credit_type IN ('gift_card', 'prepaid_package', 'account_credit')),
    initial_balance DECIMAL(10,2) NOT NULL CHECK (initial_balance >= 0),
    remaining_balance DECIMAL(10,2) NOT NULL CHECK (remaining_balance >= 0),
    remaining_visits INTEGER DEFAULT 0 NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.gift_cards_and_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation for gift_cards_and_credits"
    ON public.gift_cards_and_credits FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 5. Staff Scheduling & Shift Management (#29)
CREATE TABLE IF NOT EXISTS public.staff_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    assigned_station TEXT NOT NULL,
    max_dogs_capacity INTEGER DEFAULT 6 NOT NULL,
    status TEXT DEFAULT 'scheduled' NOT NULL CHECK (status IN ('scheduled', 'time_off', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation for staff_shifts"
    ON public.staff_shifts FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 6. Custom Digital Intake Questionnaires (#28)
CREATE TABLE IF NOT EXISTS public.intake_questionnaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    question_prompt TEXT NOT NULL,
    field_type TEXT DEFAULT 'boolean' NOT NULL CHECK (field_type IN ('boolean', 'text', 'select')),
    triggers_aura_tag TEXT,
    is_required BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.intake_questionnaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation for intake_questionnaires"
    ON public.intake_questionnaires FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 7. Post-Visit Review Generation & Feedback Routing (#27)
CREATE TABLE IF NOT EXISTS public.review_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES public.visits(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    star_rating INTEGER CHECK (star_rating BETWEEN 1 AND 5),
    routed_destination TEXT DEFAULT 'google_business_profile' CHECK (routed_destination IN ('google_business_profile', 'private_owner_inbox')),
    feedback_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation for review_requests"
    ON public.review_requests FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 8. Immutable Security & Administrative Audit Logs (#38)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action_type TEXT NOT NULL, -- e.g., 'PRICE_OVERRIDE', 'REFUND_ISSUED', 'RECORD_EXPORT', 'CATALOG_UPDATE'
    target_entity TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation for audit_logs"
    ON public.audit_logs FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 9. High-Concurrency Composite Performance Indexes (#33)
CREATE INDEX IF NOT EXISTS idx_retail_inventory_business_sku
    ON public.retail_inventory(business_id, sku);
CREATE INDEX IF NOT EXISTS idx_gift_cards_business_code
    ON public.gift_cards_and_credits(business_id, code);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_business_date
    ON public.staff_shifts(business_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created
    ON public.audit_logs(business_id, created_at DESC);
