import assert from 'node:assert/strict';
import test from 'node:test';
import {
  centsToDatabaseMoney,
  databaseMoneyToCents,
  normalizeEligibleVisits,
  utcDailyCheckoutTotals,
  validateLiveCheckoutInput,
} from '../src/lib/production-analytics.ts';

test('database decimal amounts convert to cents without floating-point drift', () => {
  assert.equal(databaseMoneyToCents('19.99'), 1999);
  assert.equal(databaseMoneyToCents('0.01'), 1);
  assert.equal(databaseMoneyToCents('12.5'), 1250);
  assert.equal(databaseMoneyToCents('1.234'), null);
  assert.equal(databaseMoneyToCents('-1.00'), null);
  assert.equal(centsToDatabaseMoney(1999), '19.99');
  assert.equal(centsToDatabaseMoney(5), '0.05');
  assert.throws(() => centsToDatabaseMoney(-1));
});

test('validates live checkout cent math and eligible visits', () => {
  const valid = validateLiveCheckoutInput({
    visit_id: '11111111-1111-4111-8111-111111111111',
    subtotal_cents: 8500,
    discount_cents: 500,
    tax_cents: 660,
    tip_cents: 1500,
    payment_method: 'card',
  });
  assert.equal(valid?.total_cents, 10160);
  assert.equal(validateLiveCheckoutInput({
    visit_id: '11111111-1111-4111-8111-111111111111',
    subtotal_cents: 1000,
    discount_cents: 1001,
    tax_cents: 0,
    tip_cents: 0,
    payment_method: 'card',
  }), null);
  assert.equal(validateLiveCheckoutInput({
    visit_id: '11111111-1111-4111-8111-111111111111',
    subtotal_cents: 1000,
    discount_cents: 0,
    tax_cents: 0,
    tip_cents: 0,
    payment_method: 'crypto',
  }), null);

  const visits = normalizeEligibleVisits([{
    id: '22222222-2222-4222-8222-222222222222',
    pet_name: 'Bello',
    service_package: 'Full Hand-Scissor',
    scheduled_time: '2026-11-09T09:00:00Z',
    quoted_cents: 9500,
  }]);
  assert.equal(visits.length, 1);
  assert.equal(visits[0].quoted_cents, 9500);
});

test('hosted checkout rows aggregate by UTC transaction date', () => {
  const daily = utcDailyCheckoutTotals([
    { amount: '12.01', created_at: '2026-11-08T23:59:00Z', status: 'completed' },
    { amount: '0.99', created_at: '2026-11-09T00:01:00Z', status: 'completed' },
    { amount: '99.00', created_at: '2026-11-09T00:02:00Z', status: 'pending' },
  ], 7, new Date('2026-11-09T12:00:00Z'));
  assert.deepEqual(daily.slice(-2), [
    { utc_date: '2026-11-08', recorded_checkout_cents: 1201, checkout_count: 1 },
    { utc_date: '2026-11-09', recorded_checkout_cents: 99, checkout_count: 1 },
  ]);
});
