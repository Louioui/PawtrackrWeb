import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanPhoneDigits,
  cleanReference,
  customerPortalFailure,
  parseCancelResponse,
  parseCustomerBookingDetails,
  parseRescheduleResponse,
  validateCancelPayload,
  validateLookupParams,
  validateReschedulePayload,
} from '../src/lib/customer-portal.ts';

test('cleanReference formats and normalizes 8-char hex code', () => {
  assert.equal(cleanReference('  a1b2c3d4  '), 'A1B2C3D4');
  assert.equal(cleanReference('deadbeef'), 'DEADBEEF');
  assert.equal(cleanReference(null), '');
  assert.equal(cleanReference(12345678), '');
});

test('cleanPhoneDigits strips all non-numeric characters', () => {
  assert.equal(cleanPhoneDigits('(415) 555-0199'), '4155550199');
  assert.equal(cleanPhoneDigits('+1-415-555-0199'), '14155550199');
  assert.equal(cleanPhoneDigits('555.123.4567'), '5551234567');
  assert.equal(cleanPhoneDigits(null), '');
});

test('validateLookupParams validates slug, reference, and phone digits', () => {
  const valid = validateLookupParams('pawsome-salon', 'a1b2c3d4', '(415) 555-0199');
  assert.deepEqual(valid, {
    ok: true,
    slug: 'pawsome-salon',
    reference: 'A1B2C3D4',
    phoneDigits: '4155550199',
  });

  // Invalid slug
  assert.equal(validateLookupParams('Invalid/Slug', 'A1B2C3D4', '4155550199').ok, false);
  assert.equal(validateLookupParams('', 'A1B2C3D4', '4155550199').ok, false);

  // Invalid reference (not 8 hex chars)
  assert.equal(validateLookupParams('pawsome-salon', 'A1B2C3', '4155550199').ok, false);
  assert.equal(validateLookupParams('pawsome-salon', 'G1B2C3D4', '4155550199').ok, false);
  assert.equal(validateLookupParams('pawsome-salon', 'A1B2C3D4E5', '4155550199').ok, false);

  // Invalid phone (<10 digits or >15 digits)
  assert.equal(validateLookupParams('pawsome-salon', 'A1B2C3D4', '555019').ok, false);
  assert.equal(validateLookupParams('pawsome-salon', 'A1B2C3D4', '1234567890123456').ok, false);
});

test('validateCancelPayload accepts optional reason and limits length', () => {
  const payload = {
    slug: 'bespoke-grooming',
    reference: 'F0E1D2C3',
    phone: '555-123-4567',
    reason: '  Schedule conflict with family event  ',
  };
  const checked = validateCancelPayload(payload);
  assert.equal(checked.ok, true);
  if (checked.ok) {
    assert.equal(checked.reference, 'F0E1D2C3');
    assert.equal(checked.phoneDigits, '5551234567');
    assert.equal(checked.reason, 'Schedule conflict with family event');
  }

  // Reason is optional
  const noReason = validateCancelPayload({
    slug: 'bespoke-grooming',
    reference: 'F0E1D2C3',
    phone: '555-123-4567',
  });
  assert.equal(noReason.ok, true);
  if (noReason.ok) {
    assert.equal(noReason.reason, null);
  }

  // Non-object input rejected
  assert.equal(validateCancelPayload('invalid').ok, false);
});

test('validateReschedulePayload requires valid future time >= 1 hour ahead', () => {
  const farFuture = new Date(Date.now() + 7 * 86400000).toISOString();
  const checked = validateReschedulePayload({
    slug: 'bespoke-grooming',
    reference: 'F0E1D2C3',
    phone: '555-123-4567',
    starts_at: farFuture,
  });
  assert.equal(checked.ok, true);
  if (checked.ok) {
    assert.equal(checked.startsAt, farFuture);
  }

  // Near future (< 1 hour)
  const tooSoon = new Date(Date.now() + 10 * 60000).toISOString();
  assert.equal(
    validateReschedulePayload({
      slug: 'bespoke-grooming',
      reference: 'F0E1D2C3',
      phone: '555-123-4567',
      starts_at: tooSoon,
    }).ok,
    false
  );

  // Past timestamp
  const past = new Date(Date.now() - 3600000).toISOString();
  assert.equal(
    validateReschedulePayload({
      slug: 'bespoke-grooming',
      reference: 'F0E1D2C3',
      phone: '555-123-4567',
      starts_at: past,
    }).ok,
    false
  );

  // Invalid date format
  assert.equal(
    validateReschedulePayload({
      slug: 'bespoke-grooming',
      reference: 'F0E1D2C3',
      phone: '555-123-4567',
      starts_at: 'tomorrow morning',
    }).ok,
    false
  );
});

