-- A tenant claim is only a hint. Access requires an actual, active staff row
-- for the authenticated user, and any claim must agree with that membership.
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT sm.business_id
    FROM public.staff_members sm
    WHERE sm.auth_user_id = auth.uid()
      AND sm.is_active
      AND (
          NULLIF(current_setting('request.jwt.claims', true), '')::jsonb
              -> 'app_metadata' ->> 'business_id' IS NULL
          OR NULLIF(current_setting('request.jwt.claims', true), '')::jsonb
              -> 'app_metadata' ->> 'business_id' = sm.business_id::text
      )
    LIMIT 1;
$$;
