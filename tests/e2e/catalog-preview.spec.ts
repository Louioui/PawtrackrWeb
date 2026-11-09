import { expect, test } from '@playwright/test';

test('saved demo package appears in its salon portal and changes the quote', async ({ page }) => {
  await page.goto('/dashboard/settings');
  const packageForm = page.locator('form').filter({ hasText: '+ Add Custom Salon Package' });
  await packageForm.getByPlaceholder('Package Title (e.g. Giant Breed Sanctuary)').fill('QA Coat Package');
  await packageForm.getByPlaceholder('Price ($)').fill('72.50');
  await packageForm.getByPlaceholder('Duration (mins)').fill('60');
  await packageForm.getByRole('button', { name: 'Add Package' }).click();
  await page.getByRole('button', { name: 'Save demo settings' }).click();
  await expect(page.getByText(/Demo settings saved in this browser/)).toBeVisible();

  await page.goto('/dashboard');
  await page.getByRole('button', { name: '4-Step POS', exact: true }).first().click();
  await expect(page.getByText('QA Coat Package')).toBeVisible();

  await page.goto('/portal/bespoke-grooming');
  const customPackage = page.getByRole('button', { name: /QA Coat Package/ });
  await expect(customPackage).toBeVisible();
  await customPackage.click();
  await expect(customPackage).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('$90.50')).toBeVisible();

  await page.goto('/portal/splash-grooming');
  await expect(page.getByRole('button', { name: /QA Coat Package/ })).toHaveCount(0);
});
