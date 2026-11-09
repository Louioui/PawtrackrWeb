import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDemoCheckoutResponse } from '../src/lib/demo-checkout-response.ts';

const expected = { businessId: 'salon-a', visitId: 'visit-a', totalCents: 1234 };
const tx = {
  id: 'tx-1', business_id: 'salon-a', visit_id: 'visit-a',
  amount: 12.34, status: 'completed', created_at: '2026-11-09T12:00:00Z',
};

test('accepts only a matching demo checkout record', () => {
  assert.deepEqual(parseDemoCheckoutResponse(true, { ok: true, mode: 'demo', transaction: tx }, expected), tx);
});

test('rejects server failure and fabricated or mismatched success', () => {
  assert.throws(() => parseDemoCheckoutResponse(false, { error: 'Unavailable' }, expected), /Unavailable/);
  assert.throws(() => parseDemoCheckoutResponse(true, { ok: true }, expected), /could not be recorded/);
  assert.throws(() => parseDemoCheckoutResponse(true, { ok: true, mode: 'demo', transaction: { ...tx, visit_id: 'other' } }, expected), /did not match/);
  assert.throws(() => parseDemoCheckoutResponse(true, { ok: true, mode: 'demo', transaction: { ...tx, amount: 13.34 } }, expected), /did not match/);
  assert.throws(() => parseDemoCheckoutResponse(true, { ok: true, mode: 'demo', transaction: { ...tx, status: 'pending' } }, expected), /did not match/);
});
