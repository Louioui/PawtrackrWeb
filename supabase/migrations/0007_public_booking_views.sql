-- Public booking needs a small catalog, not owner emails, Stripe IDs, tax
-- settings, and the full configuration JSON. Views expose only approved fields.
DROP POLICY IF EXISTS "Public can read active businesses by slug"
    ON public.businesses;
DROP POLICY IF EXISTS "Public can read business service catalog for booking"
    ON public.business_configs;

CREATE POLICY "Tenant staff can read own business"
    ON public.businesses FOR SELECT TO authenticated
    USING (id = public.current_business_id());

-- The existing ALL policy still limits staff configuration reads and writes
-- to their own business. No direct anonymous table policy remains.
CREATE VIEW public.booking_business_directory AS
SELECT id, name, slug, city_state
FROM public.businesses
WHERE subscription_status IN ('active', 'trialing');

CREATE VIEW public.booking_service_catalog AS
SELECT b.slug,
       c.custom_settings -> 'packages' AS packages,
       c.custom_settings -> 'addons' AS addons,
       c.custom_settings -> 'operating_hours' AS operating_hours
FROM public.businesses b
JOIN public.business_configs c ON c.business_id = b.id
WHERE b.subscription_status IN ('active', 'trialing');

REVOKE ALL ON public.booking_business_directory,
              public.booking_service_catalog FROM PUBLIC;
GRANT SELECT ON public.booking_business_directory,
                public.booking_service_catalog TO anon, authenticated;
