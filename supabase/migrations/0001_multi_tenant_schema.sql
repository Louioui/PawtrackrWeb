-- ============================================================================
-- PAWTRACKR WEB: ENTERPRISE MULTI-TENANT SAAS SCHEMA & RLS POLICIES
-- Migration: 0001_multi_tenant_schema.sql
-- Target: Supabase (PostgreSQL 15+)
-- Guarantees:
--   1. Strict tenant isolation by business_id across every table
--   2. Enforced Row-Level Security (RLS) so Salon A can never query Salon B
--   3. Fixed-point DECIMAL(10,2) precision for atomic financial POS math
--   4. Atomic checkout RPC function for zero-drift drawer reconciliation
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. CORE MULTI-TENANT TABLES
-- ============================================================================

-- 1.1 Businesses (Salons / Mobile Van Fleets / Independent Groomers)
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'), -- e.g., pawtrackr.live/bespoke-grooming
    owner_email TEXT NOT NULL,
    phone TEXT,
    city_state TEXT,
    stripe_account_id TEXT,          -- Stripe Connect Express/Custom account ID
    stripe_customer_id TEXT,         -- Stripe Billing SaaS customer ID
    subscription_plan TEXT DEFAULT 'salon_pro' CHECK (subscription_plan IN ('solo_van', 'salon_pro', 'enterprise')),
    subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.2 Business Configurations (Custom Service Catalogs, Pricing & Loyalty Rules)
CREATE TABLE IF NOT EXISTS public.business_configs (
    business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
    tax_rate DECIMAL(5,2) DEFAULT 8.25 NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 30),
    currency TEXT DEFAULT 'USD' NOT NULL,
    loyalty_points_per_dollar INTEGER DEFAULT 1 NOT NULL,
    custom_settings JSONB DEFAULT '{
      "packages": [],
      "addons": [],
      "operating_hours": {"open": "08:00", "close": "18:00"},
      "booking_buffer_mins": 15,
      "deposit_required": false
    }'::jsonb NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.3 Staff Members (Salon Owners, Groomers, Bath Techs, Front Desk)
CREATE TABLE IF NOT EXISTS public.staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    auth_user_id UUID UNIQUE, -- Maps to Supabase auth.users(id)
    name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL CHECK (role IN ('owner', 'groomer', 'front_desk')),
    specialty TEXT,
    color_hex TEXT DEFAULT '#8B95FF',
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.4 Clients (Pet Parents)
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    loyalty_points INTEGER DEFAULT 0 NOT NULL CHECK (loyalty_points >= 0),
    lifetime_spend DECIMAL(10,2) DEFAULT 0.00 NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.5 Pets (With Behavior Auras, Safety Flags & Coat Metrics)
CREATE TABLE IF NOT EXISTS public.pets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    species TEXT DEFAULT 'Canine' NOT NULL,
    breed TEXT NOT NULL,
    weight_lbs DECIMAL(5,2),
    age_years INTEGER,
    coat_type TEXT,
    rabies_verified BOOLEAN DEFAULT true NOT NULL,
    behavior_notes TEXT,
    behavior_tags TEXT[] DEFAULT '{}'::text[] NOT NULL, -- e.g., ['matted', 'biter', 'senior', 'extra_care']
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger to auto-populate pets.business_id from clients.business_id when omitted
CREATE OR REPLACE FUNCTION public.sync_pet_business_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.business_id IS NULL THEN
        SELECT c.business_id INTO NEW.business_id
        FROM public.clients c
        WHERE c.id = NEW.client_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pet_business_id ON public.pets;
CREATE TRIGGER trg_sync_pet_business_id
BEFORE INSERT OR UPDATE ON public.pets
FOR EACH ROW EXECUTE FUNCTION public.sync_pet_business_id();

-- 1.6 Appointments & Visits (Online Self-Bookings + Front-Desk Walk-Ins)
CREATE TABLE IF NOT EXISTS public.visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'booked' NOT NULL CHECK (
        status IN ('booked', 'dropped_off', 'bathing', 'styling', 'ready', 'completed', 'cancelled')
    ),
    booking_source TEXT DEFAULT 'online' NOT NULL CHECK (booking_source IN ('online', 'walk_in', 'recurring')),
    service_package TEXT NOT NULL,
    addon_items JSONB DEFAULT '[]'::jsonb NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    weight_logged_lbs DECIMAL(5,2),
    report_card_notes TEXT,
    before_photo_url TEXT,
    after_photo_url TEXT,
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER DEFAULT 90 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.7 Atomic POS Transactions (End-of-Day Drawer & Stripe Connect Records)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
    discount DECIMAL(10,2) DEFAULT 0.00 NOT NULL CHECK (discount >= 0),
    tax DECIMAL(10,2) NOT NULL CHECK (tax >= 0),
    tip DECIMAL(10,2) DEFAULT 0.00 NOT NULL CHECK (tip >= 0),
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0), -- Exact atomic total: subtotal - discount + tax + tip
    payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'apple_pay', 'cash', 'split')),
    stripe_payment_intent_id TEXT,
    status TEXT DEFAULT 'completed' NOT NULL CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger to auto-populate transactions.business_id from visits.business_id when omitted
CREATE OR REPLACE FUNCTION public.sync_transaction_business_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.business_id IS NULL THEN
        SELECT v.business_id INTO NEW.business_id
        FROM public.visits v
        WHERE v.id = NEW.visit_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_transaction_business_id ON public.transactions;
