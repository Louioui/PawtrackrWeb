import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { stripeCircuitBreaker } from '@/lib/adversarial-guardrails';
import { databaseMoneyToCents } from '@/lib/production-analytics';
import { isStripeConfigured, stripe } from '@/lib/stripe';

export const runtime = 'nodejs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://') || !isStripeConfigured || !stripe) {
    return reply({ error: 'Card payments are not configured.' }, 503);
  }
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return reply({ error: 'A signed-in staff session is required.' }, 401);

  let input: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
    input = parsed as Record<string, unknown>;
  } catch {
    return reply({ error: 'A transaction_id is required.' }, 400);
  }
  const transactionId = input.transaction_id;
  if (typeof transactionId !== 'string' || !uuid.test(transactionId)) {
    return reply({ error: 'A valid transaction_id is required.' }, 400);
  }

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(match[1]);
  if (authError || !user) return reply({ error: 'The staff session is invalid or expired.' }, 401);

  const { data: staff, error: staffError } = await supabase
    .from('staff_members')
    .select('business_id,role')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  if (staffError) return reply({ error: 'Staff membership could not be checked.' }, 502);
  if (!staff) return reply({ error: 'An active staff membership is required.' }, 403);
  if (!['owner', 'manager', 'front_desk'].includes(staff.role)) {
    return reply({ error: 'Only front desk, manager, or owner roles may initiate card payments.' }, 403);
  }

  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .select('id,amount,card_tender_cents,payment_method,status,settlement_status,stripe_payment_intent_id')
    .eq('business_id', staff.business_id)
    .eq('id', transactionId)
    .maybeSingle();
  if (transactionError) return reply({ error: 'The checkout could not be loaded.' }, 502);
  if (!transaction) return reply({ error: 'Checkout not found for this salon.' }, 404);

  const rawAmountCents =
    transaction.payment_method === 'split' && typeof transaction.card_tender_cents === 'number'
      ? transaction.card_tender_cents
      : databaseMoneyToCents(transaction.amount);

  if (rawAmountCents === null || rawAmountCents < 50) {
    return reply({ error: 'This checkout total cannot be charged by card.' }, 422);
  }
  if (
    !['card', 'apple_pay', 'split'].includes(transaction.payment_method) ||
    !['completed', 'pending'].includes(transaction.status)
  ) {
    return reply({ error: 'This checkout is not a card payment.' }, 422);
  }

  const stripeClient = stripe;

  try {
    if (transaction.stripe_payment_intent_id) {
      if (transaction.settlement_status !== 'pending') {
        return reply({ error: `This checkout is already ${transaction.settlement_status}.` }, 409);
      }
      const existing = await stripeCircuitBreaker.execute(() =>
        stripeClient.paymentIntents.retrieve(transaction.stripe_payment_intent_id),
      );
      return reply(
        {
          payment_intent_id: existing.id,
          client_secret: existing.client_secret,
          amount_cents: rawAmountCents,
          settlement_status: 'pending',
        },
        200,
      );
    }
    if (transaction.settlement_status !== 'unsettled') {
      return reply({ error: `This checkout is already ${transaction.settlement_status}.` }, 409);
    }

    const intent = await stripeCircuitBreaker.execute(() =>
      stripeClient.paymentIntents.create(
        {
          amount: rawAmountCents,
          currency: 'usd',
          automatic_payment_methods: { enabled: true },
          metadata: {
            pawtrackr_transaction_id: transaction.id,
            pawtrackr_business_id: staff.business_id,
          },
        },
        { idempotencyKey: `pawtrackr-checkout-${transaction.id}` },
      ),
    );

    const { data: linked, error: linkError } = await supabase
      .from('transactions')
      .update({ stripe_payment_intent_id: intent.id, settlement_status: 'pending' })
      .eq('business_id', staff.business_id)
      .eq('id', transaction.id)
      .eq('settlement_status', 'unsettled')
      .select('id')
      .maybeSingle();

    if (linkError || !linked) {
      // Concurrency guard: check whether a simultaneous sibling request already linked this exact deterministic PaymentIntent.
      const { data: reloaded } = await supabase
        .from('transactions')
        .select('stripe_payment_intent_id, settlement_status')
        .eq('business_id', staff.business_id)
        .eq('id', transaction.id)
        .maybeSingle();

      if (reloaded?.stripe_payment_intent_id === intent.id && reloaded.settlement_status === 'pending') {
        return reply(
          {
            payment_intent_id: intent.id,
            client_secret: intent.client_secret,
            amount_cents: rawAmountCents,
            settlement_status: 'pending',
            deduplicated: true,
          },
          200,
        );
      }

      // Only cancel orphaned intents that are NOT linked to the transaction row.
      if (!reloaded?.stripe_payment_intent_id) {
        await stripeClient.paymentIntents.cancel(intent.id).catch(() => undefined);
      }
      return reply({ error: 'The payment could not be linked to this checkout. No charge was started.' }, 502);
    }

    return reply(
      {
        payment_intent_id: intent.id,
        client_secret: intent.client_secret,
        amount_cents: rawAmountCents,
        settlement_status: 'pending',
      },
      201,
    );
  } catch (err) {
    const isCircuitOpen = err instanceof Error && err.message.includes('CircuitBreaker [OPEN]');
    return reply({ error: 'Stripe could not start this payment.' }, isCircuitOpen ? 503 : 502);
  }
}
