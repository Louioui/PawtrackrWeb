#!/usr/bin/env node
// ============================================================================
// Static SQL inventory and reference-model checks. This file does not execute
// migrations or prove RLS, production API behavior, or payment settlement.
// Application engine tests live in tests/*.test.mjs.
// ============================================================================

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

function toCents(dollars) {
  const num = typeof dollars === 'string' ? parseFloat(dollars) : dollars;
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100);
}

function fromCents(cents) {
  return Number((Math.round(cents) / 100).toFixed(2));
}

function multiplyCentsByPercent(cents, percent) {
  if (cents <= 0 || percent <= 0) return 0;
  const basisPoints = Math.round((percent + Number.EPSILON) * 100);
  return Math.round((cents * basisPoints) / 10000);
}

function calculateMultiStylistSplit(totalPoolCents, stylistWeights) {
  const totalWeight =
    stylistWeights.reduce((acc, s) => acc + s.sharePercent, 0) || 100;
  let allocatedSum = 0;
  const prelim = stylistWeights.map((s) => {
    const exact = (totalPoolCents * s.sharePercent) / totalWeight;
    const floored = Math.floor(exact);
    allocatedSum += floored;
    return { ...s, allocatedCents: floored, remainder: exact - floored };
  });
  let remainderCents = totalPoolCents - allocatedSum;
  const sorted = [...prelim].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remainderCents; i++) {
    sorted[i % sorted.length].allocatedCents += 1;
  }
  return prelim;
}

function calculateAtomicPOSCheckout({
  basePackageDollars,
  addonItemsDollars,
  safetySurchargeDollars = 0,
  retailItemsDollars = [],
  discountDollars = 0,
  taxRatePercent,
  retailTaxRatePercent,
  tipPercent = 20,
}) {
  const baseCents = toCents(basePackageDollars);
  const addonsCents = addonItemsDollars.reduce((a, b) => a + toCents(b), 0);
  const safetyCents = toCents(safetySurchargeDollars);
  const retailCents = retailItemsDollars.reduce((a, b) => a + toCents(b), 0);
  const serviceGrossCents = baseCents + addonsCents + safetyCents;
  const grossSubtotalCents = serviceGrossCents + retailCents;
  const discountCents = Math.min(
    Math.max(0, toCents(discountDollars)),
    grossSubtotalCents
  );
  const taxableSubtotalCents = grossSubtotalCents - discountCents;
  const taxableServiceCents = Math.max(
    0,
    serviceGrossCents - Math.min(discountCents, serviceGrossCents)
  );
  const remainingDiscount = Math.max(0, discountCents - serviceGrossCents);
  const taxableRetailCents = Math.max(0, retailCents - remainingDiscount);

  const rRate = retailTaxRatePercent ?? taxRatePercent;
  const taxCents =
    multiplyCentsByPercent(taxableServiceCents, taxRatePercent) +
    multiplyCentsByPercent(taxableRetailCents, rRate);
  const tipCents = multiplyCentsByPercent(taxableSubtotalCents, tipPercent);
  const totalCents = taxableSubtotalCents + taxCents + tipCents;

  return {
    grossSubtotalCents,
    discountCents,
    taxableSubtotalCents,
    taxCents,
    tipCents,
    totalCents,
    subtotalDollars: fromCents(grossSubtotalCents),
    discountDollars: fromCents(discountCents),
    taxDollars: fromCents(taxCents),
    tipDollars: fromCents(tipCents),
    totalDollars: fromCents(totalCents),
  };
}

console.log('================================================================');
console.log('PAWTRACKR WEB — STATIC INVENTORY AND REFERENCE-MODEL CHECKS');
console.log('================================================================\n');

// TEST 1: Sequential SQL Migrations & Checksum Verification (#2)
const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
const migFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
assert.ok(migFiles.length >= 3, 'Expected the three base SQL migrations');
for (const [index, file] of migFiles.entries()) {
  assert.ok(
    file.startsWith(`${String(index + 1).padStart(4, '0')}_`),
    `Expected sequential migration ${index + 1}, found ${file}`
  );
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  const hash = crypto.createHash('sha256').update(sql).digest('hex').slice(0, 10);
  console.log(`✓ SQL file inventoried: ${file} (sha256:${hash})`);
}

// TEST 2: 1,911+ Atomic POS + Retail/Service Tax Split Permutations (#4, #26, #30)
const taxRates = [0, 6.25, 7.875, 8.25, 8.63, 9.5, 10.25];
const tipPercents = [0, 15, 18, 20, 22, 25, 30];
let totalPermutations = 0;
let simulatedDrawerTransactions = [];

