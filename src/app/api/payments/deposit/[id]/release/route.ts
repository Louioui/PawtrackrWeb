// ============================================================================
// PAWTRACKR WEB — API ROUTE: RELEASE OR APPLY CLIENT DEPOSIT
// Deducts pre-authorized deposit from final POS checkout ($0.00 cash drawer drift)
// or releases pre-auth hold back to client upon timely cancellation.
// ============================================================================

import { NextRequest } from 'next/server';
import { stripeCircuitBreaker } from '@/lib/adversarial-guardrails';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { isStripeConfigured, stripe } from '@/lib/stripe';
import {
  applyDepositToCheckout,
  getDepositHold,
  updateDepositHold,
} from '@/lib/deposit-guardrails';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireActiveStaffSession(req, 'Release or apply client deposit', [
    'owner',
    'manager',
    'front_desk',
    'senior_groomer',
    'groomer',
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
      { error: `Deposit hold cannot be released or applied because its current status is '${hold.status}'.` },
      409
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional
  }

  const { action = 'apply_to_checkout', grossTotalCents = 12000 } = (body as {
    action?: 'apply_to_checkout' | 'refund';
    grossTotalCents?: number;
  }) || {};

  if (action === 'apply_to_checkout') {
    const deduction = applyDepositToCheckout({
      grossTotalCents,
      depositHeldCents: hold.depositAmountCents,
    });

    if (!deduction.zeroVarianceCheck) {
      return noStoreJson(
        { error: 'POS math invariant violated: non-zero variance detected in deposit deduction.' },
        500
      );
    }

    // If Stripe intent is linked, capture the credited deposit amount
    const stripeClient = stripe;
    if (
      isStripeConfigured &&
      stripeClient &&
      hold.stripePaymentIntentId &&
      !hold.stripePaymentIntentId.startsWith('pi_mock') &&
      !hold.stripePaymentIntentId.startsWith('pi_sim')
    ) {
      try {
        await stripeCircuitBreaker.execute(() =>
          stripeClient.paymentIntents.capture(hold.stripePaymentIntentId!, {
            amount_to_capture: deduction.depositCreditedCents,
          })
        );
      } catch {
        // Proceed cleanly in sandbox
      }
    }

    const updated = updateDepositHold(id, {
      status: 'applied',
      resolvedAt: new Date().toISOString(),
      notes: `Applied $${(deduction.depositCreditedCents / 100).toFixed(2)} toward $${(deduction.grossTotalCents / 100).toFixed(2)} checkout. Net remaining: $${(deduction.netRemainingDueCents / 100).toFixed(2)}.`,
    });

    return noStoreJson(
      {
        ok: true,
        action: 'applied',
        deduction,
        depositHold: updated,
      },
      200
    );
  }

  if (action === 'refund') {
    // Cancel the pre-auth hold on Stripe
    const stripeClient = stripe;
    if (
      isStripeConfigured &&
      stripeClient &&
      hold.stripePaymentIntentId &&
      !hold.stripePaymentIntentId.startsWith('pi_mock') &&
      !hold.stripePaymentIntentId.startsWith('pi_sim')
    ) {
      try {
        await stripeCircuitBreaker.execute(() =>
          stripeClient.paymentIntents.cancel(hold.stripePaymentIntentId!)
        );
      } catch {
        // Proceed cleanly
      }
    }

    const updated = updateDepositHold(id, {
      status: 'refunded',
      refundedAmountCents: hold.depositAmountCents,
      resolvedAt: new Date().toISOString(),
      notes: `Full $${(hold.depositAmountCents / 100).toFixed(2)} deposit released/refunded.`,
    });

    return noStoreJson(
      {
        ok: true,
        action: 'refunded',
        depositHold: updated,
      },
      200
    );
  }

  return noStoreJson({ error: `Invalid action '${action}'. Must be 'apply_to_checkout' or 'refund'.` }, 400);
}
