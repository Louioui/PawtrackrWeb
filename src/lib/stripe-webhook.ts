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

// A Stripe event reduced to what salon subscription billing needs.
export type SubscriptionEvent = {
  event_id: string;
  type: 'checkout.session.completed' | 'customer.subscription.created' | 'customer.subscription.updated' | 'customer.subscription.deleted';
  created_at: string;
  business_id: string | null;
  customer_id: string | null;
  subscription_id: string | null;
  // null means "link ids only": a completed Checkout session does not report
  // the subscription's state, the customer.subscription.* events do.
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | null;
  plan: 'solo_van' | 'salon_pro' | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idOf = (value: unknown): string | null =>
  typeof value === 'string' ? value : value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
    ? (value as { id: string }).id : null;
const businessIdFrom = (...candidates: unknown[]): string | null => {
  for (const candidate of candidates) if (typeof candidate === 'string' && uuidPattern.test(candidate)) return candidate.toLowerCase();
  return null;
};
const planFrom = (value: unknown): SubscriptionEvent['plan'] => value === 'solo_van' || value === 'salon_pro' ? value : null;

// Stripe has eight subscription states; a salon has four. "incomplete" (the
// first payment has not finished) changes nothing yet, so it maps to undefined
// and the event is ignored rather than locking out a salon mid-checkout.
export function salonStatusFromStripe(status: unknown): SubscriptionEvent['status'] | undefined {
  switch (status) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due': case 'unpaid': case 'paused': return 'past_due';
    case 'canceled': case 'incomplete_expired': return 'canceled';
    default: return undefined;
  }
}

export function subscriptionEventFrom(event: Stripe.Event): SubscriptionEvent | null {
  if (!Number.isSafeInteger(event.created) || event.created <= 0) return null;
  const created_at = new Date(event.created * 1000).toISOString();
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.mode !== 'subscription') return null;
    const business_id = businessIdFrom(session.metadata?.pawtrackr_business_id, session.client_reference_id);
    const customer_id = idOf(session.customer);
    const subscription_id = idOf(session.subscription);
    if (!business_id || !customer_id || !subscription_id) return null;
    return { event_id: event.id, type: event.type, created_at, business_id, customer_id, subscription_id,
      status: null, plan: planFrom(session.metadata?.pawtrackr_plan) };
  }
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : salonStatusFromStripe(subscription.status);
    const customer_id = idOf(subscription.customer);
    if (status === undefined || typeof subscription.id !== 'string' || !customer_id) return null;
    return { event_id: event.id, type: event.type, created_at,
      business_id: businessIdFrom(subscription.metadata?.pawtrackr_business_id), customer_id,
      subscription_id: subscription.id, status, plan: planFrom(subscription.metadata?.pawtrackr_plan) };
  }
  return null;
}
