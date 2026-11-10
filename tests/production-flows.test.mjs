import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import { normalizeLiveReservationDay, salonLocalDayRange, salonLocalMinute } from '../src/lib/live-reservations.ts';
import { provisioningFailure, suggestSalonSlug, validateSalonProvisioning } from '../src/lib/onboarding.ts';
import {
  createRateLimiter, parseBookingConfirmation, parsePublicCatalog, publicBookingFailure, validBookingDate,
  validatePublicBookingRequest,
} from '../src/lib/public-booking.ts';
import { settlementTotals } from '../src/lib/production-analytics.ts';
import { settlementEventFrom, verifyStripeEvent } from '../src/lib/stripe-webhook.ts';

test('a salon-local day is bounded by local midnights, including clock changes', () => {
  assert.deepEqual(salonLocalDayRange('2026-11-09', 'UTC'), { start: '2026-11-09T00:00:00.000Z', end: '2026-11-10T00:00:00.000Z' });
  assert.deepEqual(salonLocalDayRange('2026-11-09', 'America/Los_Angeles'), { start: '2026-11-09T08:00:00.000Z', end: '2026-11-10T08:00:00.000Z' });
  const hours = (range) => (Date.parse(range.end) - Date.parse(range.start)) / 3_600_000;
  assert.equal(hours(salonLocalDayRange('2026-03-08', 'America/Los_Angeles')), 23);
  assert.equal(hours(salonLocalDayRange('2026-11-01', 'America/Los_Angeles')), 25);
  assert.equal(hours(salonLocalDayRange('2026-06-01', 'Australia/Sydney')), 24);
  assert.equal(salonLocalDayRange('2026-02-30', 'UTC'), null);
  assert.equal(salonLocalDayRange('2026-11-09', 'Mars/Phobos'), null);
  assert.equal(salonLocalMinute(new Date('2026-11-09T17:30:00Z'), 'America/Los_Angeles'), 9 * 60 + 30);
});

test('a reservation day is validated against the salon zone it reports', () => {
  const visit = {
    id: 'aaaaaaaa-2222-4222-8222-222222222222', scheduled_time: '2026-11-10T02:00:00.000Z',
    reservation_end: '2026-11-10T03:15:00.000Z', status: 'booked', service_package: 'Bath', staff_id: null,
    pet_name: 'Rex', client_name: 'Pat', staff_name: 'Unassigned',
  };
  const day = (timezone) => ({
    source: 'supabase_visits', business_id: '11111111-1111-4111-8111-111111111111', date: '2026-11-09',
    timezone, as_of: '2026-11-09T20:00:00.000Z', reservations: [visit],
  });
  // 02:00 UTC on the 10th is 18:00 on the 9th in Los Angeles.
  assert.equal(normalizeLiveReservationDay(day('America/Los_Angeles'), '2026-11-09').timezone, 'America/Los_Angeles');
  assert.throws(() => normalizeLiveReservationDay(day('UTC'), '2026-11-09'));
  assert.throws(() => normalizeLiveReservationDay(day('Mars/Phobos'), '2026-11-09'));
});

test('salon provisioning input is validated and database failures are explained', () => {
  assert.equal(suggestSalonSlug('  Splash & Dash Grooming Café!  '), 'splash-and-dash-grooming-cafe');
  assert.equal(suggestSalonSlug('***'), '');
  const good = validateSalonProvisioning({ salon_name: ' Splash Grooming ', slug: 'splash-grooming', time_zone: 'America/Chicago', owner_name: ' Sam ' });
  assert.deepEqual(good, { ok: true, draft: { salon_name: 'Splash Grooming', slug: 'splash-grooming', time_zone: 'America/Chicago', owner_name: 'Sam' } });
  for (const bad of [
    { salon_name: 'S', slug: 'splash', time_zone: 'UTC', owner_name: 'Sam' },
    { salon_name: 'Splash', slug: 'Splash Grooming', time_zone: 'UTC', owner_name: 'Sam' },
    { salon_name: 'Splash', slug: 'a-', time_zone: 'UTC', owner_name: 'Sam' },
    { salon_name: 'Splash', slug: 'double--hyphen', time_zone: 'UTC', owner_name: 'Sam' },
    { salon_name: 'Splash', slug: 'splash', time_zone: 'Mars/Phobos', owner_name: 'Sam' },
    { salon_name: 'Splash', slug: 'splash', time_zone: 'UTC', owner_name: '' },
    null,
  ]) assert.equal(validateSalonProvisioning(bad).ok, false);
  // An attacker-supplied business or user id is simply not part of the draft.
  const extra = validateSalonProvisioning({ salon_name: 'Splash', slug: 'splash', time_zone: 'UTC', owner_name: 'Sam', business_id: 'x', auth_user_id: 'y' });
  assert.deepEqual(Object.keys(extra.draft).sort(), ['owner_name', 'salon_name', 'slug', 'time_zone']);
  assert.equal(provisioningFailure('23505').status, 409);
  assert.equal(provisioningFailure('PW011').status, 409);
  assert.equal(provisioningFailure('PW012').status, 400);
  assert.equal(provisioningFailure(undefined).status, 502);
});

