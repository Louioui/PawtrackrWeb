import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateOfferExpiration,
  isOfferClaimable,
  rankWaitlistCandidates,
  filterEntriesByTimePreference,
  formatWaitlistNotificationText,
} from '../src/lib/live-waitlist.ts';

test('calculateOfferExpiration computes exact 120-minute window by default', () => {
  const created = new Date('2026-06-15T10:00:00Z');
  const referenceNow = new Date('2026-06-15T10:15:00Z');

  const exp = calculateOfferExpiration(created, 120, referenceNow);

  assert.equal(exp.isExpired, false);
  assert.equal(exp.expiresAt.toISOString(), '2026-06-15T12:00:00.000Z');
  assert.equal(exp.remainingMs, 105 * 60 * 1000); // 105 minutes remaining
  assert.equal(exp.remainingFormatted, '1h 45m');
});

test('calculateOfferExpiration reports isExpired: true once hold deadline passes (silence never acceptance)', () => {
  const created = new Date('2026-06-15T10:00:00Z');
  const referenceNow = new Date('2026-06-15T12:00:01Z'); // 1 second past 2-hour window

  const exp = calculateOfferExpiration(created, 120, referenceNow);

  assert.equal(exp.isExpired, true);
  assert.equal(exp.remainingMs, 0);
  assert.equal(exp.remainingFormatted, 'Expired');
});

test('calculateOfferExpiration clamps out-of-bounds duration between 15m and 1440m', () => {
  const created = new Date('2026-06-15T10:00:00Z');
  const now = new Date('2026-06-15T10:00:00Z');

  // Negative / too small duration clamped to 15m
  const small = calculateOfferExpiration(created, 5, now);
  assert.equal(small.expiresAt.toISOString(), '2026-06-15T10:15:00.000Z');

  // Excessive duration clamped to 24 hours (1440m)
  const huge = calculateOfferExpiration(created, 5000, now);
  assert.equal(huge.expiresAt.toISOString(), '2026-06-16T10:00:00.000Z');
});

test('calculateOfferExpiration throws error on invalid timestamp inputs', () => {
  assert.throws(() => calculateOfferExpiration('invalid-date', 120), /Invalid createdInstant/);
  assert.throws(() => calculateOfferExpiration(new Date(), 120, 'invalid-now'), /Invalid referenceNow/);
});

test('isOfferClaimable enforces pending status and non-expired time gate', () => {
  const futureExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const pastExpiry = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Valid pending offer
  assert.equal(isOfferClaimable({ status: 'pending', offer_expires_at: futureExpiry }), true);

  // Expired pending offer
  assert.equal(isOfferClaimable({ status: 'pending', offer_expires_at: pastExpiry }), false);

  // Already accepted or declined
  assert.equal(isOfferClaimable({ status: 'accepted', offer_expires_at: futureExpiry }), false);
  assert.equal(isOfferClaimable({ status: 'declined', offer_expires_at: futureExpiry }), false);
});

test('rankWaitlistCandidates sorts active entries first, then by rank_position, then FIFO created_at', () => {
  const mockEntries = [
    {
      id: 'entry-3',
      business_id: 'b1',
      client_id: 'c3',
      pet_id: 'p3',
      service_package: 'Bath',
      preferred_dates: [],
      time_preference: 'any',
      status: 'offered',
      rank_position: 1,
      created_at: '2026-06-15T08:00:00Z',
      updated_at: '2026-06-15T08:00:00Z',
    },
    {
      id: 'entry-2',
      business_id: 'b1',
      client_id: 'c2',
      pet_id: 'p2',
      service_package: 'Full Groom',
      preferred_dates: [],
      time_preference: 'morning',
      status: 'active',
      rank_position: 2,
      created_at: '2026-06-15T09:00:00Z',
      updated_at: '2026-06-15T09:00:00Z',
    },
    {
      id: 'entry-1',
      business_id: 'b1',
      client_id: 'c1',
      pet_id: 'p1',
      service_package: 'Full Groom',
      preferred_dates: [],
      time_preference: 'afternoon',
      status: 'active',
      rank_position: 1,
      created_at: '2026-06-15T09:30:00Z',
      updated_at: '2026-06-15T09:30:00Z',
    },
    {
      id: 'entry-4',
      business_id: 'b1',
      client_id: 'c4',
      pet_id: 'p4',
      service_package: 'Nail Trim',
      preferred_dates: [],
      time_preference: 'any',
      status: 'active',
      rank_position: 2,
      created_at: '2026-06-15T08:30:00Z', // earlier than entry-2 with same rank
      updated_at: '2026-06-15T08:30:00Z',
    },
  ];

  const ranked = rankWaitlistCandidates(mockEntries);

  // Rank 1: entry-1 (active, rank 1)
  assert.equal(ranked[0].id, 'entry-1');
  // Rank 2: entry-4 (active, rank 2, created earlier at 08:30)
  assert.equal(ranked[1].id, 'entry-4');
  // Rank 3: entry-2 (active, rank 2, created at 09:00)
  assert.equal(ranked[2].id, 'entry-2');
  // Rank 4: entry-3 (offered)
  assert.equal(ranked[3].id, 'entry-3');
});

test('filterEntriesByTimePreference filters entries matching client preference or any', () => {
  const entries = [
    { id: '1', time_preference: 'morning' },
    { id: '2', time_preference: 'afternoon' },
    { id: '3', time_preference: 'weekend' },
    { id: '4', time_preference: 'any' },
  ];

  const morningOnly = filterEntriesByTimePreference(entries, 'morning');
  assert.deepEqual(morningOnly.map((e) => e.id), ['1', '4']);

  const all = filterEntriesByTimePreference(entries, 'any');
  assert.equal(all.length, 4);
});

test('formatWaitlistNotificationText formats clean pet parent message with 2-hour hold notice', () => {
  const text = formatWaitlistNotificationText({
    petName: 'Milo',
    servicePackage: 'Full Groom',
    slotStart: '2026-06-20T14:00:00Z',
    expiresAt: '2026-06-20T16:00:00Z',
    claimUrl: 'https://pawtrackr.com/waitlist/claim?token=abc123token',
    salonName: 'Bespoke Grooming',
  });

  assert.match(text, /Great news from Bespoke Grooming!/);
  assert.match(text, /Milo \(Full Groom\)/);
  assert.match(text, /2 hours/);
  assert.match(text, /https:\/\/pawtrackr\.com\/waitlist\/claim\?token=abc123token/);
});
