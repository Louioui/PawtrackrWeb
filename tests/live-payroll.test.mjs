import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateCommissionCents,
  splitTipPool,
  sanitizeCsvCell,
  formatGustoPayrollCsv,
  formatQuickBooksPayrollCsv,
  computePeriodTotals,
  DEFAULT_COMMISSION_RATES,
} from '../src/lib/live-payroll.ts';

test('calculateCommissionCents computes accurate integer-cent commission using half-up rounding', () => {
  // $125.00 gross (12500 cents) at 40% = 5000 cents ($50.00)
  assert.equal(calculateCommissionCents(12500, 40.0), 5000);

  // $95.50 gross (9550 cents) at 45% = 4297.5 cents -> 4298 cents ($42.98)
  assert.equal(calculateCommissionCents(9550, 45.0), 4298);

  // $80.33 gross (8033 cents) at 50% = 4016.5 cents -> 4017 cents ($40.17)
  assert.equal(calculateCommissionCents(8033, 50.0), 4017);

  // 0% rate or 0 gross yields 0
  assert.equal(calculateCommissionCents(10000, 0), 0);
  assert.equal(calculateCommissionCents(0, 40.0), 0);
});

test('splitTipPool in direct mode passes 100% of tips to stylists with 0 pooled tips', () => {
  const directTips = {
    staff_1: 4500, // $45.00
    staff_2: 3200, // $32.00
    staff_bather: 1000, // $10.00
  };
  const roles = {
    staff_1: 'senior_groomer',
    staff_2: 'groomer',
    staff_bather: 'bather',
  };

  const split = splitTipPool(directTips, roles, 15.0, 'direct');

  assert.equal(split.directTipsCents.staff_1, 4500);
  assert.equal(split.directTipsCents.staff_2, 3200);
  assert.equal(split.directTipsCents.staff_bather, 1000);

  assert.equal(split.pooledTipsCents.staff_1, 0);
  assert.equal(split.pooledTipsCents.staff_2, 0);
  assert.equal(split.pooledTipsCents.staff_bather, 0);

  assert.equal(split.totalTipsCents.staff_1, 4500);
  assert.equal(split.totalTipsCents.staff_2, 3200);
  assert.equal(split.totalTipsCents.staff_bather, 1000);

  const initialTotal = Object.values(directTips).reduce((a, b) => a + b, 0);
  const finalTotal = Object.values(split.totalTipsCents).reduce((a, b) => a + b, 0);
  assert.equal(finalTotal, initialTotal);
});

test('splitTipPool in bather_split mode enforces 0¢ rounding drift invariant across multiple bathers and odd cents', () => {
  const directTips = {
    groomer_1: 10001, // $100.01 (odd cents)
    groomer_2: 7555,  // $75.55 (odd cents)
    bather_1: 500,    // $5.00
    bather_2: 0,
    bather_3: 0,
  };
  const roles = {
    groomer_1: 'senior_groomer',
    groomer_2: 'groomer',
    bather_1: 'bather',
    bather_2: 'bather',
    bather_3: 'bather',
  };

  const split = splitTipPool(directTips, roles, 15.0, 'bather_split');

  // Total input tips
  const initialTotal = Object.values(directTips).reduce((a, b) => a + b, 0);
  // Total output tips
  const finalTotal = Object.values(split.totalTipsCents).reduce((a, b) => a + b, 0);

  // Invariant: Zero cent drift
  assert.equal(finalTotal, initialTotal, 'Total tips after split must match input cents exactly');

  // Verify bathers received the pool
  const bather1Pool = split.pooledTipsCents.bather_1;
  const bather2Pool = split.pooledTipsCents.bather_2;
  const bather3Pool = split.pooledTipsCents.bather_3;

  assert.ok(bather1Pool > 0);
  assert.ok(bather2Pool > 0);
  assert.ok(bather3Pool > 0);

  // Difference between any two bathers cannot exceed 1 cent
  assert.ok(Math.abs(bather1Pool - bather2Pool) <= 1);
  assert.ok(Math.abs(bather2Pool - bather3Pool) <= 1);
  assert.ok(Math.abs(bather1Pool - bather3Pool) <= 1);

  // Groomers retained 85% of their tips
  // 10001 * 0.85 = 8500.85 -> 8501 cents kept
  assert.equal(split.directTipsCents.groomer_1, 8501);
  // 7555 * 0.85 = 6421.75 -> 6422 cents kept
  assert.equal(split.directTipsCents.groomer_2, 6422);
});

test('splitTipPool with 0 bathers safely defaults to 100% stylist retention', () => {
  const directTips = {
    groomer_1: 8000,
    groomer_2: 6000,
  };
  const roles = {
    groomer_1: 'senior_groomer',
    groomer_2: 'groomer',
  };

  const split = splitTipPool(directTips, roles, 15.0, 'bather_split');
  assert.equal(split.totalTipsCents.groomer_1, 8000);
  assert.equal(split.totalTipsCents.groomer_2, 6000);
});

