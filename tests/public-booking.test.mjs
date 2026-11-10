import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublicCatalog, parsePublicSalon } from '../src/lib/public-booking.ts';

test('public salon projection rejects missing and unsafe slugs', () => {
  assert.deepEqual(parsePublicSalon({ id: '1', name: '  Salon A  ', slug: 'salon-a', city_state: 'LA' }),
    { id: '1', name: 'Salon A', slug: 'salon-a', city_state: 'LA' });
  assert.equal(parsePublicSalon({ id: '1', name: 'Salon', slug: '../private' }), null);
  assert.equal(parsePublicSalon({ id: '1', name: '', slug: 'salon' }), null);
});

test('public catalog uses published services and ignores malformed rows', () => {
  assert.deepEqual(parsePublicCatalog({
    packages: [{ name: 'Bath', price: 42.5, durationMinutes: 60 }, { name: '', price: 100 }],
    addons: [{ name: 'Nails', price: -1 }],
    operating_hours: { open: '09:00', close: '17:00' },
    time_zone: 'America/Los_Angeles',
  }), {
    packages: [{ name: 'Bath', description: null, price: 42.5, durationMinutes: 60 }],
    addons: [{ name: 'Nails', description: null, price: null, durationMinutes: null }],
    operatingHours: { open: '09:00', close: '17:00' },
    timeZone: 'America/Los_Angeles',
  });
  assert.equal(parsePublicCatalog({ time_zone: 'Mars/Olympus_Mons' }).timeZone, null);
});
