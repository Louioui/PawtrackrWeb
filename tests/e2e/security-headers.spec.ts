import { expect, test } from '@playwright/test';

const assertSecurityHeaders = (headers: Record<string, string>) => {
  const csp = headers['content-security-policy'];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).toContain('https://*.supabase.co');
  expect(csp).toContain('wss://*.supabase.co');
  expect(csp).toContain('https://images.unsplash.com');
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).toContain("frame-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain('upgrade-insecure-requests');
  expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-resource-policy']).toBe('same-origin');
  expect(headers['origin-agent-cluster']).toBe('?1');
  expect(headers['x-dns-prefetch-control']).toBe('off');
  expect(headers['x-permitted-cross-domain-policies']).toBe('none');
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['permissions-policy']).toContain('geolocation=()');
  expect(headers['permissions-policy']).toContain('microphone=()');
  expect(headers['permissions-policy']).toContain('payment=()');
};

test('production pages carry the complete browser security policy', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  assertSecurityHeaders(response.headers());
});

test('protected API failures retain the same security policy and no-store boundary', async ({ request }) => {
  const response = await request.get('/api/reservations?date=2026-11-10');
  expect([401, 503]).toContain(response.status());
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(response.headers()['x-pawtrackr-rate-limit-mode']).toBe('local');
  expect(response.headers()['ratelimit-limit']).toBe('180');
  assertSecurityHeaders(response.headers());
});

test('public booking abuse receives a bounded retry response before route execution', async ({ request }) => {
  const headers = { 'x-forwarded-for': '203.0.113.88' };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request.post('/api/public/bookings', { headers, data: {} });
    expect(response.status()).toBe(400);
  }
  const blocked = await request.post('/api/public/bookings', { headers, data: {} });
  expect(blocked.status()).toBe(429);
  expect(blocked.headers()['cache-control']).toBe('no-store');
  expect(blocked.headers()['x-pawtrackr-data-mode']).toBe('public-booking');
  expect(blocked.headers()['x-pawtrackr-rate-limit-mode']).toBe('local');
  expect(blocked.headers()['ratelimit-limit']).toBe('8');
  expect(blocked.headers()['ratelimit-remaining']).toBe('0');
  expect(Number(blocked.headers()['ratelimit-reset'])).toBeGreaterThan(0);
  expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0);
  await expect(blocked.json()).resolves.toEqual({
    error: 'Too many requests. Wait for the rate-limit window to reset and try again.',
  });
  assertSecurityHeaders(blocked.headers());
});
