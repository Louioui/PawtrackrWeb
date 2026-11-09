import { expect, test } from '@playwright/test';

test('retention scenario keeps sample value separate from sent messages and earned revenue', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/retention');
  await expect(page.getByText('Illustrative retention scenario · no messages or billing')).toBeVisible();
  const valueCard = page.getByText('Sample prior package value').locator('..');
  await expect(valueCard).toContainText('$528.00');
  await expect(valueCard).toContainText('not expected revenue');

  await page.getByRole('button', { name: 'Preview overdue recall batch' }).click();
  await expect(page.getByText(/Recall preview prepared for 3 overdue sample pets.*No SMS was sent/)).toBeVisible();
  await expect(valueCard).toContainText('$528.00');
  await expect(page.getByRole('button', { name: 'Preview overdue recall batch' })).toBeDisabled();

  await page.getByRole('button', { name: 'Preview $139/mo membership' }).first().click();
  await expect(page.getByText(/No subscription was created or charged/)).toBeVisible();
  await expect(page.getByText('Sample Monthly List Value').locator('..')).toContainText('$5,029.00/mo');
  const tour = page.getByRole('button', { name: 'Open Tour & Concierge' });
  expect((await tour.boundingBox())!.y).toBeGreaterThan((await page.getByText('Bello', { exact: true }).boundingBox())!.y);
  expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(390);
});
