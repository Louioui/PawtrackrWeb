-- ============================================================================
-- PAWTRACKR WEB: SLICE 4 — COMMUNICATIONS, REPORT CARDS & DAY CLOSEOUT
-- Migration: 0026_slice4_communications_report_cards_and_day_closeout.sql
-- Workflows: WF03, WF07, WF08, WF16, WF17, WF38, WF39, WF40
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND DAILY SALON DAYS FOR REGISTER CLOSEOUT (WF08)
-- ----------------------------------------------------------------------------

ALTER TABLE public.daily_salon_days
    ADD COLUMN IF NOT EXISTS expected_cash_cents INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS counted_cash_cents INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cash_variance_cents INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS variance_reason TEXT,
    ADD COLUMN IF NOT EXISTS closeout_summary JSONB DEFAULT '{}'::jsonb NOT NULL;

-- Trigger to prevent modifying a locked/closed day's financial audit fields
CREATE OR REPLACE FUNCTION private.prevent_closed_day_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'closed' THEN
        RAISE EXCEPTION 'Daily salon records are locked after closeout and cannot be modified'
            USING ERRCODE = 'PW051';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_closed_day_mutation ON public.daily_salon_days;
CREATE TRIGGER trg_prevent_closed_day_mutation
BEFORE UPDATE ON public.daily_salon_days
FOR EACH ROW
WHEN (OLD.status = 'closed')
EXECUTE FUNCTION private.prevent_closed_day_mutation();


-- ----------------------------------------------------------------------------
-- 2. REPORT CARDS TABLE (WF07: POST-SERVICE PET REPORT CARD)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.report_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    coat_condition TEXT NOT NULL DEFAULT 'good' CHECK (
        coat_condition IN ('excellent', 'good', 'fair', 'matted', 'severely_matted', 'sensitive_skin')
    ),
    behavior_tags JSONB DEFAULT '[]'::jsonb NOT NULL,
    care_notes TEXT,
    recommendations TEXT,
    photos JSONB DEFAULT '[]'::jsonb NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT report_cards_tenant_visit_unique UNIQUE (business_id, visit_id)
);

CREATE INDEX IF NOT EXISTS idx_report_cards_lookup
    ON public.report_cards(business_id, visit_id);

CREATE INDEX IF NOT EXISTS idx_report_cards_pet
    ON public.report_cards(business_id, pet_id);

CREATE INDEX IF NOT EXISTS idx_report_cards_client
    ON public.report_cards(business_id, client_id);

ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_cards FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_cards TO authenticated;

CREATE POLICY "Tenant isolation for report_cards"
    ON public.report_cards FOR ALL TO authenticated
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

CREATE OR REPLACE TRIGGER trg_report_cards_pet_same_tenant
BEFORE INSERT OR UPDATE OF business_id, pet_id ON public.report_cards
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('pet_id', 'pets');

CREATE OR REPLACE TRIGGER trg_report_cards_client_same_tenant
BEFORE INSERT OR UPDATE OF business_id, client_id ON public.report_cards
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('client_id', 'clients');

CREATE OR REPLACE TRIGGER trg_report_cards_visit_same_tenant
BEFORE INSERT OR UPDATE OF business_id, visit_id ON public.report_cards
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('visit_id', 'visits');


