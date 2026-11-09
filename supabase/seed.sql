-- ============================================================================
-- PAWTRACKR WEB: MULTI-TENANT SEED DATA
-- Demonstrates two completely isolated grooming tenants:
--   Tenant 1: Bespoke Grooming Studio (slug: bespoke-grooming)
--   Tenant 2: Splash Mobile Grooming Van Fleet (slug: splash-grooming)
-- ============================================================================

INSERT INTO public.businesses (id, name, slug, owner_email, phone, city_state, subscription_plan, subscription_status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Bespoke Grooming Studio', 'bespoke-grooming', 'elena@bespokegrooming.live', '(415) 890-4829', 'San Francisco, CA', 'salon_pro', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'Splash Mobile Van Fleet', 'splash-grooming', 'marcus@splashmobile.live', '(310) 555-0194', 'Santa Monica, CA', 'solo_van', 'active')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.business_configs (business_id, tax_rate, currency, loyalty_points_per_dollar, custom_settings)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    8.63,
    'USD',
    2,
    '{
      "tagline": "Architectural Coat Styling & Low-Stress Holistic Spa",
      "address": "742 Valencia St, San Francisco, CA 94110",
      "packages": [
        {"id": "pkg-full-couture", "name": "Full Couture Breed Scissoring", "price": 135.00, "duration": 120},
        {"id": "pkg-teddy-trim", "name": "Signature Asian Fusion / Teddy Trim", "price": 150.00, "duration": 135},
        {"id": "pkg-hydro-bath", "name": "Ozone Hydro-Massage Bath & Blowout", "price": 85.00, "duration": 75},
        {"id": "pkg-puppy-intro", "name": "Sensory Puppy First Sanctuary Groom", "price": 65.00, "duration": 60}
      ],
      "addons": [
        {"id": "add-blueberry", "name": "Organic Blueberry Tear-Stain Facial", "price": 18.00},
        {"id": "add-deshed", "name": "Carding & Undercoat De-Shedding Ritual", "price": 28.00},
        {"id": "add-demat", "name": "Humane Dematting & Coat Rescue (+15m)", "price": 25.00},
        {"id": "add-pad-balm", "name": "Dremel Nail Sculpt & Manuka Paw Balm", "price": 16.00},
        {"id": "add-ultrasonic", "name": "Ultrasonic Emmi-Pet Breath & Tartar Care", "price": 32.00}
      ]
    }'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    9.50,
    'USD',
    1,
    '{
      "tagline": "Curbside Luxury Mercedes Sprinter Grooming Sanctuary",
      "address": "Mobile Service Area: Westside LA & Santa Monica",
      "packages": [
        {"id": "pkg-mobile-full", "name": "Curbside Full VIP Groom & Style", "price": 165.00, "duration": 90},
        {"id": "pkg-mobile-bath", "name": "Surf-Side Deshed & Warm Hydro Bath", "price": 110.00, "duration": 60}
      ],
      "addons": [
        {"id": "add-oatmeal", "name": "Colloidal Oatmeal Soothing Mask", "price": 22.00},
        {"id": "add-teeth", "name": "Enzymatic Dental Gel & Paw Trim", "price": 18.00}
      ]
    }'::jsonb
  )
ON CONFLICT (business_id) DO NOTHING;
