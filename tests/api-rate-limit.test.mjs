import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRateLimitPolicy, BoundedLocalRateLimiter } from '../src/lib/api-rate-limit.ts';

test('assigns narrower windows to risky public and payment writes', () => {
  assert.deepEqual(apiRateLimitPolicy('/api/public/bookings', 'POST'), {
    id: 'public-booking-write', limit: 8, windowMs: 600_000, duration: '10 m',
  });
  assert.equal(apiRateLimitPolicy('/api/public/availability', 'GET')?.limit, 120);
  assert.equal(apiRateLimitPolicy('/api/onboarding', 'POST')?.limit, 12);
  assert.equal(apiRateLimitPolicy('/api/payments/intent', 'POST')?.limit, 30);
  assert.equal(apiRateLimitPolicy('/api/reservations', 'GET')?.limit, 180);
  assert.equal(apiRateLimitPolicy('/dashboard', 'GET'), null);
});

test('local fallback blocks at the exact limit and recovers in a new window', () => {
  const limiter = new BoundedLocalRateLimiter();
  const policy = apiRateLimitPolicy('/api/public/bookings', 'POST');
  assert(policy);
  for (let attempt = 1; attempt <= policy.limit; attempt += 1) {
    const result = limiter.limit('203.0.113.1', policy, 1_000);
    assert.equal(result.success, true);
    assert.equal(result.remaining, policy.limit - attempt);
  }
  const blocked = limiter.limit('203.0.113.1', policy, 1_000);
  assert.deepEqual(blocked, { success: false, limit: 8, remaining: 0, reset: 601_000 });
  const recovered = limiter.limit('203.0.113.1', policy, 601_000);
  assert.deepEqual(recovered, { success: true, limit: 8, remaining: 7, reset: 1_201_000 });
});

test('local fallback scopes counters by policy as well as identifier', () => {
  const limiter = new BoundedLocalRateLimiter();
  const booking = apiRateLimitPolicy('/api/public/bookings', 'POST');
  const availability = apiRateLimitPolicy('/api/public/availability', 'GET');
  assert(booking && availability);
  for (let attempt = 0; attempt < booking.limit + 1; attempt += 1) {
    limiter.limit('203.0.113.2', booking, 2_000);
  }
  assert.equal(limiter.limit('203.0.113.2', availability, 2_000).success, true);
});

test('local fallback stays bounded and evicts the oldest identifier', () => {
  const limiter = new BoundedLocalRateLimiter(2);
  const policy = apiRateLimitPolicy('/api/reservations', 'GET');
  assert(policy);
  limiter.limit('first', policy, 0);
  limiter.limit('second', policy, 0);
  limiter.limit('third', policy, 0);
  assert.equal(limiter.size(), 2);
  const firstAgain = limiter.limit('first', policy, 1);
  assert.equal(firstAgain.remaining, policy.limit - 1);
  assert.equal(limiter.size(), 2);
});
