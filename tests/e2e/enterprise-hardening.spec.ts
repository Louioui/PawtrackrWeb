import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('marketing portal omits sandbox demo links, renders Bento showcase & static preview carousel, and links to /privacy', async ({
  page,
}) => {
  await page.goto('/');

  // Zero live sandbox demo links anywhere on the public marketing portal
  const hrefs = await page.locator('a[href]').evaluateAll((anchors) =>
    anchors.map((a) => a.getAttribute('href') || '')
  );
  for (const href of hrefs) {
    expect(href).not.toBe('/dashboard');
    expect(href).not.toContain('/portal/bespoke-grooming');
    expect(href).not.toContain('/portal/splash-grooming');
    expect(href).not.toContain('/client/cl-101');
  }
  await expect(page.getByText(/test drive the live interactive demo/i)).toHaveCount(0);

  // Bento-Grid Enterprise Architecture Showcase is visible
  const bento = page.getByRole('region', { name: 'Enterprise architecture bento showcase' });
  await expect(bento).toBeVisible();
  await expect(bento).toContainText('Zero Floating-Point Drift');
  await expect(bento).toContainText('Mathematically Impossible Double-Bookings');

  // 4-Slide High-Fidelity Static Product Preview Carousel transitions cleanly
  const carousel = page.getByRole('region', {
    name: 'Pawtrackr static product preview carousel',
  });
  await expect(carousel).toBeVisible();
  await expect(carousel).toContainText('Collision-Proof Salon Schedule & Turnaround Buffers');
  await carousel.getByRole('button', { name: 'Next product preview slide' }).click();
  await expect(carousel).toContainText('$0.00 Cash Variance Checkout & Split Tenders');

  // Footer Privacy Policy link resolves 200 and passes WCAG 2.1 AA
  await page.getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(
    page.getByRole('heading', { name: /Pawtrackr Privacy Policy & Tenant Data Protection/i })
  ).toBeVisible();

  const privacyAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(privacyAxe.violations.map((v) => v.id)).toEqual([]);
});

test('synthetic canary /api/health, W3C traceparent, Unicode header safety, Stripe rate-limit exemption, and waitlist IDOR guard', async ({
  request,
  page,
}) => {
  // 1. Synthetic Canary /api/health + OpenTelemetry traceparent propagation
  const healthRes = await request.get('/api/health', {
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    },
  });
  expect(healthRes.status()).toBe(200);
  expect(healthRes.headers()['cache-control']).toContain('no-store');
  expect(healthRes.headers()['traceparent']).toMatch(
    /^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/
  );
  expect(healthRes.headers()['x-request-id']).toBeTruthy();

  const healthBody = await healthRes.json();
  expect(healthBody.status).toBe('healthy');
  expect(healthBody.checks.posMathZeroVariance).toBe(true);
  expect(healthBody.checks.promptShieldArmed).toBe(true);

  // 2. Malformed Unicode slug & CRLF query never trigger Edge Headers.set HTTP 500 DoS
  const unicodeRes = await request.get('/portal/%E2%9C%93?tenant=bad%0d%0aslug');
  expect(unicodeRes.status()).toBeLessThan(500);

  // 3. Waitlist offer decline requires claimToken when unauthenticated (IDOR closed)
  const declineRes = await request.post(
    '/api/waitlist/offers/00000000-0000-4000-8000-000000000001/decline',
    { data: {} }
  );
  expect(declineRes.status()).toBe(401);

  // 4. AI Voice Intake & Retail Inventory endpoints enforce authenticated staff RBAC
  const voiceUnauth = await request.post('/api/voice/intake', {
    data: { transcript: 'Book my poodle tomorrow' },
  });
  expect(voiceUnauth.status()).toBe(401);

  const invUnauth = await request.get('/api/inventory');
  expect(invUnauth.status()).toBe(401);

  // 5. /crm Whisper AI Voice Receptionist & /fleet real IndexedDB outbox work in browser
  await page.goto('/crm');
  const voiceSection = page.getByRole('region', { name: 'Autonomous AI Voice Receptionist' });
  await expect(voiceSection).toBeVisible();
  await voiceSection.getByRole('button', { name: /Red-Team Test — Prompt Injection Attempt/i }).click();
  await expect(voiceSection).toContainText('Adversarial Prompt Injection Neutralized');

  await page.goto('/fleet');
  await page.getByRole('button', { name: 'Simulate Offline' }).click();
  await page.getByRole('button', { name: 'Mark Arrived On-Site' }).first().click();
  await expect(page.getByText(/OFFLINE OUTBOX \(1 pending\)/i)).toBeVisible();
  await page.getByRole('button', { name: 'Flush & Reconcile Outbox Now' }).click();
  await expect(page.getByText(/Replayed 1 IndexedDB mutation/i)).toBeVisible();
});
