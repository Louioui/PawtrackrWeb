import { expect, test } from '@playwright/test';

test('POS and exception endpoints require an authorized staff session', async ({ request }) => {
  // 1. Checkout endpoint requires auth
  const checkout = await request.post('/api/pos/checkout', {
    data: {
      visitId: '11111111-1111-4111-8111-111111111111',
      subtotal: 75.0,
      discount: 0,
      tax: 6.0,
      tip: 15.0,
      amount: 96.0,
      tenderType: 'cash',
    },
  });
  expect(checkout.status()).toBe(401);

  // 2. Receipt retrieval requires auth
  const receipt = await request.get('/api/pos/receipt/11111111-1111-4111-8111-111111111111');
  expect(receipt.status()).toBe(401);

  // 3. Surcharge request requires auth
  const surchargePost = await request.post(
    '/api/visits/11111111-1111-4111-8111-111111111111/surcharge',
    {
      data: {
        amount: 25.0,
        extraTimeMinutes: 20,
        reasonType: 'matting',
        notes: 'Severe matted undercoat requires de-matting treatment',
      },
    },
  );
  expect(surchargePost.status()).toBe(401);

  // 4. Surcharge resolution requires auth
  const surchargeResolve = await request.post(
    '/api/visits/11111111-1111-4111-8111-111111111111/surcharge',
    {
      data: {
        action: 'resolve',
        surchargeId: '22222222-2222-4222-8222-222222222222',
        approved: true,
        clientConsented: true,
      },
    },
  );
  expect(surchargeResolve.status()).toBe(401);

  // 5. Safety stop / incident report requires auth
  const safetyStop = await request.post(
    '/api/visits/11111111-1111-4111-8111-111111111111/safety-stop',
    {
      data: {
        reason: 'Pet displayed extreme aggression and bit handler shears',
        incidentType: 'dog_bite',
        severity: 'moderate',
        firstAidNotes: 'Antiseptic applied to hand scratch',
        vetContacted: false,
        suggestedCharge: 35.0,
      },
    },
  );
  expect(safetyStop.status()).toBe(401);

  // 6. Refund endpoint requires auth
  const refund = await request.post('/api/pos/refund', {
    data: {
      transactionId: '33333333-3333-4333-8333-333333333333',
      amount: 45.0,
      reason: 'Customer reported service was not completed as agreed',
    },
  });
  expect(refund.status()).toBe(401);
});

test('live POS register page is accessible and displays staff sign-in form at mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/pos/live');

  await expect(page.getByRole('heading', { name: 'Live POS Register Sign In' })).toBeVisible();
  await expect(page.getByLabel('Staff Email')).toBeVisible();
  await expect(page.getByLabel('Staff Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Access POS Register' })).toBeVisible();

  // Verify responsive width fit without horizontal overflow
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
