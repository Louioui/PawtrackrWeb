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

test('live appointments visualization has no automated WCAG A or AA violations across portrait and desktop', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.addInitScript(() => {
    localStorage.setItem('sb-jdauajfcmsaamhgyklng-auth-token', JSON.stringify({
      access_token: 'fixture.jwt.token',
      refresh_token: 'fixture-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 1893456000,
      user: {
        id: 'aaaaaaaa-0000-4000-8000-000000000000',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'fixture@example.invalid',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-11-09T00:00:00Z',
      },
    }));
  });
  await page.route('**/api/reservations?date=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'supabase_visits',
        business_id: '11111111-1111-4111-8111-111111111111',
        date: today,
        timezone: 'UTC',
        as_of: `${today}T12:00:00Z`,
        reservations: [{
          id: 'bbbbbbbb-1111-4111-8111-111111111111',
          scheduled_time: `${today}T09:00:00Z`,
          reservation_end: `${today}T10:15:00Z`,
          status: 'booked',
          service_package: 'Bath',
          staff_id: 'cccccccc-1111-4111-8111-111111111111',
          pet_name: 'Pip',
          client_name: 'Alex',
          staff_name: 'Morgan',
        }],
        booking_options: {
          pets: [{
            id: 'eeeeeeee-1111-4111-8111-111111111111',
            client_id: 'ffffffff-1111-4111-8111-111111111111',
            pet_name: 'Pip',
            client_name: 'Alex',
          }],
          groomers: [{ id: 'cccccccc-1111-4111-8111-111111111111', name: 'Morgan' }],
          services: [{ id: 'bath', name: 'Bath', duration_minutes: 60 }],
        },
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/appointments/live');
  await expect(page.getByRole('region', { name: 'Appointment agenda' })).toBeVisible();
  await page.getByRole('region', { name: 'Appointment agenda' }).getByRole('button', { name: /Pip/ }).click();
  await expect(page.getByRole('region', { name: 'Selected appointment' })).toBeVisible();
  const portraitResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(portraitResults.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('region', { name: 'Appointment timeline' })).toBeVisible();
  const desktopResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(desktopResults.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
});

test('live clients and live settings views have no automated WCAG A or AA violations', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sb-jdauajfcmsaamhgyklng-auth-token', JSON.stringify({
      access_token: 'fixture.jwt.token',
      refresh_token: 'fixture-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 1893456000,
      user: {
        id: 'aaaaaaaa-0000-4000-8000-000000000000',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'fixture@example.invalid',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-11-09T00:00:00Z',
      },
    }));
  });

  await page.route('**/api/clients', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'supabase_clients_pets',
        business_id: '11111111-1111-4111-8111-111111111111',
        as_of: '2026-11-09T14:00:00Z',
        client_count: 1,
        pet_count: 1,
        pets: [{
          id: 'bbbbbbbb-1111-4111-8111-111111111111',
          client_id: 'cccccccc-1111-4111-8111-111111111111',
          pet_name: 'Bello',
          breed: 'Goldendoodle',
          weight_lbs: 32.5,
          client_name: 'Sophia Chen-Alvarez',
          client_phone: '415-890-4829',
          client_email: 'sophia@example.invalid',
        }],
      }),
    });
  });

  await page.route('**/api/settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'supabase_business_settings',
        business_id: '11111111-1111-4111-8111-111111111111',
        as_of: '2026-11-09T14:00:00Z',
        salon_name: 'Bespoke Grooming Studio',
        slug: 'bespoke-grooming',
        city_state: 'San Francisco, CA',
        subscription_status: 'active',
        tax_rate: 8.63,
        currency: 'USD',
        booking_buffer_mins: 15,
        operating_hours: { open: '08:00', close: '18:00' },
        packages: [{ id: 'bath-brush', name: 'Bath & Brush', price: 65, durationMinutes: 60 }],
        addons: [{ id: 'teeth-gel', name: 'Teeth Gel', price: 18 }],
        groomers: [{ id: 'dddddddd-1111-4111-8111-111111111111', name: 'Elena Vance', specialty: 'Hand-Scissor', is_active: true }],
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/clients/live');
  await expect(page.getByRole('heading', { name: 'Salon clients & pets' })).toBeVisible();
  const clientsAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(clientsAxe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);

  await page.goto('/dashboard/settings/live');
  await expect(page.getByRole('heading', { name: 'Live catalog, hours & groomers' })).toBeVisible();
  const settingsAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(settingsAxe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
});
