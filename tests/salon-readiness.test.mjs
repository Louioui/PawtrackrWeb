import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDefaultWeeklyHours,
  DEFAULT_SALON_POLICIES,
  evaluateSalonReadiness,
  normalizeSalonPolicies,
} from '../src/lib/salon-readiness.ts';

test('normalizes salon policies with safe fallback defaults', () => {
  const defaults = normalizeSalonPolicies(null);
  assert.deepEqual(defaults, DEFAULT_SALON_POLICIES);
  assert.equal(defaults.trial_days, 30);
  assert.equal(defaults.deposit_required, false);
  assert.equal(defaults.booking_approval_mode, 'immediate');
  assert.equal(defaults.tax_services, false);
  assert.equal(defaults.cancellation_window_hours, 24);
  assert.equal(defaults.tips_refundable, false);
  assert.equal(defaults.chargeback_claws_back_commission, false);
  assert.equal(defaults.receipt_link_ttl_days, 30);

  const custom = normalizeSalonPolicies({
    trial_days: 14,
    deposit_required: true,
    booking_approval_mode: 'approval_required',
    tax_services: true,
    cancellation_window_hours: 48,
    tips_refundable: true,
    chargeback_claws_back_commission: true,
    receipt_link_ttl_days: 60,
  });
  assert.equal(custom.trial_days, 14);
  assert.equal(custom.deposit_required, true);
  assert.equal(custom.booking_approval_mode, 'approval_required');
  assert.equal(custom.cancellation_window_hours, 48);
});

test('evaluates salon readiness blocking checks when prerequisites are missing', () => {
  const emptyReport = evaluateSalonReadiness({
    salonName: 'Bespoke Grooming',
    slug: 'bespoke-grooming',
    timeZone: 'America/Chicago',
    operatingModel: 'salon',
    bookingStatus: 'draft',
    subscriptionActive: true,
    operatingHours: { open: '08:00', close: '18:00' },
    weeklyHours: buildDefaultWeeklyHours(),
    packages: [],
    staff: [],
    weeklyShifts: [],
    stations: [],
  });

  assert.equal(emptyReport.canPublish, false);
  assert.equal(emptyReport.isAcceptingOnlineBookings, false);
  assert.equal(emptyReport.bookingStatus, 'draft');
  assert.equal(emptyReport.operatingModel, 'salon');
  assert.equal(emptyReport.blockingCount > 0, true);

  const packageCheck = emptyReport.checks.find((c) => c.id === 'services');
  assert.equal(packageCheck?.passed, false);
  const groomerCheck = emptyReport.checks.find((c) => c.id === 'groomers');
  assert.equal(groomerCheck?.passed, false);
  const shiftCheck = emptyReport.checks.find((c) => c.id === 'shifts');
  assert.equal(shiftCheck?.passed, false);
  const stationCheck = emptyReport.checks.find((c) => c.id === 'stations');
  assert.equal(stationCheck?.passed, false);
});

test('evaluates salon readiness as ready to publish when all 6 prerequisites are present', () => {
  const readyReport = evaluateSalonReadiness({
    salonName: 'Bespoke Grooming',
    slug: 'bespoke-grooming',
    timeZone: 'America/Chicago',
    operatingModel: 'salon',
    bookingStatus: 'draft',
    subscriptionActive: true,
    operatingHours: { open: '08:00', close: '18:00' },
    weeklyHours: buildDefaultWeeklyHours(),
    packages: [
      { id: 'bath-brush', name: 'Bath & Brush', price: 65, durationMinutes: 60 },
    ],
    staff: [
      { id: '11111111-1111-4111-8111-111111111111', role: 'groomer', is_active: true },
    ],
    weeklyShifts: [
      {
        staff_id: '11111111-1111-4111-8111-111111111111',
        day_of_week: 1,
        start_time: '08:00',
        end_time: '17:00',
        is_active: true,
      },
    ],
    stations: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Station 1 - Hydraulic Table',
        station_type: 'grooming_table',
        is_active: true,
      },
    ],
  });

  assert.equal(readyReport.canPublish, true);
  assert.equal(readyReport.blockingCount, 0);
  assert.equal(readyReport.checks.every((c) => c.passed), true);

  // Online booking capability reflects draft status accurately
  const onlineBookingCap = readyReport.capabilities.find((c) => c.id === 'online_booking');
  assert.equal(onlineBookingCap?.status, 'partly_ready');

  // Verify honesty badges for unbuilt integrations
  const paymentsCap = readyReport.capabilities.find((c) => c.id === 'card_payments');
  assert.equal(paymentsCap?.status, 'not_connected');
  const messagesCap = readyReport.capabilities.find((c) => c.id === 'text_messages');
  assert.equal(messagesCap?.status, 'preview_only');
  const reportCardsCap = readyReport.capabilities.find((c) => c.id === 'report_cards');
  assert.equal(reportCardsCap?.status, 'preview_only');
});

test('mobile van operating model requires van station resource', () => {
  const vanWithoutVanStation = evaluateSalonReadiness({
    salonName: 'Splash Mobile Van',
    slug: 'splash-mobile',
    timeZone: 'America/Chicago',
    operatingModel: 'mobile_van',
    bookingStatus: 'draft',
    subscriptionActive: true,
    operatingHours: { open: '08:00', close: '18:00' },
    weeklyHours: buildDefaultWeeklyHours(),
    packages: [{ id: 'bath', name: 'Bath', price: 75, durationMinutes: 60 }],
    staff: [{ id: '11111111-1111-4111-8111-111111111111', role: 'groomer', is_active: true }],
    weeklyShifts: [
      { staff_id: '11111111-1111-4111-8111-111111111111', day_of_week: 1, start_time: '08:00', end_time: '17:00', is_active: true },
    ],
    stations: [
      { id: '22222222-2222-4222-8222-222222222222', name: 'Salon Table', station_type: 'grooming_table', is_active: true },
    ],
  });
  assert.equal(vanWithoutVanStation.canPublish, false);
  const stationCheck = vanWithoutVanStation.checks.find((c) => c.id === 'stations');
  assert.equal(stationCheck?.passed, false);

  const vanWithVanStation = evaluateSalonReadiness({
    salonName: 'Splash Mobile Van',
    slug: 'splash-mobile',
    timeZone: 'America/Chicago',
    operatingModel: 'mobile_van',
    bookingStatus: 'draft',
    subscriptionActive: true,
    operatingHours: { open: '08:00', close: '18:00' },
    weeklyHours: buildDefaultWeeklyHours(),
    packages: [{ id: 'bath', name: 'Bath', price: 75, durationMinutes: 60 }],
    staff: [{ id: '11111111-1111-4111-8111-111111111111', role: 'groomer', is_active: true }],
    weeklyShifts: [
      { staff_id: '11111111-1111-4111-8111-111111111111', day_of_week: 1, start_time: '08:00', end_time: '17:00', is_active: true },
    ],
    stations: [
      { id: '22222222-2222-4222-8222-222222222222', name: 'Sprinter Van #1', station_type: 'van_bay', is_active: true },
    ],
  });
  assert.equal(vanWithVanStation.canPublish, true);
});
