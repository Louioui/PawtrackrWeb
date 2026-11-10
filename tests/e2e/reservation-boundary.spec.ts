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

  const missingPatch = await request.patch('/api/reservations', {
    data: { id: '44444444-4444-4444-8444-444444444444', status: 'completed' },
  });
  expect(missingPatch.status()).toBe(401);
  expect(missingPatch.headers()['cache-control']).toBe('no-store');
  expect(missingPatch.headers()['x-pawtrackr-data-mode']).toBe('authenticated-write');

  const malformedPatch = await request.patch('/api/reservations', {
    headers: { Authorization: 'Bearer invalid-token' },
    data: { id: '44444444-4444-4444-8444-444444444444', status: 'unsupported_state' },
  });
  expect(malformedPatch.status()).toBe(400);

  const invalidPatch = await request.patch('/api/reservations', {
    headers: { Authorization: 'Bearer invalid-token' },
    data: { id: '44444444-4444-4444-8444-444444444444', status: 'completed' },
  });
  expect(invalidPatch.status()).toBe(401);

  const missingClientsRead = await request.get('/api/clients');
  expect(missingClientsRead.status()).toBe(401);
  expect(missingClientsRead.headers()['x-pawtrackr-data-mode']).toBe('authenticated-read');

  const missingClientsWrite = await request.post('/api/clients', {
    data: { client_name: 'Sophia', client_phone: '4155550199', pet_name: 'Bello', breed: 'Poodle' },
  });
  expect(missingClientsWrite.status()).toBe(401);
  expect(missingClientsWrite.headers()['x-pawtrackr-data-mode']).toBe('authenticated-write');

  const malformedClientsWrite = await request.post('/api/clients', {
    headers: { Authorization: 'Bearer invalid-token' },
    data: { client_name: 'Sophia', client_phone: '123', pet_name: 'Bello', breed: 'Poodle' },
  });
  expect(malformedClientsWrite.status()).toBe(400);
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

  let mochiStatus: 'ready' | 'completed' = 'ready';
  let createdVisit = false;

  await page.route('**/api/reservations**', async (route) => {
    const method = route.request().method();
    expect(route.request().headers().authorization).toBe('Bearer fixture.jwt.token');
    if (method === 'PATCH') {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, string>;
      if (body.id === 'bbbbbbbb-1111-4111-8111-111111111112' && body.status === 'booked') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'That groomer is already booked during this time.' }),
        });
        return;
      }
      if (body.id === 'bbbbbbbb-1111-4111-8111-111111111113' && body.status === 'completed') {
        mochiStatus = 'completed';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            reservation: {
              id: body.id,
              scheduled_time: `${today}T11:00:00Z`,
              reservation_end: `${today}T12:00:00Z`,
              status: 'completed',
            },
          }),
        });
        return;
      }
    }
    if (method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, string>;
      if (body.scheduled_time === `${today}T09:30:00.000Z`) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'That groomer is already booked during this time.' }),
        });
        return;
      }
      createdVisit = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          reservation: {
            id: 'bbbbbbbb-1111-4111-8111-111111111114',
            scheduled_time: `${today}T13:00:00Z`,
            reservation_end: `${today}T14:00:00Z`,
            status: 'booked',
          },
        }),
      });
      return;
    }
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
            status: mochiStatus,
            service_package: 'Senior Sanctuary Bath',
            staff_id: 'dddddddd-1111-4111-8111-111111111111',
            pet_name: 'Mochi',
            client_name: 'Hannah Lindqvist',
            staff_name: 'Sora Takahashi',
          },
          ...(createdVisit ? [{
            id: 'bbbbbbbb-1111-4111-8111-111111111114',
            scheduled_time: `${requestedDate}T13:00:00Z`,
            reservation_end: `${requestedDate}T14:00:00Z`,
            status: 'booked' as const,
            service_package: 'Bath & Brush',
            staff_id: 'cccccccc-1111-4111-8111-111111111111',
            pet_name: 'Koda',
            client_name: 'Marcus Sterling',
            staff_name: 'Elena Vance',
          }] : []),
        ],
        booking_options: {
          pets: [
            {
              id: 'eeeeeeee-1111-4111-8111-111111111111',
              client_id: 'ffffffff-1111-4111-8111-111111111111',
              pet_name: 'Koda',
              client_name: 'Marcus Sterling',
            },
          ],
          groomers: [
            { id: 'cccccccc-1111-4111-8111-111111111111', name: 'Elena Vance' },
            { id: 'dddddddd-1111-4111-8111-111111111111', name: 'Sora Takahashi' },
          ],
          services: [
            { id: 'bath', name: 'Bath & Brush', duration_minutes: 60 },
          ],
        },
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

  // Status conflict (409) when attempting to reactivate a canceled visit over a booked slot
  await miloTimelineBtn.click();
  await detailRegion.getByLabel('Update status').selectOption('booked');
  await detailRegion.getByRole('button', { name: 'Save status' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'That groomer is already booked during this time.' })).toBeVisible();

  // New appointment booking (409 conflict then 201 creation)
  await page.locator('summary').filter({ hasText: 'New appointment' }).click();
  await page.getByLabel(/UTC start time/).fill('09:30');
  await page.getByRole('button', { name: 'Book visit' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'That groomer is already booked during this time.' })).toBeVisible();
  await page.getByLabel(/UTC start time/).fill('13:00');
  await page.getByRole('button', { name: 'Book visit' }).click();
  await expect(page.getByText('3 active · 0 completed · 1 canceled')).toBeVisible();
  await expect(timeline.getByRole('button', { name: /Koda/ })).toBeVisible();

  // 2. Mobile Landscape (844x390): horizontal groomer timeline + visible compact details below timeline + status completion
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(timeline).toBeVisible();
  await timeline.getByRole('button', { name: /Mochi/ }).click();
  await expect(detailRegion).toBeVisible();
  await expect(detailRegion).toContainText('Hannah Lindqvist');
  await detailRegion.getByLabel('Update status').selectOption('completed');
  await detailRegion.getByRole('button', { name: 'Save status' }).click();
  await expect(page.getByText('2 active · 1 completed · 1 canceled')).toBeVisible();

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

