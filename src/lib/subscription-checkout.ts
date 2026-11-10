// Pure rules for starting a salon subscription. Kept free of Stripe and
// Supabase so they can be tested without either.

export type BillingPlanId = 'solo_van' | 'salon_pro';

export function billingPlanFrom(value: unknown): BillingPlanId | null {
  return value === 'solo_van' || value === 'salon_pro' ? value : null;
}

// A real Stripe price id, not a missing value or the placeholders shipped in
// .env.example and the code defaults.
export function configuredPriceId(value: unknown): string | null {
  if (typeof value !== 'string' || !/^price_[A-Za-z0-9]{8,}$/.test(value)) return null;
  return /^price_(pawtrackr|solo|salon)/i.test(value) ? null : value;
}

// Stripe sends the owner back to this origin, so it comes from server
// configuration only, never from the request's Host header. HTTPS is required
// except for a developer's own machine.
export function billingReturnOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  return url.origin;
}

export type SalonBillingState = {
  subscription_status: string | null;
  stripe_subscription_id: string | null;
};

// A salon that already has a live subscription must not be sold a second one.
// A salon on its free trial has no subscription id yet and may check out.
export function mayStartSubscription(state: SalonBillingState): boolean {
  if (!state.stripe_subscription_id) return true;
  return state.subscription_status === 'canceled';
}

// Two clicks, or a retried request, inside the same ten-minute window reuse
// one Checkout session instead of opening two.
export function checkoutIdempotencyKey(businessId: string, plan: BillingPlanId, nowMs: number): string {
  return `pawtrackr-subscribe-${businessId}-${plan}-${Math.floor(nowMs / 600_000)}`;
}
