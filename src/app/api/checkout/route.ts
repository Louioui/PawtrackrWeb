import { NextRequest, NextResponse } from 'next/server';
import { calculateAtomicPOSCheckout } from '@/lib/pos-math';
import { stripe } from '@/lib/stripe';
import { getSupabaseClient } from '@/lib/supabase/client';
import { readServerLedger, writeServerLedger } from '@/lib/server-db';
import { PaymentMethod, Transaction } from '@/types/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
      stripe_connected_account_id,
    } = body;

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

    // 2. Create Stripe Connect PaymentIntent if card/apple_pay & Stripe is configured
    let paymentIntentId = `pi_atomic_${Date.now().toString(36)}`;
    if (
      stripe &&
      (payment_method === 'card' || payment_method === 'apple_pay') &&
      breakdown.totalCents > 0
    ) {
      const platformFeeCents = Math.round(breakdown.totalCents * 0.012); // 1.2% platform fee
      const pi = await stripe.paymentIntents.create({
        amount: breakdown.totalCents,
        currency: 'usd',
        metadata: {
          business_id,
          visit_id,
          verification_hash: breakdown.verificationHash,
        },
        ...(stripe_connected_account_id
          ? {
              application_fee_amount: platformFeeCents,
              transfer_data: {
                destination: stripe_connected_account_id,
              },
            }
          : {}),
      });
      paymentIntentId = pi.id;
    }

    // 3. Commit via Supabase RPC `complete_atomic_pos_checkout` if cloud DB connected
    const supabase = getSupabaseClient(business_id);
    if (supabase) {
      await supabase.rpc('complete_atomic_pos_checkout', {
        p_business_id: business_id,
        p_visit_id: visit_id,
        p_subtotal: breakdown.subtotalDollars,
        p_discount: breakdown.discountDollars,
        p_tax: breakdown.taxDollars,
        p_tip: breakdown.tipDollars,
        p_payment_method: payment_method as PaymentMethod,
        p_stripe_payment_intent_id: paymentIntentId,
      });
    }

    const settledTx: Transaction = {
      id: `tx-${Date.now().toString(36)}`,
      business_id,
      visit_id,
      subtotal: breakdown.subtotalDollars,
      discount: breakdown.discountDollars,
      tax: breakdown.taxDollars,
      tip: breakdown.tipDollars,
      amount: breakdown.totalDollars,
      payment_method: payment_method as PaymentMethod,
      stripe_payment_intent_id: paymentIntentId,
      status: 'completed',
      created_at: new Date().toISOString(),
    };

    // 4. Persist settled transaction & mark visit completed in Server Ledger
    const ledger = readServerLedger();
    writeServerLedger({
      transactions: [settledTx, ...ledger.transactions],
      visits: ledger.visits.map((v) =>
        v.id === visit_id
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
      transaction: settledTx,
      breakdown,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Atomic POS Checkout Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
