// ============================================================================
// PAWTRACKR WEB — MULTI-TENANT PRODUCTION DATASET (LOCAL-FIRST + SUPABASE SYNC)
// Strictly partitioned by `business_id` to demonstrate multi-tenant RLS
// isolation between independent grooming salons and mobile van fleets.
// ============================================================================

import type {
  Business,
  BusinessConfig,
  Client,
  Pet,
  StaffMember,
  Transaction,
  Visit,
} from '../types/database.ts';

export const TENANT_BESPOKE_ID = '11111111-1111-4111-8111-111111111111';
export const TENANT_SPLASH_ID = '22222222-2222-4222-8222-222222222222';

export const BUSINESSES: Business[] = [
  {
    id: TENANT_BESPOKE_ID,
    name: 'Bespoke Grooming Studio',
    slug: 'bespoke-grooming',
    owner_email: 'elena@bespokegrooming.live',
    phone: '(415) 890-4829',
    city_state: 'San Francisco, CA',
    subscription_plan: 'salon_pro',
    subscription_status: 'active',
    created_at: '2026-01-15T08:00:00Z',
  },
  {
    id: TENANT_SPLASH_ID,
    name: 'Splash Mobile Van Fleet',
    slug: 'splash-grooming',
    owner_email: 'marcus@splashmobile.live',
    phone: '(310) 555-0194',
    city_state: 'Santa Monica, CA',
    subscription_plan: 'solo_van',
    subscription_status: 'active',
    created_at: '2026-03-02T08:00:00Z',
  },
];

export const BUSINESS_CONFIGS: Record<string, BusinessConfig> = {
  [TENANT_BESPOKE_ID]: {
    business_id: TENANT_BESPOKE_ID,
    tax_rate: 8.63,
    currency: 'USD',
    loyalty_points_per_dollar: 2,
    custom_settings: {
      tagline: 'Architectural Coat Styling & Low-Stress Holistic Spa',
      address: '742 Valencia St, San Francisco, CA 94110',
      rating: 4.98,
      reviewCount: 418,
      operating_hours: { open: '08:00', close: '18:30' },
      packages: [
        {
          id: 'pkg-couture-scissor',
          name: 'Full Couture Breed Scissoring',
          description:
            'Hand-scissored architectural finish, double micro-bubble ozone bath, velocity fluff dry, sanitary & paw pad sculpt, ear cleanse, and dremel nail polish.',
          price: 135.0,
          durationMinutes: 120,
          badge: 'Most Popular',
        },
        {
          id: 'pkg-asian-fusion',
          name: 'Signature Asian Fusion / Teddy Trim',
          description:
            'Precision round muzzle & plush column leg styling tailored for Poodles, Bichons, and Doodles. Includes keratin coat masque.',
          price: 155.0,
          durationMinutes: 135,
          badge: 'Master Stylist',
        },
        {
          id: 'pkg-ozone-bath',
          name: 'Ozone Hydro-Massage Bath & Blowout',
          description:
            'Deep skin oxygenation bath, blowout, undercoat brush-out, face/feet/fanny tidy trim, and organic blueberry facial.',
          price: 88.0,
          durationMinutes: 75,
        },
        {
          id: 'pkg-puppy-sanctuary',
          name: 'Sensory Puppy First Sanctuary Groom',
          description:
            'Fear-free acoustic introduction for puppies under 6 months: warm bath, gentle dryer conditioning, eye-corner clear, and nail tip buff.',
          price: 68.0,
          durationMinutes: 60,
          badge: 'Fear-Free Certified',
        },
      ],
      addons: [
        {
          id: 'add-blueberry',
          name: 'Organic Blueberry Tear-Stain Facial',
          price: 18.0,
          category: 'spa',
        },
        {
          id: 'add-deshed',
          name: 'Carding & Undercoat De-Shedding Ritual',
          price: 28.0,
          category: 'coat_rescue',
        },
        {
          id: 'add-demat-rescue',
          name: 'Humane Dematting & Coat Detangle (+20m)',
          price: 25.0,
          category: 'safety_surcharge',
        },
        {
          id: 'add-handling-specialist',
          name: '2-Person Fear-Free Handling Support',
          price: 20.0,
          category: 'safety_surcharge',
        },
        {
          id: 'add-emmi-pet',
          name: 'Ultrasonic Emmi-Pet Tartar & Breath Care',
          price: 32.0,
          category: 'health',
        },
        {
          id: 'add-manuka-balm',
          name: 'Dremel Sculpt & Manuka Nose/Paw Balm',
          price: 16.0,
          category: 'spa',
        },
      ],
    },
  },
  [TENANT_SPLASH_ID]: {
    business_id: TENANT_SPLASH_ID,
    tax_rate: 9.5,
    currency: 'USD',
    loyalty_points_per_dollar: 1,
    custom_settings: {
      tagline: 'Curbside Luxury Mercedes Sprinter Grooming Sanctuary',
      address: 'Mobile Fleet: Santa Monica, Brentwood & Venice',
      rating: 4.96,
      reviewCount: 284,
      operating_hours: { open: '07:30', close: '17:30' },
      packages: [
        {
          id: 'pkg-sprinter-vip',
          name: 'Curbside 1-on-1 Full VIP Groom',
          description:
            'Doorstep luxury in our solar-powered Sprinter van. Zero cages, zero shop noise, full breed cut, warm hydro-bath, and paw care.',
          price: 165.0,
          durationMinutes: 90,
          badge: 'Zero Cage Stress',
        },
        {
          id: 'pkg-beach-deshed',
          name: 'Surf-Side Deshed & Warm Hydro Bath',
          description:
            'Removes salt, sand, and 90% of loose undercoat. Includes sea-kelp conditioning soak and high-velocity blowout.',
          price: 115.0,
          durationMinutes: 60,
        },
      ],
      addons: [
        {
          id: 'add-oatmeal-soak',
          name: 'Colloidal Oatmeal & Aloe Relief Mask',
          price: 22.0,
          category: 'spa',
        },
        {
          id: 'add-demat-mobile',
          name: 'Pelted / Matted Coat Recovery Fee',
          price: 30.0,
          category: 'safety_surcharge',
        },
        {
          id: 'add-dental-gel',
          name: 'Enzymatic Dental Gel & Pad Shave',
          price: 18.0,
          category: 'health',
        },
      ],
    },
  },
};

