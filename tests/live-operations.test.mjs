import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canStaffAdvanceStage,
  canStaffCheckIn,
  canStaffRelease,
  canOverrideUnpaidRelease,
  canOpenSalonDay,
  deriveOperationalQueues,
  isLateArrival,
  isBiteRiskPet,
} from '../src/lib/live-operations.ts';

test('isLateArrival identifies arrivals past 15-minute grace period', () => {
  const scheduled = '2026-11-13T10:00:00.000Z';

  // 10 minutes after scheduled -> within 15m grace
  const onTime = isLateArrival(scheduled, '2026-11-13T10:10:00.000Z', 15);
  assert.equal(onTime.isLate, false);
  assert.equal(onTime.minutesLate, 10);

  // Exactly 15 minutes after scheduled -> within grace
  const atGrace = isLateArrival(scheduled, '2026-11-13T10:15:00.000Z', 15);
  assert.equal(atGrace.isLate, false);

  // 16 minutes after scheduled -> late
  const late = isLateArrival(scheduled, '2026-11-13T10:16:00.000Z', 15);
  assert.equal(late.isLate, true);
  assert.equal(late.minutesLate, 16);
});

test('isBiteRiskPet detects behavioral keywords accurately', () => {
  assert.equal(isBiteRiskPet('Sweet dog, loves tummy rubs'), false);
  assert.equal(isBiteRiskPet(null), false);
  assert.equal(isBiteRiskPet('Caution: biter around paws and clippers'), true);
  assert.equal(isBiteRiskPet('Requires muzzle during nail trim - aggressive'), true);
  assert.equal(isBiteRiskPet('Snappy when wet'), true);
});

test('canStaffAdvanceStage enforces safety notes, sequential order, and role boundaries', () => {
  // Front desk cannot advance floor stages
  assert.deepEqual(canStaffAdvanceStage('front_desk', 'checked_in', 'bathing'), {
    allowed: false,
    reason: 'Front desk staff cannot advance floor grooming stages.',
  });

  // Cannot start bathing without safety notes acknowledged
  assert.deepEqual(
    canStaffAdvanceStage('groomer', 'checked_in', 'bathing', { safetyNotesAcknowledged: false }),
    {
      allowed: false,
      reason: 'Safety notes must be acknowledged before service begins (WF09).',
    },
  );

  // Groomer can advance to bathing once safety notes are acknowledged
  assert.deepEqual(
    canStaffAdvanceStage('groomer', 'checked_in', 'bathing', { safetyNotesAcknowledged: true }),
    { allowed: true },
  );

  // Non-sequential skip is rejected
  assert.deepEqual(
    canStaffAdvanceStage('groomer', 'checked_in', 'styling', { safetyNotesAcknowledged: true }),
    {
      allowed: false,
      reason: "Invalid stage progression: cannot jump from 'checked_in' to 'styling'. Must follow sequential order.",
    },
  );

  // Bather role can advance checked_in -> bathing and bathing -> drying
  assert.deepEqual(
    canStaffAdvanceStage('bather', 'checked_in', 'bathing', { safetyNotesAcknowledged: true }),
    { allowed: true },
  );
  assert.deepEqual(
    canStaffAdvanceStage('bather', 'bathing', 'drying', { safetyNotesAcknowledged: true }),
    { allowed: true },
  );

  // Bather cannot advance to styling or ready
  assert.deepEqual(
    canStaffAdvanceStage('bather', 'drying', 'styling', { safetyNotesAcknowledged: true }),
    {
      allowed: false,
      reason: 'Bathers may only progress visits to Bathing or Drying stages.',
    },
  );

  // Bather cannot service a bite-risk pet alone
  assert.deepEqual(
    canStaffAdvanceStage('bather', 'checked_in', 'bathing', {
      safetyNotesAcknowledged: true,
      petNotes: 'Caution: biter when wet',
    }),
    {
      allowed: false,
      reason: 'Bathers cannot handle bite-risk pets without a groomer or manager present.',
    },
  );

  // Senior groomer / manager / owner can advance bite-risk pet
  assert.deepEqual(
    canStaffAdvanceStage('senior_groomer', 'checked_in', 'bathing', {
      safetyNotesAcknowledged: true,
      petNotes: 'Caution: biter when wet',
    }),
    { allowed: true },
  );
});

