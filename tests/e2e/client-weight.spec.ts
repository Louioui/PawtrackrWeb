import { expect, test } from '@playwright/test';
import { BUSINESS_CONFIGS, CLIENTS, INITIAL_TRANSACTIONS, INITIAL_VISITS, PETS } from '../../src/lib/mock-tenant-data';

test.use({ viewport: { width: 390, height: 844 } });

test('client weight chart and dated log agree on all observations', async ({ page }) => {
  await page.goto('/client/cl-101');
  await expect(page.getByRole('heading', { name: 'Weight history' })).toBeVisible();
  await expect(page.getByText('Latest recorded weight:')).toContainText('24.6 lbs (2026-11-07)');
  const chart = page.getByRole('img', { name: /Bello weight history from 2026-05-12.*2026-11-07/ });
  await expect(chart).toBeVisible();
  await expect(chart.locator('circle')).toHaveCount(4);
  await expect(page.getByText('24.6 lbs', { exact: true }).last()).toBeVisible();
  const bounds = await chart.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});

test('client weight chart and page fit a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/client/cl-101');
  const chart = page.getByRole('img', { name: /Bello weight history/ });
  await expect(chart).toBeVisible();
  const bounds = await chart.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('one observation has no invented weight trend', async ({ page }) => {
  await page.goto('/client/cl-106');
  await expect(page.getByRole('heading', { name: 'Weight history' })).toBeVisible();
  await expect(page.getByText('One observation · no trend yet')).toBeVisible();
  await expect(page.getByRole('img', { name: /Zephyr weight history/ })).toHaveCount(0);
});

test('dated history wins when the undated profile weight disagrees', async ({ page }) => {
  await page.addInitScript((store) => {
    window.localStorage.setItem('pawtrackr_universal_store_v1', JSON.stringify(store));
  }, {
    configs: BUSINESS_CONFIGS,
    clients: CLIENTS,
    visits: INITIAL_VISITS,
    transactions: INITIAL_TRANSACTIONS,
    pets: PETS.map((pet) => pet.id === 'pet-101' ? { ...pet, weight_lbs: 99.9 } : pet),
    updatedAt: Date.now(),
  });
  await page.goto('/client/cl-101');
  await expect(page.getByText('Latest recorded weight:')).toContainText('24.6 lbs (2026-11-07)');
  await expect(page.getByText('99.9 lbs')).toHaveCount(0);
});

test('small positive weights keep the chart axis at zero or above', async ({ page }) => {
  await page.addInitScript((store) => {
    window.localStorage.setItem('pawtrackr_universal_store_v1', JSON.stringify(store));
  }, {
    configs: BUSINESS_CONFIGS, clients: CLIENTS, visits: INITIAL_VISITS, transactions: INITIAL_TRANSACTIONS,
    pets: PETS.map((pet) => pet.id === 'pet-101' ? { ...pet, weight_history: [
      { date: '2026-11-01', weight_lbs: 0.1 }, { date: '2026-11-07', weight_lbs: 0.2 },
    ] } : pet),
    updatedAt: Date.now(),
  });
  await page.goto('/client/cl-101');
  await expect(page.getByRole('img', { name: /Chart range 0\.0 to 1\.0 pounds/ })).toBeVisible();
});

test('unknown client does not show another client profile', async ({ page }) => {
  await page.goto('/client/no-such-demo-client');
  await expect(page.getByText('This demo client or pet profile is unavailable.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Weight history' })).toHaveCount(0);
});
