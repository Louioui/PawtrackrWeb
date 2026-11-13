import { expect, test } from '@playwright/test';

test('Slice 7 mobile fleet dispatch endpoints require an authorized staff session (WF22, PW070, PW071)', async ({
  request,
}) => {
  // 1. Fleet Dispatch GET requires auth (WF22)
  const dispatchGet = await request.get('/api/fleet/dispatch?date=2026-11-13');
  expect(dispatchGet.status()).toBe(401);

  // 2. Van Telemetry Update POST requires auth (PW070)
  const telemetryPost = await request.post('/api/fleet/dispatch', {
    data: {
      station_id: '11111111-1111-4111-8111-111111111111',
      battery_pct: 82,
      water_tank_pct: 75,
      gray_water_pct: 25,
      odometer_miles: 14820,
    },
  });
  expect(telemetryPost.status()).toBe(401);

  // 3. Curbside Stop Transition POST requires auth (PW071)
  const stopAdvance = await request.post(
    '/api/fleet/stops/11111111-1111-4111-8111-111111111111/advance',
    {
      data: {
        next_status: 'curbside_arrived',
      },
    },
  );
  expect(stopAdvance.status()).toBe(401);
});

test('Slice 7 data portability, import, rollback and config copy endpoints require an authorized staff session (WF30, WF33, WF34, PW072, PW073, PW074, PW075)', async ({
  request,
}) => {
  // 1. Dry Run Import POST requires auth (WF30)
  const dryRun = await request.post('/api/import/dry-run', {
    data: {
      source: 'moego',
      raw_csv: 'Client Name,Phone\nTest,555-0100',
    },
  });
  expect(dryRun.status()).toBe(401);

  // 2. Apply Import POST requires auth (PW073)
  const applyImport = await request.post('/api/import/apply', {
    data: {
      source: 'moego',
      raw_csv: 'Client Name,Phone\nTest,555-0100',
      imported_rows: [],
    },
  });
  expect(applyImport.status()).toBe(401);

  // 3. Rollback Import POST requires auth (PW074)
  const rollbackImport = await request.post('/api/import/rollback', {
    data: {
      job_id: '11111111-1111-4111-8111-111111111111',
      reason: 'E2E Rollback Test',
    },
  });
  expect(rollbackImport.status()).toBe(401);

  // 4. Import Jobs GET requires auth
  const importJobs = await request.get('/api/import/jobs');
  expect(importJobs.status()).toBe(401);

  // 5. Tenant Export GET requires auth (WF34 / PW075)
  const exportTenant = await request.get('/api/export/tenant?format=json');
  expect(exportTenant.status()).toBe(401);

  // 6. Salon Config Copy POST requires auth (WF33 / PW072)
  const configCopy = await request.post('/api/config/copy', {
    data: {
      target_business_id: '22222222-2222-4222-8222-222222222222',
      dry_run: true,
    },
  });
  expect(configCopy.status()).toBe(401);
});

test('live mobile fleet workspace renders fleet command and responsive layout at mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/fleet/live');

  // Verify header and navigation shell
  await expect(
    page.getByRole('heading', { name: 'Mobile Van & Hybrid Fleet Dispatch' }),
  ).toBeVisible();
  await expect(page.getByText('Selected Mobile Unit')).toBeVisible();
  await expect(page.getByText('Scheduled Curbside Stops')).toBeVisible();

  // Verify responsive width fit without horizontal overflow (Apple-grade fit)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('live data portability workspace renders competitor import and responsive layout at mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/import/live');

  // Verify header and tab navigation
  await expect(
    page.getByRole('heading', { name: 'Enterprise Data Portability & Competitor Import' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSV Import' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rollback Ledger' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tenant Archive' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy Catalog' })).toBeVisible();

  // Verify responsive width fit without horizontal overflow (Apple-grade fit)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