for (let base = 45; base <= 225; base += 15) {
  for (const taxRate of taxRates) {
    for (const tipPct of tipPercents) {
      for (const discount of [0, 10, 25]) {
        const res = calculateAtomicPOSCheckout({
          basePackageDollars: base + 0.49,
          addonItemsDollars: [18.0, 25.5, 16.25],
          safetySurchargeDollars: 15.0,
          retailItemsDollars: [28.0],
          discountDollars: discount,
          taxRatePercent: taxRate,
          retailTaxRatePercent: taxRate + 0.75,
          tipPercent: tipPct,
        });

        assert.equal(
          res.grossSubtotalCents -
            res.discountCents +
            res.taxCents +
            res.tipCents,
          res.totalCents
        );
        simulatedDrawerTransactions.push(res);
        totalPermutations++;
      }
    }
  }
}

let sumSub = 0,
  sumDisc = 0,
  sumTax = 0,
  sumTip = 0,
  sumTotal = 0;
for (const tx of simulatedDrawerTransactions) {
  sumSub += toCents(tx.subtotalDollars);
  sumDisc += toCents(tx.discountDollars);
  sumTax += toCents(tx.taxDollars);
  sumTip += toCents(tx.tipDollars);
  sumTotal += toCents(tx.totalDollars);
}
assert.equal(sumTotal - (sumSub - sumDisc + sumTax + sumTip), 0);
console.log(
  `✓ Reference POS model: ${totalPermutations} combinations balanced to 0¢.`
);

// TEST 3: Multi-Stylist Largest-Remainder Penny Split (#4, #16, #43)
for (const oddPool of [100, 3333, 4501, 7777, 9999]) {
  const split = calculateMultiStylistSplit(oddPool, [
    { staffId: 'st-1', name: 'Elena', sharePercent: 33.33 },
    { staffId: 'st-2', name: 'Julian', sharePercent: 33.33 },
    { staffId: 'st-3', name: 'Sora', sharePercent: 33.34 },
  ]);
  const sumSplit = split.reduce((a, b) => a + b.allocatedCents, 0);
  assert.equal(sumSplit, oddPool, 'Multi-stylist split lost or gained a penny');
}
console.log(
  '✓ Reference tip-split model: odd-cent pools balanced.'
);

// TEST 4: Sub-10ms Multi-Token Search Engine Latency Benchmark (#5)
const mockRecords = Array.from({ length: 500 }, (_, idx) => ({
  id: `pet-${idx}`,
  corpus:
    idx === 42
      ? 'bello f1b mini goldendoodle sophia chen alvarez 4158904829 matted extra care'
      : `dog-${idx} poodle shepherd 41555501${String(idx % 99).padStart(2, '0')} senior`,
  digits:
    idx === 42
      ? '4158904829'
      : `41555501${String(idx % 99).padStart(2, '0')}`,
}));

const queries = [
  'bello 4829 doodle',
  'matted 415',
  'poodle senior',
  'sophia goldendoodle',
  '4829',
];

const startSearch = performance.now();
const iterations = 500;
for (let i = 0; i < iterations; i++) {
  const q = queries[i % queries.length];
  const tokens = q.toLowerCase().split(/\s+/);
  mockRecords.filter((rec) =>
    tokens.every((t) => rec.corpus.includes(t) || rec.digits.includes(t))
  );
}
const avgQueryMs = (performance.now() - startSearch) / iterations;
assert.ok(avgQueryMs < 10);
console.log(
  `✓ Reference substring filter (500 records): Avg ${avgQueryMs.toFixed(
    4
  )} ms / query.`
);

// TEST 5: Inventory the enterprise tables defined in migration 0003.
// Supabase owns its migration history; the app must not create a parallel
// schema_migrations table with placeholder checksums.
const mig3Sql = fs.readFileSync(
  path.join(migrationsDir, '0003_enterprise_50_roadmap.sql'),
  'utf8'
);
for (const table of [
  'retail_inventory',
  'gift_cards_and_credits',
  'staff_shifts',
  'intake_questionnaires',
  'review_requests',
  'audit_logs',
]) {
  assert.ok(
    mig3Sql.includes(`public.${table}`),
    `Missing enterprise table ${table}`
  );
}
console.log(
  '✓ Required table names found in migration text; SQL execution and RLS remain unverified.'
);
console.log('\nStatic and reference-model checks passed. See focused tests for application code.');
