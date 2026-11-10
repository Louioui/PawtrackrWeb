import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const placeholderPattern = /(your-|example|changeme|replace-me|pawtrackr_(solo|salon)|ci_only)/i;
const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function value(env, name) {
  return typeof env[name] === 'string' ? env[name].trim() : '';
}

function productionUrl(raw, name, errors, { supabase = false, upstash = false } = {}) {
  if (!raw) {
    errors.push(`${name} is required.`);
    return null;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    errors.push(`${name} must be a valid URL.`);
    return null;
  }
  if (parsed.protocol !== 'https:') errors.push(`${name} must use HTTPS.`);
  if (parsed.username || parsed.password) errors.push(`${name} must not contain URL credentials.`);
  if (parsed.search || parsed.hash) errors.push(`${name} must not contain a query string or fragment.`);
  if (name === 'NEXT_PUBLIC_APP_URL' && parsed.pathname !== '/') {
    errors.push(`${name} must be the public site origin without a path.`);
  }
  if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    errors.push(`${name} must not point to a local host.`);
  }
  if (placeholderPattern.test(raw) || parsed.hostname.endsWith('.invalid')) {
    errors.push(`${name} still contains a placeholder or test-only value.`);
  }
  if (supabase && !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname)) {
    errors.push(`${name} must use a hosted Supabase project URL.`);
  }
  if (upstash && !/^[a-z0-9-]+\.upstash\.io$/.test(parsed.hostname)) {
    errors.push(`${name} must use an Upstash Redis REST URL.`);
  }
  return parsed;
}

function requiredKey(env, name, errors, prefixes, { allowJwt = false } = {}) {
  const raw = value(env, name);
  if (!raw) {
    errors.push(`${name} is required.`);
    return '';
  }
  if (placeholderPattern.test(raw)) errors.push(`${name} still contains a placeholder value.`);
  if (!prefixes.some((prefix) => raw.startsWith(prefix)) && !(allowJwt && jwtPattern.test(raw))) {
    errors.push(`${name} has an unexpected key format.`);
  }
  return raw;
}

export function validateProductionEnvironment(env = process.env) {
  const errors = [];
  for (const [name, raw] of Object.entries(env)) {
    if (!name.startsWith('NEXT_PUBLIC_') || typeof raw !== 'string') continue;
    if (/(?:SECRET|TOKEN|SERVICE_ROLE|PRIVATE)/.test(name) && raw.trim()) {
      errors.push(`${name} is named like a server-side secret and must not be public.`);
    }
    if (/^(?:sb_secret_|sk_(?:live|test)_|rk_(?:live|test)_|whsec_)/.test(raw.trim())) {
      errors.push(`${name} appears to contain a server-side secret.`);
    }
  }
  productionUrl(value(env, 'NEXT_PUBLIC_APP_URL'), 'NEXT_PUBLIC_APP_URL', errors);
  productionUrl(value(env, 'NEXT_PUBLIC_SUPABASE_URL'), 'NEXT_PUBLIC_SUPABASE_URL', errors, { supabase: true });
  productionUrl(value(env, 'UPSTASH_REDIS_REST_URL'), 'UPSTASH_REDIS_REST_URL', errors, { upstash: true });

  const publishable = requiredKey(
    env,
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    errors,
    ['sb_publishable_'],
    { allowJwt: true },
  );
  if (publishable.startsWith('sb_secret_') || publishable.startsWith('sk_')) {
    errors.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must never contain a secret key.');
  }

  const serviceRole = requiredKey(
    env,
    'SUPABASE_SERVICE_ROLE_KEY',
    errors,
    ['sb_secret_'],
    { allowJwt: true },
  );
  if (serviceRole.startsWith('sb_publishable_')) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY must be a server-side secret, not a publishable key.');
  }
  if (publishable && serviceRole && publishable === serviceRole) {
    errors.push('Supabase publishable and service-role keys must be different.');
  }

  requiredKey(env, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', errors, ['pk_live_']);
  requiredKey(env, 'STRIPE_SECRET_KEY', errors, ['sk_live_']);
  requiredKey(env, 'STRIPE_WEBHOOK_SECRET', errors, ['whsec_']);
  requiredKey(env, 'STRIPE_SOLO_PLAN_PRICE_ID', errors, ['price_']);
  requiredKey(env, 'STRIPE_SALON_PLAN_PRICE_ID', errors, ['price_']);
  const upstashToken = value(env, 'UPSTASH_REDIS_REST_TOKEN');
  if (!upstashToken) errors.push('UPSTASH_REDIS_REST_TOKEN is required.');
  else if (upstashToken.length < 20 || placeholderPattern.test(upstashToken)) {
    errors.push('UPSTASH_REDIS_REST_TOKEN has an unexpected or placeholder format.');
  }

  const publicStripe = value(env, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  if (publicStripe.startsWith('sk_') || publicStripe.startsWith('rk_')) {
    errors.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must never contain a Stripe secret or restricted key.');
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  const result = validateProductionEnvironment(process.env);
  if (!result.ok) {
    console.error('Pawtrackr production configuration is not release-ready:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Pawtrackr production configuration passed without printing credential values.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
