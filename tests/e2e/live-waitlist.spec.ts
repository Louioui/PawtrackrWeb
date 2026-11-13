import { expect, test } from '@playwright/test';

test('Slice 6 waitlist endpoints require an authorized staff session (WF02, WF15, WF38, WF39)', async ({
  request,
}) => {
  // 1. Waitlist Queue GET requires auth
  const waitlistGet = await request.get('/api/waitlist');
  expect(waitlistGet.status()).toBe(401);

  // 2. Add to Waitlist POST requires auth (WF02)
  const waitlistPost = await request.post('/api/waitlist', {
    data: {
      clientId: '00000000-0000-0000-0000-000000000000',
      petId: '00000000-0000-0000-0000-000000000000',
      servicePackage: 'Full Groom',
    },
  });
  expect(waitlistPost.status()).toBe(401);

  // 3. Generate Slot Offer POST requires auth (WF15)
  const offerPost = await request.post('/api/waitlist/offers', {
    data: {
      waitlistEntryId: '00000000-0000-0000-0000-000000000000',
      offeredStart: '2026-11-20T10:00:00Z',
      offeredEnd: '2026-11-20T11:00:00Z',
      assignedStaffId: '00000000-0000-0000-0000-000000000000',
    },
  });
  expect(offerPost.status()).toBe(401);

  // 4. Claim Offer rejects invalid UUID / token (400)
  const claimInvalid = await request.post('/api/waitlist/offers/invalid-uuid/claim', {
    data: { claimToken: 'invalid' },
  });
  expect(claimInvalid.status()).toBe(400);
});

test('live waitlist workspace renders sign-in gate and responsive layout at mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/waitlist/live');

  // Verify header and gate
  await expect(page.getByRole('heading', { name: 'Smart Waitlist & Slot Hold Engine' })).toBeVisible();
  await expect(page.getByPlaceholder('staff@pawtrackr.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In to Live Waitlist' })).toBeVisible();

  // Verify responsive width fit without horizontal overflow (Apple-grade fit)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
