import assert from 'node:assert/strict';
import test from 'node:test';
import {
  identifyCoatArchetype,
  calculateCoatCadenceStatus,
  generateCoatRecallSms,
  estimateRecapturableRevenueCents,
  COAT_ARCHETYPES,
} from '../src/lib/coat-cadence.ts';

test('identifyCoatArchetype correctly categorizes pet salon breeds into coat archetypes', () => {
  // Curled Fleece (Doodles & Poodles)
  assert.equal(identifyCoatArchetype('Cavapoo').archetype, 'curled_fleece');
  assert.equal(identifyCoatArchetype('Goldendoodle F1b').archetype, 'curled_fleece');
  assert.equal(identifyCoatArchetype('Standard Poodle').archetype, 'curled_fleece');
  assert.equal(identifyCoatArchetype('Bichon Frise').archetype, 'curled_fleece');

  // Double Coat (Seasonal Shedding)
  assert.equal(identifyCoatArchetype('Siberian Husky').archetype, 'double_coat');
  assert.equal(identifyCoatArchetype('German Shepherd').archetype, 'double_coat');
  assert.equal(identifyCoatArchetype('Pembroke Welsh Corgi').archetype, 'double_coat');
  assert.equal(identifyCoatArchetype('Golden Retriever').archetype, 'double_coat');

  // Silky Drop Coat
  assert.equal(identifyCoatArchetype('Yorkshire Terrier').archetype, 'silky_drop');
  assert.equal(identifyCoatArchetype('Shih Tzu').archetype, 'silky_drop');
  assert.equal(identifyCoatArchetype('Maltese').archetype, 'silky_drop');

  // Wire Coat
  assert.equal(identifyCoatArchetype('Miniature Schnauzer').archetype, 'wire_coat');
  assert.equal(identifyCoatArchetype('Airedale Terrier').archetype, 'wire_coat');
  assert.equal(identifyCoatArchetype('West Highland White Terrier').archetype, 'wire_coat');

  // Smooth Short Coat
  assert.equal(identifyCoatArchetype('French Bulldog').archetype, 'smooth_short');
  assert.equal(identifyCoatArchetype('Pug').archetype, 'smooth_short');
  assert.equal(identifyCoatArchetype('Boxer').archetype, 'smooth_short');
});

test('calculateCoatCadenceStatus assesses matting hazards and overdue intervals accurately', () => {
  const now = new Date('2026-11-14T10:00:00Z');

  // 1. On track (Cavapoo with 2 weeks elapsed)
  const onTrack = calculateCoatCadenceStatus({
    petBreed: 'Cavapoo',
    lastGroomDate: new Date('2026-10-31T10:00:00Z'), // 14 days = 2.0 weeks
    referenceDate: now,
  });
  assert.equal(onTrack.archetype, 'curled_fleece');
  assert.equal(onTrack.recommendedCadenceWeeks, 5);
  assert.equal(onTrack.weeksSinceLastGroom, 2);
  assert.equal(onTrack.mattingRiskLevel, 'on_track');
  assert.equal(onTrack.isRecallDue, false);

  // 2. Elevated (Cavapoo with 5.2 weeks elapsed)
  const elevated = calculateCoatCadenceStatus({
    petBreed: 'Cavapoo',
    lastGroomDate: new Date('2026-10-08T10:00:00Z'), // ~37 days = 5.3 weeks
    referenceDate: now,
  });
  assert.equal(elevated.mattingRiskLevel, 'elevated');
  assert.equal(elevated.isRecallDue, true);
  assert.ok(elevated.priorityScore > onTrack.priorityScore);

  // 3. Critical (Cavapoo with 7.0 weeks elapsed, exceeds 6.5w critical threshold)
  const critical = calculateCoatCadenceStatus({
    petBreed: 'Cavapoo',
    lastGroomDate: new Date('2026-09-26T10:00:00Z'), // 49 days = 7.0 weeks
    referenceDate: now,
  });
  assert.equal(critical.mattingRiskLevel, 'critical');
  assert.equal(critical.isRecallDue, true);
  assert.match(critical.careRecommendation, /URGENT/);
  assert.ok(critical.priorityScore > elevated.priorityScore);
});

test('generateCoatRecallSms generates tailored, high-converting recall messages with opt-out', () => {
  const sms = generateCoatRecallSms({
    clientName: 'Liam',
    petName: 'Winston',
    breed: 'Cavapoo',
    weeksSinceLastGroom: 6.5,
    salonName: 'Pawtrackr Sanctuary',
    bookingUrl: 'https://pawtrackr.com/book/sanctuary',
  });

  assert.match(sms, /Hi Liam!/);
  assert.match(sms, /Pawtrackr Sanctuary/);
  assert.match(sms, /Winston/);
  assert.match(sms, /friction tangling/);
  assert.match(sms, /https:\/\/pawtrackr\.com\/book\/sanctuary/);
  assert.match(sms, /Reply STOP to opt out/);
});

test('estimateRecapturableRevenueCents computes exact integer cent sums with zero variance', () => {
  const candidates = [
    { lastPackagePriceCents: 16000 },
    { lastPackagePriceCents: 19900 },
    { lastPackagePriceCents: 16900 },
  ];

  const totalCents = estimateRecapturableRevenueCents(candidates);
  assert.equal(totalCents, 52800); // $528.00 exactly
  assert.equal(estimateRecapturableRevenueCents([]), 0);
});
