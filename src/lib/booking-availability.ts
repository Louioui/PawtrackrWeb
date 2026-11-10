import type { Visit } from '@/types/database';

function slotMinute(value: string): { date: string; minute: number } | null {
  const labeled = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}) (AM|PM)$/.exec(value);
  if (labeled) {
    const hour = Number(labeled[2]);
    const minute = Number(labeled[3]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    return { date: labeled[1], minute: (hour % 12 + (labeled[4] === 'PM' ? 12 : 0)) * 60 + minute };
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return { date: date.toISOString().slice(0, 10), minute: date.getUTCHours() * 60 + date.getUTCMinutes() };
}

export function addMinutesToLabeledSlot(value: string, minutes: number): string | null {
  const start = slotMinute(value);
  if (!start || !Number.isInteger(minutes) || minutes < 0) return null;
  const date = new Date(`${start.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCMinutes(start.minute + minutes);
  const hour24 = date.getUTCHours();
  const hour12 = hour24 % 12 || 12;
  return `${date.toISOString().slice(0, 10)} ${String(hour12).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

/** Demo wall-clock overlap check. A production scheduler needs salon time zones and atomic reservations. */
export function isStaffSlotAvailable(
  visits: readonly Visit[], businessId: string, staffId: string, scheduledTime: string, durationMinutes: number
): boolean {
  const requested = slotMinute(scheduledTime);
  if (!requested || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return false;
  const requestedStart = Date.parse(`${requested.date}T00:00:00Z`) / 60_000 + requested.minute;
  return !visits.some((visit) => {
    if (visit.business_id !== businessId || visit.staff_id !== staffId || visit.status === 'completed' || visit.status === 'ready') return false;
    const existing = slotMinute(visit.scheduled_time);
    if (!existing) return false;
    const existingStart = Date.parse(`${existing.date}T00:00:00Z`) / 60_000 + existing.minute;
    const existingDuration = Number.isFinite(visit.duration_minutes) && visit.duration_minutes > 0 ? visit.duration_minutes : 90;
    return requestedStart < existingStart + existingDuration && existingStart < requestedStart + durationMinutes;
  });
}
