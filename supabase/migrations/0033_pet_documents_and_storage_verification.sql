-- ============================================================================
-- PAWTRACKR MIGRATION 0033: PET DOCUMENTS, VACCINATION ELIGIBILITY (WF20)
-- & PRIVATE STORAGE SIGNED MEDIA INTEGRATION (WF07)
-- ============================================================================
-- 1. Storage bucket for pet documents (private with tenant isolation)
-- 2. pet_documents table with multi-tenant RLS, same-tenant triggers & audit trail
-- 3. Atomic verify_pet_document RPC synchronizing rabies_verified on pets
-- 4. Customer portal lookup enrichment with published report cards & photo paths
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. STORAGE BUCKET FOR PET DOCUMENTS
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('pet-documents', 'pet-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Tenant staff can read own pet documents" ON storage.objects;
CREATE POLICY "Tenant staff can read own pet documents"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'pet-documents'
        AND (storage.foldername(name))[1] = private.current_business_id()::text
    );

DROP POLICY IF EXISTS "Tenant staff can upload own pet documents" ON storage.objects;
CREATE POLICY "Tenant staff can upload own pet documents"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'pet-documents'
        AND (storage.foldername(name))[1] = private.current_business_id()::text
    );

DROP POLICY IF EXISTS "Tenant staff can update own pet documents" ON storage.objects;
CREATE POLICY "Tenant staff can update own pet documents"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'pet-documents'
        AND (storage.foldername(name))[1] = private.current_business_id()::text
    )
    WITH CHECK (
        bucket_id = 'pet-documents'
        AND (storage.foldername(name))[1] = private.current_business_id()::text
    );

DROP POLICY IF EXISTS "Tenant staff can delete own pet documents" ON storage.objects;
CREATE POLICY "Tenant staff can delete own pet documents"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'pet-documents'
        AND (storage.foldername(name))[1] = private.current_business_id()::text
    );

-- ----------------------------------------------------------------------------
-- 2. PET DOCUMENTS TABLE (WF20)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pet_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (
        document_type IN ('rabies_certificate', 'bordetella', 'dhpp', 'vet_records', 'liability_waiver', 'other')
    ),
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT,
    mime_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (
        status IN ('uploaded', 'verified', 'rejected', 'expired')
    ),
    verification_notes TEXT,
    verified_by UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    expires_at DATE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.pet_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pet_documents FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pet_documents TO authenticated;

DROP POLICY IF EXISTS "Tenant isolation for pet_documents" ON public.pet_documents;
CREATE POLICY "Tenant isolation for pet_documents"
    ON public.pet_documents FOR ALL TO authenticated
    USING (business_id = private.current_business_id())
    WITH CHECK (business_id = private.current_business_id());

CREATE OR REPLACE TRIGGER trg_pet_documents_pet_same_tenant
BEFORE INSERT OR UPDATE OF business_id, pet_id ON public.pet_documents
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('pet_id', 'pets');

CREATE OR REPLACE TRIGGER trg_pet_documents_client_same_tenant
BEFORE INSERT OR UPDATE OF business_id, client_id ON public.pet_documents
FOR EACH ROW EXECUTE FUNCTION public.assert_same_business_reference('client_id', 'clients');

CREATE INDEX IF NOT EXISTS idx_pet_documents_pet
    ON public.pet_documents(business_id, pet_id);

CREATE INDEX IF NOT EXISTS idx_pet_documents_status
    ON public.pet_documents(business_id, status);

CREATE INDEX IF NOT EXISTS idx_pet_documents_client
    ON public.pet_documents(business_id, client_id);

