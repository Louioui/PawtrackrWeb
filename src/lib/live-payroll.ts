// ============================================================================
// PAWTRACKR WEB — LIVE PAYROLL, COMMISSIONS & TIP POOL ENGINE (V1)
// Adheres strictly to integer-cent financial safety (pos-math.ts) for absolute
// $0.00 cash reconciliation and zero-cent rounding drift in tip distribution.
// ============================================================================

import { fromCents, multiplyCentsByPercent, toCents, formatCents } from './pos-math.ts';

export type PayrollPeriodStatus = 'open' | 'locked' | 'exported';
export type TipPoolMode = 'direct' | 'bather_split';

export interface CommissionTier {
  /** Upper threshold in integer cents for this marginal bracket; null = unbounded top bracket */
  upToCents: number | null;
  /** Marginal commission rate percentage (0 - 100) applied to gross revenue within this bracket */
  ratePct: number;
  label?: string;
}

export const DEFAULT_PROGRESSIVE_COMMISSION_TIERS: CommissionTier[] = [
  { upToCents: 250_000, ratePct: 40.0, label: 'Base Tier ($0 – $2,500)' },
  { upToCents: 500_000, ratePct: 45.0, label: 'Performance Tier ($2,500 – $5,000)' },
  { upToCents: null, ratePct: 50.0, label: 'Master Stylist Tier ($5,000+)' },
];

export interface StaffPayrollLine {
  staffId: string;
  staffName: string;
  role: 'owner' | 'manager' | 'front_desk' | 'senior_groomer' | 'groomer' | 'bather' | string;
  commissionRatePct: number;
  commissionTiers?: CommissionTier[];
  effectiveCommissionPct?: number;
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
 * Calculates progressive/marginal tiered groomer commission in exact integer cents.
 * Matches PostgreSQL `public.calculate_progressive_commission_cents` cent-for-cent.
 */
export function calculateTieredCommissionCents(
  grossServiceCents: number,
  flatRatePct: number,
  tiers?: CommissionTier[] | null
): number {
  const gross = Math.max(0, Math.trunc(grossServiceCents));
  if (gross <= 0) return 0;

  const clampedFlat = Math.max(0, Math.min(100, Number.isFinite(flatRatePct) ? flatRatePct : 0));
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return multiplyCentsByPercent(gross, clampedFlat);
  }

  const normalized = tiers
    .filter((t) => t && typeof t === 'object')
    .map((t) => ({
      capCents:
        typeof t.upToCents === 'number' && Number.isFinite(t.upToCents) && t.upToCents > 0
          ? Math.trunc(t.upToCents)
          : Number.MAX_SAFE_INTEGER,
      ratePct: Math.max(0, Math.min(100, Number.isFinite(t.ratePct) ? t.ratePct : clampedFlat)),
    }))
    .sort((a, b) => a.capCents - b.capCents);

  if (normalized.length === 0) {
    return multiplyCentsByPercent(gross, clampedFlat);
  }

  let prevCap = 0;
  let totalCommission = 0;

  for (const tier of normalized) {
    if (tier.capCents > prevCap && gross > prevCap) {
      const sliceCents = Math.min(gross, tier.capCents) - prevCap;
      totalCommission += multiplyCentsByPercent(sliceCents, tier.ratePct);
      prevCap = tier.capCents;
    }
    if (gross <= prevCap) break;
  }

  if (gross > prevCap) {
    const overflowSlice = gross - prevCap;
    totalCommission += multiplyCentsByPercent(overflowSlice, clampedFlat);
  }

  return totalCommission;
}

export interface RawPayrollWireSummary {
  period_start: string;
  period_end: string;
  is_locked: boolean;
  staff_breakdown: Array<{
    staff_id: string;
    staff_name: string;
    role: string;
    commission_rate_pct: number;
    service_count: number;
    gross_cents: number;
    commission_cents: number;
    direct_tips_cents: number;
    pooled_tips_cents: number;
    total_tips_cents: number;
    adjustments_cents: number;
    payout_cents: number;
  }>;
  total_gross_cents: number;
  total_commission_cents: number;
  total_tips_cents: number;
  total_adjustments_cents: number;
  total_payout_cents: number;
  total_house_cents: number;
}

/**
 * Normalizes the PostgreSQL `calculate_payroll_summary` TABLE result (array of rows)
 * or a pre-shaped wire summary object into a canonical `RawPayrollWireSummary`.
 */
