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
  time_zone?: string;
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

export function isWithinUtcOperatingHours(
  start: Date, durationMinutes: number, bufferMinutes: number, hours: unknown
): boolean {
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(durationMinutes) || durationMinutes < 1 ||
      !Number.isInteger(bufferMinutes) || bufferMinutes < 0 || !object(hours)) return false;
  const open = parseClockMinute(hours.open);
  const close = parseClockMinute(hours.close);
  if (open === null || close === null || open >= close) return false;
  const minute = start.getUTCHours() * 60 + start.getUTCMinutes();
  return minute >= open && minute + durationMinutes + bufferMinutes <= close;
}

export function validSalonTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100 || !/^(?:[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+|UTC)$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
}

export function resolveSalonLocalTime(date: string, clock: string, timeZone: string):
  { kind: 'ok'; instant: string } | { kind: 'invalid' | 'ambiguous' } {
  if (!/^\d{4}-\d\d-\d\d$/.test(date) || parseClockMinute(clock) === null || !validSalonTimeZone(timeZone)) return { kind: 'invalid' };
  const naive = Date.parse(`${date}T${clock}:00.000Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 10) !== date) return { kind: 'invalid' };
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const matches: string[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const instant = new Date(naive - offset * 60_000);
    const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` === date && `${parts.hour}:${parts.minute}` === clock) {
      matches.push(instant.toISOString());
    }
  }
  if (matches.length === 0) return { kind: 'invalid' };
  if (matches.length > 1) return { kind: 'ambiguous' };
  return { kind: 'ok', instant: matches[0] };
}

export function salonLocalDate(instant: Date, timeZone: string): string | null {
  if (!validSalonTimeZone(timeZone) || !Number.isFinite(instant.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export type StaffShiftWindow = {
  status: 'scheduled' | 'time_off' | 'completed';
  start_time: string;
  end_time: string;
};

export type StaffShiftDraft = StaffShiftWindow & {
  staff_id: string;
  shift_date: string;
  assigned_station: string;
};

export function validateStaffShiftDraft(input: unknown, timeZone: string): StaffShiftDraft | null {
  if (!object(input) || !validSalonTimeZone(timeZone) ||
      typeof input.staff_id !== 'string' || !uuid.test(input.staff_id) ||
      typeof input.shift_date !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(input.shift_date) ||
      (input.status !== 'scheduled' && input.status !== 'time_off') ||
      typeof input.assigned_station !== 'string' || input.assigned_station.trim().length < 1 || input.assigned_station.trim().length > 80) return null;
  const start = resolveSalonLocalTime(input.shift_date, input.start_time as string, timeZone);
  const end = resolveSalonLocalTime(input.shift_date, input.end_time as string, timeZone);
  if (start.kind !== 'ok' || end.kind !== 'ok' || Date.parse(start.instant) >= Date.parse(end.instant)) return null;
  return {
    staff_id: input.staff_id,
    shift_date: input.shift_date,
    start_time: input.start_time as string,
    end_time: input.end_time as string,
    status: input.status,
    assigned_station: input.assigned_station.trim(),
  };
}

export function bookingFitsStaffShifts(
  start: Date, durationMinutes: number, bufferMinutes: number,
  localDate: string, timeZone: string, shifts: readonly StaffShiftWindow[]
): boolean {
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(durationMinutes) || durationMinutes < 1 ||
      !Number.isInteger(bufferMinutes) || bufferMinutes < 0 || !validSalonTimeZone(timeZone)) return false;
  if (shifts.length === 0) return true; // Until a salon configures shifts, operating hours remain the booking boundary.
  if (shifts.some((shift) => shift.status === 'time_off')) return false;
  const end = start.getTime() + (durationMinutes + bufferMinutes) * 60_000;
  return shifts.some((shift) => {
    if (shift.status !== 'scheduled') return false;
    const shiftStart = resolveSalonLocalTime(localDate, shift.start_time, timeZone);
    const shiftEnd = resolveSalonLocalTime(localDate, shift.end_time, timeZone);
    return shiftStart.kind === 'ok' && shiftEnd.kind === 'ok' &&
      start.getTime() >= Date.parse(shiftStart.instant) && end <= Date.parse(shiftEnd.instant);
  });
}

export function isWithinSalonOperatingHours(
  start: Date, durationMinutes: number, bufferMinutes: number, hours: unknown, timeZone: unknown
): boolean {
  if (!validSalonTimeZone(timeZone) || !Number.isFinite(start.getTime()) ||
      !Number.isInteger(durationMinutes) || durationMinutes < 1 ||
      !Number.isInteger(bufferMinutes) || bufferMinutes < 0 || !object(hours)) return false;
  const open = parseClockMinute(hours.open);
  const close = parseClockMinute(hours.close);
  if (open === null || close === null || open >= close) return false;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = (instant: Date) => Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  const first = parts(start);
  const end = new Date(start.getTime() + (durationMinutes + bufferMinutes) * 60_000);
  const last = parts(end);
  const localDay = (item: Record<string, string>) => `${item.year}-${item.month}-${item.day}`;
  const minute = (item: Record<string, string>) => Number(item.hour) * 60 + Number(item.minute);
  return localDay(first) === localDay(last) && minute(first) >= open && minute(last) <= close;
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
  if (raw.time_zone !== undefined && !validSalonTimeZone(raw.time_zone)) throw new Error('Invalid live salon time zone');
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
    ...(typeof raw.time_zone === 'string' ? { time_zone: raw.time_zone } : {}),
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

const csvCell = (value: string) => {
  const safe = /^[\s\uFEFF\u200B]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};

export function liveReservationCsv(
  day: LiveReservationDay,
  visibleReservations: readonly LiveReservation[],
  snapshotState: 'server_snapshot' | 'last_loaded'
): string {
  const allowed = new Set(day.reservations.map((item) => item.id));
  if (visibleReservations.some((item) => !allowed.has(item.id))) throw new Error('Reservation is outside this snapshot');
  const header = ['source', 'business_id', 'utc_date', 'as_of_utc', 'snapshot_state', 'visit_id',
    'start_utc', 'reservation_end_utc', 'status', 'pet_name', 'client_name', 'groomer_name', 'service_package'];
  const rows = visibleReservations.map((item) => [
    day.source, day.business_id, day.date, new Date(day.as_of).toISOString(), snapshotState, item.id,
    new Date(item.scheduled_time).toISOString(), new Date(item.reservation_end).toISOString(),
    item.status, item.pet_name, item.client_name, item.staff_name, item.service_package,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
