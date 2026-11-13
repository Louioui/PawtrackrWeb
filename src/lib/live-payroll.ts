// ============================================================================
// PAWTRACKR WEB — LIVE PAYROLL, COMMISSIONS & TIP POOL ENGINE (V1)
// Adheres strictly to integer-cent financial safety (pos-math.ts) for absolute
// $0.00 cash reconciliation and zero-cent rounding drift in tip distribution.
// ============================================================================

import { fromCents, multiplyCentsByPercent, toCents, formatCents } from './pos-math.ts';

export type PayrollPeriodStatus = 'open' | 'locked' | 'exported';
export type TipPoolMode = 'direct' | 'bather_split';

export interface StaffPayrollLine {
  staffId: string;
  staffName: string;
  role: 'owner' | 'manager' | 'front_desk' | 'senior_groomer' | 'groomer' | 'bather' | string;
  commissionRatePct: number;
  serviceCount: number;
  grossServiceCents: number;
  commissionCents: number;
  directTipsCents: number;
  pooledTipsCents: number;
  totalTipsCents: number;
  adjustmentsCents: number;
  netPayoutCents: number;
}

export interface PayrollPeriodSummary {
  periodId?: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollPeriodStatus;
  tipPoolMode: TipPoolMode;
  batherPoolPct: number;
  staffLines: StaffPayrollLine[];
  totalGrossCents: number;
  totalCommissionCents: number;
  totalTipsCents: number;
  totalAdjustmentsCents: number;
  totalPayoutCents: number;
  totalHouseRetainedCents: number;
  lockedAt?: string | null;
  lockedBy?: string | null;
  notes?: string | null;
}

export const DEFAULT_COMMISSION_RATES: Record<string, number> = {
  owner: 50.0,
  senior_groomer: 45.0,
  groomer: 40.0,
  bather: 0.0,
  front_desk: 0.0,
  manager: 0.0,
};

/**
 * Calculates staff commission in exact integer cents using commercial half-up rounding.
 */
export function calculateCommissionCents(grossServiceCents: number, commissionRatePct: number): number {
  if (grossServiceCents <= 0 || commissionRatePct <= 0) return 0;
  return multiplyCentsByPercent(grossServiceCents, commissionRatePct);
}

/**
 * Splits tips between direct stylist retention and bather pool.
 * Guarantees mathematical invariant: SUM(totalTipsCents) === SUM(directTipsByStaff)
 * with absolute zero-cent rounding drift.
 */
export function splitTipPool(
  directTipsByStaff: Record<string, number>,
  staffRoles: Record<string, string>,
  batherPoolPct: number = 15.0,
  tipPoolMode: TipPoolMode = 'direct'
): {
  directTipsCents: Record<string, number>;
  pooledTipsCents: Record<string, number>;
  totalTipsCents: Record<string, number>;
} {
  const staffIds = Object.keys(directTipsByStaff);
  const directTipsCents: Record<string, number> = {};
  const pooledTipsCents: Record<string, number> = {};
  const totalTipsCents: Record<string, number> = {};

  // Default / 100% direct mode or invalid bather percentage
  if (tipPoolMode === 'direct' || batherPoolPct <= 0 || batherPoolPct >= 100) {
    for (const id of staffIds) {
      const tip = Math.max(0, directTipsByStaff[id] ?? 0);
      directTipsCents[id] = tip;
      pooledTipsCents[id] = 0;
      totalTipsCents[id] = tip;
    }
    return { directTipsCents, pooledTipsCents, totalTipsCents };
  }

  // Identify active bathers
  const batherIds = staffIds.filter((id) => staffRoles[id] === 'bather').sort();
  const batherCount = batherIds.length;

  // If no bathers are present, stylists keep 100% of their tips
  if (batherCount === 0) {
    for (const id of staffIds) {
      const tip = Math.max(0, directTipsByStaff[id] ?? 0);
      directTipsCents[id] = tip;
      pooledTipsCents[id] = 0;
      totalTipsCents[id] = tip;
    }
    return { directTipsCents, pooledTipsCents, totalTipsCents };
  }

  let totalBatherPoolCents = 0;

  // Step 1: Stylists contribute batherPoolPct to the pool
  for (const id of staffIds) {
    const role = staffRoles[id] ?? 'groomer';
    const originalTip = Math.max(0, directTipsByStaff[id] ?? 0);

    if (role === 'bather') {
      // Bathers don't contribute their own tips to the pool, they receive from it
      directTipsCents[id] = originalTip;
      pooledTipsCents[id] = 0;
    } else {
      // Stylists retain (100 - batherPoolPct)%
      const keptCent = multiplyCentsByPercent(originalTip, 100 - batherPoolPct);
      const contribution = originalTip - keptCent;
      directTipsCents[id] = keptCent;
      pooledTipsCents[id] = 0;
      totalBatherPoolCents += contribution;
    }
  }

  // Step 2: Distribute pool equally among bathers with remainder cent allocation
  const basePoolPerBather = Math.floor(totalBatherPoolCents / batherCount);
  const remainderCents = totalBatherPoolCents % batherCount;

  batherIds.forEach((batherId, index) => {
    // Award 1 remainder cent to the first N bathers to ensure zero cent loss
    const extraCent = index < remainderCents ? 1 : 0;
    pooledTipsCents[batherId] = (pooledTipsCents[batherId] ?? 0) + basePoolPerBather + extraCent;
  });

  // Step 3: Compute total tips for each staff member
  for (const id of staffIds) {
    totalTipsCents[id] = (directTipsCents[id] ?? 0) + (pooledTipsCents[id] ?? 0);
  }

  return { directTipsCents, pooledTipsCents, totalTipsCents };
}