test('sanitizeCsvCell neutralizes formula injection triggers and escapes internal quotes', () => {
  // Formula triggers: =, @, \t, and non-numeric +, - formulas
  assert.equal(sanitizeCsvCell('=SUM(A1:B10)'), '"\'=SUM(A1:B10)"');
  assert.equal(sanitizeCsvCell('@cmd'), '"\'@cmd"');
  assert.equal(sanitizeCsvCell('\ttext'), '"\'\ttext"');
  assert.equal(sanitizeCsvCell('-2+3+cmd'), '"\'-2+3+cmd"');

  // Double quote escaping
  assert.equal(sanitizeCsvCell('John "The Groomer" Doe'), '"John ""The Groomer"" Doe"');

  // Standard safe strings and numeric values (preserving negative financial values)
  assert.equal(sanitizeCsvCell('Sarah Connor'), '"Sarah Connor"');
  assert.equal(sanitizeCsvCell(123.45), '"123.45"');
  assert.equal(sanitizeCsvCell(-15), '"-15"');
  assert.equal(sanitizeCsvCell('-15.00'), '"-15.00"');
  assert.equal(sanitizeCsvCell(null), '""');
  assert.equal(sanitizeCsvCell(''), '""');
});

test('formatGustoPayrollCsv formats compliant CSV with exact decimal dollars', () => {
  const summary = computePeriodTotals(
    '2026-11-01',
    '2026-11-14',
    [
      {
        staffId: 'staff-1',
        staffName: 'Sarah Stylist',
        role: 'senior_groomer',
        commissionRatePct: 45.0,
        serviceCount: 22,
        grossServiceCents: 220000, // $2,200.00
        commissionCents: 99000,    // $990.00
        directTipsCents: 33000,    // $330.00
        pooledTipsCents: 0,
        totalTipsCents: 33000,     // $330.00
        adjustmentsCents: 0,
        netPayoutCents: 132000,    // $1,320.00
      },
      {
        staffId: 'staff-2',
        staffName: 'Bob Bather',
        role: 'bather',
        commissionRatePct: 0.0,
        serviceCount: 15,
        grossServiceCents: 0,
        commissionCents: 0,
        directTipsCents: 0,
        pooledTipsCents: 8500,     // $85.00
        totalTipsCents: 8500,      // $85.00
        adjustmentsCents: -1500,   // -$15.00 clawback
        netPayoutCents: 7000,      // $70.00
      },
    ],
    'locked',
    'bather_split',
    15.0
  );

  const csv = formatGustoPayrollCsv(summary);
  const lines = csv.split('\n');

  assert.equal(lines.length, 3); // 1 header + 2 data rows
  assert.ok(lines[0].includes('Employee Name'));
  assert.ok(lines[0].includes('Total Payout ($)'));

  // Sarah row
  assert.ok(lines[1].includes('"Sarah Stylist"'));
  assert.ok(lines[1].includes('"990.00"'));
  assert.ok(lines[1].includes('"330.00"'));
  assert.ok(lines[1].includes('"1320.00"'));

  // Bob row
  assert.ok(lines[2].includes('"Bob Bather"'));
  assert.ok(lines[2].includes('"-15.00"'));
  assert.ok(lines[2].includes('"70.00"'));
});

test('formatQuickBooksPayrollCsv formats compliant CSV', () => {
  const summary = computePeriodTotals(
    '2026-11-01',
    '2026-11-14',
    [
      {
        staffId: 'staff-1',
        staffName: 'Alice Groomer',
        role: 'groomer',
        commissionRatePct: 40.0,
        serviceCount: 10,
        grossServiceCents: 100000,
        commissionCents: 40000,
        directTipsCents: 15000,
        pooledTipsCents: 0,
        totalTipsCents: 15000,
        adjustmentsCents: 0,
        netPayoutCents: 55000,
      },
    ]
  );

  const csv = formatQuickBooksPayrollCsv(summary);
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('Gross Pay ($)'));
  assert.ok(lines[1].includes('"Alice Groomer"'));
  assert.ok(lines[1].includes('"550.00"'));
});

test('computePeriodTotals calculates house retained and aggregate metrics correctly', () => {
  const summary = computePeriodTotals('2026-11-01', '2026-11-14', [
    {
      staffId: 's1',
      staffName: 'S1',
      role: 'groomer',
      commissionRatePct: 40,
      serviceCount: 5,
      grossServiceCents: 50000, // $500.00
      commissionCents: 20000,   // $200.00
      directTipsCents: 5000,    // $50.00
      pooledTipsCents: 0,
      totalTipsCents: 5000,
      adjustmentsCents: 0,
      netPayoutCents: 25000,    // $250.00
    },
  ]);

  assert.equal(summary.totalGrossCents, 50000);
  assert.equal(summary.totalCommissionCents, 20000);
  assert.equal(summary.totalTipsCents, 5000);
  assert.equal(summary.totalPayoutCents, 25000);
  assert.equal(summary.totalHouseRetainedCents, 30000); // $500 - $200 = $300
});

test('DEFAULT_COMMISSION_RATES defines valid standard percentages for all roles', () => {
  assert.equal(DEFAULT_COMMISSION_RATES.owner, 50.0);
  assert.equal(DEFAULT_COMMISSION_RATES.senior_groomer, 45.0);
  assert.equal(DEFAULT_COMMISSION_RATES.groomer, 40.0);
  assert.equal(DEFAULT_COMMISSION_RATES.bather, 0.0);
  assert.equal(DEFAULT_COMMISSION_RATES.front_desk, 0.0);
  assert.equal(DEFAULT_COMMISSION_RATES.manager, 0.0);
});
