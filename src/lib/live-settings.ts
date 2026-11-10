function parseClockMinute(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export type LiveSettingsPackage = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  description?: string;
};

export type LiveSettingsAddon = {
  id: string;
  name: string;
  price: number;
};

export type LiveSettingsGroomer = {
  id: string;
  name: string;
  specialty: string | null;
  is_active: boolean;
};

export type LiveSalonSettings = {
  source: 'supabase_business_settings';
  business_id: string;
  as_of: string;
  salon_name: string;
  slug: string;
  city_state: string | null;
  subscription_status: 'active' | 'trialing' | 'past_due' | 'canceled';
  tax_rate: number;
  currency: 'USD';
  booking_buffer_mins: number;
  operating_hours: {
    open: string;
    close: string;
  };
  packages: LiveSettingsPackage[];
  addons: LiveSettingsAddon[];
  groomers: LiveSettingsGroomer[];
};

export type ValidatedSalonSettingsUpdate = {
  tax_rate: number;
  booking_buffer_mins: number;
  operating_hours: {
    open: string;
    close: string;
  };
  packages: LiveSettingsPackage[];
  addons: LiveSettingsAddon[];
};

export type ValidatedGroomerIntake = {
  name: string;
  specialty: string | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9-]+$/;
const subscriptionStatuses = new Set(['active', 'trialing', 'past_due', 'canceled']);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const label = (value: unknown, max = 120): value is string => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const exactCentsPrice = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000 && Math.round(value * 100) === Number((value * 100).toFixed(4));

export function validatePackagesList(input: unknown): LiveSettingsPackage[] | null {
  if (!Array.isArray(input) || input.length > 50) return null;
  const seen = new Set<string>();
  const result: LiveSettingsPackage[] = [];
  for (const raw of input) {
    if (!object(raw) || !label(raw.id, 100) || !label(raw.name, 200) ||
        !exactCentsPrice(raw.price) ||
        typeof raw.durationMinutes !== 'number' || !Number.isInteger(raw.durationMinutes) ||
        raw.durationMinutes < 15 || raw.durationMinutes > 480) {
      return null;
    }
    const id = raw.id.trim();
    if (seen.has(id)) return null;
    seen.add(id);
    const description = typeof raw.description === 'string' && raw.description.trim().length > 0
      ? raw.description.trim().slice(0, 300)
      : undefined;
    result.push({
      id,
      name: raw.name.trim(),
      price: Number(raw.price.toFixed(2)),
      durationMinutes: raw.durationMinutes,
      ...(description ? { description } : {}),
    });
  }
  return result;
}

export function validateAddonsList(input: unknown): LiveSettingsAddon[] | null {
  if (!Array.isArray(input) || input.length > 50) return null;
  const seen = new Set<string>();
  const result: LiveSettingsAddon[] = [];
  for (const raw of input) {
    if (!object(raw) || !label(raw.id, 100) || !label(raw.name, 200) || !exactCentsPrice(raw.price)) {
      return null;
    }
    const id = raw.id.trim();
    if (seen.has(id)) return null;
    seen.add(id);
    result.push({
      id,
      name: raw.name.trim(),
      price: Number(raw.price.toFixed(2)),
    });
  }
  return result;
}

export function validateSalonSettingsUpdate(input: unknown): ValidatedSalonSettingsUpdate | null {
  if (!object(input)) return null;
  const rawTax = typeof input.tax_rate === 'string' ? Number(input.tax_rate) : input.tax_rate;
  if (typeof rawTax !== 'number' || !Number.isFinite(rawTax) || rawTax < 0 || rawTax > 30 ||
      Math.round(rawTax * 100) !== Number((rawTax * 100).toFixed(4))) {
    return null;
  }
  const rawBuffer = typeof input.booking_buffer_mins === 'string' ? Number(input.booking_buffer_mins) : input.booking_buffer_mins;
  if (typeof rawBuffer !== 'number' || !Number.isInteger(rawBuffer) || rawBuffer < 0 || rawBuffer > 240) {
    return null;
  }
  if (!object(input.operating_hours)) return null;
  const openMin = parseClockMinute(input.operating_hours.open);
  const closeMin = parseClockMinute(input.operating_hours.close);
  if (openMin === null || closeMin === null || openMin >= closeMin) {
    return null;
  }
  const packages = validatePackagesList(input.packages);
  const addons = validateAddonsList(input.addons);
  if (!packages || !addons) return null;

  return {
    tax_rate: Number(rawTax.toFixed(2)),
    booking_buffer_mins: rawBuffer,
    operating_hours: {
      open: input.operating_hours.open as string,
      close: input.operating_hours.close as string,
    },
    packages,
    addons,
  };
}

export function validateGroomerIntake(input: unknown): ValidatedGroomerIntake | null {
  if (!object(input) || !label(input.name, 120)) return null;
  let specialty: string | null = null;
  if (input.specialty !== undefined && input.specialty !== null && String(input.specialty).trim() !== '') {
    if (typeof input.specialty !== 'string' || input.specialty.trim().length > 120) return null;
    specialty = input.specialty.trim();
  }
  return {
    name: input.name.trim(),
    specialty,
  };
}

export function normalizeLiveSalonSettings(input: unknown): LiveSalonSettings {
  if (!object(input) || input.source !== 'supabase_business_settings' ||
      typeof input.business_id !== 'string' || !uuid.test(input.business_id) ||
      typeof input.as_of !== 'string' || !Number.isFinite(Date.parse(input.as_of)) ||
      !label(input.salon_name, 200) ||
      typeof input.slug !== 'string' || !slugPattern.test(input.slug) ||
      !(input.city_state === null || (typeof input.city_state === 'string' && input.city_state.length <= 160)) ||
      typeof input.subscription_status !== 'string' || !subscriptionStatuses.has(input.subscription_status) ||
      input.currency !== 'USD' ||
      !Array.isArray(input.groomers) || input.groomers.length > 200) {
    throw new Error('Invalid live salon settings');
  }
  const validatedConfig = validateSalonSettingsUpdate({
    tax_rate: input.tax_rate,
    booking_buffer_mins: input.booking_buffer_mins,
    operating_hours: input.operating_hours,
    packages: input.packages,
    addons: input.addons,
  });
  if (!validatedConfig) {
    throw new Error('Invalid live salon catalog configuration');
  }
  const seenGroomers = new Set<string>();
  const groomers: LiveSettingsGroomer[] = input.groomers.map((raw: unknown) => {
    if (!object(raw) || typeof raw.id !== 'string' || !uuid.test(raw.id) || seenGroomers.has(raw.id) ||
        !label(raw.name, 120) || typeof raw.is_active !== 'boolean' ||
        !(raw.specialty === null || (typeof raw.specialty === 'string' && raw.specialty.length <= 120))) {
      throw new Error('Invalid live groomer record');
    }
    seenGroomers.add(raw.id);
    return {
      id: raw.id,
      name: raw.name.trim(),
      specialty: raw.specialty ? raw.specialty.trim() : null,
      is_active: raw.is_active,
    };
  });
  groomers.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  return {
    source: 'supabase_business_settings',
    business_id: input.business_id,
    as_of: input.as_of,
    salon_name: input.salon_name.trim(),
    slug: input.slug,
    city_state: input.city_state,
    subscription_status: input.subscription_status as LiveSalonSettings['subscription_status'],
    tax_rate: validatedConfig.tax_rate,
    currency: 'USD',
    booking_buffer_mins: validatedConfig.booking_buffer_mins,
    operating_hours: validatedConfig.operating_hours,
    packages: validatedConfig.packages,
    addons: validatedConfig.addons,
    groomers,
  };
}
