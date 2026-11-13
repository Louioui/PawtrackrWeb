function parseClockMinute(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function validSalonTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100 || !/^(?:[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+|UTC)$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
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

export type LiveSettingsStation = {
  id: string;
  name: string;
  station_type: 'grooming_table' | 'bathing_tub' | 'drying_station' | 'van_bay' | 'holding_suite';
  is_active: boolean;
  notes?: string | null;
};

export type LiveSettingsWeeklyShift = {
  id: string;
  staff_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  station_id: string | null;
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
  time_zone: string;
  operating_hours: {
    open: string;
    close: string;
  };
  packages: LiveSettingsPackage[];
  addons: LiveSettingsAddon[];
  groomers: LiveSettingsGroomer[];
  operating_model?: 'salon' | 'mobile_van' | 'hybrid';
  booking_status?: 'draft' | 'published' | 'paused';
  trial_ends_at?: string | null;
  strict_shift_station_mode?: boolean;
  weekly_hours?: Record<string, { open: string; close: string; is_closed: boolean }>;
  stations?: LiveSettingsStation[];
  weekly_shifts?: LiveSettingsWeeklyShift[];
  policies?: Record<string, unknown>;
};

export type ValidatedSalonSettingsUpdate = {
  tax_rate: number;
  booking_buffer_mins: number;
  time_zone: string;
  operating_hours: {
    open: string;
    close: string;
  };
  packages: LiveSettingsPackage[];
  addons: LiveSettingsAddon[];
  operating_model?: 'salon' | 'mobile_van' | 'hybrid';
  booking_status?: 'draft' | 'published' | 'paused';
  strict_shift_station_mode?: boolean;
  weekly_hours?: Record<string, { open: string; close: string; is_closed: boolean }>;
  policies?: Record<string, unknown>;
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

const stationTypes = new Set(['grooming_table', 'bathing_tub', 'drying_station', 'van_bay', 'holding_suite']);
const operatingModels = new Set(['salon', 'mobile_van', 'hybrid']);
const bookingStatuses = new Set(['draft', 'published', 'paused']);

export function validateStationsList(input: unknown): LiveSettingsStation[] | null {
  if (!Array.isArray(input) || input.length > 100) return null;
  const seen = new Set<string>();
  const result: LiveSettingsStation[] = [];
  for (const raw of input) {
    if (!object(raw) || typeof raw.id !== 'string' || !uuid.test(raw.id) || seen.has(raw.id) ||
        !label(raw.name, 120) || typeof raw.station_type !== 'string' || !stationTypes.has(raw.station_type) ||
        typeof raw.is_active !== 'boolean') {
      return null;
    }
    seen.add(raw.id);
    const notes = typeof raw.notes === 'string' && raw.notes.trim().length > 0
      ? raw.notes.trim().slice(0, 300)
      : null;
    result.push({
      id: raw.id,
      name: raw.name.trim(),
      station_type: raw.station_type as LiveSettingsStation['station_type'],
      is_active: raw.is_active,
      notes,
    });
  }
  return result;
}

export function validateWeeklyShiftsList(input: unknown): LiveSettingsWeeklyShift[] | null {
  if (!Array.isArray(input) || input.length > 200) return null;
  const seen = new Set<string>();
  const result: LiveSettingsWeeklyShift[] = [];
  for (const raw of input) {
    if (!object(raw) || typeof raw.id !== 'string' || !uuid.test(raw.id) || seen.has(raw.id) ||
        typeof raw.staff_id !== 'string' || !uuid.test(raw.staff_id) ||
        typeof raw.day_of_week !== 'number' || !Number.isInteger(raw.day_of_week) || raw.day_of_week < 0 || raw.day_of_week > 6 ||
        typeof raw.start_time !== 'string' || typeof raw.end_time !== 'string' ||
        typeof raw.is_active !== 'boolean') {
      return null;
    }
    const startMin = parseClockMinute(raw.start_time.slice(0, 5));
    const endMin = parseClockMinute(raw.end_time.slice(0, 5));
    if (startMin === null || endMin === null || startMin >= endMin) return null;
    if (raw.station_id !== null && raw.station_id !== undefined && (typeof raw.station_id !== 'string' || !uuid.test(raw.station_id))) {
      return null;
    }
    seen.add(raw.id);
    result.push({
      id: raw.id,
      staff_id: raw.staff_id,
      day_of_week: raw.day_of_week,
      start_time: raw.start_time.slice(0, 5),
      end_time: raw.end_time.slice(0, 5),
      station_id: typeof raw.station_id === 'string' ? raw.station_id : null,
      is_active: raw.is_active,
    });
  }
  return result;
}

export function validateWeeklyHours(input: unknown): Record<string, { open: string; close: string; is_closed: boolean }> | null {
  if (!object(input)) return null;
  const days = ['0', '1', '2', '3', '4', '5', '6'];
  const result: Record<string, { open: string; close: string; is_closed: boolean }> = {};
  for (const day of days) {
    const entry = input[day];
    if (!object(entry) || typeof entry.is_closed !== 'boolean') return null;
    const isClosed = entry.is_closed;
    const open = typeof entry.open === 'string' ? entry.open.slice(0, 5) : '08:00';
    const close = typeof entry.close === 'string' ? entry.close.slice(0, 5) : '18:00';
    const openMin = parseClockMinute(open);
    const closeMin = parseClockMinute(close);
    if (!isClosed && (openMin === null || closeMin === null || openMin >= closeMin)) {
      return null;
    }
    result[day] = { open, close, is_closed: isClosed };
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
  const timeZone = input.time_zone === undefined ? 'UTC' : input.time_zone;
  if (!validSalonTimeZone(timeZone)) return null;
  const openMin = parseClockMinute(input.operating_hours.open);
  const closeMin = parseClockMinute(input.operating_hours.close);
  if (openMin === null || closeMin === null || openMin >= closeMin) {
    return null;
  }
  const packages = validatePackagesList(input.packages);
  const addons = validateAddonsList(input.addons);
  if (!packages || !addons) return null;

  let operating_model: 'salon' | 'mobile_van' | 'hybrid' | undefined = undefined;
  if (input.operating_model !== undefined) {
    if (typeof input.operating_model !== 'string' || !operatingModels.has(input.operating_model)) return null;
    operating_model = input.operating_model as 'salon' | 'mobile_van' | 'hybrid';
  }

  let booking_status: 'draft' | 'published' | 'paused' | undefined = undefined;
  if (input.booking_status !== undefined) {
    if (typeof input.booking_status !== 'string' || !bookingStatuses.has(input.booking_status)) return null;
    booking_status = input.booking_status as 'draft' | 'published' | 'paused';
  }

  let strict_shift_station_mode: boolean | undefined = undefined;
  if (input.strict_shift_station_mode !== undefined) {
    if (typeof input.strict_shift_station_mode !== 'boolean') return null;
    strict_shift_station_mode = input.strict_shift_station_mode;
  }

  let weekly_hours: Record<string, { open: string; close: string; is_closed: boolean }> | undefined = undefined;
  if (input.weekly_hours !== undefined) {
    const validatedWeekly = validateWeeklyHours(input.weekly_hours);
    if (!validatedWeekly) return null;
    weekly_hours = validatedWeekly;
  }

  let policies: Record<string, unknown> | undefined = undefined;
  if (input.policies !== undefined) {
    if (!object(input.policies)) return null;
    policies = input.policies;
  }

  return {
    tax_rate: Number(rawTax.toFixed(2)),
    booking_buffer_mins: rawBuffer,
    time_zone: timeZone,
    operating_hours: {
      open: input.operating_hours.open as string,
      close: input.operating_hours.close as string,
    },
    packages,
    addons,
    ...(operating_model ? { operating_model } : {}),
    ...(booking_status ? { booking_status } : {}),
    ...(strict_shift_station_mode !== undefined ? { strict_shift_station_mode } : {}),
    ...(weekly_hours ? { weekly_hours } : {}),
    ...(policies ? { policies } : {}),
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
    time_zone: input.time_zone,
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

  let operating_model: 'salon' | 'mobile_van' | 'hybrid' | undefined = undefined;
  if (input.operating_model !== undefined) {
    if (typeof input.operating_model === 'string' && operatingModels.has(input.operating_model)) {
      operating_model = input.operating_model as 'salon' | 'mobile_van' | 'hybrid';
    }
  }

  let booking_status: 'draft' | 'published' | 'paused' | undefined = undefined;
  if (input.booking_status !== undefined) {
    if (typeof input.booking_status === 'string' && bookingStatuses.has(input.booking_status)) {
      booking_status = input.booking_status as 'draft' | 'published' | 'paused';
    }
  }

  const trial_ends_at = typeof input.trial_ends_at === 'string' && Number.isFinite(Date.parse(input.trial_ends_at))
    ? input.trial_ends_at
    : null;

  const strict_shift_station_mode = typeof input.strict_shift_station_mode === 'boolean'
    ? input.strict_shift_station_mode
    : undefined;

  const weekly_hours = input.weekly_hours !== undefined
    ? validateWeeklyHours(input.weekly_hours) ?? undefined
    : undefined;

  const stations = input.stations !== undefined
    ? validateStationsList(input.stations) ?? undefined
    : undefined;

  const weekly_shifts = input.weekly_shifts !== undefined
    ? validateWeeklyShiftsList(input.weekly_shifts) ?? undefined
    : undefined;

  const policies = object(input.policies) ? input.policies : undefined;

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
    time_zone: validatedConfig.time_zone,
    operating_hours: validatedConfig.operating_hours,
    packages: validatedConfig.packages,
    addons: validatedConfig.addons,
    groomers,
    ...(operating_model ? { operating_model } : {}),
    ...(booking_status ? { booking_status } : {}),
    ...(trial_ends_at ? { trial_ends_at } : {}),
    ...(strict_shift_station_mode !== undefined ? { strict_shift_station_mode } : {}),
    ...(weekly_hours ? { weekly_hours } : {}),
    ...(stations ? { stations } : {}),
    ...(weekly_shifts ? { weekly_shifts } : {}),
    ...(policies ? { policies } : {}),
  };
}
