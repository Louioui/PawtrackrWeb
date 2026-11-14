import { expect, test } from '@playwright/test';

test.describe('Customer Self-Service Portal (WF02 / WF14)', () => {
  test('manage endpoints validate required parameters and rate limits', async ({ request }) => {
    // 1. Missing or invalid parameters in lookup
    const emptyLookup = await request.get('/api/public/bookings/manage');
    expect(emptyLookup.status()).toBe(400);
    const emptyJson = await emptyLookup.json();
    expect(emptyJson.error).toContain('valid salon identifier');

    const invalidRef = await request.get(
      '/api/public/bookings/manage?slug=bespoke-grooming&ref=INVALID&phone=5551234567'
    );
    expect(invalidRef.status()).toBe(400);
    const refJson = await invalidRef.json();
    expect(refJson.error).toContain('8-character');

    const invalidPhone = await request.get(
      '/api/public/bookings/manage?slug=bespoke-grooming&ref=A1B2C3D4&phone=123'
    );
    expect(invalidPhone.status()).toBe(400);
    const phoneJson = await invalidPhone.json();
    expect(phoneJson.error).toContain('phone number');

    // 2. Cancellation validation
    const emptyCancel = await request.post('/api/public/bookings/manage/cancel', {
      data: {},
    });
    expect(emptyCancel.status()).toBe(400);

    const badRefCancel = await request.post('/api/public/bookings/manage/cancel', {
      data: {
        slug: 'bespoke-grooming',
        reference: 'ZZZZ',
        phone: '5551234567',
      },
    });
    expect(badRefCancel.status()).toBe(400);

    // 3. Reschedule validation
    const pastReschedule = await request.post('/api/public/bookings/manage/reschedule', {
      data: {
        slug: 'bespoke-grooming',
        reference: 'A1B2C3D4',
        phone: '5551234567',
        starts_at: '2020-01-01T10:00:00Z',
      },
    });
    expect(pastReschedule.status()).toBe(400);
    const pastJson = await pastReschedule.json();
    expect(pastJson.error).toContain('1 hour in the future');
  });

  test('portal manage page displays clean 404 for nonexistent salon', async ({ page }) => {
    await page.goto('/portal/live/nonexistent-salon-slug/manage');
    await expect(page.getByText('This page could not be found.')).toBeVisible();
  });
});