-- ----------------------------------------------------------------------------
-- 3. CLIENT COMMUNICATIONS TABLE (WF16 / WF17: AUDIT LEDGER & DELIVERY)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    message_type TEXT NOT NULL CHECK (
        message_type IN ('booking_confirmation', 'reminder_24h', 'ready_for_pickup', 'report_card_ready', 'recall_prompt', 'ad_hoc')
    ),
    channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
    recipient_phone TEXT,
    recipient_email TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'prepared' CHECK (
        status IN ('prepared', 'queued', 'sent', 'delivered', 'failed', 'opted_out')
    ),
    provider_message_id TEXT,
    error_details TEXT,
    retry_count INT DEFAULT 0 NOT NULL CHECK (retry_count >= 0),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_communications_lookup
    ON public.client_communications(business_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_communications_visit
    ON public.client_communications(business_id, visit_id);

CREATE INDEX IF NOT EXISTS idx_client_communications_status
    ON public.client_communications(business_id, status);

ALTER TABLE public.client_communications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_communications FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.client_communications TO authenticated;

CREATE POLICY "Tenant isolation for client_communications"
    ON public.client_communications FOR ALL TO authenticated
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

CREATE OR REPLACE TRIGGER trg_client_communications_client_same_tenant
BEFORE INSERT OR UPDATE OF business_id, client_id ON public.client_communications
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('client_id', 'clients');


-- ----------------------------------------------------------------------------
-- 4. ATOMIC CLOSE SALON DAY RPC (WF08)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_salon_day(
    p_salon_date DATE,
    p_counted_cash_cents INT,
    p_variance_reason TEXT DEFAULT NULL,
    p_closeout_summary JSONB DEFAULT '{}'::jsonb
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
    v_day RECORD;
    v_unresolved_count INT;
    v_expected_cash_cents INT;
    v_cash_variance_cents INT;
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

    -- Only manager or owner can perform day closeout
    IF v_staff_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Only an owner or manager can close the salon day (WF08)'
            USING ERRCODE = 'PW050';
    END IF;

    IF p_counted_cash_cents < 0 THEN
        RAISE EXCEPTION 'Counted cash cannot be negative' USING ERRCODE = 'PW021';
    END IF;

    -- Find the open salon day
    SELECT id, status INTO v_day
    FROM public.daily_salon_days
    WHERE business_id = v_business_id AND salon_date = p_salon_date
    FOR UPDATE;

    IF v_day.id IS NULL THEN
        RAISE EXCEPTION 'Salon day % has not been opened or does not exist', p_salon_date
            USING ERRCODE = 'PW028';
    END IF;

    IF v_day.status = 'closed' THEN
        RAISE EXCEPTION 'Salon day % is already closed', p_salon_date
            USING ERRCODE = 'PW051';
    END IF;

    -- Enforce visit resolution invariant: all visits on that date must be in terminal/released states
    SELECT count(*) INTO v_unresolved_count
    FROM public.visits v
    LEFT JOIN public.business_configs bc ON bc.business_id = v.business_id
    WHERE v.business_id = v_business_id
      AND (v.scheduled_time AT TIME ZONE COALESCE(bc.custom_settings->>'time_zone', 'UTC'))::DATE = p_salon_date
      AND v.status NOT IN ('completed', 'cancelled', 'no_show', 'partly_completed', 'released_unpaid', 'refunded', 'refused');

    IF v_unresolved_count > 0 THEN
        RAISE EXCEPTION 'Cannot close day: % visit(s) remain open or in progress', v_unresolved_count
            USING ERRCODE = 'PW048';
    END IF;

    -- Compute expected cash from completed, settled cash transactions for visits on that date
    SELECT COALESCE(ROUND(SUM(t.amount * 100))::INT, 0) INTO v_expected_cash_cents
    FROM public.transactions t
    JOIN public.visits v ON v.id = t.visit_id
    LEFT JOIN public.business_configs bc ON bc.business_id = v.business_id
    WHERE t.business_id = v_business_id
      AND (v.scheduled_time AT TIME ZONE COALESCE(bc.custom_settings->>'time_zone', 'UTC'))::DATE = p_salon_date
      AND t.payment_method = 'cash'
      AND t.status = 'completed'
      AND t.settlement_status = 'settled';

    v_cash_variance_cents := p_counted_cash_cents - v_expected_cash_cents;

    -- Mandatory explanation reason if variance exists
    IF v_cash_variance_cents <> 0 AND (p_variance_reason IS NULL OR TRIM(p_variance_reason) = '') THEN
        RAISE EXCEPTION 'A mandatory explanation reason is required when cash drawer has a variance (WF08)'
            USING ERRCODE = 'PW049';
    END IF;

    -- Update and lock daily_salon_days record
    UPDATE public.daily_salon_days
    SET status = 'closed',
        closed_at = timezone('utc'::text, now()),
        closed_by = v_staff_id,
        expected_cash_cents = v_expected_cash_cents,
        counted_cash_cents = p_counted_cash_cents,
        cash_variance_cents = v_cash_variance_cents,
        variance_reason = NULLIF(TRIM(p_variance_reason), ''),
        closeout_summary = p_closeout_summary,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_day.id;

    -- Audit event
    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id, source_version,
        actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF08', 'day.closed', 'daily_salon_days', v_day.id::text, 1,
        v_user_id, v_staff_role, 'open', 'closed',
        COALESCE(NULLIF(TRIM(p_variance_reason), ''), 'End-of-day register closeout completed and day locked.'),
        jsonb_build_object(
            'salon_date', p_salon_date,
            'expected_cash_cents', v_expected_cash_cents,
            'counted_cash_cents', p_counted_cash_cents,
            'variance_cents', v_cash_variance_cents,
            'summary', p_closeout_summary
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'day_id', v_day.id,
        'salon_date', p_salon_date,
        'status', 'closed',
        'expected_cash_cents', v_expected_cash_cents,
        'counted_cash_cents', p_counted_cash_cents,
        'variance_cents', v_cash_variance_cents,
        'closed_at', timezone('utc'::text, now())
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 5. ATOMIC REPORT CARD DRAFT & PUBLISH RPCS (WF07)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_report_card_draft(
    p_visit_id UUID,
    p_coat_condition TEXT DEFAULT 'good',
    p_behavior_tags JSONB DEFAULT '[]'::jsonb,
    p_care_notes TEXT DEFAULT NULL,
    p_recommendations TEXT DEFAULT NULL,
    p_photos JSONB DEFAULT '[]'::jsonb
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
    v_visit RECORD;
    v_card_id UUID;
BEGIN
    v_business_id := private.current_business_id();
    v_user_id := auth.uid();

    IF v_business_id IS NULL OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'A verified staff session is required' USING ERRCODE = 'PW010';
    END IF;

    SELECT id INTO v_staff_id
    FROM public.staff_members
    WHERE auth_user_id = v_user_id AND business_id = v_business_id AND is_active = true;

    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Active staff member profile not found' USING ERRCODE = 'PW010';
    END IF;

    SELECT id, pet_id, client_id INTO v_visit
    FROM public.visits
    WHERE id = p_visit_id AND business_id = v_business_id;

    IF v_visit.id IS NULL THEN
        RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'PW028';
    END IF;

    IF p_coat_condition NOT IN ('excellent', 'good', 'fair', 'matted', 'severely_matted', 'sensitive_skin') THEN
        RAISE EXCEPTION 'Invalid coat condition: %', p_coat_condition USING ERRCODE = 'PW021';
    END IF;

    INSERT INTO public.report_cards (
        business_id, visit_id, pet_id, client_id, staff_id,
        coat_condition, behavior_tags, care_notes, recommendations, photos,
        status, updated_at
    ) VALUES (
        v_business_id, p_visit_id, v_visit.pet_id, v_visit.client_id, v_staff_id,
        p_coat_condition, COALESCE(p_behavior_tags, '[]'::jsonb),
        TRIM(p_care_notes), TRIM(p_recommendations), COALESCE(p_photos, '[]'::jsonb),
        'draft', timezone('utc'::text, now())
    )
    ON CONFLICT (business_id, visit_id)
    DO UPDATE SET
        coat_condition = EXCLUDED.coat_condition,
        behavior_tags = EXCLUDED.behavior_tags,
        care_notes = EXCLUDED.care_notes,
        recommendations = EXCLUDED.recommendations,
        photos = EXCLUDED.photos,
        updated_at = timezone('utc'::text, now())
    RETURNING id INTO v_card_id;

    RETURN jsonb_build_object(
        'success', true,
        'report_card_id', v_card_id,
        'visit_id', p_visit_id,
        'status', 'draft'
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.publish_report_card(
    p_visit_id UUID,
    p_coat_condition TEXT,
    p_behavior_tags JSONB DEFAULT '[]'::jsonb,
    p_care_notes TEXT DEFAULT NULL,
    p_recommendations TEXT DEFAULT NULL,
    p_photos JSONB DEFAULT '[]'::jsonb
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
    v_visit RECORD;
    v_client RECORD;
    v_card_id UUID;
    v_published_at TIMESTAMPTZ;
    v_comm_id UUID;
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

    SELECT id, pet_id, client_id, status INTO v_visit
    FROM public.visits
    WHERE id = p_visit_id AND business_id = v_business_id;

    IF v_visit.id IS NULL THEN
        RAISE EXCEPTION 'Visit not found' USING ERRCODE = 'PW028';
    END IF;

    -- Publication gate: pet must be ready, paid, partly_completed, or completed
    IF v_visit.status NOT IN ('ready', 'paid', 'partly_completed', 'completed') THEN
        RAISE EXCEPTION 'Report card cannot be published until pet reaches ready, paid, partly_completed, or completed status (current: %) (WF07)', v_visit.status
            USING ERRCODE = 'PW052';
    END IF;

    IF p_coat_condition NOT IN ('excellent', 'good', 'fair', 'matted', 'severely_matted', 'sensitive_skin') THEN
        RAISE EXCEPTION 'Invalid coat condition: %', p_coat_condition USING ERRCODE = 'PW021';
    END IF;

    INSERT INTO public.report_cards (
        business_id, visit_id, pet_id, client_id, staff_id,
        coat_condition, behavior_tags, care_notes, recommendations, photos,
        status, published_at, updated_at
    ) VALUES (
        v_business_id, p_visit_id, v_visit.pet_id, v_visit.client_id, v_staff_id,
        p_coat_condition, COALESCE(p_behavior_tags, '[]'::jsonb),
        TRIM(p_care_notes), TRIM(p_recommendations), COALESCE(p_photos, '[]'::jsonb),
        'published', timezone('utc'::text, now()), timezone('utc'::text, now())
    )
    ON CONFLICT (business_id, visit_id)
    DO UPDATE SET
        coat_condition = EXCLUDED.coat_condition,
        behavior_tags = EXCLUDED.behavior_tags,
        care_notes = EXCLUDED.care_notes,
        recommendations = EXCLUDED.recommendations,
        photos = EXCLUDED.photos,
        status = 'published',
        published_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    RETURNING id, published_at INTO v_card_id, v_published_at;

    -- Sync care notes to visits.report_card_notes
    IF p_care_notes IS NOT NULL AND TRIM(p_care_notes) <> '' THEN
        UPDATE public.visits
        SET report_card_notes = TRIM(p_care_notes)
        WHERE id = p_visit_id;
    END IF;

    -- Queue outbound notification to pet parent
    SELECT name, phone, email INTO v_client
    FROM public.clients
    WHERE id = v_visit.client_id AND business_id = v_business_id;

    INSERT INTO public.client_communications (
        business_id, visit_id, client_id, message_type, channel,
        recipient_phone, recipient_email, body, status, sent_at
    ) VALUES (
        v_business_id, p_visit_id, v_visit.client_id, 'report_card_ready',
        CASE WHEN v_client.phone IS NOT NULL AND v_client.phone <> '' THEN 'sms' ELSE 'email' END,
        v_client.phone, v_client.email,
        format('Hi %s, your pet''s grooming report card is ready to view!', COALESCE(v_client.name, 'there')),
        'queued', timezone('utc'::text, now())
    ) RETURNING id INTO v_comm_id;

    -- Audit workflow event
    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id, source_version,
        actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF07', 'report_card.published', 'report_cards', v_card_id::text, 1,
        v_user_id, v_staff_role, 'draft', 'published',
        'Staff published post-service pet report card and queued client notification.',
        jsonb_build_object(
            'visit_id', p_visit_id,
            'coat_condition', p_coat_condition,
            'communication_id', v_comm_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'report_card_id', v_card_id,
        'visit_id', p_visit_id,
        'status', 'published',
        'published_at', v_published_at,
        'communication_id', v_comm_id
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 6. CLIENT COMMUNICATION LOGGING RPC (WF16 / WF17)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_client_communication(
    p_client_id UUID,
    p_message_type TEXT,
    p_channel TEXT,
    p_body TEXT,
    p_visit_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'sent',
    p_provider_message_id TEXT DEFAULT NULL,
    p_error_details TEXT DEFAULT NULL,
    p_recipient_phone TEXT DEFAULT NULL,
    p_recipient_email TEXT DEFAULT NULL
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
    v_comm_id UUID;
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

    IF p_message_type NOT IN ('booking_confirmation', 'reminder_24h', 'ready_for_pickup', 'report_card_ready', 'recall_prompt', 'ad_hoc') THEN
        RAISE EXCEPTION 'Invalid message type: %', p_message_type USING ERRCODE = 'PW021';
    END IF;

    IF p_channel NOT IN ('sms', 'email') THEN
        RAISE EXCEPTION 'Invalid channel: %', p_channel USING ERRCODE = 'PW021';
    END IF;

    IF p_status NOT IN ('prepared', 'queued', 'sent', 'delivered', 'failed', 'opted_out') THEN
        RAISE EXCEPTION 'Invalid status: %', p_status USING ERRCODE = 'PW021';
    END IF;

    INSERT INTO public.client_communications (
        business_id, visit_id, client_id, message_type, channel,
        recipient_phone, recipient_email, body, status,
        provider_message_id, error_details, sent_at
    ) VALUES (
        v_business_id, p_visit_id, p_client_id, p_message_type, p_channel,
        p_recipient_phone, p_recipient_email, p_body, p_status,
        p_provider_message_id, p_error_details,
        CASE WHEN p_status IN ('sent', 'delivered') THEN timezone('utc'::text, now()) ELSE NULL END
    ) RETURNING id INTO v_comm_id;

    -- Audit workflow event (WF16 / WF17)
    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id, source_version,
        actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF16', 'communication.logged', 'client_communications', v_comm_id::text, 1,
        v_user_id, v_staff_role, 'none', p_status,
        format('Logged %s message via %s', p_message_type, p_channel),
        jsonb_build_object(
            'message_type', p_message_type,
            'channel', p_channel,
            'status', p_status,
            'provider_message_id', p_provider_message_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'communication_id', v_comm_id,
        'status', p_status
    );
END;
$$;
