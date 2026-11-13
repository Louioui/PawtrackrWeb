import assert from 'node:assert/strict';
import test from 'node:test';
import {
  roundToCents,
  calculateLivePOSBreakdown,
  validatePOSMath,
  formatItemizedReceipt,
  validateRefundEligibility,
  detectStalePendingPayment,
  validateSurchargeConsent,
} from '../src/lib/live-pos.ts';

test('calculateLivePOSBreakdown computes accurate cent balances', () => {
  const breakdown = calculateLivePOSBreakdown({
    subtotal: 95.0,
    discount: 10.0,
    taxRate: 0.0825, // 8.25% on $85.00 = $7.0125 -> $7.01
    tip: 15.0,
  });

  assert.equal(breakdown.subtotal, 95.0);
  assert.equal(breakdown.discount, 10.0);
  assert.equal(breakdown.tax, 7.01);
  assert.equal(breakdown.tip, 15.0);
  assert.equal(breakdown.amount, 107.01);

  const validation = validatePOSMath(breakdown);
  assert.equal(validation.valid, true);
});

test('validatePOSMath rejects unbalanced cent breakdowns', () => {
  const unbalanced = {
    subtotal: 95.0,
    discount: 0.0,
    tax: 5.0,
    tip: 10.0,
    amount: 100.0, // Expected 110.0
  };

  const res = validatePOSMath(unbalanced);
  assert.equal(res.valid, false);
  assert.match(res.error || '', /POS breakdown unbalanced/);
});

test('validatePOSMath rejects discount exceeding subtotal', () => {
  const invalidDiscount = {
    subtotal: 50.0,
    discount: 60.0,
    tax: 0.0,
    tip: 0.0,
    amount: 0.0,
  };

  const res = validatePOSMath(invalidDiscount);
  assert.equal(res.valid, false);
  assert.match(res.error || '', /Discount cannot exceed subtotal/);
});

test('formatItemizedReceipt marks settled payment as verified receipt', () => {
  const settledReceipt = formatItemizedReceipt({
    transaction: {
      id: 'tx_12345678_abcd',
      amount: 110.0,
      subtotal: 95.0,
      discount: 0.0,
      tax: 5.0,
      tip: 10.0,
      payment_method: 'cash',
      settlement_status: 'settled',
      settled_at: '2026-11-13T10:30:00.000Z',
      created_at: '2026-11-13T10:30:00.000Z',
    },
    visit: {
      id: 'vis_8888',
      service_package: 'Full Groom',
      pet_name: 'Bello',
      client_name: 'Sophia Alvarez',
      status: 'completed',
    },
    salon: {
      name: 'Bespoke Grooming Chicago',
      phone: '312-555-0144',
      address: '123 N Michigan Ave, Chicago, IL',
    },
  });

  assert.equal(settledReceipt.payment.isVerifiedSettled, true);
  assert.equal(settledReceipt.breakdown.total, '$110.00');
  assert.equal(settledReceipt.receiptId, 'REC-TX_12345');
});

test('formatItemizedReceipt flags unsettled payment as not verified', () => {
  const pendingReceipt = formatItemizedReceipt({
    transaction: {
      id: 'tx_pending_1111',
      amount: 80.0,
      subtotal: 80.0,
      discount: 0.0,
      tax: 0.0,
      tip: 0.0,
      payment_method: 'card',
      settlement_status: 'pending',
      created_at: '2026-11-13T10:30:00.000Z',
    },
    visit: {
      id: 'vis_9999',
      service_package: 'Bath & Brush',
      status: 'payment_pending',
    },
    salon: {
      name: 'Bespoke Grooming',
    },
  });

  assert.equal(pendingReceipt.payment.isVerifiedSettled, false);
});

test('validateRefundEligibility enforces role, reason, settlement and amount invariants', () => {
  const settledTx = {
    amount: 110.0,
    settlement_status: 'settled',
    status: 'completed',
  };

  // Groomer cannot refund (PW045)
  const groomerAttempt = validateRefundEligibility({
    transaction: settledTx,
    refundAmount: 50.0,
    role: 'groomer',
    reason: 'Customer was not happy with ear trim',
  });
  assert.equal(groomerAttempt.eligible, false);
  assert.match(groomerAttempt.error || '', /require manager or owner authorization/);

  // Manager with short reason fails (PW046)
  const shortReasonAttempt = validateRefundEligibility({
    transaction: settledTx,
    refundAmount: 50.0,
    role: 'manager',
    reason: 'bad trim',
  });
  assert.equal(shortReasonAttempt.eligible, false);
  assert.match(shortReasonAttempt.error || '', /min 10 chars/);

  // Refund amount exceeding total fails
  const excessAttempt = validateRefundEligibility({
    transaction: settledTx,
    refundAmount: 150.0,
    role: 'owner',
    reason: 'Customer coat matting refund request',
  });
  assert.equal(excessAttempt.eligible, false);
  assert.match(excessAttempt.error || '', /cannot exceed transaction total/);

  // Valid manager refund succeeds
  const validAttempt = validateRefundEligibility({
    transaction: settledTx,
    refundAmount: 110.0,
    role: 'manager',
    reason: 'Customer coat matting refund request after inspection',
  });
  assert.equal(validAttempt.eligible, true);
});

test('detectStalePendingPayment flags payments pending > 30 minutes', () => {
  const now = new Date('2026-11-13T11:00:00.000Z');

  // 10 minutes ago -> not stale
  const freshTx = {
    created_at: '2026-11-13T10:50:00.000Z',
    settlement_status: 'pending',
    status: 'pending',
  };
  assert.equal(detectStalePendingPayment(freshTx, now), false);

  // 35 minutes ago -> stale (unknown payment)
  const staleTx = {
    created_at: '2026-11-13T10:25:00.000Z',
    settlement_status: 'pending',
    status: 'pending',
  };
  assert.equal(detectStalePendingPayment(staleTx, now), true);

  // Settled transaction is never stale
  const settledTx = {
    created_at: '2026-11-13T09:00:00.000Z',
    settlement_status: 'settled',
    status: 'completed',
  };
  assert.equal(detectStalePendingPayment(settledTx, now), false);
});

test('validateSurchargeConsent enforces client consent gate (PW044)', () => {
  // Surcharge without consent fails
  const withoutConsent = validateSurchargeConsent({
    amount: 25.0,
    client_consented: false,
  });
  assert.equal(withoutConsent.allowed, false);
  assert.match(withoutConsent.error || '', /No extra charge can be applied without recorded client consent/);

  // Surcharge with consent succeeds
  const withConsent = validateSurchargeConsent({
    amount: 25.0,
    client_consented: true,
  });
  assert.equal(withConsent.allowed, true);
});