/**
 * Sanitizes CSV cell values to prevent formula injection (CSV Injection / OWASP).
 * Prepends a single quote if the value begins with '=', '@', '\t', '\r', or non-numeric '+', '-'.
 * Legitimate negative/positive numbers (e.g. financial adjustments -15.00) remain numeric.
 */
export function sanitizeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const rawStr = String(value);
  if (rawStr.trim() === '') return '""';

  // Check if raw value starts with tab or carriage return
  if (rawStr.startsWith('\t') || rawStr.startsWith('\r')) {
    return `"'\t${rawStr.trim().replace(/"/g, '""')}"`;
  }

  const trimmed = rawStr.trim();
  const isPureNumber = typeof value === 'number' || (!Number.isNaN(Number(trimmed)) && !/^0\d+/.test(trimmed));

  // If it's a legitimate number, don't break financial parsing
  if (isPureNumber) {
    return `"${trimmed.replace(/"/g, '""')}"`;
  }

  // Defend against formula triggers: =, @, or non-numeric +, -
  const startsWithTrigger =
    trimmed.startsWith('=') ||
    trimmed.startsWith('@') ||
    trimmed.startsWith('+') ||
    trimmed.startsWith('-');

  let sanitized = trimmed;
  if (startsWithTrigger) {
    sanitized = `'${trimmed}`;
  }

  // Escape internal double quotes by doubling them
  return `"${sanitized.replace(/"/g, '""')}"`;
}

/**
 * Formats a PayrollPeriodSummary into a Gusto-compatible CSV string.
 */
export function formatGustoPayrollCsv(summary: PayrollPeriodSummary): string {
  const headers = [
    'Employee Name',
    'Employee ID',
    'Role',
    'Service Count',
    'Commission ($)',
    'Tips ($)',
    'Adjustments ($)',
    'Total Payout ($)',
    'Memo',
  ];

  const rows = summary.staffLines.map((line) => [
    sanitizeCsvCell(line.staffName),
    sanitizeCsvCell(line.staffId),
    sanitizeCsvCell(line.role),
    sanitizeCsvCell(line.serviceCount),
    sanitizeCsvCell(fromCents(line.commissionCents).toFixed(2)),
    sanitizeCsvCell(fromCents(line.totalTipsCents).toFixed(2)),
    sanitizeCsvCell(fromCents(line.adjustmentsCents).toFixed(2)),
    sanitizeCsvCell(fromCents(line.netPayoutCents).toFixed(2)),
    sanitizeCsvCell(`Payroll Period ${summary.periodStart} to ${summary.periodEnd}`),
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

/**
 * Formats a PayrollPeriodSummary into a QuickBooks-compatible CSV string.
 */
export function formatQuickBooksPayrollCsv(summary: PayrollPeriodSummary): string {
  const headers = [
    'Name',
    'Staff Role',
    'Gross Service ($)',
    'Commission Amount ($)',
    'Gratuity/Tips ($)',
    'Adjustments ($)',
    'Gross Pay ($)',
  ];

  const rows = summary.staffLines.map((line) => [
    sanitizeCsvCell(line.staffName),
    sanitizeCsvCell(line.role),
    sanitizeCsvCell(fromCents(line.grossServiceCents).toFixed(2)),
    sanitizeCsvCell(fromCents(line.commissionCents).toFixed(2)),
    sanitizeCsvCell(fromCents(line.totalTipsCents).toFixed(2)),
    sanitizeCsvCell(fromCents(line.adjustmentsCents).toFixed(2)),
    sanitizeCsvCell(fromCents(line.netPayoutCents).toFixed(2)),
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

/**
 * Computes the aggregate period summary given individual staff lines.
 */
export function computePeriodTotals(
  periodStart: string,
  periodEnd: string,
  staffLines: StaffPayrollLine[],
  status: PayrollPeriodStatus = 'open',
  tipPoolMode: TipPoolMode = 'direct',
  batherPoolPct: number = 0.0,
  notes: string | null = null
): PayrollPeriodSummary {
  let totalGrossCents = 0;
  let totalCommissionCents = 0;
  let totalTipsCents = 0;
  let totalAdjustmentsCents = 0;
  let totalPayoutCents = 0;

  for (const line of staffLines) {
    totalGrossCents += line.grossServiceCents;
    totalCommissionCents += line.commissionCents;
    totalTipsCents += line.totalTipsCents;
    totalAdjustmentsCents += line.adjustmentsCents;
    totalPayoutCents += line.netPayoutCents;
  }

  const totalHouseRetainedCents = totalGrossCents - totalCommissionCents;

  return {
    periodStart,
    periodEnd,
    status,
    tipPoolMode,
    batherPoolPct,
    staffLines,
    totalGrossCents,
    totalCommissionCents,
    totalTipsCents,
    totalAdjustmentsCents,
    totalPayoutCents,
    totalHouseRetainedCents,
    notes,
  };
}