test('parseCustomerBookingDetails parses valid DB projection', () => {
  const rawDbRecord = {
    reference: 'a1b2c3d4',
    visit_id: '11111111-2222-3333-4444-555555555555',
    status: 'booked',
    service: 'Full Groom Deluxe',
    price: 85.5,
    starts_at: '2026-11-20T14:00:00.000Z',
    ends_at: '2026-11-20T15:30:00.000Z',
    duration_minutes: 90,
    time_zone: 'America/New_York',
    salon_name: 'Bespoke Grooming',
    salon_slug: 'bespoke-grooming',
    salon_phone: '415-555-0100',
    salon_address: 'San Francisco, CA',
    client_name: 'Sophia Alvarez',
    pet_name: 'Barnaby',
    pet_breed: 'Mini Goldendoodle',
    staff_name: 'Elena Rostova',
    station_name: 'Table 1',
    can_reschedule: true,
    can_cancel: true,
    policy_notice: 'Online modifications allowed up to 24 hours in advance.',
  };

  const parsed = parseCustomerBookingDetails(rawDbRecord);
  assert.ok(parsed !== null);
  assert.equal(parsed.reference, 'A1B2C3D4');
  assert.equal(parsed.status, 'booked');
  assert.equal(parsed.service, 'Full Groom Deluxe');
  assert.equal(parsed.price, 85.5);
  assert.equal(parsed.durationMinutes, 90);
  assert.equal(parsed.canReschedule, true);
  assert.equal(parsed.canCancel, true);
  assert.equal(parsed.petName, 'Barnaby');
  assert.equal(parsed.clientName, 'Sophia Alvarez');
});

test('parseCustomerBookingDetails maps in-salon stages correctly', () => {
  for (const st of ['dropped_off', 'bathing', 'styling', 'ready', 'completed', 'cancelled', 'no_show']) {
    const raw = {
      reference: '12345678',
      visit_id: '11111111-1111-1111-1111-111111111111',
      status: st,
      service: 'Bath',
      price: 45,
      starts_at: '2026-11-20T14:00:00Z',
      ends_at: '2026-11-20T15:00:00Z',
      duration_minutes: 60,
      time_zone: 'UTC',
      salon_name: 'Salon',
      salon_slug: 'salon',
      client_name: 'Client',
      pet_name: 'Pet',
      pet_breed: 'Breed',
    };
    const parsed = parseCustomerBookingDetails(raw);
    assert.ok(parsed !== null);
    assert.equal(parsed.status, st);
  }
});

test('parseCustomerBookingDetails rejects malformed records', () => {
  assert.equal(parseCustomerBookingDetails(null), null);
  assert.equal(parseCustomerBookingDetails({}), null);
  assert.equal(parseCustomerBookingDetails({ reference: 'SHORT' }), null);
  assert.equal(parseCustomerBookingDetails({ reference: '12345678', price: -10 }), null);
  assert.equal(parseCustomerBookingDetails({ reference: '12345678', starts_at: 'invalid' }), null);
});

test('parseCancelResponse and parseRescheduleResponse handle DB output', () => {
  const cancelData = {
    reference: 'B8C7D6E5',
    status: 'cancelled',
    cancelled_at: '2026-11-14T12:00:00Z',
    service: 'Full Groom',
    pet_name: 'Mochi',
    salon_name: 'Pawsome',
  };
  const cancelParsed = parseCancelResponse(cancelData);
  assert.ok(cancelParsed !== null);
  assert.equal(cancelParsed.status, 'cancelled');
  assert.equal(cancelParsed.petName, 'Mochi');

  const rescheduleData = {
    reference: 'B8C7D6E5',
    status: 'booked',
    service: 'Full Groom',
    starts_at: '2026-11-22T10:00:00Z',
    ends_at: '2026-11-22T11:30:00Z',
    time_zone: 'America/Los_Angeles',
    price: 90,
    salon_name: 'Pawsome',
    pet_name: 'Mochi',
  };
  const rescheduleParsed = parseRescheduleResponse(rescheduleData);
  assert.ok(rescheduleParsed !== null);
  assert.equal(rescheduleParsed.status, 'booked');
  assert.equal(rescheduleParsed.startsAt, '2026-11-22T10:00:00.000Z');
});

test('customerPortalFailure maps SQLSTATE errors to HTTP responses', () => {
  assert.deepEqual(customerPortalFailure('PW020'), {
    status: 404,
    error: 'This salon is not currently active.',
  });
  assert.deepEqual(customerPortalFailure('PW021'), {
    status: 400,
    error: 'Please check your booking reference code, phone number, and appointment details.',
  });
  assert.deepEqual(customerPortalFailure('PW022'), {
    status: 409,
    error: 'That time slot is no longer available. Please select another time.',
  });
  assert.deepEqual(customerPortalFailure('PW030'), {
    status: 404,
    error: 'No appointment found matching that reference code and phone number. Please verify your details.',
  });
  assert.deepEqual(customerPortalFailure('PW031'), {
    status: 400,
    error: 'Only upcoming appointments in booked status can be modified or cancelled online.',
  });
  assert.deepEqual(customerPortalFailure('PW032'), {
    status: 403,
    error: 'Appointments within 24 hours cannot be changed online. Please call the salon directly so staff can assist you.',
  });
  assert.equal(customerPortalFailure('UNKNOWN').status, 502);
});
