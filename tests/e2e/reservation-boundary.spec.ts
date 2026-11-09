import { expect, test } from '@playwright/test';

test('staff reservation endpoint requires a real session and validates the request', async ({ request }) => {
  const missingRead = await request.get('/api/reservations?date=2026-11-09');
  expect(missingRead.status()).toBe(401);
  expect(missingRead.headers()['cache-control']).toBe('no-store');
  const malformedRead = await request.get('/api/reservations?date=2026-02-30', {
    headers: { Authorization: 'Bearer invalid-token' },
  });
  expect(malformedRead.status()).toBe(400);
  const invalidRead = await request.get('/api/reservations?date=2026-11-09', {
    headers: { Authorization: 'Bearer invalid-token' },
  });
  expect(invalidRead.status()).toBe(401);

  const input = {
    client_id: '11111111-1111-4111-8111-111111111111',
    pet_id: '22222222-2222-4222-8222-222222222222',
    staff_id: '33333333-3333-4333-8333-333333333333',
    package_id: 'bath',
    scheduled_time: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
  const missing = await request.post('/api/reservations', { data: input });
  expect(missing.status()).toBe(401);
  expect(missing.headers()['cache-control']).toBe('no-store');

  const malformed = await request.post('/api/reservations', {
    headers: { Authorization: 'Bearer invalid-token' },
    data: { ...input, scheduled_time: '2030-01-01T09:00:00' },
  });
  expect(malformed.status()).toBe(400);

  const invalid = await request.post('/api/reservations', {
    headers: { Authorization: 'Bearer invalid-token' },
    data: input,
  });
  expect(invalid.status()).toBe(401);
});
