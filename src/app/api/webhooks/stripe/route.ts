import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { settlementEventFrom, verifyStripeEvent } from '@/lib/stripe-webhook';

export const runtime = 'nodejs';

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Stripe is the only caller. Nothing is trusted until the signature over the
// raw body verifies; after that, public.apply_stripe_payment_event (migration
// 0019) records the event id once and is the only writer of settled, failed,
// and refunded states.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !secret.startsWith('whsec_') || secret.includes('your_webhook_secret') ||
      !url || !url.startsWith('https://') || !serviceKey || serviceKey.includes('your-supabase')) {
    return reply({ error: 'Stripe webhooks are not configured.' }, 503);
  }

  const rawBody = await req.text();
  const event = verifyStripeEvent(rawBody, req.headers.get('stripe-signature'), secret);
  if (!event) return reply({ error: 'Invalid Stripe signature.' }, 400);

  const settlement = settlementEventFrom(event);
  if (!settlement) return reply({ received: true, outcome: 'ignored' }, 200);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc('apply_stripe_payment_event', {
    p_event_id: settlement.event_id,
    p_event_type: settlement.type,
    p_payment_intent_id: settlement.payment_intent_id,
    p_amount_cents: settlement.amount_cents,
    p_currency: settlement.currency,
  });
  // A failure here rolled back the event record too, so a non-2xx answer lets
  // Stripe redeliver and the retry is processed from scratch.
  if (error || typeof data !== 'string') return reply({ error: 'The payment event could not be recorded.' }, 500);
  return reply({ received: true, outcome: data }, 200);
}
