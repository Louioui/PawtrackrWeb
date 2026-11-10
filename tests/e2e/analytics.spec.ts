import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const bespoke = '11111111-1111-4111-8111-111111111111';
const splash = '22222222-2222-4222-8222-222222222222';

function fixtureStore() {
  const today = new Date('2026-11-09T18:00:00Z');
  const yesterday = new Date(today.getTime() - 86_400_000);
  return {
    configs: {}, clients: [], pets: [],
    visits: [
      { id: 'fixture-visit-1', business_id: bespoke, client_id: 'fixture-client', pet_id: 'fixture-pet', package_name: 'Bath', addon_ids: ['spa'] },
      { id: 'fixture-visit-2', business_id: bespoke, client_id: 'fixture-client', pet_id: 'fixture-pet', package_name: 'Bath', addon_ids: [] },
    ],
    transactions: [
      { id: 'fixture-transaction-1', business_id: bespoke, visit_id: 'fixture-visit-1', status: 'completed', amount: 12.34, created_at: today.toISOString() },
      { id: 'fixture-transaction-2', business_id: bespoke, visit_id: 'fixture-visit-2', status: 'completed', amount: 20, created_at: yesterday.toISOString() },
      { id: 'fixture-pending', business_id: bespoke, visit_id: 'fixture-visit-2', status: 'pending', amount: 900, created_at: today.toISOString() },
    ],
    updatedAt: Date.now(),
  };
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T18:00:00Z') });
  await page.addInitScript((fixture) => {
    if (!window.localStorage.getItem('pawtrackr_universal_store_v1')) {
      window.localStorage.setItem('pawtrackr_universal_store_v1', JSON.stringify(fixture));
    }
  }, fixtureStore());
});

test('restores filters, shows the exact daily table, and exports labeled cents', async ({ page }) => {
  await page.goto(`/dashboard/analytics?business=${bespoke}&days=7`);
  await expect(page.getByRole('heading', { name: 'Bespoke Grooming Studio performance' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Time window' })).toHaveValue('7');
  await expect(page.getByRole('region', { name: 'Completed checkout total' }).getByText('$32.34')).toBeVisible();
  await page.getByText('View daily values').click();
  await expect(page.locator('tbody tr')).toHaveCount(7);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export daily CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('pawtrackr-demo-checkout-daily-bespoke-grooming');
  const csv = await readFile(await download.path(), 'utf8');
  const rows = csv.trim().split('\r\n');
  expect(rows).toHaveLength(8);
  expect(rows[0]).toBe('business_id,utc_date,recorded_completed_demo_checkout_cents,pending_sync,snapshot_status');
  expect(rows.slice(1).every((row) => row.startsWith(`${bespoke},`))).toBe(true);
  expect(rows.slice(1).reduce((total, row) => total + Number(row.split(',')[2]), 0)).toBe(3234);

  await page.getByRole('combobox', { name: 'Time window' }).selectOption('30');
  await expect(page).toHaveURL(/days=30/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Time window' })).toHaveValue('30');
  await expect(page.getByRole('heading', { name: 'Bespoke Grooming Studio performance' })).toBeVisible();
});

test('mobile chart stays before summary and empty business is explicit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard/analytics?business=${bespoke}&days=90`);
  const chart = page.getByRole('region', { name: 'Completed checkout total' });
  const summary = page.getByRole('region', { name: 'Period summary' });
  await expect(chart.getByRole('img', { name: /Daily completed checkout totals/ })).toBeVisible();
  expect((await chart.boundingBox())!.y).toBeLessThan((await summary.boundingBox())!.y);
  const tourButton = page.getByRole('button', { name: 'Open Tour & Concierge' });
  await expect(tourButton).toBeVisible();
  expect((await tourButton.boundingBox())!.y).toBeGreaterThan((await chart.boundingBox())!.y + (await chart.boundingBox())!.height);
  await page.getByRole('combobox', { name: 'Demo business' }).selectOption(splash);
  await expect(chart.getByText('No completed checkouts in this period.')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`business=${splash}`));
});

test('mobile primary analytics card retains its visual layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard/analytics?business=${bespoke}&days=7`);
  const card = page.getByRole('region', { name: 'Completed checkout total' });
  await expect(card.getByText('$32.34')).toBeVisible();
  await expect(card.getByRole('status')).toContainText('Server unavailable');
  // The committed baseline image was captured on macOS. Fonts render differently
  // on Linux, so the pixel comparison runs only where a baseline exists; the
  // content assertions above still run everywhere.
  if (process.platform === 'darwin') {
    await expect(card).toHaveScreenshot('analytics-mobile-primary-card.png', { animations: 'disabled' });
  }
});

test('period summary comparison fits a narrow phone without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`/dashboard/analytics?business=${bespoke}&days=7`);
  const summary = page.getByRole('region', { name: 'Period summary' });
  await expect(summary.getByText('Completed checkout total')).toBeVisible();
  await expect(summary.getByText('Average checkout')).toBeVisible();
  const widths = await summary.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('owner-set weekly target shows UTC pacing for the selected salon', async ({ page }) => {
  await page.goto('/dashboard/settings');
  await page.getByLabel('Weekly demo checkout target ($)').fill('70');
  await page.getByRole('button', { name: 'Save demo settings' }).click();
  await expect(page.getByText(/Demo settings saved in this browser/)).toBeVisible();

  await page.goto(`/dashboard/analytics?business=${bespoke}&days=7`);
  const pacing = page.getByLabel('Weekly demo checkout pacing');
  await expect(pacing).toContainText('$12.34 / $70.00');
  await expect(pacing).toContainText('UTC 2026-11-09 through 2026-11-09');
  await expect(pacing).toContainText('$2.34 ahead');
  await expect(pacing.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '$12.34 of $70.00');

  await page.getByRole('combobox', { name: 'Demo business' }).selectOption(splash);
  await expect(page.getByLabel('Weekly demo checkout pacing')).toHaveCount(0);
});

test('later checkout timestamp today stays out of current totals', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const key = 'pawtrackr_universal_store_v1';
    const store = JSON.parse(window.localStorage.getItem(key)!);
    store.transactions.push({ id: 'future-today', business_id: '11111111-1111-4111-8111-111111111111', visit_id: 'fixture-visit-1', status: 'completed', amount: 80, created_at: '2026-11-09T19:00:00Z' });
    window.localStorage.setItem(key, JSON.stringify(store));
  });
  await page.goto(`/dashboard/analytics?business=${bespoke}&days=7`);
  await expect(page.getByRole('region', { name: 'Completed checkout total' }).getByText('$32.34')).toBeVisible();
  await expect(page.getByText('$112.34')).toHaveCount(0);
});

