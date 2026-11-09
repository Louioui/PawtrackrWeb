import { createClient } from '@supabase/supabase-js';

export interface PublicSalon {
  id: string;
  name: string;
  slug: string;
  city_state: string | null;
}

export interface PublicService {
  name: string;
  description: string | null;
  price: number | null;
  durationMinutes: number | null;
}

export interface PublicCatalog {
  packages: PublicService[];
  addons: PublicService[];
  operatingHours: { open: string; close: string } | null;
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
  return {
    packages: parseServices(row.packages),
    addons: parseServices(row.addons),
    operatingHours: typeof hours.open === 'string' && typeof hours.close === 'string'
      ? { open: hours.open, close: hours.close } : null,
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
