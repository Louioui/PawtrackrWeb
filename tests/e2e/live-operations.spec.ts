import { expect, test } from '@playwright/test';

test('operations and floor stage APIs require a signed-in staff session', async ({ request }) => {
  // 1. Day state endpoint requires session
  const dayGet = await request.get('/api/operations/day');
  expect(dayGet.status()).toBe(401);

  const dayPost = await request.post('/api/operations/day', {
    data: { salon_date: '2026-11-13' },
  });
  expect(dayPost.status()).toBe(401);

  // 2. Check-in endpoint requires session
  const checkIn = await request.post(
    '/api/visits/11111111-1111-4111-8111-111111111111/check-in',
    {
      data: { collector_name: 'Alice Parent' },
    },
  );
  expect(checkIn.status()).toBe(401);

  // 3. Stage progression endpoint requires session
  const stage = await request.post(
    '/api/visits/11111111-1111-4111-8111-111111111111/stage',
    {
      data: { action: 'advance_stage', target_stage: 'bathing', client_version: 1 },
    },
  );
  expect(stage.status()).toBe(401);

  // 4. Release endpoint requires session
  const release = await request.post(
    '/api/visits/11111111-1111-4111-8111-111111111111/release',
    {
      data: { released_to_name: 'Alice Parent' },
    },
  );
  expect(release.status()).toBe(401);

  // 5. Digital waiver endpoint requires session
  const waiver = await request.post('/api/waivers', {
    data: {
      client_id: '11111111-1111-4111-8111-111111111111',
      pet_id: '22222222-2222-4222-8222-222222222222',
      signer_name: 'Alice Parent',
      agreed: true,
    },
  });
  expect(waiver.status()).toBe(401);

  // 6. Staff invitation endpoint requires session
  const invite = await request.post('/api/staff/invitations', {
    data: { email: 'groomer@example.com', role: 'groomer' },
  });
  expect(invite.status()).toBe(401);
});

test('live operations page is accessible and displays staff sign-in form at mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/operations/live');

  await expect(
    page.getByRole('heading', { name: 'Operations Command Sign-in' }),
  ).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign In to Command Center' }),
  ).toBeVisible();

  // Verify responsive width fit
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    390,
  );
});