export function normalizePayrollRpcSummary(
  rawData: unknown,
  periodStart: string,
  periodEnd: string,
  isLocked = false
): RawPayrollWireSummary {
  if (Array.isArray(rawData)) {
    let totalGross = 0;
    let totalCommission = 0;
    let totalTips = 0;
    let totalAdjustments = 0;
    let totalPayout = 0;
    let totalHouse = 0;

    const breakdown = rawData.map((row: Record<string, unknown>) => {
      const gross = Number(row.gross_service_cents ?? row.gross_cents ?? 0);
      const comm = Number(row.commission_cents ?? 0);
      const directTips = Number(row.direct_tips_cents ?? 0);
      const pooledTips = Number(row.pool_tips_cents ?? row.pooled_tips_cents ?? 0);
      const totalRowTips = Number(row.total_tips_cents ?? directTips + pooledTips);
      const adjustments = Number(row.retro_adjustments_cents ?? row.adjustments_cents ?? 0);
      const payout = Number(row.total_payout_cents ?? row.payout_cents ?? comm + totalRowTips + adjustments);
      const house = Number(row.house_retained_cents ?? gross - comm);

      totalGross += gross;
      totalCommission += comm;
      totalTips += totalRowTips;
      totalAdjustments += adjustments;
      totalPayout += payout;
      totalHouse += house;

      return {
        staff_id: String(row.staff_id ?? ''),
        staff_name: String(row.staff_name ?? 'Staff Member'),
        role: String(row.staff_role ?? row.role ?? 'groomer'),
        commission_rate_pct: Number(row.commission_rate ?? row.commission_rate_pct ?? 0),
        service_count: Number(row.dogs_groomed ?? row.service_count ?? 0),
        gross_cents: gross,
        commission_cents: comm,
        direct_tips_cents: directTips,
        pooled_tips_cents: pooledTips,
        total_tips_cents: totalRowTips,
        adjustments_cents: adjustments,
        payout_cents: payout,
      };
    });

    return {
      period_start: periodStart,
      period_end: periodEnd,
      is_locked: isLocked,
      staff_breakdown: breakdown,
      total_gross_cents: totalGross,
      total_commission_cents: totalCommission,
      total_tips_cents: totalTips,
      total_adjustments_cents: totalAdjustments,
      total_payout_cents: totalPayout,
      total_house_cents: totalHouse,
    };
  }

  const obj = (rawData && typeof rawData === 'object' ? rawData : {}) as Record<string, unknown>;
  const rawStaff = Array.isArray(obj.staff_breakdown) ? obj.staff_breakdown : [];
  return {
    period_start: String(obj.period_start ?? periodStart),
    period_end: String(obj.period_end ?? periodEnd),
    is_locked: Boolean(obj.is_locked ?? isLocked),
    staff_breakdown: rawStaff.map((s: Record<string, unknown>) => ({
      staff_id: String(s.staff_id ?? ''),
      staff_name: String(s.staff_name ?? 'Staff Member'),
      role: String(s.role ?? s.staff_role ?? 'groomer'),
      commission_rate_pct: Number(s.commission_rate_pct ?? s.commission_rate ?? 0),
      service_count: Number(s.service_count ?? s.dogs_groomed ?? 0),
      gross_cents: Number(s.gross_cents ?? s.gross_service_cents ?? 0),
      commission_cents: Number(s.commission_cents ?? 0),
      direct_tips_cents: Number(s.direct_tips_cents ?? 0),
      pooled_tips_cents: Number(s.pooled_tips_cents ?? s.pool_tips_cents ?? 0),
      total_tips_cents: Number(s.total_tips_cents ?? 0),
      adjustments_cents: Number(s.adjustments_cents ?? s.retro_adjustments_cents ?? 0),
      payout_cents: Number(s.payout_cents ?? s.total_payout_cents ?? 0),
    })),
    total_gross_cents: Number(obj.total_gross_cents ?? 0),
    total_commission_cents: Number(obj.total_commission_cents ?? 0),
    total_tips_cents: Number(obj.total_tips_cents ?? 0),
    total_adjustments_cents: Number(obj.total_adjustments_cents ?? 0),
    total_payout_cents: Number(obj.total_payout_cents ?? 0),
    total_house_cents: Number(obj.total_house_cents ?? 0),
  };
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
