import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isStripeConfigured, stripe } from '@/lib/stripe';
import {
  billingPlanFrom, billingReturnOrigin, checkoutIdempotencyKey, configuredPriceId, mayStartSubscription,
} from '@/lib/subscription-checkout';

export const runtime = 'nodejs';

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Opens a Stripe Checkout page for the caller's own salon subscription. Only
// the salon's owner may start it, and the salon is taken from their verified
// staff membership, never from the request. Nothing in the salon's billing
// state changes here: Stripe's signed webhook is the only writer (0024).
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const origin = billingReturnOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (!url || !key || !url.startsWith('https://') || !isStripeConfigured || !stripe || !origin) {
    return reply({ error: 'Subscription billing is not configured.' }, 503);
  }
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return reply({ error: 'A signed-in owner session is required.' }, 401);

  let plan = null;
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) plan = billingPlanFrom((parsed as { plan?: unknown }).plan);
  } catch { /* handled below */ }
  if (!plan) return reply({ error: 'Choose the solo_van or salon_pro plan.' }, 400);
  const priceId = configuredPriceId(plan === 'solo_van' ? process.env.STRIPE_SOLO_PLAN_PRICE_ID : process.env.STRIPE_SALON_PLAN_PRICE_ID);
  if (!priceId) return reply({ error: 'This plan is not available for purchase yet.' }, 503);

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(match[1]);
  if (authError || !user) return reply({ error: 'The session is invalid or expired.' }, 401);
  const { data: staff, error: staffError } = await supabase.from('staff_members')
    .select('business_id,role').eq('auth_user_id', user.id).eq('is_active', true).maybeSingle();
  if (staffError) return reply({ error: 'Staff membership could not be checked.' }, 502);
  if (!staff) return reply({ error: 'An active staff membership is required.' }, 403);
  if (staff.role !== 'owner') return reply({ error: 'Only the salon owner can manage the subscription.' }, 403);

  const { data: salon, error: salonError } = await supabase.from('businesses')
    .select('id,subscription_status,stripe_customer_id,stripe_subscription_id')
    .eq('id', staff.business_id).maybeSingle();
  if (salonError) return reply({ error: 'The salon could not be loaded.' }, 502);
  if (!salon) return reply({ error: 'Salon not found.' }, 404);
  if (!mayStartSubscription(salon)) return reply({ error: 'This salon already has a subscription.' }, 409);

  const metadata = { pawtrackr_business_id: salon.id, pawtrackr_plan: plan };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: salon.id,
      metadata,
      subscription_data: { metadata },
      // Reuse the salon's Stripe customer when one is already linked;
      // otherwise Checkout creates one for the signed-in owner's email.
      ...(salon.stripe_customer_id ? { customer: salon.stripe_customer_id } : user.email ? { customer_email: user.email } : {}),
      success_url: `${origin}/dashboard/settings/live?billing=success`,
      cancel_url: `${origin}/dashboard/settings/live?billing=cancelled`,
    }, { idempotencyKey: checkoutIdempotencyKey(salon.id, plan, Date.now()) });
    if (!session.url) return reply({ error: 'Stripe did not return a checkout page.' }, 502);
    return reply({ url: session.url, plan }, 201);
  } catch {
    return reply({ error: 'Stripe could not start the subscription checkout.' }, 502);
  }
}
