import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionEnvironment } from '../scripts/validate-production-env.mjs';

const valid = {
  NEXT_PUBLIC_APP_URL: 'https://pawtrackr.live',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_realistic_public_value',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_realistic_server_value',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_realistic_public_value',
  STRIPE_SECRET_KEY: 'sk_live_realistic_server_value',
  STRIPE_WEBHOOK_SECRET: 'whsec_realistic_webhook_value',
  STRIPE_SOLO_PLAN_PRICE_ID: 'price_live_solo_value',
  STRIPE_SALON_PLAN_PRICE_ID: 'price_live_salon_value',
  UPSTASH_REDIS_REST_URL: 'https://pawtrackr-rate-limit.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'upstash_realistic_server_token_value',
};

test('accepts a complete live production configuration', () => {
  assert.deepEqual(validateProductionEnvironment(valid), { ok: true, errors: [] });
});

test('rejects missing values without disclosing any configured value', () => {
  const result = validateProductionEnvironment({});
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 11);
  assert(result.errors.every((message) => !message.includes('realistic')));
});

test('rejects local, test-only, and path-bearing production URLs', () => {
  const result = validateProductionEnvironment({
    ...valid,
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000/admin',
    NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.invalid',
    UPSTASH_REDIS_REST_URL: 'https://example.invalid',
  });
  assert.equal(result.ok, false);
  assert(result.errors.some((message) => message.includes('must use HTTPS')));
  assert(result.errors.some((message) => message.includes('must not point to a local host')));
  assert(result.errors.some((message) => message.includes('without a path')));
  assert(result.errors.some((message) => message.includes('test-only')));
  assert(result.errors.some((message) => message.includes('hosted Supabase')));
  assert(result.errors.some((message) => message.includes('Upstash Redis')));
});

test('rejects an exposed Upstash token by its public variable name', () => {
  const result = validateProductionEnvironment({
    ...valid,
    NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN: 'opaque_upstash_token_that_must_stay_server_side',
  });
  assert.equal(result.ok, false);
  assert(result.errors.some((message) => message.includes('named like a server-side secret')));
});

test('rejects placeholder values and Stripe test credentials for a live release', () => {
  const result = validateProductionEnvironment({
    ...valid,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'your-supabase-key',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_value',
    STRIPE_SECRET_KEY: 'sk_test_value',
  });
  assert.equal(result.ok, false);
  assert(result.errors.some((message) => message.includes('placeholder')));
  assert.equal(result.errors.filter((message) => message.includes('unexpected key format')).length, 3);
});

test('rejects public exposure of Supabase or Stripe secret keys', () => {
  const result = validateProductionEnvironment({
    ...valid,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do_not_expose',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'sk_live_do_not_expose',
  });
  assert.equal(result.ok, false);
  assert(result.errors.some((message) => message.includes('server-side secret')));
  assert(result.errors.some((message) => message.includes('must never contain a secret key')));
  assert(result.errors.some((message) => message.includes('must never contain a Stripe secret')));
});

test('accepts legacy Supabase JWT formats while requiring separate client and server values', () => {
  const result = validateProductionEnvironment({
    ...valid,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'aaa.bbb.ccc',
    SUPABASE_SERVICE_ROLE_KEY: 'ddd.eee.fff',
  });
  assert.deepEqual(result, { ok: true, errors: [] });

  const shared = validateProductionEnvironment({
    ...valid,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'aaa.bbb.ccc',
    SUPABASE_SERVICE_ROLE_KEY: 'aaa.bbb.ccc',
  });
  assert.equal(shared.ok, false);
  assert(shared.errors.some((message) => message.includes('must be different')));
});