test('live client and pet roster supports staff intake, offline retention, and revocation', async ({ page }) => {
  let addedPet = false;
  let revoked = false;
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

  await page.route('**/api/clients', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer fixture.jwt.token');
    if (route.request().method() === 'POST') {
      addedPet = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          client: { id: 'cccccccc-1111-4111-8111-111111111112', name: 'Marcus Sterling', phone: '415-555-0144', email: null },
          pet: { id: 'bbbbbbbb-1111-4111-8111-111111111112', client_id: 'cccccccc-1111-4111-8111-111111111112', name: 'Koda', breed: 'Samoyed', weight_lbs: '48.50' },
        }),
      });
      return;
    }
    if (revoked) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'An active staff membership is required.' }),
      });
      return;
    }
    const pets = [
      {
        id: 'bbbbbbbb-1111-4111-8111-111111111111',
        client_id: 'cccccccc-1111-4111-8111-111111111111',
        pet_name: 'Bello',
        breed: 'Goldendoodle',
        weight_lbs: 32.5,
        client_name: 'Sophia Chen-Alvarez',
        client_phone: '415-890-4829',
        client_email: 'sophia@example.invalid',
      },
      ...(addedPet ? [{
        id: 'bbbbbbbb-1111-4111-8111-111111111112',
        client_id: 'cccccccc-1111-4111-8111-111111111112',
        pet_name: 'Koda',
        breed: 'Samoyed',
        weight_lbs: 48.5,
        client_name: 'Marcus Sterling',
        client_phone: '415-555-0144',
        client_email: null,
      }] : []),
    ];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'supabase_clients_pets',
        business_id: '11111111-1111-4111-8111-111111111111',
        as_of: '2026-11-09T14:00:00Z',
        client_count: pets.length,
        pet_count: pets.length,
        pets,
      }),
    });
  });

  await page.goto('/dashboard/clients/live');
  await expect(page.getByRole('heading', { name: 'Salon clients & pets' })).toBeVisible();
  await expect(page.getByText('1 pet · 1 client · Source: Supabase')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Goldendoodle' })).toBeVisible();

  await page.locator('summary').filter({ hasText: 'Register client & pet' }).click();
  await page.getByLabel('Client name').fill('Marcus Sterling');
  await page.getByLabel('Client phone').fill('415-555-0144');
  await page.getByLabel('Pet name').fill('Koda');
  await page.getByLabel('Breed').fill('Samoyed');
  await page.getByLabel('Weight in lbs (optional)').fill('48.5');
  await page.getByRole('button', { name: 'Save client & pet' }).click();

  await expect(page.getByText('2 pets · 2 clients · Source: Supabase')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Samoyed' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '48.5 lbs' })).toBeVisible();

  revoked = true;
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'An active staff membership is required.' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Roster unavailable');
});

