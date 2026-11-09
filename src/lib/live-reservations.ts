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
};

const statuses = new Set(['booked', 'dropped_off', 'bathing', 'styling', 'ready', 'completed', 'cancelled']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const dateTime = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const label = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;

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
  };
}
