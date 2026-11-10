export type LiveReservation = {
  id: string;
  scheduled_time: string;
  reservation_end: string;
  status: 'booked' | 'dropped_off' | 'bathing' | 'styling' | 'ready' | 'completed' | 'cancelled';
  service_package: string;
  staff_id: string | null;
  pet_name: string;
  client_name: string;
  staff_name: string;
};

export type LiveBookingPetOption = {
  id: string;
  client_id: string;
  pet_name: string;
  client_name: string;
};

export type LiveBookingGroomerOption = {
  id: string;
  name: string;
};

export type LiveBookingServiceOption = {
  id: string;
  name: string;
  duration_minutes: number;
};

export type LiveOperatingHours = {
  open: string;
  close: string;
};

export type LiveBookingOptions = {
  pets: LiveBookingPetOption[];
  groomers: LiveBookingGroomerOption[];
  services: LiveBookingServiceOption[];
  operating_hours?: LiveOperatingHours;
};

export type LiveReservationDay = {
  source: 'supabase_visits';
  business_id: string;
  date: string;
  timezone: 'UTC';
  as_of: string;
  reservations: LiveReservation[];
  active_count: number;
  completed_count: number;
  cancelled_count: number;
  booking_options?: LiveBookingOptions;
};

const statuses = new Set(['booked', 'dropped_off', 'bathing', 'styling', 'ready', 'completed', 'cancelled']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const dateTime = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const label = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;

export function parseClockMinute(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function normalizeBookingOptions(raw: unknown): LiveBookingOptions {
  if (!object(raw) || !Array.isArray(raw.pets) || !Array.isArray(raw.groomers) || !Array.isArray(raw.services) ||
      raw.pets.length > 500 || raw.groomers.length > 200 || raw.services.length > 200) {
    throw new Error('Invalid live booking options');
  }
  const petIds = new Set<string>();
  const pets: LiveBookingPetOption[] = raw.pets.map((item: unknown) => {
    if (!object(item) || typeof item.id !== 'string' || !uuid.test(item.id) || petIds.has(item.id) ||
        typeof item.client_id !== 'string' || !uuid.test(item.client_id) ||
        !label(item.pet_name) || !label(item.client_name)) {
      throw new Error('Invalid live booking pet option');
    }
    petIds.add(item.id);
    return { id: item.id, client_id: item.client_id, pet_name: item.pet_name, client_name: item.client_name };
  });
  const groomerIds = new Set<string>();
  const groomers: LiveBookingGroomerOption[] = raw.groomers.map((item: unknown) => {
    if (!object(item) || typeof item.id !== 'string' || !uuid.test(item.id) || groomerIds.has(item.id) || !label(item.name)) {
      throw new Error('Invalid live booking groomer option');
    }
    groomerIds.add(item.id);
    return { id: item.id, name: item.name };
  });
  const serviceIds = new Set<string>();
  const services: LiveBookingServiceOption[] = raw.services.map((item: unknown) => {
    if (!object(item) || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 100 || serviceIds.has(item.id) ||
        !label(item.name) || typeof item.duration_minutes !== 'number' || !Number.isInteger(item.duration_minutes) ||
        item.duration_minutes < 1 || item.duration_minutes > 1440) {
      throw new Error('Invalid live booking service option');
    }
    serviceIds.add(item.id);
    return { id: item.id, name: item.name, duration_minutes: item.duration_minutes };
  });
  pets.sort((a, b) => a.pet_name.localeCompare(b.pet_name) || a.id.localeCompare(b.id));
  groomers.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  services.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  let operatingHours: LiveOperatingHours | undefined;
  if (raw.operating_hours !== undefined && raw.operating_hours !== null) {
    if (!object(raw.operating_hours)) throw new Error('Invalid live operating hours');
    const openMin = parseClockMinute(raw.operating_hours.open);
    const closeMin = parseClockMinute(raw.operating_hours.close);
    if (openMin === null || closeMin === null || openMin >= closeMin) {
      throw new Error('Invalid live operating hours');
    }
    operatingHours = { open: raw.operating_hours.open as string, close: raw.operating_hours.close as string };
  }
  return {
    pets,
    groomers,
    services,
    ...(operatingHours ? { operating_hours: operatingHours } : {}),
  };
}

export function normalizeLiveReservationDay(input: unknown, expectedDate: string): LiveReservationDay {
  if (!object(input) || input.source !== 'supabase_visits' || input.timezone !== 'UTC' ||
      input.date !== expectedDate || typeof input.business_id !== 'string' || !uuid.test(input.business_id) ||
      !dateTime(input.as_of) || !Array.isArray(input.reservations) || input.reservations.length > 1000) {
    throw new Error('Invalid live reservation day');
  }
  const ids = new Set<string>();
  const reservations: LiveReservation[] = input.reservations.map((raw: unknown) => {
    if (!object(raw) || typeof raw.id !== 'string' || !uuid.test(raw.id) || ids.has(raw.id) ||
        !dateTime(raw.scheduled_time) || !dateTime(raw.reservation_end) ||
        new Date(raw.reservation_end).getTime() <= new Date(raw.scheduled_time).getTime() ||
        new Date(raw.scheduled_time).toISOString().slice(0, 10) !== expectedDate ||
        typeof raw.status !== 'string' || !statuses.has(raw.status) ||
        !(raw.staff_id === null || (typeof raw.staff_id === 'string' && uuid.test(raw.staff_id))) ||
        !label(raw.service_package) || !label(raw.pet_name) || !label(raw.client_name) || !label(raw.staff_name)) {
      throw new Error('Invalid live reservation');
    }
    ids.add(raw.id);
    return raw as LiveReservation;
  });
  reservations.sort((a, b) => Date.parse(a.scheduled_time) - Date.parse(b.scheduled_time) || a.id.localeCompare(b.id));
  const bookingOptions = input.booking_options !== undefined ? normalizeBookingOptions(input.booking_options) : undefined;
  return {
    source: 'supabase_visits',
    business_id: input.business_id,
    date: expectedDate,
    timezone: 'UTC',
    as_of: input.as_of,
    reservations,
    active_count: reservations.filter((item) => !['completed', 'cancelled'].includes(item.status)).length,
    completed_count: reservations.filter((item) => item.status === 'completed').length,
    cancelled_count: reservations.filter((item) => item.status === 'cancelled').length,
    ...(bookingOptions ? { booking_options: bookingOptions } : {}),
  };
}
