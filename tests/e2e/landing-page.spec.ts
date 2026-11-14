import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('front page connects one appointment across Pet Parent, Salon Team, and Owner perspectives', async ({
  page,
}) => {
  await page.goto('/');

  // Honest preview framing and customer-facing headline
  await expect(
    page.getByText('Interactive product preview • Simulated salon workflow')
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: /The Trusted Operating System for Modern Pet-Care Businesses/i,
    })
  ).toBeVisible();

  // Technical prototype labels and unbenchmarked claims must not appear
  await expect(page.getByText('MODULE A • /portal/[salon-slug]')).toHaveCount(0);
  await expect(page.getByText('< 1.0 ms (Multi-Token In-Memory)')).toHaveCount(0);

  // Default Pet Parent perspective shows Bello's appointment and salon time zone
  const petParentTab = page.getByRole('tab', { name: 'Pet Parent', exact: true });
  const salonTeamTab = page.getByRole('tab', { name: 'Salon Team', exact: true });
  const ownerTab = page.getByRole('tab', { name: 'Owner', exact: true });

  await expect(petParentTab).toHaveAttribute('aria-selected', 'true');
  const petParentPanel = page.getByRole('tabpanel', { name: 'Pet Parent', exact: true });
  await expect(petParentPanel).toContainText('Full Coat Sculpt & Spa Bath');
  await expect(petParentPanel).toContainText('America/Los_Angeles');

  // Switch to Salon Team perspective and inspect care note & buffer
  await salonTeamTab.click();
  await expect(salonTeamTab).toHaveAttribute('aria-selected', 'true');
  const teamPanel = page.getByRole('tabpanel', { name: 'Salon Team', exact: true });
  await expect(teamPanel).toContainText('+15m turnaround buffer reserved until 12:15 PM');
  await expect(teamPanel).toContainText('Dryer / noise sensitive');

  // Switch to Owner perspective before checkout completion ($428.50 / 3 visits)
  await ownerTab.click();
  const ownerPanel = page.getByRole('tabpanel', { name: 'Owner', exact: true });
  await expect(ownerPanel).toContainText('3 visits');
  await expect(ownerPanel).toContainText('$428.50');

  // Simulate Bello's checkout (+$137.43) and verify connected owner revenue updates to $565.93
  await ownerPanel
    .getByRole('button', { name: /Simulate Bello’s Completed Checkout/i })
    .click();
  await expect(ownerPanel).toContainText('4 visits');
  await expect(ownerPanel).toContainText('$565.93');
});

test('front page availability intelligence explains why a booking fits or is blocked', async ({
  page,
}) => {
  await page.goto('/');

  const section = page.getByRole('region', {
    name: 'Availability intelligence demonstration',
  });
  await expect(section).toContainText('Slot available • Fits hours, shift, and buffer');

  await section
    .getByRole('button', { name: /Scenario B: Why was 12:00 PM PT blocked\?/i })
    .click();
  await expect(section).toContainText('Booking blocked • Exceeds groomer shift with buffer');
  await expect(section).toContainText(
    'This time is unavailable because Elena Rostova’s scheduled shift ends at 1:30 PM America/Los_Angeles'
  );
});

test('front page interactive tour, animated walkthrough, and lifecycle stages are interactive and accessible at mobile and desktop widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  // Verify no horizontal overflow at 390px mobile portrait width
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);

  // Lifecycle stage interaction
  await page.getByRole('tab', { name: /Step 5.*Paid/i }).click();
  await expect(
    page.getByRole('tabpanel', { name: /Step 5.*Paid/i })
  ).toContainText('Cent-exact checkout updates daily revenue and drawer totals');

  // Interactive tour auto-play simulation controls
  const tourButton = page.getByRole('button', { name: /Auto-Play Live Tour/i });
  await expect(tourButton).toBeVisible();
  await tourButton.click();
  await expect(page.getByRole('button', { name: /Pause Live Tour/i })).toBeVisible();

  // Automated WCAG 2.1 AA audit on mobile viewport
  const mobileAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    mobileAxe.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    }))
  ).toEqual([]);

  // Automated WCAG 2.1 AA audit on desktop viewport
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    desktopAxe.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    }))
  ).toEqual([]);
});

test('pwa web app manifest, sitemap, and high-DPI brand icons return 200 with correct media types', async ({
  request,
}) => {
  const manifest = await request.get('/manifest.json');
  expect(manifest.status()).toBe(200);
  const manifestJson = await manifest.json();
  expect(manifestJson.name).toContain('Pawtrackr');
  expect(manifestJson.display).toBe('standalone');
  expect(manifestJson.icons.length).toBeGreaterThanOrEqual(4);

  const svgIcon = await request.get('/icon.svg');
  expect(svgIcon.status()).toBe(200);
  expect(svgIcon.headers()['content-type']).toContain('image/svg+xml');

  const icon192 = await request.get('/icon-192.png');
  expect(icon192.status()).toBe(200);

  const icon512 = await request.get('/icon-512.png');
  expect(icon512.status()).toBe(200);

  const appleTouch = await request.get('/apple-touch-icon.png');
  expect(appleTouch.status()).toBe(200);

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain('/privacy');
  expect(sitemapText).toContain('/login');
  expect(sitemapText).toContain('/signup');
});
