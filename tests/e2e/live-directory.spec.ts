import { expect, test } from '@playwright/test';

test('live public directory shows a source-backed empty state and no booking CTA', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/portal/live');
  await expect(page.getByRole('heading', { name: 'Find a salon' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No salons are listed yet' })).toBeVisible();
  await expect(page.getByText('Source: Pawtrackr public booking catalog.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Book Appointment' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.goto('/portal/live/unknown-salon');
  await expect(page.getByText('This page could not be found.')).toBeVisible();
});
