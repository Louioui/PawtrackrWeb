import test from 'node:test';
import assert from 'node:assert/strict';
import { demoStorePatchError } from '../src/lib/demo-store-validation.ts';

test('accepts a bounded demo transaction update with chart fields', () => {
  assert.equal(demoStorePatchError({ transactions: [{
    id: 'tx-1', business_id: 'salon-1', visit_id: 'visit-1',
    amount: 12.34, status: 'completed', created_at: '2026-11-09T10:00:00Z',
  }] }), null);
});

test('rejects malformed ledger shapes before they reach analytics', () => {
  assert.match(demoStorePatchError({ transactions: 'oops' }), /transactions/);
  assert.match(demoStorePatchError({ transactions: [{
    id: 'tx-1', business_id: 'salon-1', visit_id: 'visit-1',
    amount: '12.34', status: 'completed', created_at: '2026-11-09T10:00:00Z',
  }] }), /transaction/);
  assert.match(demoStorePatchError({ visits: [{ id: 'v1', business_id: 'salon-1' }] }), /visit/);
  assert.match(demoStorePatchError({ transactions: [], admin: true }), /unknown field/);
  assert.match(demoStorePatchError({ configs: { salon: { business_id: 'salon', custom_settings: {} } } }), /config/);
});

test('rejects duplicate entity IDs so checkout totals have one record per ID', () => {
  const transaction = {
    id: 'tx-1', business_id: 'salon-1', visit_id: 'visit-1',
    amount: 12.34, status: 'completed', created_at: '2026-11-09T10:00:00Z',
  };
  assert.match(demoStorePatchError({ transactions: [transaction, { ...transaction, amount: 50 }] }), /transactions contains duplicate IDs/);
  assert.match(demoStorePatchError({ clients: [
    { id: 'client-1', business_id: 'salon-1', name: 'A' },
    { id: 'client-1', business_id: 'salon-2', name: 'B' },
  ] }), /clients contains duplicate IDs/);
});

test('accepts a cent-based weekly target and rejects invalid target values', () => {
  const config = {
    business_id: 'salon', tax_rate: 8, loyalty_points_per_dollar: 2,
    custom_settings: {
      tagline: '', address: '', rating: 5, reviewCount: 0,
      operating_hours: { open: '09:00', close: '17:00' },
      packages: [{ id: 'bath', name: 'Bath', description: '', price: 20, durationMinutes: 60 }],
      addons: [], weekly_checkout_target_cents: 70000,
    },
  };
  assert.equal(demoStorePatchError({ configs: { salon: config } }), null);
  for (const invalid of [0, -1, 12.34, '70000', 100_000_001]) {
    assert.match(demoStorePatchError({ configs: { salon: { ...config, custom_settings: { ...config.custom_settings, weekly_checkout_target_cents: invalid } } } }), /config/);
  }
});