-- ----------------------------------------------------------------------------
-- 3. ATOMIC VERIFICATION RPC (WF20)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.verify_pet_document_internal(
    p_document_id UUID,
    p_status TEXT,
    p_expires_at DATE DEFAULT NULL,
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
    v_staff RECORD;
    v_doc RECORD;
    v_has_other_verified_rabies BOOLEAN;
BEGIN
    v_business_id := private.current_business_id();
    v_user_id := auth.uid();

    IF v_business_id IS NULL OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'A verified staff session is required' USING ERRCODE = 'PW010';
    END IF;

    SELECT id, role INTO v_staff
    FROM public.staff_members
    WHERE auth_user_id = v_user_id AND business_id = v_business_id AND is_active = true;

    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'Active staff member profile not found' USING ERRCODE = 'PW010';
    END IF;

    IF p_status NOT IN ('verified', 'rejected', 'expired') THEN
        RAISE EXCEPTION 'Invalid verification status: % (expected verified, rejected, or expired)', p_status
            USING ERRCODE = 'PW021';
    END IF;

    SELECT * INTO v_doc
    FROM public.pet_documents
    WHERE id = p_document_id AND business_id = v_business_id;

    IF v_doc.id IS NULL THEN
        RAISE EXCEPTION 'Document not found' USING ERRCODE = 'PW028';
    END IF;

    IF p_status = 'verified' AND p_expires_at IS NOT NULL AND p_expires_at < CURRENT_DATE THEN
        RAISE EXCEPTION 'Cannot verify a document with an expiration date in the past' USING ERRCODE = 'PW021';
    END IF;

    -- Update document record
    UPDATE public.pet_documents
    SET status = p_status,
        expires_at = p_expires_at,
        verification_notes = NULLIF(TRIM(p_notes), ''),
        verified_by = v_staff.id,
        verified_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_document_id;

    -- Synchronize rabies_verified on the pet if this is a rabies certificate
    IF v_doc.document_type = 'rabies_certificate' THEN
        IF p_status = 'verified' AND (p_expires_at IS NULL OR p_expires_at >= CURRENT_DATE) THEN
            UPDATE public.pets
            SET rabies_verified = true
            WHERE id = v_doc.pet_id AND business_id = v_business_id;
        ELSE
            -- Check if any other active verified rabies certificate exists
            SELECT EXISTS (
                SELECT 1
                FROM public.pet_documents
                WHERE business_id = v_business_id
                  AND pet_id = v_doc.pet_id
                  AND document_type = 'rabies_certificate'
                  AND status = 'verified'
                  AND id <> p_document_id
                  AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
            ) INTO v_has_other_verified_rabies;

            IF NOT v_has_other_verified_rabies THEN
                UPDATE public.pets
                SET rabies_verified = false
                WHERE id = v_doc.pet_id AND business_id = v_business_id;
            END IF;
        END IF;
    END IF;

    -- Log append-only audit event in workflow_events (WF20)
    INSERT INTO public.workflow_events (
        business_id, workflow_id, event_type, source_record_type, source_record_id, source_version,
        actor_user_id, actor_role, previous_state, new_state, reason, metadata
    ) VALUES (
        v_business_id, 'WF20',
        CASE WHEN p_status = 'verified' THEN 'document.verified' ELSE 'document.rejected' END,
        'pet_documents', p_document_id::text, 1,
        v_user_id, v_staff.role, v_doc.status, p_status,
        COALESCE(NULLIF(TRIM(p_notes), ''), format('Staff %s document %s', p_status, v_doc.file_name)),
        jsonb_build_object(
            'pet_id', v_doc.pet_id,
            'client_id', v_doc.client_id,
            'document_type', v_doc.document_type,
            'file_name', v_doc.file_name,
            'expires_at', p_expires_at,
            'status', p_status
        )
    );

    RETURN jsonb_build_object(
        'id', p_document_id,
        'pet_id', v_doc.pet_id,
        'document_type', v_doc.document_type,
        'file_name', v_doc.file_name,
        'status', p_status,
        'expires_at', p_expires_at,
        'verified_at', timezone('utc'::text, now()),
        'verification_notes', NULLIF(TRIM(p_notes), '')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_pet_document(
    p_document_id UUID,
    p_status TEXT,
    p_expires_at DATE DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
AS $$
    SELECT private.verify_pet_document_internal(p_document_id, p_status, p_expires_at, p_notes);
$$;

REVOKE ALL ON FUNCTION private.verify_pet_document_internal(UUID, TEXT, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.verify_pet_document_internal(UUID, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pet_document(UUID, TEXT, DATE, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. CUSTOMER PORTAL ENRICHMENT WITH PUBLISHED REPORT CARDS & PHOTOS (WF07/WF14)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.customer_booking_lookup_internal(
    p_slug text,
    p_reference text,
    p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    clean_slug text := lower(btrim(COALESCE(p_slug, '')));
    clean_ref text := upper(btrim(COALESCE(p_reference, '')));
    phone_digits text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
    biz record;
    v_rec record;
    rc record;
    can_manage boolean := false;
BEGIN
    IF clean_slug !~ '^[a-z0-9-]{1,60}$' THEN
        RAISE EXCEPTION 'Invalid salon identifier' USING ERRCODE = 'PW020';
    END IF;
    IF clean_ref !~ '^[0-9A-F]{8}$' THEN
        RAISE EXCEPTION 'Invalid booking reference code' USING ERRCODE = 'PW021';
    END IF;
    IF length(phone_digits) NOT BETWEEN 10 AND 15 THEN
        RAISE EXCEPTION 'Phone number with area code is required' USING ERRCODE = 'PW021';
    END IF;

    SELECT b.id, b.name, b.slug, b.phone, b.city_state,
           COALESCE(c.time_zone, 'America/New_York') AS zone,
           COALESCE(c.custom_settings->'operating_hours'->>'open', '08:00') AS open_clock,
           COALESCE(c.custom_settings->'operating_hours'->>'close', '18:00') AS close_clock
    INTO biz
    FROM public.businesses b
    LEFT JOIN public.business_configs c ON c.business_id = b.id
    WHERE b.slug = clean_slug AND b.subscription_status IN ('active', 'trialing');

    IF biz.id IS NULL THEN
        RAISE EXCEPTION 'Salon not found or inactive' USING ERRCODE = 'PW020';
    END IF;

    SELECT v.id, v.status, v.service_package, v.total_amount, v.scheduled_time,
           v.duration_minutes, v.booking_buffer_minutes, v.created_at,
           c.name AS client_name, c.phone AS client_phone,
           p.name AS pet_name, p.breed AS pet_breed,
           s.name AS staff_name, st.name AS station_name
    INTO v_rec
    FROM public.visits v
    JOIN public.clients c ON c.id = v.client_id
    JOIN public.pets p ON p.id = v.pet_id
    LEFT JOIN public.staff_members s ON s.id = v.staff_id
    LEFT JOIN public.salon_stations st ON st.id = v.station_id
    WHERE v.business_id = biz.id
      AND upper(substr(replace(v.id::text, '-', ''), 1, 8)) = clean_ref
      AND regexp_replace(c.phone, '[^0-9]', '', 'g') = phone_digits
    ORDER BY v.created_at DESC
    LIMIT 1;

    IF v_rec.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found or phone number does not match' USING ERRCODE = 'PW030';
    END IF;

    -- Pet parents can self-cancel or self-reschedule online if the visit is still in 'booked' status
    -- and at least 24 hours remain before the scheduled start time.
    can_manage := (v_rec.status = 'booked' AND v_rec.scheduled_time > now() + interval '24 hours');

    -- Look for published report card for this visit (WF07)
    SELECT id, coat_condition, behavior_tags, care_notes, recommendations, photos, published_at
    INTO rc
    FROM public.report_cards
    WHERE business_id = biz.id AND visit_id = v_rec.id AND status = 'published'
    LIMIT 1;

    RETURN jsonb_build_object(
        'reference', clean_ref,
        'visit_id', v_rec.id,
        'status', v_rec.status,
        'service', v_rec.service_package,
        'price', v_rec.total_amount,
        'starts_at', v_rec.scheduled_time,
        'ends_at', v_rec.scheduled_time + (v_rec.duration_minutes * interval '1 minute'),
        'duration_minutes', v_rec.duration_minutes,
        'time_zone', biz.zone,
        'salon_name', biz.name,
        'salon_slug', biz.slug,
        'salon_phone', biz.phone,
        'salon_address', biz.city_state,
        'client_name', v_rec.client_name,
        'pet_name', v_rec.pet_name,
        'pet_breed', v_rec.pet_breed,
        'staff_name', v_rec.staff_name,
        'station_name', v_rec.station_name,
        'can_reschedule', can_manage,
        'can_cancel', can_manage,
        'policy_notice', 'Appointments can be modified or cancelled online up to 24 hours in advance. For changes within 24 hours, please contact the salon directly.',
        'report_card', CASE WHEN rc.id IS NOT NULL THEN jsonb_build_object(
            'id', rc.id,
            'coat_condition', rc.coat_condition,
            'behavior_tags', rc.behavior_tags,
            'care_notes', rc.care_notes,
            'recommendations', rc.recommendations,
            'photos', rc.photos,
            'published_at', rc.published_at
        ) ELSE NULL END
    );
END;
$$;
