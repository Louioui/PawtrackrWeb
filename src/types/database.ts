// ============================================================================
// PAWTRACKR WEB — STRICT MULTI-TENANT DOMAIN & DATABASE TYPES
// Every tenant entity is partitioned by `business_id` (UUID)
// ============================================================================

export type SubscriptionPlan = 'solo_van' | 'salon_pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

export type StaffRole = 'owner' | 'groomer' | 'front_desk';

export type BehaviorTag =
  | 'biter'
  | 'matted'
  | 'senior'
  | 'extra_care'
  | 'anxious'
  | 'heart_murmur'
  | 'cage_reactive';

export type VisitStatus =
  | 'booked'
  | 'dropped_off'
  | 'bathing'
  | 'styling'
  | 'ready'
  | 'completed';

export type BookingSource = 'online' | 'walk_in' | 'recurring';

export type PaymentMethod = 'card' | 'apple_pay' | 'cash' | 'split';

export interface ServicePackage {
  id: string;
  name: string;
  description: string;
  price: number; // Stored in USD dollars (converted to integer cents in POS engine)
  durationMinutes: number;
  badge?: string;
}

export interface ServiceAddon {
  id: string;
  name: string;
  price: number;
  category: 'spa' | 'coat_rescue' | 'health' | 'safety_surcharge';
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  phone: string;
  city_state: string;
  subscription_plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  created_at: string;
}

export interface BusinessConfig {
  business_id: string;
  tax_rate: number; // e.g. 8.63 (%)
  currency: 'USD' | 'CAD' | 'GBP';
  loyalty_points_per_dollar: number;
  custom_settings: {
    tagline: string;
    address: string;
    rating: number;
    reviewCount: number;
    packages: ServicePackage[];
    addons: ServiceAddon[];
    operating_hours: {
      open: string;
      close: string;
    };
  };
}

export interface StaffMember {
  id: string;
  business_id: string;
  name: string;
  role: StaffRole;
  specialty: string;
  color_hex: string;
  active_dogs_count: number;
}

export interface Client {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  loyalty_points: number;
  lifetime_spend: number;
  created_at: string;
}

export interface PetWeightEntry {
  date: string;
  weight_lbs: number;
}

export interface GroomingPhotoPair {
  id: string;
  visit_date: string;
  package_name: string;
  groomer_name: string;
  before_url: string;
  after_url: string;
  before_caption: string;
  after_caption: string;
  coat_condition_score: number; // 1 - 10
}

export interface Pet {
  id: string;
  business_id: string;
  client_id: string;
  name: string;
  species: 'Canine' | 'Feline';
  breed: string;
  weight_lbs: number;
  age_years: number;
  coat_type: string;
  rabies_verified: boolean;
  behavior_notes: string;
  behavior_tags: BehaviorTag[];
  avatar_url: string;
  weight_history: PetWeightEntry[];
  photo_gallery: GroomingPhotoPair[];
}

export interface Visit {
  id: string;
  business_id: string;
  client_id: string;
  pet_id: string;
  staff_id: string;
  status: VisitStatus;
  booking_source: BookingSource;
  package_id: string;
  package_name: string;
  base_price: number;
  addon_ids: string[];
  total_amount: number;
  scheduled_time: string; // ISO string or formatted slot
  time_label: string;     // e.g. "09:30 AM"
  duration_minutes: number;
  bay_or_van: string;
  report_card_notes: string;
  weight_logged_lbs: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  business_id: string;
  visit_id: string;
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  amount: number;
  payment_method: PaymentMethod;
  stripe_payment_intent_id?: string;
  status: 'pending' | 'completed' | 'refunded';
  created_at: string;
}
