import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLiveClientRoster, validateClientPetIntake, validatePetWeightUpdate } from '../src/lib/live-clients.ts';

test('validates client and pet intake fields and rejects invalid phones or weights', () => {
  const valid = validateClientPetIntake({
    client_name: '  Sophia Chen-Alvarez ',
    client_phone: '(415) 890-4829',
    client_email: 'sophia@example.test',
    pet_name: 'Bello',
    breed: 'Goldendoodle',
    weight_lbs: 38.5,
  });
  assert.deepEqual(valid, {
    client_name: 'Sophia Chen-Alvarez',
    client_phone: '(415) 890-4829',
    client_email: 'sophia@example.test',
    pet_name: 'Bello',
    breed: 'Goldendoodle',
    weight_lbs: '38.50',
  });
  assert.equal(validateClientPetIntake({
    client_name: 'Sophia',
    client_phone: '123',
    pet_name: 'Bello',
    breed: 'Poodle',
  }), null);
  assert.equal(validateClientPetIntake({
    client_name: 'Sophia',
    client_phone: '4158904829',
    pet_name: 'Bello',
    breed: 'Poodle',
    weight_lbs: -5,
  }), null);
  assert.equal(validateClientPetIntake({
    client_name: 'Sophia',
    client_phone: '4158904829',
    pet_name: 'Bello',
    breed: 'Poodle',
    weight_lbs: 1.15,
  })?.weight_lbs, '1.15');
  assert.equal(validateClientPetIntake({
    client_name: 'Sophia',
    client_phone: '4158904829',
    pet_name: 'Bello',
    breed: 'Poodle',
    weight_lbs: 4.35,
  })?.weight_lbs, '4.35');
});

test('normalizes live client roster and sorts pets by name', () => {
  const roster = normalizeLiveClientRoster({
    source: 'supabase_clients_pets',
    business_id: '11111111-1111-4111-8111-111111111111',
    as_of: '2026-11-09T12:00:00Z',
    client_count: 2,
    pet_count: 2,
    pets: [
      {
        id: 'bbbbbbbb-1111-4111-8111-111111111112',
        client_id: 'cccccccc-1111-4111-8111-111111111112',
        pet_name: 'Zoe',
        breed: 'Poodle',
        weight_lbs: '18.25',
        client_name: 'Devon Brooks',
        client_phone: '415-555-0192',
        client_email: null,
      },
      {
        id: 'bbbbbbbb-1111-4111-8111-111111111111',
        client_id: 'cccccccc-1111-4111-8111-111111111111',
        pet_name: 'Bello',
        breed: 'Goldendoodle',
        weight_lbs: null,
        client_name: 'Sophia Chen',
        client_phone: '415-555-0101',
        client_email: 'sophia@example.test',
      },
    ],
  });
  assert.deepEqual(roster.pets.map((p) => p.pet_name), ['Bello', 'Zoe']);
  assert.equal(roster.pets[1].weight_lbs, 18.25);
});

test('validates pet weight updates and rejects out-of-range or malformed values', () => {
  assert.deepEqual(validatePetWeightUpdate({
    pet_id: 'bbbbbbbb-1111-4111-8111-111111111111',
    weight_lbs: 33.4,
  }), {
    pet_id: 'bbbbbbbb-1111-4111-8111-111111111111',
    weight_lbs: '33.40',
  });
  assert.equal(validatePetWeightUpdate({
    pet_id: 'not-a-uuid',
    weight_lbs: 25,
  }), null);
  assert.equal(validatePetWeightUpdate({
    pet_id: 'bbbbbbbb-1111-4111-8111-111111111111',
    weight_lbs: 0,
  }), null);
  assert.equal(validatePetWeightUpdate({
    pet_id: 'bbbbbbbb-1111-4111-8111-111111111111',
    weight_lbs: 300.01,
  }), null);
  assert.equal(validatePetWeightUpdate({
    pet_id: 'bbbbbbbb-1111-4111-8111-111111111111',
    weight_lbs: '12.345',
  }), null);
});
