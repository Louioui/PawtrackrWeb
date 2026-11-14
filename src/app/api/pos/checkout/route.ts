import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { validatePOSMath, roundToCents } from '@/lib/live-pos';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idempotencyPattern = /^[A-Za-z0-9._:-]{8,128}$/;

export async function POST(req: NextRequest) {
  // WF06: Point-of-Sale (POS) atomic checkout, split-tender verification & barcode inventory deduction
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

  if (subtotal < 0 || discount < 0 || tax < 0 || tip < 0 || amount < 0) {
    return noStoreJson({ error: 'Monetary checkout values cannot be negative.', code: 'PW041' }, 422);
  }

  const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod.trim() : 'cash';
  const isCashSettled = Boolean(body.isCashSettled ?? (paymentMethod === 'cash'));
  const stripeIntentId = typeof body.stripeIntentId === 'string' ? body.stripeIntentId.trim() || null : null;

  const rawIdempotencyKey =
    req.headers.get('x-idempotency-key')?.trim() ||
    (typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '');
  const idempotencyKey = rawIdempotencyKey && idempotencyPattern.test(rawIdempotencyKey) ? rawIdempotencyKey : null;

  const parseOptionalCents = (val: unknown): number | null => {
    if (val === null || val === undefined || val === '') return null;
    const parsed = Number(val);
    if (!Number.isInteger(parsed) || parsed < 0) return -1;
    return parsed;
  };

  const cashTenderCents = parseOptionalCents(body.cashTenderCents);
  const cardTenderCents = parseOptionalCents(body.cardTenderCents);
  const giftCardTenderCents = parseOptionalCents(body.giftCardTenderCents);
  const creditTenderCents = parseOptionalCents(body.creditTenderCents);

  if (
    cashTenderCents === -1 ||
    cardTenderCents === -1 ||
    giftCardTenderCents === -1 ||
    creditTenderCents === -1
  ) {
    return noStoreJson({ error: 'Split-tender values must be non-negative integer cents.', code: 'PW041' }, 422);
  }

  // Enforce cent-accurate balance invariant (PW041)
  const mathValidation = validatePOSMath({ subtotal, discount, tax, tip, amount });
  if (!mathValidation.valid) {
    return noStoreJson({ error: mathValidation.error, code: 'PW041' }, 422);
  }

  const totalCents = Math.round(amount * 100);
  if (
    paymentMethod === 'split' &&
    (cashTenderCents !== null ||
      cardTenderCents !== null ||
      giftCardTenderCents !== null ||
      creditTenderCents !== null)
  ) {
    const splitSum =
      (cashTenderCents ?? 0) +
      (cardTenderCents ?? 0) +
      (giftCardTenderCents ?? 0) +
      (creditTenderCents ?? 0);
    if (splitSum !== totalCents) {
      return noStoreJson(
        {
          error: `Split-tender cents (${splitSum}) must equal total checkout cents (${totalCents}).`,
          code: 'PW041',
        },
        422,
      );
    }
  }

  // Atomically deduct any barcode/SKU retail line items included in the ticket
  const retailItems = Array.isArray(body.retailItems) ? body.retailItems : [];
  const deductedRetail: unknown[] = [];
  for (const item of retailItems.slice(0, 25)) {
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const code = String(rec.skuOrBarcode || rec.barcode || rec.sku || '').trim();
      const qty = Math.max(1, Math.floor(Number(rec.quantity) || 1));
      if (code) {
        const { data: invData, error: invError } = await auth.ctx.supabase.rpc(
          'deduct_retail_inventory_atomic',
          {
            p_sku_or_barcode: code,
            p_quantity: qty,
          },
        );
        if (invError) {
          const errCode = (invError as { code?: string }).code;
          const status = errCode === 'PW075' ? 409 : errCode === 'PW028' ? 404 : 422;
          return noStoreJson({ error: invError.message, code: errCode || 'INVENTORY_ERROR' }, status);
        }
        deductedRetail.push(invData);
      }
    }
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
    p_idempotency_key: idempotencyKey,
    p_cash_tender_cents: cashTenderCents,
    p_card_tender_cents: cardTenderCents,
    p_gift_card_tender_cents: giftCardTenderCents,
    p_credit_tender_cents: creditTenderCents,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    const msg = error.message;
    if (code === 'PW041') return noStoreJson({ error: msg, code: 'PW041' }, 422);
    if (code === 'PW021') return noStoreJson({ error: msg, code: 'PW021' }, 403);
    if (code === 'PW028') return noStoreJson({ error: msg, code: 'PW028' }, 404);
    if (code === 'PW042') return noStoreJson({ error: msg, code: 'PW042' }, 409);
    return noStoreJson({ error: msg || 'Failed to record checkout.' }, 500);
  }

  return noStoreJson({ ok: true, transaction: data, retailDeductions: deductedRetail }, 200);
}