export const STAFF_MEMBERS: StaffMember[] = [
  {
    id: 'st-101',
    business_id: TENANT_BESPOKE_ID,
    name: 'Elena Vance',
    role: 'owner',
    specialty: 'Master Poodle & Asian Fusion Stylist',
    color_hex: '#8B95FF',
    active_dogs_count: 3,
  },
  {
    id: 'st-102',
    business_id: TENANT_BESPOKE_ID,
    name: 'Julian Kwon',
    role: 'groomer',
    specialty: 'Hand-Stripping & Double Coat Specialist',
    color_hex: '#10B981',
    active_dogs_count: 2,
  },
  {
    id: 'st-103',
    business_id: TENANT_BESPOKE_ID,
    name: 'Sora Takahashi',
    role: 'groomer',
    specialty: 'Senior & Fear-Free Rehabilitation Groomer',
    color_hex: '#F59E0B',
    active_dogs_count: 2,
  },
  {
    id: 'st-104',
    business_id: TENANT_BESPOKE_ID,
    name: 'Maya Lin',
    role: 'front_desk',
    specialty: 'Concierge Intake & POS Coordinator',
    color_hex: '#38BDF8',
    active_dogs_count: 0,
  },
  // Tenant 2 Staff (Isolated to Splash Mobile Van Fleet)
  {
    id: 'st-201',
    business_id: TENANT_SPLASH_ID,
    name: 'Marcus Sterling',
    role: 'owner',
    specialty: 'Sprinter Van #1 Lead Groomer',
    color_hex: '#8B95FF',
    active_dogs_count: 2,
  },
  {
    id: 'st-202',
    business_id: TENANT_SPLASH_ID,
    name: 'Chloe Rivera',
    role: 'groomer',
    specialty: 'Sprinter Van #2 Coastal Deshed Specialist',
    color_hex: '#10B981',
    active_dogs_count: 2,
  },
];

