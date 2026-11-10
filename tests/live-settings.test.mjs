import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeLiveSalonSettings,
  validateGroomerIntake,
  validateSalonSettingsUpdate,
} from '../src/lib/live-settings.ts';

test('validates salon settings updates including operating hours, tax rate, buffer, packages, and add-ons', () => {
  const valid = validateSalonSettingsUpdate({
    tax_rate: 8.25,
    booking_buffer_mins: 15,
    time_zone: 'America/Los_Angeles',
    operating_hours: { open: '08:30', close: '17:30' },
    packages: [
      { id: 'bath-brush', name: 'Bath & Brush', price: 65, durationMinutes: 60 },
      { id: 'full-groom', name: 'Full Hand-Scissor', price: 125.5, durationMinutes: 120, description: 'Full spa groom' },
    ],
    addons: [
      { id: 'blueberry-facial', name: 'Blueberry Facial', price: 18 },
    ],
  });
  assert.deepEqual(valid, {
    tax_rate: 8.25,
    booking_buffer_mins: 15,
    time_zone: 'America/Los_Angeles',
    operating_hours: { open: '08:30', close: '17:30' },
    packages: [
      { id: 'bath-brush', name: 'Bath & Brush', price: 65, durationMinutes: 60 },
      { id: 'full-groom', name: 'Full Hand-Scissor', price: 125.5, durationMinutes: 120, description: 'Full spa groom' },
    ],
    addons: [
      { id: 'blueberry-facial', name: 'Blueberry Facial', price: 18 },
    ],
  });

  // Rejects inverted operating hours
  assert.equal(validateSalonSettingsUpdate({
    tax_rate: 8.25,
    booking_buffer_mins: 15,
    operating_hours: { open: '18:00', close: '08:00' },
    packages: [],
    addons: [],
  }), null);

  assert.equal(validateSalonSettingsUpdate({
    tax_rate: 8.25,
    booking_buffer_mins: 15,
    time_zone: 'Mars/Olympus_Mons',
    operating_hours: { open: '08:00', close: '18:00' },
    packages: [],
    addons: [],
  }), null);

  // Rejects duplicate package IDs
  assert.equal(validateSalonSettingsUpdate({
    tax_rate: 8.25,
    booking_buffer_mins: 15,
    operating_hours: { open: '08:00', close: '18:00' },
    packages: [
      { id: 'dup', name: 'One', price: 50, durationMinutes: 60 },
      { id: 'dup', name: 'Two', price: 60, durationMinutes: 60 },
    ],
    addons: [],
  }), null);

  // Rejects out-of-range tax rate or fractional cents
  assert.equal(validateSalonSettingsUpdate({
    tax_rate: 35,
    booking_buffer_mins: 15,
    operating_hours: { open: '08:00', close: '18:00' },
    packages: [],
    addons: [],
  }), null);
  assert.equal(validateSalonSettingsUpdate({
    tax_rate: 8.25,
    booking_buffer_mins: 15,
    operating_hours: { open: '08:00', close: '18:00' },
    packages: [{ id: 'bath', name: 'Bath', price: 42.555, durationMinutes: 60 }],
    addons: [],
  }), null);
});

test('validates groomer intake and normalizes live salon settings snapshot', () => {
  assert.deepEqual(validateGroomerIntake({
    name: '  Elena Vance ',
    specialty: ' Hand-Scissor & Doodles ',
  }), {
    name: 'Elena Vance',
    specialty: 'Hand-Scissor & Doodles',
  });
  assert.equal(validateGroomerIntake({ name: '   ' }), null);

  const normalized = normalizeLiveSalonSettings({
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
    time_zone: 'America/Los_Angeles',
    operating_hours: { open: '08:00', close: '18:00' },
    packages: [{ id: 'bath', name: 'Bath & Brush', price: 65, durationMinutes: 60 }],
    addons: [{ id: 'teeth', name: 'Ultrasonic Teeth Gel', price: 18 }],
    groomers: [
      { id: 'bbbbbbbb-1111-4111-8111-111111111112', name: 'Sora Takahashi', specialty: 'Asian Fusion', is_active: true },
      { id: 'bbbbbbbb-1111-4111-8111-111111111111', name: 'Elena Vance', specialty: null, is_active: true },
    ],
  });
  assert.deepEqual(normalized.groomers.map((g) => g.name), ['Elena Vance', 'Sora Takahashi']);
  assert.equal(normalized.tax_rate, 8.63);
  assert.equal(normalized.time_zone, 'America/Los_Angeles');
});
