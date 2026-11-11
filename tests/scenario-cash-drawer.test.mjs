// Scenario: the 4:59 PM cash drawer.
//
// A salon closes out after a full day of mixed services, add-ons, discounts,
// tips and local tax rates. The report must match to the cent, every day.
// These tests check the money engine against an integer-only reference rather
// than against values computed the same way, so they can catch real drift.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAtomicPOSCheckout,
  multiplyCentsByPercent,
  reconcileEndOfDayDrawer,
  toCents,
} from '../src/lib/pos-math.ts';

// Half-up rounding done purely in integers: no floating point anywhere.
const referencePercentOf = (cents, basisPoints) => Math.floor((cents * basisPoints + 5000) / 10000);

// Real US combined sales tax rates, including ones that are not exact in binary.
const RATES = [
  { percent: 7, bps: 700 },
  { percent: 8.25, bps: 825 },
  { percent: 8.63, bps: 863 },
  { percent: 8.75, bps: 875 },
  { percent: 9.5, bps: 950 },
  { percent: 10.25, bps: 1025 },
];

test('tax on every amount from $0.00 to $1,000.00 matches integer arithmetic at real rates', () => {
  for (const { percent, bps } of RATES) {
    for (let cents = 0; cents <= 100_000; cents += 1) {
      const actual = multiplyCentsByPercent(cents, percent);
      const expected = referencePercentOf(cents, bps);
      if (actual !== expected) {
        assert.fail(`${percent}% of ${cents}¢ gave ${actual}¢, expected ${expected}¢`);
      }
    }
  }
});

test('exact half-cent tax rounds up, the way a register does', () => {
  // 8.75% of $125.00 is 1093.75¢ and 8% of $0.0625 style halves.
  assert.equal(multiplyCentsByPercent(12_500, 8.75), 1094);
  // 10% of 5¢ is exactly 0.5¢.
  assert.equal(multiplyCentsByPercent(5, 10), 1);
  // 8.25% of 200¢ is exactly 16.5¢.
  assert.equal(multiplyCentsByPercent(200, 8.25), 17);
});

test('prices that trip up floating point convert to exact cents', () => {
  for (const [dollars, cents] of [
    [19.99, 1999], [8.95, 895], [0.07, 7], [0.1 + 0.2, 30], ['145.00', 14500], [1.005, 101], [4.35, 435],
  ]) {
    assert.equal(toCents(dollars), cents, String(dollars));
  }
});

// A realistic spread of tickets a groomer rings up in a week.
function* realisticTickets() {
  const bases = [45, 65, 85, 95, 110, 125, 145.5, 187];
  const addonSets = [[], [12], [18, 12.5], [25], [9.99, 14.99]];
  const discounts = [0, 5, 10, 22.5, 1000];
  const tips = [
    { tipMode: 'percent', tipPercent: 0 },
    { tipMode: 'percent', tipPercent: 15 },
    { tipMode: 'percent', tipPercent: 20 },
    { tipMode: 'custom', customTipDollars: 7.5 },
  ];
  for (const base of bases) {
    for (const addonItemsDollars of addonSets) {
      for (const discountDollars of discounts) {
        for (const tip of tips) {
          for (const { percent } of RATES) {
            yield { basePackageDollars: base, addonItemsDollars, discountDollars, taxRatePercent: percent, ...tip };
          }
        }
      }
    }
  }
}

test('every realistic ticket balances: subtotal minus discount plus tax plus tip equals total', () => {
  let tickets = 0;
  for (const params of realisticTickets()) {
    const r = calculateAtomicPOSCheckout(params);
    tickets += 1;
    for (const key of ['grossSubtotalCents', 'discountCents', 'taxCents', 'tipCents', 'totalCents']) {
      assert.ok(Number.isSafeInteger(r[key]) && r[key] >= 0, `${key} must be whole cents: ${r[key]}`);
    }
    // A discount larger than the bill never makes the bill negative.
    assert.ok(r.discountCents <= r.grossSubtotalCents);
    assert.equal(r.taxableSubtotalCents, r.grossSubtotalCents - r.discountCents);
    assert.equal(r.taxCents, r.serviceTaxCents + r.retailTaxCents);
    assert.equal(r.totalCents, r.taxableSubtotalCents + r.taxCents + r.tipCents);
    // Tax is charged on the discounted price, at the integer reference rate.
    const bps = RATES.find((rate) => rate.percent === params.taxRatePercent).bps;
    assert.equal(r.taxCents, referencePercentOf(r.taxableSubtotalCents, bps));
  }
  assert.ok(tickets > 3000);
});

