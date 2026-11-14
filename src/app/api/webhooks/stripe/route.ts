import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { stripeCircuitBreaker } from '@/lib/adversarial-guardrails';
import { settlementEventFrom, subscriptionEventFrom, verifyStripeEvent } from '@/lib/stripe-webhook';

export const runtime = 'nodejs';

const MAX_WEBHOOK_BODY_BYTES = 262_144; // 256 KB DoS guard prior to HMAC hashing

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !secret ||
    !secret.startsWith('whsec_') ||
    secret.includes('your_webhook_secret') ||
    !url ||
    !url.startsWith('https://') ||
    !serviceKey ||
    serviceKey.includes('your-supabase')
  ) {
    return reply({ error: 'Stripe webhooks are not configured.' }, 503);
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return reply({ error: 'Webhook payload exceeds 256 KB maximum size.' }, 413);
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
    return reply({ error: 'Webhook payload exceeds 256 KB maximum size.' }, 413);
  }

  const event = verifyStripeEvent(rawBody, req.headers.get('stripe-signature'), secret);
  if (!event) return reply({ error: 'Invalid Stripe signature.' }, 400);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const subscription = subscriptionEventFrom(event);
  if (subscription) {
    try {
      const outcome = await stripeCircuitBreaker.execute(async () => {
        const { data, error } = await supabase.rpc('apply_stripe_subscription_event', {
          p_event_id: subscription.event_id,
          p_event_type: subscription.type,
          p_event_created: subscription.created_at,
          p_business_id: subscription.business_id,
          p_customer_id: subscription.customer_id,
          p_subscription_id: subscription.subscription_id,
          p_status: subscription.status,
          p_plan: subscription.plan,
        });
        if (error || typeof data !== 'string') {
          throw new Error(error?.message || 'Subscription event write failed');
        }
        return data;
      });
      return reply({ received: true, outcome }, 200);
    } catch {
      return reply({ error: 'The subscription event could not be recorded.' }, 500);
    }
  }

  const settlement = settlementEventFrom(event);
  if (!settlement) return reply({ received: true, outcome: 'ignored' }, 200);

  try {
    const outcome = await stripeCircuitBreaker.execute(async () => {
      const { data, error } = await supabase.rpc('apply_stripe_payment_event', {
        p_event_id: settlement.event_id,
        p_event_type: settlement.type,
        p_payment_intent_id: settlement.payment_intent_id,
        p_amount_cents: settlement.amount_cents,
        p_currency: settlement.currency,
      });
      if (error || typeof data !== 'string') {
        throw new Error(error?.message || 'Payment event write failed');
      }
      return data;
    });
    return reply({ received: true, outcome }, 200);
  } catch {
    return reply({ error: 'The payment event could not be recorded.' }, 500);
  }
}
