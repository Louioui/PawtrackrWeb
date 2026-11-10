import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('public booking APIs reject malformed requests before touching the database', async ({ request }) => {
  const noParams = await request.get('/api/public/availability');
  expect(noParams.status()).toBe(400);
  expect(noParams.headers()['x-pawtrackr-data-mode']).toBe('public-booking');
  expect(noParams.headers()['cache-control']).toBe('no-store');
  const badDate = await request.get('/api/public/availability?slug=a-salon&package_id=bath&date=2026-02-30');
  expect(badDate.status()).toBe(400);
  const badSlug = await request.get('/api/public/availability?slug=../private&package_id=bath&date=2026-12-01');
  expect(badSlug.status()).toBe(400);

  const empty = await request.post('/api/public/bookings', { data: {} });
  expect(empty.status()).toBe(400);
  const shortPhone = await request.post('/api/public/bookings', { data: {
    slug: 'a-salon', package_id: 'bath', starts_at: '2026-12-01T17:00:00Z',
    client_name: 'Pat Parent', client_phone: '555', pet_name: 'Rex', breed: 'Lab',
  } });
  expect(shortPhone.status()).toBe(400);
  expect((await shortPhone.json()).error).toContain('phone');
});

test('salon provisioning and card payments require a signed-in session', async ({ request }) => {
  const read = await request.get('/api/onboarding');
  expect(read.status()).toBe(401);
  expect(read.headers()['x-pawtrackr-data-mode']).toBe('authenticated-read');
  const write = await request.post('/api/onboarding', { data: { salon_name: 'X', slug: 'x', time_zone: 'UTC', owner_name: 'X' } });
  expect(write.status()).toBe(401);
  expect(write.headers()['x-pawtrackr-data-mode']).toBe('authenticated-write');
  const forged = await request.post('/api/onboarding', {
    headers: { Authorization: 'Bearer not.a.real.token' },
    data: { salon_name: 'Forged Salon', slug: 'forged-salon', time_zone: 'UTC', owner_name: 'Nobody' },
  });
  expect(forged.status()).toBe(401);
  const intent = await request.post('/api/payments/intent', { data: { transaction_id: 'aaaaaaaa-2222-4222-8222-222222222222' } });
  expect([401, 503]).toContain(intent.status());
});

test('the Stripe webhook never accepts an unsigned or forged event', async ({ request }) => {
  const body = JSON.stringify({ id: 'evt_forged', type: 'payment_intent.succeeded', data: { object: { id: 'pi_x', amount_received: 1, currency: 'usd' } } });
  const unsigned = await request.post('/api/webhooks/stripe', { data: body, headers: { 'Content-Type': 'application/json' } });
  expect([400, 503]).toContain(unsigned.status());
  expect(unsigned.headers()['x-pawtrackr-data-mode']).toBe('verified-webhook');
  const forged = await request.post('/api/webhooks/stripe', {
    data: body, headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
  });
  expect([400, 503]).toContain(forged.status());
});

test('salon sign-up page is usable and accessible at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Set up your salon' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Create account' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Work email')).toBeVisible();
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});
