import { expect, test } from '@playwright/test';
import { BUSINESS_CONFIGS, CLIENTS, INITIAL_TRANSACTIONS, INITIAL_VISITS, PETS, TENANT_BESPOKE_ID } from '../../src/lib/mock-tenant-data';

test('portal marks overlapping groomer times unavailable from the demo schedule', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T18:00:00Z') });
  const store = {
    configs: BUSINESS_CONFIGS, clients: CLIENTS, pets: PETS, transactions: INITIAL_TRANSACTIONS,
    visits: [...INITIAL_VISITS, {
      ...INITIAL_VISITS[0], id: 'booked-tomorrow', business_id: TENANT_BESPOKE_ID,
      staff_id: 'st-101', status: 'booked', scheduled_time: '2026-11-10 09:00 AM', duration_minutes: 120,
    }],
    updatedAt: Date.now(),
  };
  await page.addInitScript((snapshot) => localStorage.setItem('pawtrackr_universal_store_v1', JSON.stringify(snapshot)), store);
  await page.goto('/portal/bespoke-grooming');
  await expect(page.locator('input[type="date"]')).toHaveValue('2026-11-10');
  await expect(page.getByRole('button', { name: '10:30 AM unavailable' })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'selected time is now occupied' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirm Booking for/ })).toBeDisabled();
  await page.getByRole('button', { name: '12:00 PM', exact: true }).click();
  await expect(page.getByRole('button', { name: /Confirm Booking for/ })).toBeEnabled();
  await page.getByRole('button', { name: /Julian Kwon/ }).click();
  await expect(page.getByRole('button', { name: '10:30 AM', exact: true })).toBeEnabled();
});

test('production demo booking failure never creates a browser visit or confirmation', async ({ page }) => {
  await page.goto('/portal/splash-grooming');
  await expect(page.locator('input[type="date"]')).not.toHaveValue('');
  const visitsBefore = await page.evaluate(() => {
    const raw = localStorage.getItem('pawtrackr_universal_store_v1');
    return raw ? JSON.parse(raw).visits.length : null;
  });

  await page.getByRole('button', { name: /Confirm Booking for/ }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('disabled in production');
  await expect(page.getByText(/Demo booking saved for/)).toHaveCount(0);
  const visitsAfter = await page.evaluate(() => {
    const raw = localStorage.getItem('pawtrackr_universal_store_v1');
    return raw ? JSON.parse(raw).visits.length : null;
  });
  expect(visitsAfter).toBe(visitsBefore);
});
