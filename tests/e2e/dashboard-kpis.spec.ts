import { expect, test } from '@playwright/test';

test('command center labels recorded visits and reports checkout math mismatch', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pawtrackr_universal_store_v1', JSON.stringify({
      configs: {}, clients: [], pets: [], visits: [],
      transactions: [{
        id: 'mismatched-checkout', business_id: '11111111-1111-4111-8111-111111111111',
        visit_id: 'missing-visit', subtotal: 10, discount: 0, tax: 0, tip: 0,
        amount: 11, payment_method: 'cash', status: 'completed',
        created_at: new Date().toISOString(),
      }],
      updatedAt: Date.now(),
    }));
  });
  await page.goto('/dashboard');
  await expect(page.getByText('Recorded Salon Visits')).toBeVisible();
  await expect(page.getByText('0 Visits')).toBeVisible();
  await expect(page.getByText('Recorded Checkout Math Difference')).toBeVisible();
  await expect(page.getByText('$1.00')).toBeVisible();
  await expect(page.getByText('CHECK TOTALS')).toBeVisible();
  await expect(page.getByText('No cash drawer count.')).toBeVisible();
});
