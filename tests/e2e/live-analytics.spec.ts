import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('staff analytics requires sign-in and keeps its source clear on a phone', async ({ page, request }) => {
  const missingPost = await request.post('/api/analytics', {
    data: {
      visit_id: '11111111-1111-4111-8111-111111111111',
      subtotal_cents: 8500,
      discount_cents: 0,
      tax_cents: 0,
      tip_cents: 0,
      payment_method: 'card',
    },
  });
  expect(missingPost.status()).toBe(401);
  expect(missingPost.headers()['x-pawtrackr-data-mode']).toBe('authenticated-write');

  const malformedPost = await request.post('/api/analytics', {
    headers: { Authorization: 'Bearer invalid-token' },
    data: {
      visit_id: '11111111-1111-4111-8111-111111111111',
      subtotal_cents: 1000,
      discount_cents: 1200,
      tax_cents: 0,
      tip_cents: 0,
      payment_method: 'card',
    },
  });
  expect(malformedPost.status()).toBe(400);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) });
  });
  await page.goto('/dashboard/analytics/live');
  await expect(page.getByRole('heading', { name: 'Recorded checkout analytics' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible();
  await expect(page.getByText('Demo PINs do not grant access here.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Completed checkout total' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Email' }).fill('nobody@example.invalid');
  await page.getByLabel('Password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Sign-in failed' })).toContainText('Sign-in failed');
  await expect(page.getByLabel('Password')).toHaveValue('');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});

test('staff chart and CSV use the same mocked source-backed daily snapshot', async ({ page }) => {
  let membershipRevoked = false;
  let recordedSecond = false;
  await page.addInitScript(() => {
    localStorage.setItem('sb-jdauajfcmsaamhgyklng-auth-token', JSON.stringify({
      access_token: 'fixture.jwt.token', refresh_token: 'fixture-refresh', token_type: 'bearer',
      expires_in: 3600, expires_at: 1893456000,
      user: { id: 'aaaaaaaa-0000-4000-8000-000000000000', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-11-09T00:00:00Z' },
    }));
  });
  await page.route('**/api/analytics**', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer fixture.jwt.token');
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as { tip_cents?: number };
      if (body.tip_cents === 99) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'A completed checkout is already recorded for this visit.' }) });
        return;
      }
      recordedSecond = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          transaction: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'completed' },
          recorded_checkout_cents: 9500,
          settlement_confirmed: false,
        }),
      });
      return;
    }
    if (membershipRevoked) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'An active staff membership is required.' }) });
      return;
    }
    const totalToday = recordedSecond ? 10734 : 1234;
    const countToday = recordedSecond ? 2 : 1;
    const daily = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 9, 11 + index)).toISOString().slice(0, 10);
      return { utc_date: date, recorded_checkout_cents: index === 29 ? totalToday : 0, checkout_count: index === 29 ? countToday : 0 };
    });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      source: 'supabase_recorded_checkouts', settlement_confirmed: false,
      business_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', as_of: '2026-11-09T18:00:00Z', timezone: 'UTC', days: 30,
      recorded_checkout_cents: totalToday, checkout_count: countToday, daily,
      eligible_visits: recordedSecond ? [] : [{
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        pet_name: 'Bello',
        service_package: 'Full Hand-Scissor',
        scheduled_time: '2026-11-09T09:00:00Z',
        quoted_cents: 8000,
      }],
    }) });
  });
  await page.goto('/dashboard/analytics/live');
  await expect(page.getByRole('heading', { name: 'Completed checkout total' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Daily recorded checkout totals/ })).toBeVisible();
  await expect(page.getByText('Payment settlement is unverified.')).toBeVisible();
  await page.getByText('View daily values').click();
  await expect(page.locator('tbody tr')).toHaveCount(30);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export daily CSV' }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('recorded_completed_checkout_cents,checkout_count,settlement_confirmed');
  expect(csv.trim().split('\r\n')).toHaveLength(31);
  expect(csv).toContain('2026-11-09,1234,1,false');

  // Record a completed checkout (409 conflict then 201 recorded checkout)
  await page.locator('summary').filter({ hasText: 'Record completed checkout' }).click();
  await page.getByLabel('Tip (¢)').fill('99');
  await page.getByRole('button', { name: 'Record checkout' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'A completed checkout is already recorded for this visit.' })).toBeVisible();
  await page.getByLabel('Tip (¢)').fill('1500');
  await page.getByRole('button', { name: 'Record checkout' }).click();
  await expect(page.getByText('$107.34').first()).toBeVisible();
  await expect(page.getByText('2 completed checkouts')).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('status')).toContainText('Offline · last loaded snapshot');
  await expect(page.getByRole('img', { name: /Daily recorded checkout totals/ })).toBeVisible();
  await page.context().setOffline(false);
  membershipRevoked = true;
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByText('An active staff membership is required to view salon analytics.')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Snapshot unavailable');
  await expect(page.getByRole('img', { name: /Daily recorded checkout totals/ })).toHaveCount(0);
});
