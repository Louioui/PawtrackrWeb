import { expect, test } from '@playwright/test';

test('commercial superiority: coat cadence recall matrix, archetype filtering, and retention preview', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard/retention');

  // Verify Header and Value Display
  await expect(page.getByRole('heading', { name: 'Coat Cadence & Retention Preview' })).toBeVisible();
  await expect(page.getByText('Sample prior package value')).toBeVisible();

  // Verify Coat Archetype Filters exist and function
  const allTab = page.getByRole('button', { name: 'All Archetypes' });
  const curledTab = page.getByRole('button', { name: 'Curled Fleece / Doodles' });
  const doubleTab = page.getByRole('button', { name: 'Double Coat' });

  await expect(allTab).toBeVisible();
  await expect(curledTab).toBeVisible();
  await expect(doubleTab).toBeVisible();

  // Filter by Curled Fleece
  await curledTab.click();
  await expect(page.getByText('Winston')).toBeVisible();
  await expect(page.getByText('Cavapoo')).toBeVisible();

  // Filter by Double Coat (empty in sample list)
  await doubleTab.click();
  await expect(page.getByText('Winston')).not.toBeVisible();

  // Reset to All
  await allTab.click();
  await expect(page.getByText('Winston')).toBeVisible();

  // Verify Matting Risk Indicators
  await expect(page.getByText('Sample: 6.5 Wks Since Groom')).toBeVisible();

  // Verify Batch Preview Workflow
  const batchBtn = page.getByRole('button', { name: 'Preview overdue recall batch' });
  await expect(batchBtn).toBeEnabled();
  await batchBtn.click();
  await expect(page.getByText(/Recall preview prepared for 3 overdue sample pets/)).toBeVisible();
  await expect(batchBtn).toBeDisabled();
});
