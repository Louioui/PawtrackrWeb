-- Publish only the fields needed for booking. The API-facing views use the
-- caller's RLS permissions on this purpose-built table, not owner privileges
-- on businesses or business_configs.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.booking_public_catalog (
    business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
    slug text NOT NULL,
    name text NOT NULL,
    city_state text,
    packages jsonb NOT NULL DEFAULT '[]'::jsonb,
    addons jsonb NOT NULL DEFAULT '[]'::jsonb,
    operating_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
    active boolean NOT NULL DEFAULT false
);

ALTER TABLE public.booking_public_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_public_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_public_catalog TO anon, authenticated;
CREATE POLICY "Public can read active booking catalog"
    ON public.booking_public_catalog FOR SELECT TO anon, authenticated
    USING (active);

CREATE OR REPLACE FUNCTION private.refresh_booking_public_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_business_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'businesses' THEN
        target_business_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        target_business_id := OLD.business_id;
    ELSE
        target_business_id := NEW.business_id;
    END IF;

    INSERT INTO public.booking_public_catalog (
        business_id, slug, name, city_state, packages, addons, operating_hours, active
    )
    SELECT b.id, b.slug, b.name, b.city_state,
           COALESCE(c.custom_settings -> 'packages', '[]'::jsonb),
           COALESCE(c.custom_settings -> 'addons', '[]'::jsonb),
           COALESCE(c.custom_settings -> 'operating_hours', '{}'::jsonb),
           b.subscription_status IN ('active', 'trialing')
    FROM public.businesses b
    LEFT JOIN public.business_configs c ON c.business_id = b.id
    WHERE b.id = target_business_id
    ON CONFLICT (business_id) DO UPDATE SET
        slug = EXCLUDED.slug,
        name = EXCLUDED.name,
        city_state = EXCLUDED.city_state,
        packages = EXCLUDED.packages,
        addons = EXCLUDED.addons,
        operating_hours = EXCLUDED.operating_hours,
        active = EXCLUDED.active;
    RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION private.refresh_booking_public_catalog() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_booking_public_business
AFTER INSERT OR UPDATE OF slug, name, city_state, subscription_status
ON public.businesses
FOR EACH ROW EXECUTE FUNCTION private.refresh_booking_public_catalog();

CREATE TRIGGER trg_booking_public_config
AFTER INSERT OR UPDATE OF custom_settings OR DELETE
ON public.business_configs
FOR EACH ROW EXECUTE FUNCTION private.refresh_booking_public_catalog();

INSERT INTO public.booking_public_catalog (
    business_id, slug, name, city_state, packages, addons, operating_hours, active
)
SELECT b.id, b.slug, b.name, b.city_state,
       COALESCE(c.custom_settings -> 'packages', '[]'::jsonb),
       COALESCE(c.custom_settings -> 'addons', '[]'::jsonb),
       COALESCE(c.custom_settings -> 'operating_hours', '{}'::jsonb),
       b.subscription_status IN ('active', 'trialing')
FROM public.businesses b
LEFT JOIN public.business_configs c ON c.business_id = b.id;

CREATE OR REPLACE VIEW public.booking_business_directory AS
SELECT business_id AS id, name, slug, city_state
FROM public.booking_public_catalog
WHERE active;

CREATE OR REPLACE VIEW public.booking_service_catalog AS
SELECT slug, packages, addons, operating_hours
FROM public.booking_public_catalog
WHERE active;

-- PostgreSQL 15+ supports invoker views. Local PostgreSQL 14 tests exercise
-- the public table RLS and projection; the hosted PostgreSQL 17 project also
-- verifies that both views use invoker permissions.
DO $$ BEGIN
    IF current_setting('server_version_num')::integer >= 150000 THEN
        EXECUTE 'ALTER VIEW public.booking_business_directory SET (security_invoker = true)';
        EXECUTE 'ALTER VIEW public.booking_service_catalog SET (security_invoker = true)';
    END IF;
END $$;

REVOKE ALL ON public.booking_business_directory,
              public.booking_service_catalog FROM PUBLIC;
GRANT SELECT ON public.booking_business_directory,
                public.booking_service_catalog TO anon, authenticated;
