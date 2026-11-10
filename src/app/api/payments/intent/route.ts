import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { databaseMoneyToCents } from '@/lib/production-analytics';
import { isStripeConfigured, stripe } from '@/lib/stripe';

export const runtime = 'nodejs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Starts a card payment for one recorded checkout in the caller's salon. The
// amount comes from the stored transaction, never from the request. Creating
// the intent only moves the checkout to "pending"; it becomes "settled" when
// Stripe's signed webhook confirms the same amount.
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
  if (typeof transactionId !== 'string' || !uuid.test(transactionId)) return reply({ error: 'A valid transaction_id is required.' }, 400);

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(match[1]);
  if (authError || !user) return reply({ error: 'The staff session is invalid or expired.' }, 401);
  const { data: staff, error: staffError } = await supabase.from('staff_members')
    .select('business_id').eq('auth_user_id', user.id).eq('is_active', true).maybeSingle();
  if (staffError) return reply({ error: 'Staff membership could not be checked.' }, 502);
  if (!staff) return reply({ error: 'An active staff membership is required.' }, 403);

  const { data: transaction, error: transactionError } = await supabase.from('transactions')
    .select('id,amount,payment_method,status,settlement_status,stripe_payment_intent_id')
    .eq('business_id', staff.business_id).eq('id', transactionId).maybeSingle();
  if (transactionError) return reply({ error: 'The checkout could not be loaded.' }, 502);
  if (!transaction) return reply({ error: 'Checkout not found for this salon.' }, 404);
  const amountCents = databaseMoneyToCents(transaction.amount);
  if (amountCents === null || amountCents < 50) return reply({ error: 'This checkout total cannot be charged by card.' }, 422);
  if (!['card', 'apple_pay'].includes(transaction.payment_method) || !['completed', 'pending'].includes(transaction.status)) {
    return reply({ error: 'This checkout is not a card payment.' }, 422);
  }

  try {
    if (transaction.stripe_payment_intent_id) {
      if (transaction.settlement_status !== 'pending') return reply({ error: `This checkout is already ${transaction.settlement_status}.` }, 409);
      const existing = await stripe.paymentIntents.retrieve(transaction.stripe_payment_intent_id);
      return reply({ payment_intent_id: existing.id, client_secret: existing.client_secret, amount_cents: amountCents, settlement_status: 'pending' }, 200);
    }
    if (transaction.settlement_status !== 'unsettled') return reply({ error: `This checkout is already ${transaction.settlement_status}.` }, 409);

    // The idempotency key makes a retried request return the same intent
    // instead of creating a second charge for one checkout.
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { pawtrackr_transaction_id: transaction.id, pawtrackr_business_id: staff.business_id },
    }, { idempotencyKey: `pawtrackr-checkout-${transaction.id}` });

    const { data: linked, error: linkError } = await supabase.from('transactions')
      .update({ stripe_payment_intent_id: intent.id, settlement_status: 'pending' })
      .eq('business_id', staff.business_id).eq('id', transaction.id).eq('settlement_status', 'unsettled')
      .select('id').maybeSingle();
    if (linkError || !linked) {
      // Without the link the webhook could never match this payment, so do not
      // hand out a secret for it.
      await stripe.paymentIntents.cancel(intent.id).catch(() => undefined);
      return reply({ error: 'The payment could not be linked to this checkout. No charge was started.' }, 502);
    }
    return reply({ payment_intent_id: intent.id, client_secret: intent.client_secret, amount_cents: amountCents, settlement_status: 'pending' }, 201);
  } catch {
    return reply({ error: 'Stripe could not start this payment.' }, 502);
  }
}