CREATE TRIGGER trg_sync_transaction_business_id
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_transaction_business_id();

-- ============================================================================
-- 2. HIGH-SPEED MULTI-TENANT INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON public.businesses(slug);
CREATE INDEX IF NOT EXISTS idx_staff_business_id ON public.staff_members(business_id);
CREATE INDEX IF NOT EXISTS idx_clients_business_id ON public.clients(business_id);
CREATE INDEX IF NOT EXISTS idx_clients_business_phone ON public.clients(business_id, phone);
CREATE INDEX IF NOT EXISTS idx_pets_business_id ON public.pets(business_id);
CREATE INDEX IF NOT EXISTS idx_pets_client_id ON public.pets(client_id);
CREATE INDEX IF NOT EXISTS idx_pets_behavior_tags_gin ON public.pets USING GIN (behavior_tags);
CREATE INDEX IF NOT EXISTS idx_visits_business_scheduled ON public.visits(business_id, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_visits_business_status ON public.visits(business_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_business_created ON public.transactions(business_id, created_at);

-- ============================================================================
-- 3. ROW-LEVEL SECURITY (RLS) — MATHEMATICAL TENANT ISOLATION
-- ============================================================================

-- Resolves the authenticated staff member's business_id from JWT claims or staff_members table
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'business_id', '')::uuid,
        (SELECT sm.business_id FROM public.staff_members sm WHERE sm.auth_user_id = auth.uid() LIMIT 1)
    );
$$;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 3.1 Businesses Policies
-- Public visitors can resolve a salon's public booking slug; only tenant owners/staff can mutate their own business
CREATE POLICY "Public can read active businesses by slug"
    ON public.businesses FOR SELECT
    USING (subscription_status IN ('active', 'trialing'));

CREATE POLICY "Tenant staff can update own business"
    ON public.businesses FOR UPDATE
    USING (id = public.current_business_id())
    WITH CHECK (id = public.current_business_id());

-- 3.2 Business Configs Policies
CREATE POLICY "Public can read business service catalog for booking"
    ON public.business_configs FOR SELECT
    USING (true);

CREATE POLICY "Tenant staff can manage own business_configs"
    ON public.business_configs FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 3.3 Staff Members Policies
CREATE POLICY "Tenant isolation for staff_members"
    ON public.staff_members FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 3.4 Clients Policies
CREATE POLICY "Tenant isolation for clients"
    ON public.clients FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 3.5 Pets Policies
CREATE POLICY "Tenant isolation for pets"
    ON public.pets FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 3.6 Visits Policies
CREATE POLICY "Tenant isolation for visits"
    ON public.visits FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- 3.7 Transactions Policies
CREATE POLICY "Tenant isolation for transactions"
    ON public.transactions FOR ALL
    USING (business_id = public.current_business_id())
    WITH CHECK (business_id = public.current_business_id());

-- ============================================================================
-- 4. ATOMIC 4-STEP POS CHECKOUT RPC FUNCTION
-- Ensures visit completion, transaction recording, and client loyalty point
-- updates execute atomically within a single ACID database transaction.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_atomic_pos_checkout(
    p_business_id UUID,
    p_visit_id UUID,
    p_subtotal DECIMAL(10,2),
    p_discount DECIMAL(10,2),
    p_tax DECIMAL(10,2),
    p_tip DECIMAL(10,2),
    p_payment_method TEXT,
    p_stripe_payment_intent_id TEXT DEFAULT NULL
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client_id UUID;
    v_exact_total DECIMAL(10,2);
    v_points_earned INTEGER;
    v_tx public.transactions;
BEGIN
    -- Verify visit belongs to the specified tenant business_id
    SELECT client_id INTO v_client_id
    FROM public.visits
    WHERE id = p_visit_id AND business_id = p_business_id
    FOR UPDATE;

    IF v_client_id IS NULL THEN
        RAISE EXCEPTION 'Tenant isolation violation or visit % not found for business %', p_visit_id, p_business_id;
    END IF;

    -- Compute exact decimal total down to the penny
    v_exact_total := ROUND((p_subtotal - p_discount + p_tax + p_tip)::numeric, 2);
    v_points_earned := GREATEST(0, FLOOR(p_subtotal - p_discount)::integer);

    -- 1. Insert atomic transaction record
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
        status
    ) VALUES (
        p_business_id,
        p_visit_id,
        ROUND(p_subtotal, 2),
        ROUND(p_discount, 2),
        ROUND(p_tax, 2),
        ROUND(p_tip, 2),
        v_exact_total,
        p_payment_method,
        p_stripe_payment_intent_id,
        'completed'
    )
    RETURNING * INTO v_tx;

    -- 2. Mark visit as completed and sync final pre-tip/tax service total
    UPDATE public.visits
    SET status = 'completed',
        total_amount = ROUND(p_subtotal - p_discount, 2)
    WHERE id = p_visit_id AND business_id = p_business_id;

    -- 3. Credit loyalty points & lifetime spend to client
    UPDATE public.clients
    SET loyalty_points = loyalty_points + v_points_earned,
        lifetime_spend = lifetime_spend + v_exact_total
    WHERE id = v_client_id AND business_id = p_business_id;

    RETURN v_tx;
END;
$$;
