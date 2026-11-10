import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { salonStatusFromStripe, subscriptionEventFrom } from '../src/lib/stripe-webhook.ts';
import {
  billingPlanFrom, billingReturnOrigin, checkoutIdempotencyKey, configuredPriceId, mayStartSubscription,
} from '../src/lib/subscription-checkout.ts';
import { apiRateLimitPolicy } from '../src/lib/api-rate-limit.ts';

const salon = '11111111-1111-4111-8111-111111111111';
const subscriptionEvent = (type, object, created = 1_794_000_000) => ({ id: 'evt_1', type, created, data: { object } });

test('only the two sold plans and real price ids are accepted', () => {
  assert.equal(billingPlanFrom('solo_van'), 'solo_van');
  for (const bad of ['enterprise', '', null, 1, 'SOLO_VAN']) assert.equal(billingPlanFrom(bad), null);
  assert.equal(configuredPriceId('price_1QabcDEF234567'), 'price_1QabcDEF234567');
  for (const bad of [undefined, '', 'price_solo_119', 'price_salon_149', 'price_pawtrackr_solo_119', 'prod_123456789', 'price_x'])
    assert.equal(configuredPriceId(bad), null);
});

test('Stripe may return only to the configured HTTPS origin', () => {
  assert.equal(billingReturnOrigin('https://pawtrackr.live'), 'https://pawtrackr.live');
  assert.equal(billingReturnOrigin('http://localhost:3000'), 'http://localhost:3000');
  for (const bad of [undefined, '', 'http://pawtrackr.live', 'https://user:pw@pawtrackr.live', 'https://pawtrackr.live/x',
    'https://pawtrackr.live?x=1', 'javascript:alert(1)', 'pawtrackr.live']) assert.equal(billingReturnOrigin(bad), null);
});

test('a salon with a live subscription cannot buy a second one', () => {
  assert.equal(mayStartSubscription({ subscription_status: 'trialing', stripe_subscription_id: null }), true);
  assert.equal(mayStartSubscription({ subscription_status: 'canceled', stripe_subscription_id: null }), true);
  for (const status of ['active', 'trialing', 'past_due'])
    assert.equal(mayStartSubscription({ subscription_status: status, stripe_subscription_id: 'sub_1' }), false);
});

test('a double click reuses one checkout session key; other salons and plans do not', () => {
  const now = 1_794_000_000_000;
  assert.equal(checkoutIdempotencyKey(salon, 'solo_van', now), checkoutIdempotencyKey(salon, 'solo_van', now + 1500));
  assert.notEqual(checkoutIdempotencyKey(salon, 'solo_van', now), checkoutIdempotencyKey(salon, 'salon_pro', now));
  assert.notEqual(checkoutIdempotencyKey(salon, 'solo_van', now), checkoutIdempotencyKey(salon.replace('1', '2'), 'solo_van', now));
  assert.notEqual(checkoutIdempotencyKey(salon, 'solo_van', now), checkoutIdempotencyKey(salon, 'solo_van', now + 3_600_000));
});

test('Stripe subscription states map onto the four salon states', () => {
  assert.equal(salonStatusFromStripe('active'), 'active');
  assert.equal(salonStatusFromStripe('trialing'), 'trialing');
  for (const status of ['past_due', 'unpaid', 'paused']) assert.equal(salonStatusFromStripe(status), 'past_due');
  for (const status of ['canceled', 'incomplete_expired']) assert.equal(salonStatusFromStripe(status), 'canceled');
  for (const status of ['incomplete', 'something_new', null]) assert.equal(salonStatusFromStripe(status), undefined);
});

test('a completed subscription checkout links ids without asserting a status', () => {
  const parsed = subscriptionEventFrom(subscriptionEvent('checkout.session.completed', {
    mode: 'subscription', customer: 'cus_1', subscription: { id: 'sub_1' }, client_reference_id: salon,
    metadata: { pawtrackr_business_id: salon.toUpperCase(), pawtrackr_plan: 'salon_pro' },
  }));
  assert.deepEqual(parsed, { event_id: 'evt_1', type: 'checkout.session.completed', created_at: new Date(1_794_000_000_000).toISOString(),
    business_id: salon, customer_id: 'cus_1', subscription_id: 'sub_1', status: null, plan: 'salon_pro' });
});

test('checkout sessions that are not ours or not subscriptions are ignored', () => {
  const base = { mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', client_reference_id: salon, metadata: {} };
  assert.equal(subscriptionEventFrom(subscriptionEvent('checkout.session.completed', { ...base, mode: 'payment' })), null);
  assert.equal(subscriptionEventFrom(subscriptionEvent('checkout.session.completed', { ...base, client_reference_id: 'not-a-salon' })), null);
  assert.equal(subscriptionEventFrom(subscriptionEvent('checkout.session.completed', { ...base, subscription: null })), null);
  assert.equal(subscriptionEventFrom(subscriptionEvent('checkout.session.completed', base, 0)), null);
});

test('subscription lifecycle events carry status; deletion always cancels', () => {
  const object = { id: 'sub_1', customer: 'cus_1', status: 'past_due', metadata: { pawtrackr_business_id: salon, pawtrackr_plan: 'bogus' } };
  const updated = subscriptionEventFrom(subscriptionEvent('customer.subscription.updated', object));
  assert.equal(updated.status, 'past_due'); assert.equal(updated.business_id, salon); assert.equal(updated.plan, null);
  assert.equal(subscriptionEventFrom(subscriptionEvent('customer.subscription.deleted', { ...object, status: 'active' })).status, 'canceled');
  assert.equal(subscriptionEventFrom(subscriptionEvent('customer.subscription.updated', { ...object, status: 'incomplete' })), null);
  assert.equal(subscriptionEventFrom(subscriptionEvent('customer.subscription.updated', { ...object, metadata: {} })).business_id, null);
  assert.equal(subscriptionEventFrom(subscriptionEvent('invoice.paid', object)), null);
});

test('migration 0024 keeps billing writes behind the service role', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0024_subscription_billing.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TRIGGER trg_business_billing_guard\s+BEFORE UPDATE ON public\.businesses/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.apply_stripe_subscription_event\([^)]*\)\s+FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.apply_stripe_subscription_event\([^)]*\)\s+TO service_role;/);
  assert.match(sql, /ON CONFLICT \(event_id\) DO NOTHING/);
});

test('subscription checkout has its own tight rate limit', () => {
  assert.equal(apiRateLimitPolicy('/api/billing/create-checkout', 'POST')?.limit, 10);
});
