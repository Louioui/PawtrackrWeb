import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';
import { BUSINESS_CONFIGS, CLIENTS, INITIAL_TRANSACTIONS, INITIAL_VISITS, PETS, TENANT_BESPOKE_ID, TENANT_SPLASH_ID } from '../../src/lib/mock-tenant-data';

test('competing catalog edits preserve the second browser without overwriting the server', async ({ browser, baseURL }) => {
  let serverStore = {
    configs: structuredClone(BUSINESS_CONFIGS), clients: structuredClone(CLIENTS), pets: structuredClone(PETS),
    visits: structuredClone(INITIAL_VISITS), transactions: structuredClone(INITIAL_TRANSACTIONS), updatedAt: 1,
  };
  const handleStore = async (route: Route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { ok: true, store: serverStore } });
      return;
    }
    if (request.headers()['if-match'] !== String(serverStore.updatedAt)) {
      await route.fulfill({ status: 409, json: { error: 'Demo ledger changed.' } });
      return;
    }
    serverStore = { ...request.postDataJSON(), updatedAt: serverStore.updatedAt + 1 };
    await route.fulfill({ json: { ok: true, store: serverStore } });
  };

  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    await first.route('**/api/store', handleStore);
    await second.route('**/api/store', handleStore);
    const editor = await first.newPage();
    const otherEditor = await second.newPage();
    await Promise.all([
      editor.goto(`${baseURL}/dashboard/settings`),
      otherEditor.goto(`${baseURL}/dashboard/settings`),
    ]);
    await editor.getByLabel('Weekly demo checkout target ($)').fill('70');
    await editor.getByRole('button', { name: 'Save demo settings' }).click();
    await expect.poll(() => serverStore.configs[TENANT_BESPOKE_ID].custom_settings.weekly_checkout_target_cents).toBe(7000);
    await expect.poll(() => editor.evaluate(() => localStorage.getItem('pawtrackr_pending_demo_store_v1'))).toBeNull();

    await otherEditor.getByLabel('Weekly demo checkout target ($)').fill('80');
    await otherEditor.getByRole('button', { name: 'Save demo settings' }).click();
    await expect(otherEditor.getByRole('alert').filter({ hasText: 'Another browser changed the demo ledger' })).toBeVisible();
    expect(serverStore.configs[TENANT_BESPOKE_ID].custom_settings.weekly_checkout_target_cents).toBe(7000);
    expect(await otherEditor.evaluate(() => Boolean(localStorage.getItem('pawtrackr_pending_demo_store_v1')))).toBe(true);
    await otherEditor.goto(`${baseURL}/dashboard/analytics`);
    await expect(otherEditor.getByRole('region', { name: 'Completed checkout total' }).getByRole('status')).toContainText('Sync conflict · local edits preserved');
  } finally {
    await first.close();
    await second.close();
  }
});

test('different salons can save targets from stale browser snapshots', async ({ browser, baseURL }) => {
  let serverStore = {
    configs: structuredClone(BUSINESS_CONFIGS), clients: structuredClone(CLIENTS), pets: structuredClone(PETS),
    visits: structuredClone(INITIAL_VISITS), transactions: structuredClone(INITIAL_TRANSACTIONS), updatedAt: 1,
  };
  const handleStore = async (route: Route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { ok: true, store: serverStore } });
      return;
    }
    if (request.headers()['if-match'] !== String(serverStore.updatedAt)) {
      await route.fulfill({ status: 409, json: { error: 'Demo ledger changed.' } });
      return;
    }
    serverStore = { ...request.postDataJSON(), updatedAt: serverStore.updatedAt + 1 };
    await route.fulfill({ json: { ok: true, store: serverStore } });
  };

  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    await first.route('**/api/store', handleStore);
    await second.route('**/api/store', handleStore);
    const bespokeEditor = await first.newPage();
    const splashEditor = await second.newPage();
    await Promise.all([
      bespokeEditor.goto(`${baseURL}/dashboard/settings`),
      splashEditor.goto(`${baseURL}/dashboard/settings`),
    ]);
    await splashEditor.getByRole('button', { name: 'Splash Mobile Van Fleet' }).click();
    await bespokeEditor.getByLabel('Weekly demo checkout target ($)').fill('70');
    await bespokeEditor.getByRole('button', { name: 'Save demo settings' }).click();
    await expect.poll(() => serverStore.configs[TENANT_BESPOKE_ID].custom_settings.weekly_checkout_target_cents).toBe(7000);
    await splashEditor.getByLabel('Weekly demo checkout target ($)').fill('80');
    await splashEditor.getByRole('button', { name: 'Save demo settings' }).click();
    await expect.poll(() => serverStore.configs[TENANT_SPLASH_ID].custom_settings.weekly_checkout_target_cents).toBe(8000);
    expect(serverStore.configs[TENANT_BESPOKE_ID].custom_settings.weekly_checkout_target_cents).toBe(7000);
    await expect.poll(() => splashEditor.evaluate(() => localStorage.getItem('pawtrackr_pending_demo_store_v1'))).toBeNull();
    await expect(splashEditor.getByRole('alert').filter({ hasText: 'Another browser changed the demo ledger' })).toHaveCount(0);
  } finally {
    await first.close();
    await second.close();
  }
});
