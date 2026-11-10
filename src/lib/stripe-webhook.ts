import Stripe from 'stripe';

// A Stripe event reduced to what settlement needs. Built only from an event
// whose signature has already been verified.
export type SettlementEvent = {
  event_id: string;
  type: 'payment_intent.succeeded' | 'payment_intent.payment_failed' | 'charge.refunded';
  payment_intent_id: string;
  amount_cents: number;
  currency: string;
};

// Returns the event only when the signature header was produced with this
// endpoint's secret over these exact bytes, within Stripe's default five-minute
// tolerance. The body must be the raw request text, never re-serialised JSON.
export function verifyStripeEvent(rawBody: string, signatureHeader: string | null, secret: string): Stripe.Event | null {
  if (!signatureHeader || !secret || !rawBody) return null;
  try {
    return Stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
  } catch {
    return null;
  }
}

export function settlementEventFrom(event: Stripe.Event): SettlementEvent | null {
  if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object;
    const amount = event.type === 'payment_intent.succeeded' ? intent.amount_received : intent.amount;
    if (typeof intent.id !== 'string' || !Number.isSafeInteger(amount) || typeof intent.currency !== 'string') return null;
    return { event_id: event.id, type: event.type, payment_intent_id: intent.id, amount_cents: amount, currency: intent.currency };
  }
  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (typeof intentId !== 'string' || !Number.isSafeInteger(charge.amount_refunded) || typeof charge.currency !== 'string') return null;
    return { event_id: event.id, type: event.type, payment_intent_id: intentId, amount_cents: charge.amount_refunded, currency: charge.currency };
  }
  return null;
}