test('a discount bigger than the services spills onto retail and never goes negative', () => {
  const r = calculateAtomicPOSCheckout({
    basePackageDollars: 40, addonItemsDollars: [], retailItemsDollars: [30],
    discountDollars: 55, taxRatePercent: 8.63, retailTaxRatePercent: 9.5, tipMode: 'percent', tipPercent: 0,
  });
  // $70 gross - $55 = $15 left, all of it retail.
  assert.equal(r.taxableSubtotalCents, 1500);
  assert.equal(r.serviceTaxCents, 0);
  assert.equal(r.retailTaxCents, referencePercentOf(1500, 950));
});

test('a gift card covers at most the bill and leaves the right balance', () => {
  const r = calculateAtomicPOSCheckout({
    basePackageDollars: 50, addonItemsDollars: [], giftCardCreditDollars: 500,
    taxRatePercent: 8.25, tipMode: 'percent', tipPercent: 0,
  });
  assert.equal(r.giftCardAppliedCents, r.totalCents);
  assert.equal(r.netBalanceDueCents, 0);
});

test('a busy Friday of 60 checkouts closes with zero variance and matching totals', () => {
  const transactions = [];
  let expectedCollected = 0;
  let expectedCash = 0;
  let i = 0;
  for (const params of realisticTickets()) {
    if (i++ % 53 !== 0) continue; // a spread across the grid
    const r = calculateAtomicPOSCheckout(params);
    const method = transactions.length % 3 === 0 ? 'cash' : transactions.length % 3 === 1 ? 'card' : 'apple_pay';
    // Stored as the checkout route stores them: dollars with two decimals.
    transactions.push({
      subtotal: r.subtotalDollars, discount: r.discountDollars, tax: r.taxDollars,
      tip: r.tipDollars, amount: r.totalDollars, payment_method: method,
    });
    expectedCollected += r.totalCents;
    if (method === 'cash') expectedCash += r.totalCents;
    if (transactions.length === 60) break;
  }
  const report = reconcileEndOfDayDrawer(transactions);
  assert.equal(report.varianceCents, 0);
  assert.equal(report.isBalancedToPenny, true);
  assert.equal(toCents(report.totalCollectedDollars), expectedCollected);
  assert.equal(toCents(report.cashDollars), expectedCash);
  assert.equal(toCents(report.cashDollars) + toCents(report.cardDollars), expectedCollected);
});

test('a record that was altered after checkout is caught as a variance', () => {
  const r = calculateAtomicPOSCheckout({
    basePackageDollars: 95, addonItemsDollars: [18], taxRatePercent: 8.63, tipMode: 'percent', tipPercent: 20,
  });
  const report = reconcileEndOfDayDrawer([{
    subtotal: r.subtotalDollars, discount: r.discountDollars, tax: r.taxDollars,
    tip: r.tipDollars, amount: r.totalDollars + 0.01, payment_method: 'cash',
  }]);
  assert.equal(report.varianceCents, 1);
  assert.equal(report.isBalancedToPenny, false);
});

test('a split payment is reported on its own, not counted as card', () => {
  const report = reconcileEndOfDayDrawer([
    { subtotal: 100, discount: 0, tax: 8.25, tip: 0, amount: 108.25, payment_method: 'cash' },
    { subtotal: 50, discount: 0, tax: 4.13, tip: 10, amount: 64.13, payment_method: 'split' },
    { subtotal: 80, discount: 0, tax: 6.6, tip: 16, amount: 102.6, payment_method: 'card' },
  ]);
  assert.equal(report.cashDollars, 108.25);
  assert.equal(report.cardDollars, 102.6);
  assert.equal(report.splitDollars, 64.13);
  assert.equal(toCents(report.cashDollars) + toCents(report.cardDollars) + toCents(report.splitDollars),
    toCents(report.totalCollectedDollars));
  assert.equal(report.varianceCents, 0);
});