test('period total compares the prior window only through the same UTC time', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const key = 'pawtrackr_universal_store_v1';
    const store = JSON.parse(window.localStorage.getItem(key)!);
    store.transactions.push(
      { id: 'prior-in', business_id: '11111111-1111-4111-8111-111111111111', visit_id: 'fixture-visit-1', status: 'completed', amount: 20, created_at: '2026-11-02T17:00:00Z' },
      { id: 'prior-late', business_id: '11111111-1111-4111-8111-111111111111', visit_id: 'fixture-visit-1', status: 'completed', amount: 100, created_at: '2026-11-02T19:00:00Z' },
    );
    window.localStorage.setItem(key, JSON.stringify(store));
  });
  await page.goto(`/dashboard/analytics?business=${bespoke}&days=7`);
  const summary = page.getByRole('region', { name: 'Period summary' });
  await expect(summary).toContainText('Prior 7 days through the same UTC time: $20.00');
  await expect(summary).toContainText('+$12.34 (+61.7%) vs prior comparable window');
});

test('offline and reconnect keep the last chart while source status changes', async ({ page, context }) => {
  await page.route('**/api/store', (route) => route.fulfill({ json: { ok: true, store: fixtureStore() } }));
  await page.goto(`/dashboard/analytics?business=${bespoke}&days=7`);
  const chart = page.getByRole('region', { name: 'Completed checkout total' });
  const status = chart.getByRole('status');
  await expect(status).toContainText('Server reached');
  await expect(chart.getByText('$32.34')).toBeVisible();

  await context.setOffline(true);
  await expect(status).toContainText('Browser offline');
  await expect(chart.getByText('$32.34')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export daily CSV' }).click();
  const offlineDownload = await downloadPromise;
  const offlineCsv = await readFile(await offlineDownload.path(), 'utf8');
  expect(offlineCsv.trim().split('\r\n').slice(1).every((row) => row.endsWith(',browser_offline'))).toBe(true);

  await context.setOffline(false);
  await expect(status).toContainText('Server reached');
  await expect(chart.getByText('$32.34')).toBeVisible();
});
