import test from 'node:test';
import assert from 'node:assert/strict';
import { addMinutesToLabeledSlot, isStaffSlotAvailable } from '../src/lib/booking-availability.ts';

const visit = (scheduled_time, duration_minutes = 90, overrides = {}) => ({
  business_id: 'salon-a', staff_id: 'groomer-a', status: 'booked', scheduled_time, duration_minutes, ...overrides,
});

test('rejects overlapping same-groomer visits and accepts adjacent slots', () => {
  const visits = [visit('2026-11-10 09:00 AM', 120)];
  assert.equal(isStaffSlotAvailable(visits, 'salon-a', 'groomer-a', '2026-11-10 10:30 AM', 60), false);
  assert.equal(isStaffSlotAvailable(visits, 'salon-a', 'groomer-a', '2026-11-10 11:00 AM', 60), true);
  assert.equal(isStaffSlotAvailable(visits, 'salon-a', 'groomer-b', '2026-11-10 10:30 AM', 60), true);
  assert.equal(isStaffSlotAvailable(visits, 'salon-b', 'groomer-a', '2026-11-10 10:30 AM', 60), true);
});

test('multi-pet duration and completed visits affect availability', () => {
  const visits = [visit('2026-11-10T15:00:00Z', 90)];
  assert.equal(isStaffSlotAvailable(visits, 'salon-a', 'groomer-a', '2026-11-10 01:30 PM', 180), false);
  assert.equal(isStaffSlotAvailable([visit('2026-11-10 09:00 AM', 120, { status: 'completed' })], 'salon-a', 'groomer-a', '2026-11-10 10:30 AM', 60), true);
  assert.equal(isStaffSlotAvailable(visits, 'salon-a', 'groomer-a', 'invalid', 60), false);
});

test('second pet starts after the first service, including noon and day rollover', () => {
  assert.equal(addMinutesToLabeledSlot('2026-11-10 10:30 AM', 120), '2026-11-10 12:30 PM');
  assert.equal(addMinutesToLabeledSlot('2026-11-10 11:00 PM', 120), '2026-11-11 01:00 AM');
  const visits = [
    visit('2026-11-10 09:00 AM', 120),
    visit('2026-11-10 11:00 AM', 90),
  ];
  assert.equal(isStaffSlotAvailable(visits, 'salon-a', 'groomer-a', '2026-11-10 12:00 PM', 60), false);
  assert.equal(isStaffSlotAvailable(visits, 'salon-a', 'groomer-a', '2026-11-10 12:30 PM', 60), true);
  assert.equal(isStaffSlotAvailable([visit('2026-11-10 11:00 PM', 120)], 'salon-a', 'groomer-a', '2026-11-11 12:30 AM', 60), false);
});
