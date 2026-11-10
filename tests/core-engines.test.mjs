import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { lookupAutomatedMunicipalTaxRate, calculateAtomicPOSCheckout, calculateMultiStylistSplit, reconcileEndOfDayDrawer } from '../src/lib/pos-math.ts';
import { buildSalonSearchIndex, executeMultiTokenSearch } from '../src/lib/search-engine.ts';

test('application POS and tip engines conserve cents across representative combinations', () => {
  const transactions = [];
  for (const base of [45.49, 135.49, 225.49]) {
    for (const taxRate of [0, 7.875, 8.63, 10.25]) {
      for (const tipPercent of [0, 15, 20, 30]) {
        const result = calculateAtomicPOSCheckout({
          basePackageDollars: base, addonItemsDollars: [18, 25.5],
          retailItemsDollars: [28], discountDollars: 10,
          taxRatePercent: taxRate, retailTaxRatePercent: taxRate + 0.75,
          tipMode: 'percent', tipPercent,
        });
        assert.equal(result.grossSubtotalCents - result.discountCents + result.taxCents + result.tipCents, result.totalCents);
        transactions.push({
          subtotal: result.subtotalDollars, discount: result.discountDollars,
          tax: result.taxDollars, tip: result.tipDollars, amount: result.totalDollars,
          payment_method: 'card',
        });
      }
    }
  }
  assert.equal(reconcileEndOfDayDrawer(transactions).varianceCents, 0);
  for (const pool of [100, 3333, 4501, 7777, 9999]) {
    const split = calculateMultiStylistSplit(pool, [
      { staffId: 'a', name: 'A', sharePercent: 33.33 },
      { staffId: 'b', name: 'B', sharePercent: 33.33 },
      { staffId: 'c', name: 'C', sharePercent: 33.34 },
    ]);
    assert.equal(split.reduce((sum, row) => sum + row.allocatedCents, 0), pool);
  }
});

test('application search engine isolates the salon and matches mixed tokens', () => {
  const clients = [
    { id: 'c1', business_id: 'a', name: 'Sophia Chen', phone: '(415) 890-4829' },
    { id: 'c2', business_id: 'b', name: 'Other Parent', phone: '(415) 890-4829' },
  ];
  const pets = [
    { id: 'p1', client_id: 'c1', business_id: 'a', name: 'Bello', breed: 'Goldendoodle', species: 'Canine', coat_type: 'curly', behavior_notes: '', behavior_tags: ['matted'] },
    { id: 'p2', client_id: 'c2', business_id: 'b', name: 'Bello', breed: 'Goldendoodle', species: 'Canine', coat_type: 'curly', behavior_notes: '', behavior_tags: ['matted'] },
  ];
  const index = buildSalonSearchIndex('a', pets, clients, []);
  assert.equal(index.length, 1);
  assert.deepEqual(executeMultiTokenSearch(index, 'bello 4829 doodle').results.map((row) => row.record.pet.id), ['p1']);
  assert.equal(executeMultiTokenSearch(index, 'other 4829').results.length, 0);
  const started = performance.now();
  for (let i = 0; i < 500; i++) executeMultiTokenSearch(index, 'bello 4829');
  assert.ok((performance.now() - started) / 500 < 10);
});

test('municipal tax lookup matches ZIP prefixes, not arbitrary digits', () => {
  assert.equal(lookupAutomatedMunicipalTaxRate('94103').serviceTaxRate, 8.63);
  assert.equal(lookupAutomatedMunicipalTaxRate('90405').retailTaxRate, 10.25);
  assert.equal(lookupAutomatedMunicipalTaxRate('10001').serviceTaxRate, 4.5);
  assert.equal(lookupAutomatedMunicipalTaxRate('New York').serviceTaxRate, 4.5);
  for (const zip of ['91004', '19040', '39410']) {
    assert.equal(lookupAutomatedMunicipalTaxRate(zip).serviceTaxRate, 8.25, zip);
  }
});

test('stylist split ignores non-positive weights and conserves the pool', () => {
  const split = calculateMultiStylistSplit(1001, [
    { staffId: 'a', name: 'A', sharePercent: 50 },
    { staffId: 'b', name: 'B', sharePercent: -20 },
    { staffId: 'c', name: 'C', sharePercent: 50 },
  ]);
  assert.equal(split.find((s) => s.staffId === 'b').allocatedCents, 0);
  assert.equal(split.reduce((n, s) => n + s.allocatedCents, 0), 1001);
  assert.deepEqual(calculateMultiStylistSplit(500, [{ staffId: 'a', name: 'A', sharePercent: 0 }]), []);
});
