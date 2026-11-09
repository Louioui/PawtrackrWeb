import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLiveReservationDay } from '../src/lib/live-reservations.ts';

const row = (id, start, status = 'booked') => ({
  id,
  scheduled_time: start,
  reservation_end: new Date(Date.parse(start) + 75 * 60000).toISOString(),
  status,
  service_package: 'Bath',
  staff_id: 'cccccccc-1111-4111-8111-111111111111',
  pet_name: 'Pip',
  client_name: 'Alex',
  staff_name: 'Morgan',
});
const day = (reservations) => ({
  source: 'supabase_visits',
  business_id: 'aaaaaaaa-1111-4111-8111-111111111111',
  date: '2026-12-09',
  timezone: 'UTC',
  as_of: '2026-12-09T08:00:00Z',
  reservations,
});

test('orders live visits and separates active, completed, and cancelled counts', () => {
  const result = normalizeLiveReservationDay(day([
    row('bbbbbbbb-1111-4111-8111-111111111113', '2026-12-09T11:00:00Z', 'completed'),
    row('bbbbbbbb-1111-4111-8111-111111111111', '2026-12-09T09:00:00Z'),
    row('bbbbbbbb-1111-4111-8111-111111111112', '2026-12-09T10:00:00Z', 'cancelled'),
  ]), '2026-12-09');
  assert.deepEqual(result.reservations.map((item) => item.pet_name), ['Pip', 'Pip', 'Pip']);
  assert.equal(result.reservations[0].scheduled_time, '2026-12-09T09:00:00Z');
  assert.deepEqual([result.active_count, result.completed_count, result.cancelled_count], [1, 1, 1]);
});

test('rejects a mismatched day, duplicate id, or invalid interval', () => {
  const first = row('bbbbbbbb-1111-4111-8111-111111111111', '2026-12-09T09:00:00Z');
  assert.throws(() => normalizeLiveReservationDay(day([]), '2026-12-10'));
  assert.throws(() => normalizeLiveReservationDay(day([first, first]), '2026-12-09'));
  assert.throws(() => normalizeLiveReservationDay(day([{ ...first, reservation_end: first.scheduled_time }]), '2026-12-09'));
  assert.throws(() => normalizeLiveReservationDay(day([{ ...first, scheduled_time: '2026-12-09T09:00:00' }]), '2026-12-09'));
});

test('sorts offset-aware times by instant, not their text', () => {
  const later = row('bbbbbbbb-1111-4111-8111-111111111111', '2026-12-09T10:00:00+00:00');
  const earlier = row('bbbbbbbb-1111-4111-8111-111111111112', '2026-12-09T06:00:00-03:00');
  const result = normalizeLiveReservationDay(day([later, earlier]), '2026-12-09');
  assert.equal(result.reservations[0].id, earlier.id);
});

test('normalizes optional booking options and rejects malformed catalog entries', () => {
  const withOptions = normalizeLiveReservationDay({
    ...day([]),
    booking_options: {
      pets: [
        { id: 'dddddddd-1111-4111-8111-111111111112', client_id: 'eeeeeeee-1111-4111-8111-111111111112', pet_name: 'Zoe', client_name: 'Sam' },
        { id: 'dddddddd-1111-4111-8111-111111111111', client_id: 'eeeeeeee-1111-4111-8111-111111111111', pet_name: 'Bello', client_name: 'Alex' },
      ],
      groomers: [
        { id: 'cccccccc-1111-4111-8111-111111111112', name: 'Sora' },
        { id: 'cccccccc-1111-4111-8111-111111111111', name: 'Elena' },
      ],
      services: [
        { id: 'scissor', name: 'Full Scissor', duration_minutes: 90 },
        { id: 'bath', name: 'Bath & Brush', duration_minutes: 60 },
      ],
    },
  }, '2026-12-09');
  assert.deepEqual(withOptions.booking_options?.pets.map((p) => p.pet_name), ['Bello', 'Zoe']);
  assert.deepEqual(withOptions.booking_options?.groomers.map((g) => g.name), ['Elena', 'Sora']);
  assert.deepEqual(withOptions.booking_options?.services.map((s) => s.id), ['bath', 'scissor']);

  assert.throws(() => normalizeLiveReservationDay({
    ...day([]),
    booking_options: { pets: [], groomers: [], services: [{ id: 'bad', name: 'Bad', duration_minutes: 0 }] },
  }, '2026-12-09'));
});
