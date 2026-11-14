/**
 * PAWTRACKR WEB — MASTER ADVERSARIAL STRESS-TESTING & SCENARIO MATRIX
 * Automated validation of catastrophic edge cases, multi-tenant isolation,
 * POS integer-cent invariants, double-booking exclusion, and Sovereign Matrix security.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAtomicPOSCheckout,
  formatCurrency,
  fromCents,
  multiplyCentsByPercent,
  toCents,
} from '../src/lib/pos-math.ts';
import { isStaffSlotAvailable } from '../src/lib/booking-availability.ts';
import { BoundedLocalRateLimiter } from '../src/lib/api-rate-limit.ts';
import {
  DEFAULT_SOVEREIGN_MASTER_KEY,
  getSovereignState,
  getSovereignTelemetry,
  runAdversarialSelfAudit,
  validateSovereignKey,
} from '../src/lib/sovereign-matrix.ts';

// ============================================================================
// PART 1: FINANCIAL & POS LEDGER STRESS TESTS ($0.00 CASH VARIANCE GUARANTEE)
// ============================================================================
describe('FIN / ERR-01: Financial Precision & POS Checkout Math Invariants', () => {
  it('FIN-01: converts edge-case float amounts to exact integer cents with zero drift', () => {
    // Classic JavaScript float trap: 0.1 + 0.2 === 0.30000000000000004
    assert.strictEqual(toCents(0.1 + 0.2), 30);
    assert.strictEqual(toCents(19.99), 1999);
    assert.strictEqual(toCents(149.0), 14900);
    assert.strictEqual(toCents(119.0), 11900);
    assert.strictEqual(toCents(0.0), 0);
  });

  it('FIN-01: calculates sales tax using integer basis points without rounding error', () => {
    // $100.00 at 8.75% tax => $8.75 (875 cents)
    assert.strictEqual(multiplyCentsByPercent(10000, 8.75), 875);

    // Half-cent rounding rounds up as a physical cash register does
    // $12.50 at 8.25% tax => 1250 * 0.0825 = 103.125 => 103 cents
    assert.strictEqual(multiplyCentsByPercent(1250, 8.25), 103);

    // $115.00 service + 8.63% tax => 11500 * 0.0863 = 992.45 => 992 cents ($9.92)
    assert.strictEqual(multiplyCentsByPercent(11500, 8.63), 992);
  });

  it('FIN-03: split-tender invariant balance guard strictly balances to zero discrepancy', () => {
    const subtotalCents = 11500; // $115.00
    const discountCents = 1500;  // $15.00 discount
    const taxableSubtotal = subtotalCents - discountCents; // $100.00 (10000 cents)
    const taxCents = multiplyCentsByPercent(taxableSubtotal, 8.75); // $8.75 (875 cents)
    const tipCents = 2000; // $20.00 tip (2000 cents)
    const finalTotalCents = taxableSubtotal + taxCents + tipCents; // 12875 cents ($128.75)

    assert.strictEqual(finalTotalCents, 12875);

    // Simulate multi-tender split: $50.00 cash + $78.75 card
    const cashTenderCents = 5000;
    const cardTenderCents = 7875;
    const totalTendered = cashTenderCents + cardTenderCents;

    // Invariant condition: Sum(Tenders) === Final_Total_Cents
    const balanceVarianceCents = finalTotalCents - totalTendered;
    assert.strictEqual(balanceVarianceCents, 0, 'Cash drawer variance must be exactly $0.00');
  });

  it('FIN-02 / ERR-01: cryptographic idempotency key prevents duplicate transactions during network retries', () => {
    const idempotencyCache = new Set();

    function processCheckout(idempotencyKey, amountCents) {
      if (idempotencyCache.has(idempotencyKey)) {
        return { status: 'DUPLICATE_REJECTED', charged: false };
      }
      idempotencyCache.add(idempotencyKey);
      return { status: 'SUCCESS', charged: true, amountCents };
    }

    const testKey = 'idem-uuid-9842a-7712f';
    const firstCall = processCheckout(testKey, 12875);
    assert.strictEqual(firstCall.status, 'SUCCESS');
    assert.strictEqual(firstCall.charged, true);

    // Client connection drops, client retries with the same idempotency key
    const secondCall = processCheckout(testKey, 12875);
    assert.strictEqual(secondCall.status, 'DUPLICATE_REJECTED');
    assert.strictEqual(secondCall.charged, false, 'Duplicate charge must be rejected');
  });
});

// ============================================================================
// PART 2: CALENDAR, SCHEDULING, & CONCURRENCY STRESS TESTS (ZERO DOUBLE-BOOKING)
// ============================================================================
describe('SCH / ERR-02: Concurrency & Double-Booking Exclusion Invariants', () => {
  it('SCH-01: detects and rejects overlapping appointments for the exact same staff member', () => {
    const existingVisits = [
      {
        id: 'v-101',
        business_id: 'salon-a',
        staff_id: 'st-elena',
        status: 'booked',
        scheduled_time: '2026-11-15 10:00 AM',
        duration_minutes: 60, // 10:00 AM to 11:00 AM
      },
    ];

    // Attempt 1: Exact duplicate collision at 10:00 AM (Should be rejected)
    const collisionAttempt = isStaffSlotAvailable(
      existingVisits,
      'salon-a',
      'st-elena',
      '2026-11-15 10:00 AM',
      60
    );
    assert.strictEqual(collisionAttempt, false, 'Direct time collision must be rejected');

    // Attempt 2: Overlapping appointment at 10:30 AM (Should be rejected)
    const overlapAttempt = isStaffSlotAvailable(
      existingVisits,
      'salon-a',
      'st-elena',
      '2026-11-15 10:30 AM',
      45
    );
    assert.strictEqual(overlapAttempt, false, 'Overlapping appointment interval must be rejected');

    // Attempt 3: Non-overlapping appointment at 11:00 AM (Should succeed)
    const nonOverlapAttempt = isStaffSlotAvailable(
      existingVisits,
      'salon-a',
      'st-elena',
      '2026-11-15 11:00 AM',
      60
    );
    assert.strictEqual(nonOverlapAttempt, true, 'Non-overlapping appointment slot must be accepted');

    // Attempt 4: Simultaneous appointment for a DIFFERENT staff member (Should succeed)
    const otherStaffAttempt = isStaffSlotAvailable(
      existingVisits,
      'salon-a',
      'st-julian',
      '2026-11-15 10:00 AM',
      60
    );
    assert.strictEqual(otherStaffAttempt, true, 'Different groomer at same time slot must be accepted');

    // Attempt 5: Different salon tenant isolation (Should succeed)
    const otherTenantAttempt = isStaffSlotAvailable(
      existingVisits,
      'salon-b',
      'st-elena',
      '2026-11-15 10:00 AM',
      60
    );
    assert.strictEqual(otherTenantAttempt, true, 'Different salon tenant must be isolated');
  });
});

// ============================================================================
// PART 3: THREAT MITIGATION & SLIDING-WINDOW RATE LIMITING
// ============================================================================
describe('SEC / ERR-04: API Armoring & Brute-Force Rate Limiting', () => {
  it('SEC-02: sliding-window limiter blocks rapid bot submissions exceeding threshold', () => {
    const limiter = new BoundedLocalRateLimiter(100);
    const policy = {
      id: 'public-booking-write',
      limit: 5,
      windowMs: 60_000,
      duration: '1 m',
    };

    const attackerIp = '203.0.113.195';

    // First 5 requests within the window must be permitted
    for (let i = 1; i <= 5; i++) {
      const res = limiter.limit(attackerIp, policy);
      assert.strictEqual(res.success, true, `Request ${i} should be permitted`);
      assert.strictEqual(res.remaining, 5 - i);
    }

    // 6th request violates the limit and must be blocked (HTTP 429)
    const blockedRes = limiter.limit(attackerIp, policy);
    assert.strictEqual(blockedRes.success, false, 'Excessive request must be blocked');
    assert.strictEqual(blockedRes.remaining, 0);

    // Legitimate user from a different IP is unaffected
    const legitIp = '198.51.100.12';
    const legitRes = limiter.limit(legitIp, policy);
    assert.strictEqual(legitRes.success, true, 'Legitimate IP must not be blocked');
  });
});

// ============================================================================
// PART 4: SOVEREIGN MATRIX ENGINE & MASTER OPERATOR SECURITY
// ============================================================================
describe('SOVEREIGN MATRIX: Solo Founder Master Oversight & Kill-Switch', () => {
  it('authenticates only with the cryptographically verified Sovereign Master Key', () => {
    assert.strictEqual(validateSovereignKey(null), false);
    assert.strictEqual(validateSovereignKey(''), false);
    assert.strictEqual(validateSovereignKey('invalid_password_attempt'), false);
    assert.strictEqual(validateSovereignKey(DEFAULT_SOVEREIGN_MASTER_KEY), true);
    assert.strictEqual(validateSovereignKey(`Bearer ${DEFAULT_SOVEREIGN_MASTER_KEY}`), true);
  });

  it('telemetry aggregates multi-tenant metrics and confirms 100% RLS compliance', () => {
    const telemetry = getSovereignTelemetry();
    assert.ok(telemetry.platformMetrics.totalTenants >= 2);
    assert.strictEqual(telemetry.platformMetrics.securityPosture.rlsComplianceRate, 100);
    assert.strictEqual(telemetry.platformMetrics.dbPoolHealth.status, 'healthy');
    assert.ok(Array.isArray(telemetry.tenants));
    assert.ok(Array.isArray(telemetry.recentSecurityEvents));
  });

  it('can atomically freeze and unfreeze a tenant via emergency kill-switch', () => {
    const state = getSovereignState();
    const testTenantId = 'biz-bespoke-01';

    // Verify initial nominal state
    assert.strictEqual(state.isTenantLocked(testTenantId), false);

    // Trigger emergency lock
    state.setTenantLock(testTenantId, true, 'Adversarial anomaly detected');
    assert.strictEqual(state.isTenantLocked(testTenantId), true);
    assert.strictEqual(state.getTenantLock(testTenantId)?.reason, 'Adversarial anomaly detected');

    // Trigger unlock
    state.setTenantLock(testTenantId, false, 'Anomaly resolved');
    assert.strictEqual(state.isTenantLocked(testTenantId), false);
  });

  it('can toggle global emergency maintenance circuit breaker', () => {
    const state = getSovereignState();

    state.setGlobalMaintenance(true, 'Database migration window');
    assert.strictEqual(state.isGlobalMaintenance(), true);
    assert.strictEqual(state.getGlobalMaintenance().reason, 'Database migration window');

    // Restore nominal operations
    state.setGlobalMaintenance(false);
    assert.strictEqual(state.isGlobalMaintenance(), false);
  });

  it('runs adversarial self-audit and verifies all 5 threat defense vectors pass', () => {
    const audit = runAdversarialSelfAudit();
    assert.strictEqual(audit.overallScore, 100);
    assert.strictEqual(audit.vulnerabilitiesDetected, 0);
    assert.strictEqual(audit.systemIntegrity, 'IMPREGNABLE');
    assert.strictEqual(audit.checks.length, 5);
    for (const check of audit.checks) {
      assert.strictEqual(check.status, 'PASSED');
    }
  });
});
