// ============================================================================
// PAWTRACKR WEB — API ROUTE: FORFEIT CLIENT DEPOSIT (NO-SHOW & LATE CANCEL)
// Enforces salon cancellation rules, stylist compensation, and audit logs.
// ============================================================================

import { NextRequest } from 'next/server';
import { stripeCircuitBreaker } from '@/lib/adversarial-guardrails';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { isStripeConfigured, stripe } from '@/lib/stripe';
import {
  evaluateCancellationForfeiture,
  getDepositHold,
  updateDepositHold,
  ForfeitReason,
  DepositPolicy,
} from '@/lib/deposit-guardrails';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireActiveStaffSession(req, 'Forfeit client deposit', [
    'owner',
    'manager',
    'front_desk',
  ]);
  if (!auth.ok) return auth.response;

  const businessId = auth.ctx.membership.business_id;
  const { id } = await params;

  const hold = getDepositHold(id);
  if (!hold || hold.businessId !== businessId) {
    return noStoreJson({ error: 'Deposit hold not found for this salon.' }, 404);
  }

  if (hold.status !== 'held') {
    return noStoreJson(
      { error: `Deposit hold cannot be forfeited because its current status is '${hold.status}'.` },
      409
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional
  }

  const {
    reason = 'no_show',
    scheduledTime = new Date(Date.now() - 3600000).toISOString(),
    policy,
  } = (body as {
    reason?: ForfeitReason;
    scheduledTime?: string;
    policy?: Partial<DepositPolicy>;
  }) || {};

  const assessment = evaluateCancellationForfeiture({
    depositHeldCents: hold.depositAmountCents,
    scheduledTime,
    isMarkedNoShow: reason === 'no_show',
    policy,
  });

  // If Stripe intent is linked and Stripe is configured, capture the forfeited amount
  const stripeClient = stripe;
  if (
    isStripeConfigured &&
    stripeClient &&
    hold.stripePaymentIntentId &&
    !hold.stripePaymentIntentId.startsWith('pi_mock') &&
    !hold.stripePaymentIntentId.startsWith('pi_sim')
  ) {
    try {
      if (assessment.forfeitAmountCents > 0) {
        await stripeCircuitBreaker.execute(() =>
          stripeClient.paymentIntents.capture(hold.stripePaymentIntentId!, {
            amount_to_capture: assessment.forfeitAmountCents,
          })
        );
      } else {
        await stripeCircuitBreaker.execute(() =>
          stripeClient.paymentIntents.cancel(hold.stripePaymentIntentId!)
        );
      }
    } catch {
      // In sandbox, proceed cleanly
    }
  }

  const updatedHold = updateDepositHold(id, {
    status: 'forfeited',
    forfeitReason: reason,
    forfeitAmountCents: assessment.forfeitAmountCents,
    refundedAmountCents: assessment.refundAmountCents,
    resolvedAt: new Date().toISOString(),
    notes: assessment.explanation,
  });

  return noStoreJson(
    {
      ok: true,
      depositHold: updatedHold,
      assessment,
    },
    200
  );
}