test('public booking requests are normalised and rejected with specific reasons', () => {
  const base = {
    slug: 'splash-grooming', package_id: 'bath', starts_at: '2026-11-16T09:00:00-08:00',
    client_name: ' Pat Parent ', client_phone: '(323) 555-0100', client_email: ' Pat@Example.test ', pet_name: 'Rex', breed: 'Lab',
  };
  const good = validatePublicBookingRequest(base);
  assert.equal(good.ok, true);
  assert.deepEqual(good.request, {
    slug: 'splash-grooming', package_id: 'bath', starts_at: '2026-11-16T17:00:00.000Z',
    client_name: 'Pat Parent', client_phone: '3235550100', client_email: 'pat@example.test', pet_name: 'Rex', breed: 'Lab',
  });
  assert.equal(validatePublicBookingRequest({ ...base, client_email: '' }).request.client_email, null);
  for (const change of [
    { slug: 'Bad Slug' }, { package_id: '' }, { starts_at: '2026-11-16 09:00' }, { starts_at: '2026-11-16T09:00:00' },
    { client_name: 'P' }, { client_phone: '555' }, { client_email: 'not-an-email' }, { pet_name: '' }, { breed: '' },
  ]) assert.equal(validatePublicBookingRequest({ ...base, ...change }).ok, false, JSON.stringify(change));
  assert.equal(validBookingDate('2026-11-16'), true);
  assert.equal(validBookingDate('2026-02-30'), false);
  assert.equal(publicBookingFailure('PW022').status, 409);
  assert.equal(publicBookingFailure('PW023').status, 429);
  assert.equal(publicBookingFailure('PW020').status, 404);
  assert.equal(publicBookingFailure('XX000').status, 502);
  assert.equal(parsePublicCatalog({ packages: [{ id: 'bath', name: 'Bath', price: 19.99, durationMinutes: 60 }, { name: 'No id' }] }).packages[0].id, 'bath');
  assert.equal(parsePublicCatalog({ packages: [{ name: 'No id' }] }).packages[0].id, null);
  const confirmation = { reference: '0A1B2C3D', status: 'booked', service: 'Bath', starts_at: '2026-11-16T17:00:00+00:00', ends_at: '2026-11-16T18:00:00+00:00', time_zone: 'America/Los_Angeles', price: 19.99 };
  assert.equal(parseBookingConfirmation(confirmation).reference, '0A1B2C3D');
  assert.equal(parseBookingConfirmation({ ...confirmation, reference: 'aaaaaaaa-2222-4222-8222-222222222222' }), null);
  assert.equal(parseBookingConfirmation(null), null);
});

test('the booking rate limiter allows a fixed number per window and then recovers', () => {
  let now = 1_000;
  const allow = createRateLimiter(2, 1_000, () => now);
  assert.deepEqual([allow('a'), allow('a'), allow('a'), allow('b')], [true, true, false, true]);
  now += 1_001;
  assert.equal(allow('a'), true);
});

test('settlement totals separate confirmed money from recorded checkouts', () => {
  const totals = settlementTotals([
    { amount: '48.00', settlement_status: 'settled' }, { amount: 19.99, settlement_status: 'unsettled' },
    { amount: '20.00', settlement_status: 'pending' }, { amount: '5.01', settlement_status: 'unsettled' },
  ]);
  assert.deepEqual(totals.settled, { cents: 4800, count: 1 });
  assert.deepEqual(totals.unsettled, { cents: 2500, count: 2 });
  assert.deepEqual(totals.pending, { cents: 2000, count: 1 });
  assert.deepEqual(totals.failed, { cents: 0, count: 0 });
  assert.throws(() => settlementTotals([{ amount: '1.00', settlement_status: 'paid' }]));
  assert.throws(() => settlementTotals([{ amount: 'abc', settlement_status: 'settled' }]));
  assert.throws(() => settlementTotals([{ amount: '1.00', settlement_status: 'constructor' }]));
});

test('Stripe events are accepted only with a valid signature over the exact body', () => {
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({
    id: 'evt_1', object: 'event', type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_1', object: 'payment_intent', amount: 4800, amount_received: 4800, currency: 'usd' } },
  });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const event = verifyStripeEvent(payload, header, secret);
  assert.deepEqual(settlementEventFrom(event), {
    event_id: 'evt_1', type: 'payment_intent.succeeded', payment_intent_id: 'pi_1', amount_cents: 4800, currency: 'usd',
  });
  assert.equal(verifyStripeEvent(payload, header, 'whsec_other_secret'), null);
  assert.equal(verifyStripeEvent(payload.replace('4800', '1'), header, secret), null);
  assert.equal(verifyStripeEvent(payload, null, secret), null);
  assert.equal(verifyStripeEvent(payload, 't=1,v1=deadbeef', secret), null);
  const stale = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  assert.equal(verifyStripeEvent(payload, stale, secret), null);

  const refund = { id: 'evt_2', type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount_refunded: 4800, currency: 'usd' } } };
  assert.equal(settlementEventFrom(refund).type, 'charge.refunded');
  assert.equal(settlementEventFrom({ id: 'evt_3', type: 'customer.created', data: { object: {} } }), null);
  assert.equal(settlementEventFrom({ id: 'evt_4', type: 'charge.refunded', data: { object: { payment_intent: null, amount_refunded: 1, currency: 'usd' } } }), null);
});