export const CLIENTS: Client[] = [
  {
    id: 'cl-101',
    business_id: TENANT_BESPOKE_ID,
    name: 'Sophia Chen-Alvarez',
    phone: '(415) 890-4829',
    email: 'sophia.alvarez@icloud.com',
    address: '2140 Pacific Ave, Apt 4B, San Francisco, CA',
    loyalty_points: 840,
    lifetime_spend: 1840.0,
    created_at: '2025-11-10T10:00:00Z',
  },
  {
    id: 'cl-102',
    business_id: TENANT_BESPOKE_ID,
    name: 'Devon Thorne',
    phone: '(415) 622-9104',
    email: 'dthorne@linear-ventures.io',
    address: '888 Brannan St, San Francisco, CA',
    loyalty_points: 460,
    lifetime_spend: 985.5,
    created_at: '2026-01-19T14:30:00Z',
  },
  {
    id: 'cl-103',
    business_id: TENANT_BESPOKE_ID,
    name: 'Hannah Lindqvist',
    phone: '(650) 419-3302',
    email: 'hannah.lindqvist@me.com',
    address: '390 Dolores St, San Francisco, CA',
    loyalty_points: 1120,
    lifetime_spend: 2490.0,
    created_at: '2025-08-04T09:15:00Z',
  },
  {
    id: 'cl-104',
    business_id: TENANT_BESPOKE_ID,
    name: 'Liam O’Connor',
    phone: '(415) 773-5521',
    email: 'liam@oconnorarchitects.com',
    address: '1422 Noe St, San Francisco, CA',
    loyalty_points: 310,
    lifetime_spend: 620.0,
    created_at: '2026-04-12T11:20:00Z',
  },
  {
    id: 'cl-105',
    business_id: TENANT_BESPOKE_ID,
    name: 'Amara Patel',
    phone: '(415) 309-7788',
    email: 'amara.patel@gmail.com',
    address: '512 Hayes St, San Francisco, CA',
    loyalty_points: 675,
    lifetime_spend: 1350.0,
    created_at: '2025-12-01T16:00:00Z',
  },
  {
    id: 'cl-106',
    business_id: TENANT_BESPOKE_ID,
    name: 'Noah Vance-Kerr',
    phone: '(415) 901-2345',
    email: 'noah.vk@hey.com',
    address: '1900 Fell St, San Francisco, CA',
    loyalty_points: 195,
    lifetime_spend: 390.0,
    created_at: '2026-06-18T13:10:00Z',
  },
  // Tenant 2 Clients (Splash Mobile Van Fleet)
  {
    id: 'cl-201',
    business_id: TENANT_SPLASH_ID,
    name: 'Kendra Hollis',
    phone: '(310) 882-4410',
    email: 'kendra@malibustudio.com',
    address: '412 Ocean Ave, Santa Monica, CA',
    loyalty_points: 520,
    lifetime_spend: 1120.0,
    created_at: '2026-03-10T10:00:00Z',
  },
  {
    id: 'cl-202',
    business_id: TENANT_SPLASH_ID,
    name: 'Grant Mercer',
    phone: '(310) 409-1198',
    email: 'gmercer@pacificcap.com',
    address: '910 Montana Ave, Santa Monica, CA',
    loyalty_points: 290,
    lifetime_spend: 580.0,
    created_at: '2026-05-01T10:00:00Z',
  },
];

