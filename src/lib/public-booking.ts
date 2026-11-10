import { createClient } from '@supabase/supabase-js';

export interface PublicSalon {
  id: string;
  name: string;
  slug: string;
  city_state: string | null;
}

export interface PublicService {
  id: string | null;
  name: string;
  description: string | null;
  price: number | null;
  durationMinutes: number | null;
}

export interface PublicCatalog {
  packages: PublicService[];
  addons: PublicService[];
  operatingHours: { open: string; close: string } | null;
  timeZone: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parsePublicSalon(value: unknown): PublicSalon | null {
  if (!isRecord(value) || typeof value.id !== 'string' ||
      typeof value.name !== 'string' || !value.name.trim() ||
      typeof value.slug !== 'string' || !/^[a-z0-9-]+$/.test(value.slug)) return null;
  return {
    id: value.id,
    name: value.name.trim(),
    slug: value.slug,
    city_state: typeof value.city_state === 'string' ? value.city_state : null,
  };
}

function parseServices(value: unknown): PublicService[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== 'string' || !item.name.trim()) return [];
    const price = typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0
      ? item.price : null;
    const durationMinutes = typeof item.durationMinutes === 'number' &&
      Number.isInteger(item.durationMinutes) && item.durationMinutes > 0 ? item.durationMinutes : null;
    return [{
      id: typeof item.id === 'string' && item.id.trim() && item.id.length <= 100 ? item.id : null,
      name: item.name.trim(),
      description: typeof item.description === 'string' ? item.description.trim() : null,
      price,
      durationMinutes,
    }];
  });
}

export function parsePublicCatalog(value: unknown): PublicCatalog {
  const row = isRecord(value) ? value : {};
  const hours = isRecord(row.operating_hours) ? row.operating_hours : {};
  let timeZone: string | null = null;
  if (typeof row.time_zone === 'string' && row.time_zone.length <= 100) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: row.time_zone });
      timeZone = row.time_zone;
    } catch { /* Do not label hours with an invalid zone. */ }
  }
  return {
    packages: parseServices(row.packages),
    addons: parseServices(row.addons),
    operatingHours: typeof hours.open === 'string' && typeof hours.close === 'string'
      ? { open: hours.open, close: hours.close } : null,
    timeZone,
  };
}

export function getPublicBookingClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://') || url.includes('your-project-id')) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}

// ---------------------------------------------------------------------------
// Online booking requests. The database functions in migration 0018 are the
// authority; these checks give the form and API the same early answer.
// ---------------------------------------------------------------------------

export type PublicBookingRequest = {
  slug: string;
  package_id: string;
  starts_at: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  pet_name: string;
  breed: string;
};

export type PublicBookingConfirmation = {
  reference: string;
  service: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  price: number;
};

const slugPattern = /^[a-z0-9-]{1,60}$/;
const instantPattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;

export function validBookingSlug(value: unknown): value is string {
  return typeof value === 'string' && slugPattern.test(value);
}

export function validBookingDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

export function validatePublicBookingRequest(input: unknown):
  { ok: true; request: PublicBookingRequest } | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: 'Booking details are required.' };
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const clientName = text(input.client_name);
  const petName = text(input.pet_name);
  const breed = text(input.breed);
  const phoneDigits = text(input.client_phone).replace(/\D/g, '');
  const email = text(input.client_email).toLowerCase();
  if (!validBookingSlug(input.slug) || typeof input.package_id !== 'string' || !input.package_id || input.package_id.length > 100) {
    return { ok: false, error: 'Choose a service to book.' };
  }
  if (typeof input.starts_at !== 'string' || !instantPattern.test(input.starts_at) || !Number.isFinite(Date.parse(input.starts_at))) {
    return { ok: false, error: 'Choose an available time.' };
  }
  if (clientName.length < 2 || clientName.length > 120) return { ok: false, error: 'Enter your full name.' };
  if (phoneDigits.length < 10 || phoneDigits.length > 15) return { ok: false, error: 'Enter a phone number with area code.' };
  if (email && (email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) return { ok: false, error: 'Enter a valid email address, or leave it blank.' };
  if (petName.length < 1 || petName.length > 80) return { ok: false, error: "Enter your pet's name." };
  if (breed.length < 1 || breed.length > 80) return { ok: false, error: "Enter your pet's breed." };
  return {
    ok: true,
    request: {
      slug: input.slug, package_id: input.package_id, starts_at: new Date(input.starts_at).toISOString(),
      client_name: clientName, client_phone: phoneDigits, client_email: email || null, pet_name: petName, breed,
    },
  };
}

// Maps the SQLSTATEs raised by the public booking functions to an HTTP answer
// a pet parent can act on.
export function publicBookingFailure(code: string | undefined): { status: number; error: string } {
  switch (code) {
    case 'PW020': return { status: 404, error: 'This salon or service is not taking online bookings right now.' };
    case 'PW021': return { status: 400, error: 'Check your name, phone, email, and pet details.' };
    case 'PW022': return { status: 409, error: 'That time was just taken. Pick another time.' };
    case 'PW023': return { status: 429, error: 'Online booking is limited right now. Please contact the salon directly.' };
    default: return { status: 502, error: 'We could not confirm that booking. It was not saved; please try again.' };
  }
}

export function parseBookingConfirmation(value: unknown): PublicBookingConfirmation | null {
  if (!isRecord(value) || typeof value.reference !== 'string' || !/^[0-9A-F]{8}$/.test(value.reference) ||
      typeof value.service !== 'string' || typeof value.time_zone !== 'string' ||
      typeof value.starts_at !== 'string' || !Number.isFinite(Date.parse(value.starts_at)) ||
      typeof value.ends_at !== 'string' || !Number.isFinite(Date.parse(value.ends_at)) ||
      typeof value.price !== 'number' || !Number.isFinite(value.price) || value.price < 0) return null;
  return {
    reference: value.reference, service: value.service, time_zone: value.time_zone,
    starts_at: new Date(value.starts_at).toISOString(), ends_at: new Date(value.ends_at).toISOString(), price: value.price,
  };
}

// A small fixed-window limiter for the anonymous booking endpoints. It is
// per server process: enough to blunt a single abusive client, not a
// substitute for a shared store once the app runs on more than one instance.
// The database also caps bookings per phone and per salon (migration 0018).
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; windowStart: number }>();
  return (key: string): boolean => {
    const at = now();
    if (hits.size > 5000) {
      for (const [stored, record] of hits) if (at - record.windowStart > windowMs) hits.delete(stored);
    }
    const record = hits.get(key);
    if (!record || at - record.windowStart > windowMs) { hits.set(key, { count: 1, windowStart: at }); return true; }
    record.count += 1;
    return record.count <= limit;
  };
}
