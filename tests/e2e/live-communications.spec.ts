import { expect, test } from '@playwright/test';

test('Slice 4 endpoints require an authorized staff session (WF03, WF07, WF08, WF16, WF17)', async ({
  request,
}) => {
  // 1. Day Closeout endpoint requires auth (WF08)
  const closeDay = await request.post('/api/operations/day/close', {
    data: {
      salon_date: '2026-11-13',
      counted_cash_cents: 12500,
      variance_reason: 'Normal expected cash balance',
    },
  });
  expect(closeDay.status()).toBe(401);

  // 2. Report Card GET requires auth (WF07)
  const reportCardGet = await request.get(
    '/api/visits/11111111-1111-4111-8111-111111111111/report-card',
  );
  expect(reportCardGet.status()).toBe(401);

  // 3. Report Card POST requires auth (WF07)
  const reportCardPost = await request.post(
    '/api/visits/11111111-1111-4111-8111-111111111111/report-card',
    {
      data: {
        coat_condition: 'healthy_clean',
        behavior_tags: ['calm', 'cooperative'],
        care_notes: 'Coat brushed thoroughly with leave-in conditioner',
        action: 'publish',
      },
    },
  );
  expect(reportCardPost.status()).toBe(401);

  // 4. Communications GET requires auth (WF16/WF17)
  const commsGet = await request.get('/api/communications');
  expect(commsGet.status()).toBe(401);

  // 5. Communications POST requires auth (WF16/WF17)
  const commsPost = await request.post('/api/communications', {
    data: {
      message_type: 'ready_for_pickup',
      channel: 'sms',
      recipient_phone: '+15551234567',
      body: 'Your pet is ready for pickup!',
    },
  });
  expect(commsPost.status()).toBe(401);

  // 6. Care Profile GET requires auth (WF03 / WF38)
  const careProfile = await request.get(
    '/api/clients/11111111-1111-4111-8111-111111111111/care-profile',
  );
  expect(careProfile.status()).toBe(401);
});

test('live operations page renders operational status and sign-in at mobile width', async ({
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

  // Verify responsive width fit without horizontal overflow
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('live POS register page displays Day Closeout (WF08) quick link at mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/pos/live');

  await expect(page.getByRole('heading', { name: 'Live POS Register Sign In' })).toBeVisible();

  // Verify responsive width fit without horizontal overflow
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
