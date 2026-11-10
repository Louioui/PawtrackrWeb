-- Publish the salon's configured IANA time zone with its wall-clock hours.
-- Existing salons without a zone retain the explicitly documented UTC default.
ALTER TABLE public.booking_public_catalog
    ADD COLUMN time_zone text NOT NULL DEFAULT 'UTC';

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
        business_id, slug, name, city_state, packages, addons, operating_hours, active, time_zone
    )
    SELECT b.id, b.slug, b.name, b.city_state,
           COALESCE(c.custom_settings -> 'packages', '[]'::jsonb),
           COALESCE(c.custom_settings -> 'addons', '[]'::jsonb),
           COALESCE(c.custom_settings -> 'operating_hours', '{}'::jsonb),
           b.subscription_status IN ('active', 'trialing'),
           COALESCE(c.custom_settings ->> 'time_zone', 'UTC')
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
        active = EXCLUDED.active,
        time_zone = EXCLUDED.time_zone;
    RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION private.refresh_booking_public_catalog() FROM PUBLIC, anon, authenticated;

UPDATE public.booking_public_catalog AS catalog
SET time_zone = COALESCE(config.custom_settings ->> 'time_zone', 'UTC')
FROM public.business_configs AS config
WHERE config.business_id = catalog.business_id;

CREATE OR REPLACE VIEW public.booking_service_catalog AS
SELECT slug, packages, addons, operating_hours, time_zone
FROM public.booking_public_catalog
WHERE active;

DO $$ BEGIN
    IF current_setting('server_version_num')::integer >= 150000 THEN
        EXECUTE 'ALTER VIEW public.booking_service_catalog SET (security_invoker = true)';
    END IF;
END $$;
REVOKE ALL ON public.booking_service_catalog FROM PUBLIC;
GRANT SELECT ON public.booking_service_catalog TO anon, authenticated;
