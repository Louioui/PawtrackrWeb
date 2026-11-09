import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const [name, route] of [
  ['analytics', '/dashboard/analytics'],
  ['client weight history', '/client/cl-101'],
] as const) {
  test(`${name} visualization has no automated WCAG A or AA violations`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    if (name === 'analytics') {
      await expect(page.getByRole('heading', { name: 'Completed checkout total' })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'Weight history' })).toBeVisible();
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  });
}

test('analytics daily values open and close from the keyboard', async ({ page }) => {
  await page.goto('/dashboard/analytics');
  const disclosure = page.locator('summary').filter({ hasText: 'View daily values' });
  const details = disclosure.locator('..');
  await disclosure.focus();
  await expect(disclosure).toBeFocused();
  await disclosure.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('tbody tr')).toHaveCount(30);
  await disclosure.press('Enter');
  await expect(details).not.toHaveAttribute('open', '');
});

test('photo comparison slider responds to keyboard arrows', async ({ page }) => {
  await page.goto('/client/cl-101');
  const slider = page.getByRole('slider', { name: /Before and after photo comparison for Bello on Nov 07, 2026/ });
  await expect(slider).toHaveValue('50');
  await slider.focus();
  await expect(slider).toBeFocused();
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('51');
  await slider.press('ArrowLeft');
  await expect(slider).toHaveValue('50');
});
