import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateRequiredDepositCents,
  evaluateCancellationForfeiture,
  applyDepositToCheckout,
  storeDepositHold,
  getDepositHold,
  listDepositHolds,
  updateDepositHold,
  clearDepositHolds,
} from '../src/lib/deposit-guardrails.ts';

test('calculateRequiredDepositCents adheres to policy modes and bounding limits in integer cents', () => {
  // 1. Default fixed policy ($25.00)
  const fixed = calculateRequiredDepositCents({ estimatedPackagePriceCents: 12000 });
  assert.equal(fixed, 2500);

  // 2. Percentage mode (20% of $180.00 = $36.00)
  const pct = calculateRequiredDepositCents({
    estimatedPackagePriceCents: 18000,
    policy: { mode: 'percentage', percentage: 0.2 },
  });
  assert.equal(pct, 3600);

  // 3. Clamped by minimum ($15.00 min)
  const clampedMin = calculateRequiredDepositCents({
    estimatedPackagePriceCents: 4000,
    policy: { mode: 'percentage', percentage: 0.1, minCents: 1500 },
  });
  assert.equal(clampedMin, 1500);

  // 4. Clamped by maximum ($100.00 max)
  const clampedMax = calculateRequiredDepositCents({
    estimatedPackagePriceCents: 80000,
    policy: { mode: 'percentage', percentage: 0.25, maxCents: 10000 },
  });
  assert.equal(clampedMax, 10000);

  // 5. Holiday peak surcharge
  const holiday = calculateRequiredDepositCents({
    estimatedPackagePriceCents: 15000,
    isHolidayPeak: true,
  });
  assert.ok(holiday >= 3500);
});

test('evaluateCancellationForfeiture enforces timely refunds, late forfeiture, and no-show policies', () => {
  const depositCents = 2500; // $25.00
  const scheduledTime = '2026-11-15T14:00:00Z';

  // 1. Timely cancellation: 30 hours before visit (>= 24h window)
  const timely = evaluateCancellationForfeiture({
    depositHeldCents: depositCents,
    scheduledTime,
    cancellationTime: '2026-11-14T08:00:00Z', // 30h before
  });
  assert.equal(timely.isTimelyCancellation, true);
  assert.equal(timely.isLateCancellation, false);
  assert.equal(timely.isNoShow, false);
  assert.equal(timely.forfeitAmountCents, 0);
  assert.equal(timely.refundAmountCents, 2500);
  assert.equal(timely.policyApplied, 'TIMELY_FREE_CANCELLATION');

  // 2. Late cancellation: 6 hours before visit (< 24h window)
  const late = evaluateCancellationForfeiture({
    depositHeldCents: depositCents,
    scheduledTime,
    cancellationTime: '2026-11-15T08:00:00Z', // 6h before
  });
  assert.equal(late.isTimelyCancellation, false);
  assert.equal(late.isLateCancellation, true);
  assert.equal(late.isNoShow, false);
  assert.equal(late.forfeitAmountCents, 2500);
  assert.equal(late.refundAmountCents, 0);
  assert.equal(late.policyApplied, 'LATE_CANCELLATION_FORFEITURE');

  // 3. No-show marked
  const noShow = evaluateCancellationForfeiture({
    depositHeldCents: depositCents,
    scheduledTime,
    isMarkedNoShow: true,
  });
  assert.equal(noShow.isNoShow, true);
  assert.equal(noShow.forfeitAmountCents, 2500);
  assert.equal(noShow.refundAmountCents, 0);
  assert.equal(noShow.policyApplied, 'NO_SHOW_FORFEITURE');
});

test('applyDepositToCheckout enforces zero cash drawer drift invariant ($0.00 variance)', () => {
  // Gross total $125.00, deposit hold $25.00 -> Net due $100.00
  const deduction = applyDepositToCheckout({
    grossTotalCents: 12500,
    depositHeldCents: 2500,
  });

  assert.equal(deduction.grossTotalCents, 12500);
  assert.equal(deduction.depositCreditedCents, 2500);
  assert.equal(deduction.netRemainingDueCents, 10000);
  assert.equal(deduction.zeroVarianceCheck, true);
  assert.equal(
    deduction.grossTotalCents,
    deduction.depositCreditedCents + deduction.netRemainingDueCents
  );

  // When deposit exceeds gross (e.g. quick nail trim $20.00 with $25.00 deposit)
  const partial = applyDepositToCheckout({
    grossTotalCents: 2000,
    depositHeldCents: 2500,
  });
  assert.equal(partial.depositCreditedCents, 2000);
  assert.equal(partial.netRemainingDueCents, 0);
  assert.equal(partial.zeroVarianceCheck, true);
});

test('Deposit hold repository handles CRUD lifecycle and multi-tenant scoping', () => {
  clearDepositHolds();

  const hold = {
    id: 'hold-test-1',
    businessId: 'biz-sanctuary',
    visitId: 'visit-101',
    clientId: 'client-501',
    depositAmountCents: 2500,
    status: 'held',
    heldAt: new Date().toISOString(),
  };

  storeDepositHold(hold);
  assert.equal(getDepositHold('hold-test-1')?.depositAmountCents, 2500);

  const list = listDepositHolds('biz-sanctuary');
  assert.equal(list.length, 1);
  assert.equal(listDepositHolds('other-biz').length, 0);

  const updated = updateDepositHold('hold-test-1', { status: 'applied' });
  assert.equal(updated?.status, 'applied');
  assert.equal(getDepositHold('hold-test-1')?.status, 'applied');

  clearDepositHolds();
  assert.equal(listDepositHolds('biz-sanctuary').length, 0);
});
