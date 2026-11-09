import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('first offline reload keeps analytics interactive after worker activation', async ({ page, context }) => {
  await page.goto('/dashboard/analytics');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cachedStatic = await page.evaluate(async () => {
    const names = await caches.keys();
    const paths = (await Promise.all(names.map(async (name) =>
      (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname)
    ))).flat();
    return paths.filter((path) => path.startsWith('/_next/static/')).length;
  });
  expect(cachedStatic).toBeGreaterThan(0);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Bespoke Grooming Studio performance' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Completed checkout total' }).getByRole('status')).toContainText('local snapshot');
  await page.getByRole('combobox', { name: 'Time window' }).selectOption('90');
  await expect(page.locator('tbody tr')).toHaveCount(90);
  await context.setOffline(false);
});

test('demo service worker caches app shell but no API or client response', async ({ page, context }) => {
  await page.goto('/dashboard/analytics');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.reload();

  const apiResponse = await page.evaluate(() => fetch('/api/store').then((response) => response.status));
  // The production demo endpoint is disabled; the shared IP limiter can reject it first during a full suite.
  expect([503, 429]).toContain(apiResponse);
  const cachedBeforeClient = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = (await Promise.all(names.map(async (name) =>
      (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname)
    ))).flat();
    return urls;
  });
  expect(cachedBeforeClient).toContain('/dashboard/analytics');
  expect(cachedBeforeClient.some((path) => path.startsWith('/api/'))).toBe(false);

  await page.goto('/client/cl-101');
  const cachedClient = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.map(async (name) =>
      (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname)
    ))).flat().some((path) => path.startsWith('/client/'));
  });
  expect(cachedClient).toBe(false);

  await page.goto('/dashboard/analytics');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Bespoke Grooming Studio performance' })).toBeVisible();
  await context.setOffline(false);
});
