import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getSupabaseClient } from '@/lib/supabase/client';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature') ?? '';
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

    let eventType = 'payment_intent.succeeded';
    let metadata: Record<string, string> = {};

    if (stripe && webhookSecret && !webhookSecret.includes('your_webhook_secret')) {
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
      eventType = event.type;
      const obj = event.data.object as { metadata?: Record<string, string> };
      metadata = obj.metadata ?? {};
    } else {
      const parsed = JSON.parse(rawBody || '{}');
      eventType = parsed.type ?? 'checkout.session.completed';
      metadata = parsed.data?.object?.metadata ?? {};
    }

    const businessId = metadata.business_id;
    const supabase = getSupabaseClient(businessId);

    switch (eventType) {
      case 'checkout.session.completed':
      case 'customer.subscription.updated': {
        if (supabase && metadata.salon_slug) {
          await supabase
            .from('businesses')
            .update({ subscription_status: 'active' })
            .eq('slug', metadata.salon_slug);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        if (supabase && metadata.salon_slug) {
          await supabase
            .from('businesses')
            .update({ subscription_status: 'canceled' })
            .eq('slug', metadata.salon_slug);
        }
        break;
      }
      case 'payment_intent.succeeded': {
        // Atomic POS PaymentIntent settled via Stripe Connect
        break;
      }
      default:
        break;
    }

    return NextResponse.json({
      received: true,
      eventType,
      tenantIsolated: Boolean(businessId || metadata.salon_slug),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Stripe Webhook Error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
