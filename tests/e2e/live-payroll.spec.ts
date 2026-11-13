import { expect, test } from '@playwright/test';

test('Slice 5 payroll endpoints require an authorized staff session (WF08, WF28, WF34)', async ({
  request,
}) => {
  // 1. Payroll Ledger GET requires auth (WF28)
  const payrollGet = await request.get('/api/payroll');
  expect(payrollGet.status()).toBe(401);

  // 2. Pay Period Lock POST requires auth (WF08 / PW060)
  const lockPost = await request.post('/api/payroll/period/lock', {
    data: {
      period_start: '2026-11-01',
      period_end: '2026-11-14',
      tip_pool_mode: 'direct',
      bather_pool_pct: 15.0,
      notes: 'Bi-weekly closeout test',
    },
  });
  expect(lockPost.status()).toBe(401);

  // 3. Payroll Export GET requires auth (WF34)
  const exportGusto = await request.get('/api/payroll/export?format=gusto');
  expect(exportGusto.status()).toBe(401);

  const exportQuickBooks = await request.get('/api/payroll/export?format=quickbooks');
  expect(exportQuickBooks.status()).toBe(401);
});

test('live payroll command workspace renders sign-in and responsive layout at mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/payroll/live');

  await expect(page.getByRole('heading', { name: 'Staff Payroll Command' })).toBeVisible();
  await expect(page.getByPlaceholder('manager@pawtrackr.com')).toBeVisible();
  await expect(page.getByPlaceholder('••••••••••••')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Authenticate Payroll Session' })).toBeVisible();

  // Verify responsive width fit without horizontal overflow (Apple-grade fit)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