export const PETS: Pet[] = [
  {
    id: 'pet-101',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-101',
    name: 'Bello',
    species: 'Canine',
    breed: 'F1b Mini Goldendoodle',
    weight_lbs: 24.6,
    age_years: 3,
    coat_type: 'Curly Fleece (High Density)',
    rabies_verified: true,
    behavior_notes:
      'Friction mats behind ears & collar line. Very sweet temperament, prefers low-pitch dryer nozzle around ears.',
    behavior_tags: ['matted', 'extra_care'],
    avatar_url:
      'https://images.unsplash.com/photo-1591769225440-811ad7d6eab3?auto=format&fit=crop&w=600&q=80',
    weight_history: [
      { date: '2026-05-12', weight_lbs: 23.8 },
      { date: '2026-07-04', weight_lbs: 24.1 },
      { date: '2026-09-01', weight_lbs: 24.4 },
      { date: '2026-11-07', weight_lbs: 24.6 },
    ],
    photo_gallery: [
      {
        id: 'gal-1',
        visit_date: 'Nov 07, 2026',
        package_name: 'Signature Asian Fusion / Teddy Trim',
        groomer_name: 'Elena Vance',
        before_url:
          'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=800&q=80',
        after_url:
          'https://images.unsplash.com/photo-1591769225440-811ad7d6eab3?auto=format&fit=crop&w=800&q=80',
        before_caption: 'Overgrown 8-week fleece coat with tight friction tangles behind both ears.',
        after_caption: 'Hand-scissored 1/2" plush teddy columns, rounded donut muzzle & blueberry tear-stain lift.',
        coat_condition_score: 9.6,
      },
      {
        id: 'gal-2',
        visit_date: 'Sep 01, 2026',
        package_name: 'Full Couture Breed Scissoring',
        groomer_name: 'Elena Vance',
        before_url:
          'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?auto=format&fit=crop&w=800&q=80',
        after_url:
          'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=800&q=80',
        before_caption: 'Post-beach salt buildup and damp undercoat webbing near front armpits.',
        after_caption: 'Ozone hydro-massage detox bath + velvet scissor finish & Manuka paw pad treatment.',
        coat_condition_score: 9.4,
      },
    ],
  },
  {
    id: 'pet-102',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-102',
    name: 'Koda',
    species: 'Canine',
    breed: 'Shiba Inu',
    weight_lbs: 22.0,
    age_years: 4,
    coat_type: 'Dense Double Spit Coat',
    rabies_verified: true,
    behavior_notes:
      'CRITICAL ALERT: Snaps when front dewclaws are touched. Use soft breathable basket muzzle for nail dremel only. Two-person hold required.',
    behavior_tags: ['biter', 'anxious'],
    avatar_url:
      'https://images.unsplash.com/photo-1583511655826-05700d52f4d9?auto=format&fit=crop&w=600&q=80',
    weight_history: [
      { date: '2026-06-15', weight_lbs: 22.4 },
      { date: '2026-08-20', weight_lbs: 22.1 },
      { date: '2026-11-07', weight_lbs: 22.0 },
    ],
    photo_gallery: [],
  },
  {
    id: 'pet-103',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-103',
    name: 'Mochi',
    species: 'Canine',
    breed: 'Toy Poodle (Apricot)',
    weight_lbs: 7.8,
    age_years: 12,
    coat_type: 'Fine Silky Curl',
    rabies_verified: true,
    behavior_notes:
      '12yo Senior with Grade II Heart Murmur & mild rear hip arthritis. Use orthopedic sling support; limit continuous standing to 20-min intervals.',
    behavior_tags: ['senior', 'heart_murmur', 'extra_care'],
    avatar_url:
      'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=600&q=80',
    weight_history: [
      { date: '2026-05-01', weight_lbs: 8.1 },
      { date: '2026-08-01', weight_lbs: 7.9 },
      { date: '2026-11-07', weight_lbs: 7.8 },
    ],
    photo_gallery: [],
  },
  {
    id: 'pet-104',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-104',
    name: 'Winston',
    species: 'Canine',
    breed: 'Cavapoo',
    weight_lbs: 16.4,
    age_years: 2,
    coat_type: 'Wavy Silk-Wool Blend',
    rabies_verified: true,
    behavior_notes:
      'Chest & belly matting from harness rub. Needs 20-minute humane dematting conditioning spray before bath.',
    behavior_tags: ['matted'],
    avatar_url:
      'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80',
    weight_history: [
      { date: '2026-07-10', weight_lbs: 15.9 },
      { date: '2026-11-07', weight_lbs: 16.4 },
    ],
    photo_gallery: [],
  },
  {
    id: 'pet-105',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-105',
    name: 'duchess',
    species: 'Canine',
    breed: 'Bernedoodle (Standard)',
    weight_lbs: 64.2,
    age_years: 5,
    coat_type: 'Heavy Tri-Color Wavy Fleece',
    rabies_verified: true,
    behavior_notes:
      'Gentle giant but cage-reactive if placed near barking terriers. Keep in open-top luxury suite #1.',
    behavior_tags: ['cage_reactive', 'extra_care'],
    avatar_url:
      'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?auto=format&fit=crop&w=600&q=80',
    weight_history: [
      { date: '2026-08-14', weight_lbs: 63.8 },
      { date: '2026-11-07', weight_lbs: 64.2 },
    ],
    photo_gallery: [],
  },
  {
    id: 'pet-106',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-106',
    name: 'Zephyr',
    species: 'Canine',
    breed: 'Australian Shepherd',
    weight_lbs: 48.0,
    age_years: 3,
    coat_type: 'Weather-Resistant Double Coat',
    rabies_verified: true,
    behavior_notes:
      'High energy, loves water jets. Never shave double coat—outline feather trim & undercoat carding only.',
    behavior_tags: ['anxious'],
    avatar_url:
      'https://images.unsplash.com/photo-1503256207526-0d5d80fa2f47?auto=format&fit=crop&w=600&q=80',
    weight_history: [{ date: '2026-11-07', weight_lbs: 48.0 }],
    photo_gallery: [],
  },
  // Tenant 2 Pets (Isolated to Splash Mobile Van Fleet)
  {
    id: 'pet-201',
    business_id: TENANT_SPLASH_ID,
    client_id: 'cl-201',
    name: 'Malibu',
    species: 'Canine',
    breed: 'Golden Retriever',
    weight_lbs: 58.5,
    age_years: 6,
    coat_type: 'Coastal Golden Double Coat',
    rabies_verified: true,
    behavior_notes: 'Sand accumulation in webbing between toes. Loves warm hydro nozzle.',
    behavior_tags: ['matted'],
    avatar_url:
      'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80',
    weight_history: [{ date: '2026-11-07', weight_lbs: 58.5 }],
    photo_gallery: [],
  },
  {
    id: 'pet-202',
    business_id: TENANT_SPLASH_ID,
    client_id: 'cl-202',
    name: 'Rocco',
    species: 'Canine',
    breed: 'French Bulldog',
    weight_lbs: 26.0,
    age_years: 4,
    coat_type: 'Short Smooth Brindle',
    rabies_verified: true,
    behavior_notes: 'Brachycephalic airway caution + nail clipper bite risk. Use cool air only.',
    behavior_tags: ['biter', 'extra_care'],
    avatar_url:
      'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=600&q=80',
    weight_history: [{ date: '2026-11-07', weight_lbs: 26.0 }],
    photo_gallery: [],
  },
];

