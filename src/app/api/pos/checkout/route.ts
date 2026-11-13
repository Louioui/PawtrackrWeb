import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { validatePOSMath, roundToCents } from '@/lib/live-pos';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  // WF06: Point-of-Sale (POS) atomic checkout & settlement
  const auth = await requireActiveStaffSession(req, 'POS checkout', [
    'owner',
    'manager',
    'front_desk',
  ]);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const visitId = typeof body.visitId === 'string' ? body.visitId.trim() : '';
  if (!uuidPattern.test(visitId)) {
    return noStoreJson({ error: 'Valid visit UUID is required.' }, 400);
  }

  const subtotal = roundToCents(Number(body.subtotal) || 0);
  const discount = roundToCents(Number(body.discount) || 0);
  const tax = roundToCents(Number(body.tax) || 0);
  const tip = roundToCents(Number(body.tip) || 0);
  const amount = roundToCents(Number(body.amount) || 0);
  const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod.trim() : 'cash';
  const isCashSettled = Boolean(body.isCashSettled ?? (paymentMethod === 'cash'));
  const stripeIntentId = typeof body.stripeIntentId === 'string' ? body.stripeIntentId.trim() : null;

  // Enforce cent-accurate balance invariant (PW041)
  const mathValidation = validatePOSMath({ subtotal, discount, tax, tip, amount });
  if (!mathValidation.valid) {
    return noStoreJson({ error: mathValidation.error }, 422);
  }

  const { data, error } = await auth.ctx.supabase.rpc('record_pos_checkout', {
    p_visit_id: visitId,
    p_subtotal: subtotal,
    p_discount: discount,
    p_tax: tax,
    p_tip: tip,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_stripe_intent_id: stripeIntentId,
    p_is_cash_settled: isCashSettled,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    const msg = error.message;
    if (code === 'PW041') {
      return noStoreJson({ error: msg, code: 'PW041' }, 422);
    }
    if (code === 'PW021') {
      return noStoreJson({ error: msg, code: 'PW021' }, 403);
    }
    if (code === 'PW028') {
      return noStoreJson({ error: msg, code: 'PW028' }, 404);
    }
    if (code === 'PW042') {
      return noStoreJson({ error: msg, code: 'PW042' }, 409);
    }
    return noStoreJson({ error: msg || 'Failed to record checkout.' }, 500);
  }

  return noStoreJson({ ok: true, transaction: data }, 200);
}
