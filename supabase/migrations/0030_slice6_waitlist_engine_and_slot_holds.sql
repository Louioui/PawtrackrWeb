-- ============================================================================
-- Migration: 0028_slice6_waitlist_engine_and_slot_holds.sql
-- Purpose:
--   1. Create public.waitlist_entries and public.waitlist_offers (WF02, WF15).
--   2. Enforce 2-hour versioned slot holds with automated expiration (WF38, WF39).
--   3. Atomic offer generation and GiST station re-verification on claim.
--   4. RLS policies with strict tenant isolation via private.current_business_id().
--   5. Append-only audit trail logging into public.workflow_events.
-- ============================================================================

-- 1. WAITLIST ENTRIES TABLE
CREATE TABLE IF NOT EXISTS public.waitlist_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    service_package TEXT NOT NULL CHECK (btrim(service_package) <> ''),
    preferred_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    preferred_dates DATE[] NOT NULL DEFAULT '{}'::date[],
    time_preference TEXT NOT NULL DEFAULT 'any' CHECK (time_preference IN ('any', 'morning', 'afternoon', 'weekend')),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'offered', 'booked', 'cancelled', 'expired')),
    rank_position INT NOT NULL DEFAULT 1 CHECK (rank_position >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_business_status
    ON public.waitlist_entries (business_id, status, rank_position);

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_client_pet
    ON public.waitlist_entries (client_id, pet_id);

-- 2. WAITLIST OFFERS TABLE (2-HOUR VERSIONED SLOT HOLDS)
CREATE TABLE IF NOT EXISTS public.waitlist_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    waitlist_entry_id UUID NOT NULL REFERENCES public.waitlist_entries(id) ON DELETE CASCADE,
    offered_start TIMESTAMPTZ NOT NULL,
    offered_end TIMESTAMPTZ NOT NULL,
    assigned_staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
    assigned_station_id UUID REFERENCES public.salon_stations(id) ON DELETE SET NULL,
    offer_expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    claim_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    claimed_visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_offer_time_window CHECK (offered_end > offered_start)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_offers_business_status
    ON public.waitlist_offers (business_id, status, offer_expires_at);

CREATE INDEX IF NOT EXISTS idx_waitlist_offers_entry
    ON public.waitlist_offers (waitlist_entry_id);

-- 3. ROW-LEVEL SECURITY
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant staff can view waitlist entries"
    ON public.waitlist_entries FOR SELECT
    USING (business_id = private.current_business_id());

CREATE POLICY "Tenant staff can manage waitlist entries"
    ON public.waitlist_entries FOR ALL
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

CREATE POLICY "Tenant staff can view waitlist offers"
    ON public.waitlist_offers FOR SELECT
    USING (business_id = private.current_business_id());

CREATE POLICY "Tenant staff can manage waitlist offers"
    ON public.waitlist_offers FOR ALL
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

-- 4. ATOMIC RPC: CREATE WAITLIST ENTRY
CREATE OR REPLACE FUNCTION public.create_waitlist_entry(
    p_client_id UUID,
    p_pet_id UUID,
    p_service_package TEXT,
    p_preferred_staff_id UUID DEFAULT NULL,
    p_preferred_dates DATE[] DEFAULT '{}'::date[],
    p_time_preference TEXT DEFAULT 'any',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_business_id UUID;
    v_user_id UUID;
    v_staff_id UUID;
    v_staff_role TEXT;
    v_next_rank INT;
    v_entry_id UUID;
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

    -- Verify client and pet exist and belong to this salon
    IF NOT EXISTS (
        SELECT 1 FROM public.pets p
        JOIN public.clients c ON c.id = p.client_id
        WHERE p.id = p_pet_id AND c.id = p_client_id AND c.business_id = v_business_id
    ) THEN
        RAISE EXCEPTION 'Client or pet not found for this salon' USING ERRCODE = 'PW021';
    END IF;

    -- Compute next rank
    SELECT COALESCE(MAX(rank_position), 0) + 1 INTO v_next_rank
    FROM public.waitlist_entries
    WHERE business_id = v_business_id AND status = 'active';

    INSERT INTO public.waitlist_entries (
        business_id,
        client_id,
        pet_id,
        service_package,
        preferred_staff_id,
        preferred_dates,
        time_preference,
        notes,
        status,
        rank_position
    ) VALUES (
        v_business_id,
        p_client_id,
        p_pet_id,
        p_service_package,
        p_preferred_staff_id,
        COALESCE(p_preferred_dates, '{}'::date[]),
        COALESCE(p_time_preference, 'any'),
        p_notes,
        'active',
        v_next_rank
    ) RETURNING id INTO v_entry_id;

    -- Append audit event (WF37)
    INSERT INTO public.workflow_events (
        business_id,
        workflow_id,
        event_type,
        source_record_type,
        source_record_id,
        source_version,
        actor_user_id,
        actor_role,
        reason,
        metadata
    ) VALUES (
        v_business_id,
        'WF02',
        'waitlist.entry_created',
        'waitlist_entry',
        v_entry_id::text,
        1,
        v_user_id,
        v_staff_role,
        'Client added to salon waitlist queue',
        jsonb_build_object(
            'client_id', p_client_id,
            'pet_id', p_pet_id,
            'service_package', p_service_package,
            'rank_position', v_next_rank
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'entry_id', v_entry_id,
        'rank_position', v_next_rank
    );
END;
$$;

-- 5. ATOMIC RPC: GENERATE WAITLIST OFFER (WF15 - 2-HOUR HOLD)
CREATE OR REPLACE FUNCTION public.generate_waitlist_offer(
    p_waitlist_entry_id UUID,
    p_offered_start TIMESTAMPTZ,
    p_offered_end TIMESTAMPTZ,
    p_assigned_staff_id UUID,
    p_assigned_station_id UUID DEFAULT NULL,
    p_hold_duration_minutes INT DEFAULT 120
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_business_id UUID;
    v_user_id UUID;
    v_staff_id UUID;
    v_staff_role TEXT;
    v_entry RECORD;
    v_offer_id UUID;
    v_expires_at TIMESTAMPTZ;
    v_claim_token TEXT;
    v_hold_minutes INT;
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

    -- Retrieve active waitlist entry
    SELECT * INTO v_entry
    FROM public.waitlist_entries
    WHERE id = p_waitlist_entry_id AND business_id = v_business_id;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'Waitlist entry not found' USING ERRCODE = 'PW021';
    END IF;

    IF v_entry.status NOT IN ('active', 'offered') THEN
        RAISE EXCEPTION 'Waitlist entry is not eligible for new slot offers (status: %)', v_entry.status
            USING ERRCODE = 'PW021';
    END IF;

    v_hold_minutes := COALESCE(p_hold_duration_minutes, 120);
    IF v_hold_minutes < 15 OR v_hold_minutes > 1440 THEN
        v_hold_minutes := 120;
    END IF;

    v_expires_at := timezone('utc'::text, now()) + (v_hold_minutes || ' minutes')::interval;
    v_claim_token := encode(gen_random_bytes(16), 'hex');

    INSERT INTO public.waitlist_offers (
        business_id,
        waitlist_entry_id,
        offered_start,
        offered_end,
        assigned_staff_id,
        assigned_station_id,
        offer_expires_at,
        status,
        claim_token
    ) VALUES (
        v_business_id,
        p_waitlist_entry_id,
        p_offered_start,
        p_offered_end,
        p_assigned_staff_id,
        p_assigned_station_id,
        v_expires_at,
        'pending',
        v_claim_token
    ) RETURNING id INTO v_offer_id;

    -- Update waitlist entry status
    UPDATE public.waitlist_entries
    SET status = 'offered', updated_at = timezone('utc'::text, now())
    WHERE id = p_waitlist_entry_id;

    -- Append audit event (WF37)
    INSERT INTO public.workflow_events (
        business_id,
        workflow_id,
        event_type,
        source_record_type,
        source_record_id,
        source_version,
        actor_user_id,
        actor_role,
        reason,
        metadata
    ) VALUES (
        v_business_id,
        'WF15',
        'waitlist.offered',
        'waitlist_offer',
        v_offer_id::text,
        1,
        v_user_id,
        v_staff_role,
        'Generated versioned slot hold offer',
        jsonb_build_object(
            'waitlist_entry_id', p_waitlist_entry_id,
            'offered_start', p_offered_start,
            'offered_end', p_offered_end,
            'assigned_staff_id', p_assigned_staff_id,
            'assigned_station_id', p_assigned_station_id,
            'expires_at', v_expires_at
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'offer_id', v_offer_id,
        'claim_token', v_claim_token,
        'expires_at', v_expires_at,
        'hold_minutes', v_hold_minutes
    );
END;
$$;

-- 6. ATOMIC RPC: CLAIM WAITLIST OFFER (WF15 / GIST RE-VERIFICATION)
CREATE OR REPLACE FUNCTION public.claim_waitlist_offer(
    p_offer_id UUID,
    p_claim_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_offer RECORD;
    v_entry RECORD;
    v_visit_id UUID;
    v_duration_minutes INT;
    v_service_price NUMERIC;
BEGIN
    SELECT * INTO v_offer
    FROM public.waitlist_offers
    WHERE id = p_offer_id AND claim_token = p_claim_token;

    IF v_offer.id IS NULL THEN
        RAISE EXCEPTION 'Waitlist offer not found or token invalid' USING ERRCODE = 'PW021';
    END IF;

    IF v_offer.status <> 'pending' THEN
        RAISE EXCEPTION 'Waitlist offer is no longer pending (status: %)', v_offer.status
            USING ERRCODE = 'PW021';
    END IF;

    -- Strict Invariant: Silence never treated as acceptance; check expiration deadline
    IF v_offer.offer_expires_at <= timezone('utc'::text, now()) THEN
        RAISE EXCEPTION 'PW062: Waitlist slot hold expired at %', v_offer.offer_expires_at
            USING ERRCODE = 'PW062';
    END IF;

    SELECT * INTO v_entry
    FROM public.waitlist_entries
    WHERE id = v_offer.waitlist_entry_id;

    v_duration_minutes := GREATEST(15, EXTRACT(EPOCH FROM (v_offer.offered_end - v_offer.offered_start)) / 60)::INT;

    -- Look up standard package price or default
    SELECT COALESCE((svc->>'price')::numeric, 85.00) INTO v_service_price
    FROM public.business_configs bc,
         jsonb_array_elements(
             CASE
                 WHEN jsonb_typeof(bc.custom_settings->'packages') = 'array' THEN bc.custom_settings->'packages'
                 WHEN jsonb_typeof(bc.custom_settings->'service_packages') = 'array' THEN bc.custom_settings->'service_packages'
                 ELSE '[]'::jsonb
             END
         ) svc
    WHERE bc.business_id = v_offer.business_id
      AND (svc->>'name' = v_entry.service_package OR svc->>'id' = v_entry.service_package)
    LIMIT 1;

    IF v_service_price IS NULL OR v_service_price <= 0 THEN
        v_service_price := 85.00;
    END IF;

    -- Insert visit. The database GiST trigger trg_enforce_visit_availability
    -- automatically re-verifies staff shift and station non-overlap!
    INSERT INTO public.visits (
        business_id,
        client_id,
        pet_id,
        staff_id,
        station_id,
        scheduled_time,
        duration_minutes,
        service_package,
        total_amount,
        status
    ) VALUES (
        v_offer.business_id,
        v_entry.client_id,
        v_entry.pet_id,
        v_offer.assigned_staff_id,
        v_offer.assigned_station_id,
        v_offer.offered_start,
        v_duration_minutes,
        v_entry.service_package,
        v_service_price,
        'booked'
    ) RETURNING id INTO v_visit_id;

    -- Update offer to accepted
    UPDATE public.waitlist_offers
    SET status = 'accepted', claimed_visit_id = v_visit_id, updated_at = timezone('utc'::text, now())
    WHERE id = p_offer_id;

    -- Update waitlist entry to booked
    UPDATE public.waitlist_entries
    SET status = 'booked', updated_at = timezone('utc'::text, now())
    WHERE id = v_entry.id;

    -- Append audit event (WF37)
    INSERT INTO public.workflow_events (
        business_id,
        workflow_id,
        event_type,
        source_record_type,
        source_record_id,
        source_version,
        actor_role,
        reason,
        metadata
    ) VALUES (
        v_offer.business_id,
        'WF15',
        'waitlist.claimed',
        'waitlist_offer',
        p_offer_id::text,
        1,
        'client',
        'Pet parent accepted waitlist slot hold offer',
        jsonb_build_object(
            'waitlist_entry_id', v_entry.id,
            'claimed_visit_id', v_visit_id,
            'scheduled_time', v_offer.offered_start,
            'duration_minutes', v_duration_minutes
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'offer_id', p_offer_id,
        'visit_id', v_visit_id,
        'scheduled_time', v_offer.offered_start,
        'status', 'booked'
    );
END;
$$;

-- 7. ATOMIC RPC: EXPIRE STALE WAITLIST OFFERS (WF38 / WF39)
CREATE OR REPLACE FUNCTION public.expire_waitlist_offers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_expired_count INT := 0;
    v_offer RECORD;
BEGIN
    FOR v_offer IN
        SELECT id, waitlist_entry_id, business_id
        FROM public.waitlist_offers
        WHERE status = 'pending' AND offer_expires_at <= timezone('utc'::text, now())
    LOOP
        UPDATE public.waitlist_offers
        SET status = 'expired', updated_at = timezone('utc'::text, now())
        WHERE id = v_offer.id;

        UPDATE public.waitlist_entries
        SET status = 'active', updated_at = timezone('utc'::text, now())
        WHERE id = v_offer.waitlist_entry_id;

        -- Log audit event
        INSERT INTO public.workflow_events (
            business_id,
            workflow_id,
            event_type,
            source_record_type,
            source_record_id,
            source_version,
            actor_role,
            reason,
            metadata
        ) VALUES (
            v_offer.business_id,
            'WF15',
            'waitlist.offer_expired',
            'waitlist_offer',
            v_offer.id::text,
            1,
            'system',
            'Waitlist slot hold offer window elapsed without acceptance',
            jsonb_build_object('waitlist_entry_id', v_offer.waitlist_entry_id)
        );

        v_expired_count := v_expired_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'expired_offers_count', v_expired_count
    );
END;
$$;

-- 8. GRANTS
GRANT EXECUTE ON FUNCTION public.create_waitlist_entry(UUID, UUID, TEXT, UUID, DATE[], TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_waitlist_offer(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_offer(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.expire_waitlist_offers() TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist_offers TO authenticated;

