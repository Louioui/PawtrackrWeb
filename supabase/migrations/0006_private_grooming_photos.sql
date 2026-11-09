-- Grooming photos can contain client and pet information. Keep the bucket
-- private; an authenticated server may issue short-lived signed URLs after
-- checking the requesting client's or staff member's access.
UPDATE storage.buckets SET public = false WHERE id = 'grooming-photos';

DROP POLICY IF EXISTS "Public can view grooming report card photos"
    ON storage.objects;

CREATE POLICY "Tenant staff can read own grooming photos"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'grooming-photos'
        AND (storage.foldername(name))[1] = public.current_business_id()::text
    );

CREATE POLICY "Tenant staff can update own grooming photos"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'grooming-photos'
        AND (storage.foldername(name))[1] = public.current_business_id()::text
    )
    WITH CHECK (
        bucket_id = 'grooming-photos'
        AND (storage.foldername(name))[1] = public.current_business_id()::text
    );

CREATE POLICY "Tenant staff can delete own grooming photos"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'grooming-photos'
        AND (storage.foldername(name))[1] = public.current_business_id()::text
    );
