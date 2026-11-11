import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { calculateAtomicPOSCheckout } from '@/lib/pos-math';
import { readServerLedger, writeServerLedger } from '@/lib/server-db';
import { PaymentMethod, Transaction } from '@/types/database';
import { requireLocalDemoApi } from '@/lib/demo-boundary';
import { canRecordDemoCheckout } from '@/lib/demo-checkout-eligibility';
import { demoCheckoutInputError } from '@/lib/demo-checkout-input';

export async function POST(req: NextRequest) {
  const blocked = requireLocalDemoApi();
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Checkout details must be a JSON object.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const inputError = demoCheckoutInputError(body);
  if (inputError) {
    return NextResponse.json({ error: inputError }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const {
      business_id,
      visit_id,
      base_package_dollars,
      addon_items_dollars = [],
      safety_surcharge_dollars = 0,
      discount_dollars = 0,
      tax_rate_percent = 8.63,
      tip_mode = 'percent',
      tip_percent = 20,
      custom_tip_dollars = 0,
      payment_method = 'card',
      loyalty_points_per_dollar = 2,
      // Shapes were checked by demoCheckoutInputError above.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } = body as Record<string, any>;

    if (!business_id || !visit_id) {
      return NextResponse.json(
        { error: 'business_id and visit_id are required for tenant isolation' },
        { status: 400 }
      );
    }

    // 1. Run exact fixed-point integer-cent math
    const breakdown = calculateAtomicPOSCheckout({
      basePackageDollars: Number(base_package_dollars),
      addonItemsDollars: Array.isArray(addon_items_dollars)
        ? addon_items_dollars.map(Number)
        : [],
      safetySurchargeDollars: Number(safety_surcharge_dollars),
      discountDollars: Number(discount_dollars),
      taxRatePercent: Number(tax_rate_percent),
      tipMode: tip_mode,
      tipPercent: Number(tip_percent),
      customTipDollars: Number(custom_tip_dollars),
      loyaltyPointsPerDollar: Number(loyalty_points_per_dollar),
    });

    // This route records a local demo checkout only. A real card payment needs
    // authenticated tenant access and a confirmed payment event.
    const ledger = readServerLedger();
    const visit = ledger.visits.find((item) => item.id === visit_id && item.business_id === business_id);
    if (!visit) {
      return NextResponse.json({ error: 'Demo visit not found for this salon.' }, { status: 404 });
    }
    if (!canRecordDemoCheckout(visit, ledger.transactions)) {
      return NextResponse.json({ error: 'This demo visit already has a completed checkout.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
    const demoTx: Transaction = {
      id: randomUUID(),
      business_id,
      visit_id,
      subtotal: breakdown.subtotalDollars,
      discount: breakdown.discountDollars,
      tax: breakdown.taxDollars,
      tip: breakdown.tipDollars,
      amount: breakdown.totalDollars,
      payment_method: payment_method as PaymentMethod,
      status: 'completed',
      created_at: new Date().toISOString(),
    };

    // Persist a demo transaction and mark its matching visit complete.
    writeServerLedger({
      transactions: [demoTx, ...ledger.transactions],
      visits: ledger.visits.map((v) =>
        v.id === visit_id && v.business_id === business_id
          ? {
              ...v,
              status: 'completed',
              total_amount: breakdown.subtotalDollars - breakdown.discountDollars,
            }
          : v
      ),
    });

    return NextResponse.json({
      ok: true,
      transaction: demoTx,
      mode: 'demo',
      breakdown,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Atomic POS Checkout Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
