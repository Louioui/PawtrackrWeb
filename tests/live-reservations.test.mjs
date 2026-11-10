import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingFitsStaffShifts, isWithinSalonOperatingHours, isWithinUtcOperatingHours, liveReservationCsv, normalizeLiveReservationDay, resolveSalonLocalTime, salonLocalDate, validateStaffShiftDraft } from '../src/lib/live-reservations.ts';

test('shift draft requires a real groomer, local interval, and station', () => {
  const draft = { staff_id: 'cccccccc-1111-4111-8111-111111111111', shift_date: '2026-11-09',
    start_time: '09:00', end_time: '17:00', status: 'scheduled', assigned_station: '  Bay 1  ' };
  assert.equal(validateStaffShiftDraft(draft, 'America/Los_Angeles')?.assigned_station, 'Bay 1');
  assert.equal(validateStaffShiftDraft({ ...draft, end_time: '08:00' }, 'America/Los_Angeles'), null);
  assert.equal(validateStaffShiftDraft({ ...draft, start_time: '02:30', shift_date: '2026-03-08' }, 'America/Los_Angeles'), null);
  assert.equal(validateStaffShiftDraft({ ...draft, staff_id: 'other' }, 'America/Los_Angeles'), null);
});

test('configured groomer shifts contain the occupied interval and time off blocks it', () => {
  const zone = 'America/Los_Angeles';
  const start = new Date('2026-11-09T17:00:00Z');
  assert.equal(salonLocalDate(start, zone), '2026-11-09');
  assert.equal(bookingFitsStaffShifts(start, 60, 15, '2026-11-09', zone, []), true);
  const scheduled = [{ status: 'scheduled', start_time: '08:00', end_time: '10:15' }];
  assert.equal(bookingFitsStaffShifts(start, 60, 15, '2026-11-09', zone, scheduled), true);
  assert.equal(bookingFitsStaffShifts(start, 60, 16, '2026-11-09', zone, scheduled), false);
  assert.equal(bookingFitsStaffShifts(start, 60, 15, '2026-11-09', zone, [...scheduled, { status: 'time_off', start_time: '00:00', end_time: '23:59' }]), false);
  assert.equal(bookingFitsStaffShifts(start, 60, 15, '2026-11-09', zone, [{ status: 'completed', start_time: '08:00', end_time: '10:15' }]), false);
});

test('local salon time resolves one instant and rejects DST gaps or repeated hours', () => {
  assert.deepEqual(resolveSalonLocalTime('2026-03-08', '09:00', 'America/Los_Angeles'), { kind: 'ok', instant: '2026-03-08T16:00:00.000Z' });
  assert.deepEqual(resolveSalonLocalTime('2026-11-01', '09:00', 'America/Los_Angeles'), { kind: 'ok', instant: '2026-11-01T17:00:00.000Z' });
  assert.deepEqual(resolveSalonLocalTime('2026-03-08', '02:30', 'America/Los_Angeles'), { kind: 'invalid' });
  assert.deepEqual(resolveSalonLocalTime('2026-11-01', '01:30', 'America/Los_Angeles'), { kind: 'ambiguous' });
  assert.deepEqual(resolveSalonLocalTime('2026-02-30', '09:00', 'America/Los_Angeles'), { kind: 'invalid' });
});

test('UTC operating hours require a configured interval that includes service and buffer', () => {
  const hours = { open: '08:00', close: '18:00' };
  assert.equal(isWithinUtcOperatingHours(new Date('2026-12-09T16:30:00Z'), 60, 30, hours), true);
  assert.equal(isWithinUtcOperatingHours(new Date('2026-12-09T16:31:00Z'), 60, 30, hours), false);
  assert.equal(isWithinUtcOperatingHours(new Date('2026-12-09T07:59:00Z'), 60, 15, hours), false);
  assert.equal(isWithinUtcOperatingHours(new Date('2026-12-09T09:00:00Z'), 60, 15, undefined), false);
  assert.equal(isWithinUtcOperatingHours(new Date('2026-12-09T09:00:00Z'), 60, 15, { open: '18:00', close: '08:00' }), false);
});

test('salon hours use local wall time on both sides of daylight-saving transitions', () => {
  const hours = { open: '08:00', close: '18:00' };
  assert.equal(isWithinSalonOperatingHours(new Date('2026-03-08T16:00:00Z'), 60, 15, hours, 'America/Los_Angeles'), true);
  assert.equal(isWithinSalonOperatingHours(new Date('2026-11-01T17:00:00Z'), 60, 15, hours, 'America/Los_Angeles'), true);
  assert.equal(isWithinSalonOperatingHours(new Date('2026-03-08T14:00:00Z'), 60, 15, hours, 'America/Los_Angeles'), false);
  assert.equal(isWithinSalonOperatingHours(new Date('2026-03-08T00:30:00Z'), 60, 15, hours, 'America/Los_Angeles'), true);
  assert.equal(isWithinSalonOperatingHours(new Date('2026-03-08T01:30:00Z'), 60, 15, hours, 'America/Los_Angeles'), false);
  assert.equal(isWithinSalonOperatingHours(new Date('2026-03-08T16:00:00Z'), 60, 15, hours, 'Mars/Olympus_Mons'), false);
});

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

test('CSV keeps UTC provenance, filtered rows, and spreadsheet-safe client text', () => {
  const first = { ...row('bbbbbbbb-1111-4111-8111-111111111111', '2026-12-09T09:00:00Z'), client_name: '=HYPERLINK("bad")' };
  const second = row('bbbbbbbb-1111-4111-8111-111111111112', '2026-12-09T11:00:00Z');
  const snapshot = normalizeLiveReservationDay(day([first, second]), '2026-12-09');
  const csv = liveReservationCsv(snapshot, [snapshot.reservations[0]], 'last_loaded');
  assert.equal(csv.trim().split('\r\n').length, 2);
  assert.match(csv, /"supabase_visits","aaaaaaaa-1111-4111-8111-111111111111","2026-12-09"/);
  assert.match(csv, /"last_loaded"/);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
  assert.doesNotMatch(csv, /bbbbbbbb-1111-4111-8111-111111111112/);
  assert.throws(() => liveReservationCsv(snapshot, [row('bbbbbbbb-1111-4111-8111-111111111113', '2026-12-09T12:00:00Z')], 'server_snapshot'));
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

  const withHours = normalizeLiveReservationDay({
    ...day([]),
    booking_options: {
      pets: [],
      groomers: [],
      services: [],
      operating_hours: { open: '08:00', close: '18:00' },
      time_zone: 'America/Los_Angeles',
    },
  }, '2026-12-09');
  assert.deepEqual(withHours.booking_options?.operating_hours, { open: '08:00', close: '18:00' });
  assert.equal(withHours.booking_options?.time_zone, 'America/Los_Angeles');

  assert.throws(() => normalizeLiveReservationDay({
    ...day([]),
    booking_options: { pets: [], groomers: [], services: [], operating_hours: { open: '18:00', close: '08:00' } },
  }, '2026-12-09'));

  assert.throws(() => normalizeLiveReservationDay({
    ...day([]),
    booking_options: { pets: [], groomers: [], services: [{ id: 'bad', name: 'Bad', duration_minutes: 0 }] },
  }, '2026-12-09'));
});