test('role permission guards check-in, release, unpaid overrides, and salon opening', () => {
  // Check-in permissions
  assert.equal(canStaffCheckIn('owner'), true);
  assert.equal(canStaffCheckIn('manager'), true);
  assert.equal(canStaffCheckIn('front_desk'), true);
  assert.equal(canStaffCheckIn('groomer'), false);
  assert.equal(canStaffCheckIn('bather'), false);

  // Release permissions
  assert.equal(canStaffRelease('front_desk'), true);
  assert.equal(canStaffRelease('groomer'), false);

  // Unpaid release overrides
  assert.equal(canOverrideUnpaidRelease('owner'), true);
  assert.equal(canOverrideUnpaidRelease('manager'), true);
  assert.equal(canOverrideUnpaidRelease('front_desk'), false);

  // Opening the salon day
  assert.equal(canOpenSalonDay('owner'), true);
  assert.equal(canOpenSalonDay('manager'), true);
  assert.equal(canOpenSalonDay('front_desk'), false);
});

test('deriveOperationalQueues correctly separates arrivals, in_service, ready, and exceptions', () => {
  const visits = [
    {
      id: 'v1',
      scheduled_time: '2026-11-13T09:00:00.000Z',
      reservation_end: '2026-11-13T10:30:00.000Z',
      status: 'booked',
      service_package: 'Full Groom',
      staff_id: 's1',
      pet_id: 'p1',
      pet_name: 'Barnaby',
      client_id: 'c1',
      client_name: 'Alice',
      version: 1,
    },
    {
      id: 'v2',
      scheduled_time: '2026-11-13T09:15:00.000Z',
      reservation_end: '2026-11-13T10:45:00.000Z',
      status: 'checked_in',
      service_package: 'Bath & Brush',
      staff_id: 's2',
      pet_id: 'p2',
      pet_name: 'Bella',
      client_id: 'c2',
      client_name: 'Bob',
      version: 2,
    },
    {
      id: 'v3',
      scheduled_time: '2026-11-13T08:30:00.000Z',
      reservation_end: '2026-11-13T10:00:00.000Z',
      status: 'ready',
      service_package: 'Full Groom',
      staff_id: 's1',
      pet_id: 'p3',
      pet_name: 'Charlie',
      client_id: 'c3',
      client_name: 'Carol',
      version: 5,
    },
    {
      id: 'v4',
      scheduled_time: '2026-11-13T08:00:00.000Z',
      reservation_end: '2026-11-13T09:30:00.000Z',
      status: 'waiver_hold',
      service_package: 'Full Groom',
      staff_id: 's1',
      pet_id: 'p4',
      pet_name: 'Daisy',
      client_id: 'c4',
      client_name: 'David',
      version: 2,
    },
    {
      id: 'v5',
      scheduled_time: '2026-11-13T07:30:00.000Z',
      reservation_end: '2026-11-13T09:00:00.000Z',
      status: 'completed',
      service_package: 'Bath & Brush',
      staff_id: 's2',
      pet_id: 'p5',
      pet_name: 'Echo',
      client_id: 'c5',
      client_name: 'Eve',
      version: 8,
    },
  ];

  const queues = deriveOperationalQueues(visits, '2026-11-13');
  assert.equal(queues.arrivals.length, 1);
  assert.equal(queues.arrivals[0].id, 'v1');

  assert.equal(queues.in_service.length, 1);
  assert.equal(queues.in_service[0].id, 'v2');

  assert.equal(queues.ready_for_pickup.length, 1);
  assert.equal(queues.ready_for_pickup[0].id, 'v3');

  assert.equal(queues.exceptions.length, 1);
  assert.equal(queues.exceptions[0].id, 'v4');

  assert.equal(queues.summary.completed_today, 1);
  assert.equal(queues.summary.total, 4);
});
