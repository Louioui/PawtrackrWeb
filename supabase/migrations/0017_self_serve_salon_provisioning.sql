-- A newly signed-up owner has no staff row, so row-level security hides every
-- tenant table from them and they cannot create a salon themselves. This
-- function is the one trusted path: it creates the business, its settings, and
-- the caller's own active owner membership in a single transaction.
--
-- The caller's identity comes only from auth.uid(). Nothing in the arguments
-- can name another user or an existing salon. A user who already has any staff
-- row (active or not) cannot provision a second salon; staff_members.auth_user_id
-- is UNIQUE, which also settles two simultaneous calls.
--
-- New salons start in 'trialing'. Billing changes that status elsewhere.
--
-- SQLSTATEs: PW010 not signed in, PW011 already belongs to a salon,
-- PW012 invalid input, 23505 slug already taken.
CREATE OR REPLACE FUNCTION public.provision_salon(
    p_salon_name text,
    p_slug text,
    p_time_zone text,
    p_owner_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    caller uuid := auth.uid();
    caller_email text := NULLIF(btrim(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'), '');
    salon_name text := btrim(COALESCE(p_salon_name, ''));
    owner_name text := btrim(COALESCE(p_owner_name, ''));
    new_business_id uuid;
BEGIN
    IF caller IS NULL THEN
        RAISE EXCEPTION 'A signed-in user is required' USING ERRCODE = 'PW010';
    END IF;
    IF EXISTS (SELECT 1 FROM public.staff_members WHERE auth_user_id = caller) THEN
        RAISE EXCEPTION 'This account already belongs to a salon' USING ERRCODE = 'PW011';
    END IF;
    IF caller_email IS NULL OR length(caller_email) > 320
        OR length(salon_name) NOT BETWEEN 2 AND 120
        OR length(owner_name) NOT BETWEEN 1 AND 120
        OR p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_slug) NOT BETWEEN 3 AND 60
        OR p_time_zone IS NULL
        OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_time_zone) THEN
        RAISE EXCEPTION 'Salon name, web address, owner name, or time zone is invalid'
            USING ERRCODE = 'PW012';
    END IF;

    INSERT INTO public.businesses (name, slug, owner_email, subscription_status)
    VALUES (salon_name, p_slug, caller_email, 'trialing')
    RETURNING id INTO new_business_id;

    INSERT INTO public.business_configs (business_id) VALUES (new_business_id);
    UPDATE public.business_configs
    SET custom_settings = custom_settings || jsonb_build_object('time_zone', p_time_zone)
    WHERE business_id = new_business_id;

    INSERT INTO public.staff_members (business_id, auth_user_id, name, email, role, is_active)
    VALUES (new_business_id, caller, owner_name, caller_email, 'owner', true);

    RETURN new_business_id;
END;
$$;
REVOKE ALL ON FUNCTION public.provision_salon(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_salon(text, text, text, text) TO authenticated;