export const INITIAL_VISITS: Visit[] = [
  {
    id: 'vis-101',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-101',
    pet_id: 'pet-101',
    staff_id: 'st-101',
    status: 'styling',
    booking_source: 'online',
    package_id: 'pkg-asian-fusion',
    package_name: 'Signature Asian Fusion / Teddy Trim',
    base_price: 155.0,
    addon_ids: ['add-blueberry', 'add-demat-rescue'],
    total_amount: 198.0,
    scheduled_time: '2026-11-07T09:00:00-08:00',
    time_label: '09:00 AM',
    duration_minutes: 135,
    bay_or_van: 'Styling Table #1',
    report_card_notes:
      'Bello was an absolute gentleman today! Safely detangled ear mats with silk serum, sculpted plush 1/2" column legs & round teddy muzzle.',
    weight_logged_lbs: 24.6,
    created_at: '2026-11-05T14:22:00Z',
  },
  {
    id: 'vis-102',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-102',
    pet_id: 'pet-102',
    staff_id: 'st-102',
    status: 'bathing',
    booking_source: 'walk_in',
    package_id: 'pkg-ozone-bath',
    package_name: 'Ozone Hydro-Massage Bath & Blowout',
    base_price: 88.0,
    addon_ids: ['add-deshed', 'add-handling-specialist'],
    total_amount: 136.0,
    scheduled_time: '2026-11-07T10:00:00-08:00',
    time_label: '10:00 AM',
    duration_minutes: 75,
    bay_or_van: 'Hydro Spa Tub #2',
    report_card_notes:
      'Front-desk walk-in deshed. Julian & Sora performed 2-person fear-free nail trim with basket muzzle—zero stress!',
    weight_logged_lbs: 22.0,
    created_at: '2026-11-07T09:48:00Z',
  },
  {
    id: 'vis-103',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-103',
    pet_id: 'pet-103',
    staff_id: 'st-103',
    status: 'ready',
    booking_source: 'recurring',
    package_id: 'pkg-couture-scissor',
    package_name: 'Full Couture Breed Scissoring',
    base_price: 135.0,
    addon_ids: ['add-blueberry', 'add-manuka-balm'],
    total_amount: 169.0,
    scheduled_time: '2026-11-07T08:30:00-08:00',
    time_label: '08:30 AM',
    duration_minutes: 120,
    bay_or_van: 'Senior Sanctuary Suite #3',
    report_card_notes:
      'Mochi rested comfortably in our orthopedic belly sling. Heart rate stayed calm throughout warm hydro-rinse and lamb-cut scissor finish.',
    weight_logged_lbs: 7.8,
    created_at: '2026-10-24T10:00:00Z',
  },
  {
    id: 'vis-104',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-104',
    pet_id: 'pet-104',
    staff_id: 'st-101',
    status: 'dropped_off',
    booking_source: 'online',
    package_id: 'pkg-couture-scissor',
    package_name: 'Full Couture Breed Scissoring',
    base_price: 135.0,
    addon_ids: ['add-demat-rescue', 'add-emmi-pet'],
    total_amount: 192.0,
    scheduled_time: '2026-11-07T11:30:00-08:00',
    time_label: '11:30 AM',
    duration_minutes: 120,
    bay_or_van: 'Prep Station #2',
    report_card_notes:
      'Checked in at front desk. Applying conditioning detangler spray to harness friction zone before ozone bath.',
    weight_logged_lbs: 16.4,
    created_at: '2026-11-04T19:15:00Z',
  },
  {
    id: 'vis-105',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-105',
    pet_id: 'pet-105',
    staff_id: 'st-102',
    status: 'booked',
    booking_source: 'online',
    package_id: 'pkg-asian-fusion',
    package_name: 'Signature Asian Fusion / Teddy Trim',
    base_price: 155.0,
    addon_ids: ['add-deshed', 'add-manuka-balm'],
    total_amount: 199.0,
    scheduled_time: '2026-11-07T13:00:00-08:00',
    time_label: '01:00 PM',
    duration_minutes: 135,
    bay_or_van: 'Open-Top Luxury Suite #1',
    report_card_notes: 'Confirmed via SMS reminder. Reserved Open-Top Suite #1.',
    weight_logged_lbs: 64.2,
    created_at: '2026-11-01T12:00:00Z',
  },
  {
    id: 'vis-106',
    business_id: TENANT_BESPOKE_ID,
    client_id: 'cl-106',
    pet_id: 'pet-106',
    staff_id: 'st-103',
    status: 'completed',
    booking_source: 'walk_in',
    package_id: 'pkg-ozone-bath',
    package_name: 'Ozone Hydro-Massage Bath & Blowout',
    base_price: 88.0,
    addon_ids: ['add-deshed'],
    total_amount: 116.0,
    scheduled_time: '2026-11-07T08:00:00-08:00',
    time_label: '08:00 AM',
    duration_minutes: 75,
    bay_or_van: 'Hydro Spa Tub #1',
    report_card_notes:
      'Full undercoat blowout & feathering tidy. Paid via Apple Pay at POS.',
    weight_logged_lbs: 48.0,
    created_at: '2026-11-07T07:55:00Z',
  },
  // Tenant 2 Visits (Isolated to Splash Mobile Van Fleet)
  {
    id: 'vis-201',
    business_id: TENANT_SPLASH_ID,
    client_id: 'cl-201',
    pet_id: 'pet-201',
    staff_id: 'st-201',
    status: 'styling',
    booking_source: 'online',
    package_id: 'pkg-sprinter-vip',
    package_name: 'Curbside 1-on-1 Full VIP Groom',
    base_price: 165.0,
    addon_ids: ['add-oatmeal-soak'],
    total_amount: 187.0,
    scheduled_time: '2026-11-07T10:30:00-08:00',
    time_label: '10:30 AM',
    duration_minutes: 90,
    bay_or_van: 'Mercedes Sprinter Van #1 (412 Ocean Ave)',
    report_card_notes: 'Curbside at 412 Ocean Ave. Full sea-salt detox & golden feather sculpt.',
    weight_logged_lbs: 58.5,
    created_at: '2026-11-06T09:00:00Z',
  },
  {
    id: 'vis-202',
    business_id: TENANT_SPLASH_ID,
    client_id: 'cl-202',
    pet_id: 'pet-202',
    staff_id: 'st-202',
    status: 'ready',
    booking_source: 'online',
    package_id: 'pkg-beach-deshed',
    package_name: 'Surf-Side Deshed & Warm Hydro Bath',
    base_price: 115.0,
    addon_ids: ['add-dental-gel'],
    total_amount: 133.0,
    scheduled_time: '2026-11-07T09:15:00-08:00',
    time_label: '09:15 AM',
    duration_minutes: 60,
    bay_or_van: 'Mercedes Sprinter Van #2 (910 Montana Ave)',
    report_card_notes: 'Cool-air brachycephalic dry completed. Ready for driveway handoff.',
    weight_logged_lbs: 26.0,
    created_at: '2026-11-06T12:00:00Z',
  },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1001',
    business_id: TENANT_BESPOKE_ID,
    visit_id: 'vis-106',
    subtotal: 116.0,
    discount: 0.0,
    tax: 10.01, // 116.00 * 8.63% = 10.0108 -> 10.01
    tip: 23.2,  // 20% of 116.00 = 23.20
    amount: 149.21,
    payment_method: 'apple_pay',
    stripe_payment_intent_id: 'pi_3Q8xPawtrackrLive001',
    status: 'completed',
    created_at: '2026-11-07T09:18:00Z',
  },
];

/**
 * Helper to fetch isolated tenant dataset by business_id or slug
 */
export function getTenantBundleBySlug(slug: string) {
  const business =
    BUSINESSES.find((b) => b.slug === slug) ?? BUSINESSES[0];
  return getTenantBundleById(business.id);
}

export function getTenantBundleById(businessId: string) {
  const business =
    BUSINESSES.find((b) => b.id === businessId) ?? BUSINESSES[0];
  const config = BUSINESS_CONFIGS[business.id];
  const staff = STAFF_MEMBERS.filter((s) => s.business_id === business.id);
  const clients = CLIENTS.filter((c) => c.business_id === business.id);
  const pets = PETS.filter((p) => p.business_id === business.id);
  const visits = INITIAL_VISITS.filter((v) => v.business_id === business.id);
  const transactions = INITIAL_TRANSACTIONS.filter(
    (t) => t.business_id === business.id
  );

  return {
    business,
    config,
    staff,
    clients,
    pets,
    visits,
    transactions,
  };
}
