import { expect, test } from '@playwright/test';

test('staff reservation endpoint requires a real session and validates the request', async ({ request }) => {
  const missingRead = await request.get('/api/reservations?date=2026-11-09');
  expect(missingRead.status()).toBe(401);
  expect(missingRead.headers()['cache-control']).toBe('no-store');
  expect(missingRead.headers()['x-pawtrackr-data-mode']).toBe('authenticated-read');
  const malformedRead = await request.get('/api/reservations?date=2026-02-30', {
    headers: { Authorization: 'Bearer invalid-token' },
  });
  expect(malformedRead.status()).toBe(400);
  const invalidRead = await request.get('/api/reservations?date=2026-11-09', {
    headers: { Authorization: 'Bearer invalid-token' },
  });
  expect(invalidRead.status()).toBe(401);

  const input = {
    client_id: '11111111-1111-4111-8111-111111111111',
    pet_id: '22222222-2222-4222-8222-222222222222',
    staff_id: '33333333-3333-4333-8333-333333333333',
    package_id: 'bath',
    scheduled_time: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
  const missing = await request.post('/api/reservations', { data: input });
  expect(missing.status()).toBe(401);
  expect(missing.headers()['cache-control']).toBe('no-store');
  expect(missing.headers()['x-pawtrackr-data-mode']).toBe('authenticated-write');

  const malformed = await request.post('/api/reservations', {
    headers: { Authorization: 'Bearer invalid-token' },
    data: { ...input, scheduled_time: '2030-01-01T09:00:00' },
  });
  expect(malformed.status()).toBe(400);

  const invalid = await request.post('/api/reservations', {
    headers: { Authorization: 'Bearer invalid-token' },
    data: input,
  });
  expect(invalid.status()).toBe(401);
});

test('live appointments requires staff sign-in and fits narrow mobile viewports', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
    });
  });
  await page.goto('/dashboard/appointments/live');
  await expect(page.getByRole('heading', { name: 'Live appointments' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible();
  await expect(page.getByText('Demo PINs do not grant access.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'UTC appointment schedule' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Email' }).fill('nobody@example.invalid');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Sign-in failed' })).toContainText('Sign-in failed');
  await expect(page.getByLabel('Password')).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('live appointments supports desktop, portrait, and landscape schedules with filter, date, offline, and revocation states', async ({ page }) => {
  let membershipRevoked = false;
  const today = new Date().toISOString().slice(0, 10);
  const nextDay = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

  await page.addInitScript(() => {
    localStorage.setItem('sb-jdauajfcmsaamhgyklng-auth-token', JSON.stringify({
      access_token: 'fixture.jwt.token',
      refresh_token: 'fixture-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 1893456000,
      user: {
        id: 'aaaaaaaa-0000-4000-8000-000000000000',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'fixture@example.invalid',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-11-09T00:00:00Z',
      },
    }));
  });

  await page.route('**/api/reservations?date=*', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer fixture.jwt.token');
    if (membershipRevoked) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'An active staff membership is required.' }),
      });
      return;
    }
    const url = new URL(route.request().url());
    const requestedDate = url.searchParams.get('date') ?? today;
    if (requestedDate === nextDay) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'supabase_visits',
          business_id: '11111111-1111-4111-8111-111111111111',
          date: nextDay,
          timezone: 'UTC',
          as_of: `${nextDay}T08:00:00Z`,
          reservations: [],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'supabase_visits',
        business_id: '11111111-1111-4111-8111-111111111111',
        date: requestedDate,
        timezone: 'UTC',
        as_of: `${requestedDate}T14:00:00Z`,
        reservations: [
          {
            id: 'bbbbbbbb-1111-4111-8111-111111111111',
            scheduled_time: `${requestedDate}T09:00:00Z`,
            reservation_end: `${requestedDate}T10:15:00Z`,
            status: 'booked',
            service_package: 'Full Hand-Scissor',
            staff_id: 'cccccccc-1111-4111-8111-111111111111',
            pet_name: 'Bello',
            client_name: 'Sophia Chen-Alvarez',
            staff_name: 'Elena Vance',
          },
          {
            id: 'bbbbbbbb-1111-4111-8111-111111111112',
            scheduled_time: `${requestedDate}T09:30:00Z`,
            reservation_end: `${requestedDate}T10:30:00Z`,
            status: 'cancelled',
            service_package: 'Bath & Brush',
            staff_id: 'cccccccc-1111-4111-8111-111111111111',
            pet_name: 'Milo',
            client_name: 'Devon Brooks',
            staff_name: 'Elena Vance',
          },
          {
            id: 'bbbbbbbb-1111-4111-8111-111111111113',
            scheduled_time: `${requestedDate}T11:00:00Z`,
            reservation_end: `${requestedDate}T12:00:00Z`,
            status: 'ready',
            service_package: 'Senior Sanctuary Bath',
            staff_id: 'dddddddd-1111-4111-8111-111111111111',
            pet_name: 'Mochi',
            client_name: 'Hannah Lindqvist',
            staff_name: 'Sora Takahashi',
          },
        ],
      }),
    });
  });

  // 1. Desktop (1280x800): timeline, non-overlapping track stacking, filter behavior, right-rail details
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard/appointments/live');
  await expect(page.getByText('Source: Supabase visits')).toBeVisible();
  await expect(page.getByText('2 active · 0 completed · 1 canceled')).toBeVisible();

  const timeline = page.getByRole('region', { name: 'Appointment timeline' });
  await expect(timeline).toBeVisible();
  const belloTimelineBtn = timeline.getByRole('button', { name: /Bello/ });
  const miloTimelineBtn = timeline.getByRole('button', { name: /Milo/ });
  const belloBox = await belloTimelineBtn.boundingBox();
  const miloBox = await miloTimelineBtn.boundingBox();
  expect(belloBox).not.toBeNull();
  expect(miloBox).not.toBeNull();
  expect(Math.abs((belloBox?.y ?? 0) - (miloBox?.y ?? 0))).toBeGreaterThanOrEqual(60);

  await belloTimelineBtn.click();
  const detailRegion = page.getByRole('region', { name: 'Selected appointment' });
  await expect(detailRegion).toBeVisible();
  await expect(detailRegion).toContainText('Sophia Chen-Alvarez');
  await expect(detailRegion).toContainText('Full Hand-Scissor');

  const filterRail = page.getByRole('complementary', { name: 'Groomer filters' });
  await filterRail.getByRole('button', { name: 'Elena Vance' }).click();
  await expect(detailRegion).toBeVisible();
  await filterRail.getByRole('button', { name: 'Sora Takahashi' }).click();
  await expect(detailRegion).toHaveCount(0);
  await filterRail.getByRole('button', { name: 'All groomers' }).click();
  await expect(timeline.getByRole('button', { name: /Bello/ })).toBeVisible();

  // 2. Mobile Landscape (844x390): horizontal groomer timeline + visible compact details below timeline
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(timeline).toBeVisible();
  await timeline.getByRole('button', { name: /Mochi/ }).click();
  await expect(detailRegion).toBeVisible();
  await expect(detailRegion).toContainText('Hannah Lindqvist');

  // 3. Mobile Portrait (390x844): agenda view + inline selected details
  await page.setViewportSize({ width: 390, height: 844 });
  const agenda = page.getByRole('region', { name: 'Appointment agenda' });
  await expect(agenda).toBeVisible();
  await expect(detailRegion).toBeVisible();
  await expect(detailRegion).toContainText('Senior Sanctuary Bath');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // 4. Offline refresh retains last loaded day
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('status')).toContainText('Offline · last loaded day');
  await expect(agenda.getByRole('button', { name: /Bello/ })).toBeVisible();
  await page.context().setOffline(false);

  // 5. Changing UTC day clears old snapshot and loads new day
  await page.getByRole('button', { name: 'Next UTC day' }).click();
  await expect(page.getByText('No appointments for this UTC day and groomer filter.')).toBeVisible();
  await expect(agenda).toHaveCount(0);

  // 6. Revoked staff membership clears snapshot
  membershipRevoked = true;
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'An active staff membership is required.' })).toContainText('An active staff membership is required.');
  await expect(page.getByRole('status')).toContainText('Unavailable');
});

