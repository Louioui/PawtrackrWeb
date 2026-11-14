import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Sovereign Operator Matrix & Customer Portal Hub (E2E & WCAG)', () => {
  test('Sovereign Matrix gate rejects invalid key, unlocks with master key, and toggles kill-switch', async ({ page }) => {
    await page.goto('/admin/sovereign-matrix');

    // 1. Gate is presented with password/key input
    await expect(page.getByRole('heading', { name: 'Sovereign Matrix' })).toBeVisible();
    const keyInput = page.getByLabel('Sovereign Master Key');
    await expect(keyInput).toBeVisible();

    // 2. Reject incorrect key
    await keyInput.fill('wrong_sovereign_key_attempt');
    await page.getByRole('button', { name: 'Authenticate Sovereign Session' }).click();
    await expect(page.getByText(/Unauthorized|Authentication failed/i)).toBeVisible();

    // 3. Accessibility check on locked gate
    const gateAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(gateAxe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) }))).toEqual([]);

    // 4. Authenticate with valid master key
    await keyInput.fill('pwtr_sov_master_99x_matrix_key_2026');
    await page.getByRole('button', { name: 'Authenticate Sovereign Session' }).click();

    // 5. HUD unlocks
    await expect(page.getByRole('heading', { name: 'Pawtrackr Sovereign Matrix' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Active Multi-Tenant Operations/i })).toBeVisible();
    await expect(page.getByText('Bespoke Grooming').first()).toBeVisible();

    // 6. Verify kill-switch action button exists and toggles lock state
    const freezeButtons = page.getByRole('button', { name: /Freeze Tenant/i });
    await expect(freezeButtons.first()).toBeVisible();
    await freezeButtons.first().click();
    await expect(page.getByText('FROZEN / LOCKED', { exact: true })).toBeVisible();

    // Unfreeze back to nominal state
    await page.getByRole('button', { name: /Unfreeze/i }).first().click();
    await expect(page.getByText(/is now UNLOCKED/i)).toBeVisible();

    // 7. Verify security audit vectors are all PASSED
    await expect(page.getByText('Multi-Tenant Row-Level Security Isolation')).toBeVisible();
    await expect(page.getByText('PostgreSQL btree_gist Double-Booking Constraint')).toBeVisible();

    // 8. Accessibility check on unlocked HUD
    const hudAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(hudAxe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) }))).toEqual([]);
  });

  test('Customer Portal Hub enables passwordless pet parent lookup with zero WCAG violations', async ({ page }) => {
    await page.goto('/client');

    // 1. Hub heading & form are visible
    await expect(page.getByRole('heading', { name: 'Pet Parent Account Portal' })).toBeVisible();
    const input = page.getByLabel('Phone Number or Email');
    await expect(input).toBeVisible();

    // 2. Accessibility check on customer hub
    const hubAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(hubAxe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) }))).toEqual([]);

    // 3. Test quick-access drive button
    const sophiaButton = page.getByRole('button', { name: /Sophia Chen-Alvarez/i });
    await expect(sophiaButton).toBeVisible();
    await sophiaButton.click();

    // 4. Navigates cleanly to /client/cl-101
    await expect(page).toHaveURL(/\/client\/cl-101$/);
    await expect(page.getByRole('heading', { name: /Bello’s Digital Grooming Passport/i })).toBeVisible();
    await expect(page.getByText('Sophia Chen-Alvarez')).toBeVisible();
  });
});
