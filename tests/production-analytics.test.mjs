import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseMoneyToCents, utcDailyCheckoutTotals } from '../src/lib/production-analytics.ts';

test('database decimal amounts convert to cents without floating-point drift', () => {
  assert.equal(databaseMoneyToCents('19.99'), 1999);
  assert.equal(databaseMoneyToCents('0.01'), 1);
  assert.equal(databaseMoneyToCents('12.5'), 1250);
  assert.equal(databaseMoneyToCents('1.234'), null);
  assert.equal(databaseMoneyToCents('-1.00'), null);
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
