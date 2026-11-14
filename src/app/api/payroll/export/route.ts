import { NextRequest, NextResponse } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import {
  formatGustoPayrollCsv,
  formatQuickBooksPayrollCsv,
  normalizePayrollRpcSummary,
  PayrollPeriodSummary,
  StaffPayrollLine,
} from '@/lib/live-payroll';

export const dynamic = 'force-dynamic';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Payroll export', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = new Date(now.getTime() - 13 * 86400000).toISOString().slice(0, 10);

  const periodStart = url.searchParams.get('start_date') || defaultStart;
  const periodEnd = url.searchParams.get('end_date') || defaultEnd;
  if (!ISO_DATE_RE.test(periodStart) || !ISO_DATE_RE.test(periodEnd) || periodStart > periodEnd) {
    return noStoreJson({ error: 'Valid YYYY-MM-DD start_date and end_date are required.' }, 400);
  }

  const tipPoolMode = url.searchParams.get('tip_pool_mode') === 'bather_split' ? 'bather_split' : 'direct';
  const parsedPct = parseFloat(url.searchParams.get('bather_pool_pct') || '15.0');
  const batherPoolPct = Number.isFinite(parsedPct) ? Math.max(0, Math.min(100, parsedPct)) : 15.0;
  const format = url.searchParams.get('format') === 'quickbooks' ? 'quickbooks' : 'gusto';

  // Calculate live summary data via hardened RPC
  const { data: rawSummary, error: summaryError } = await auth.ctx.supabase.rpc('calculate_payroll_summary', {
    p_business_id: auth.ctx.membership.business_id,
    p_start_date: periodStart,
    p_end_date: periodEnd,
    p_tip_pool_mode: tipPoolMode,
    p_bather_pool_pct: batherPoolPct,
  });

  if (summaryError || !rawSummary) {
    const status = summaryError?.code === 'P0058' || summaryError?.code === 'P0059' ? 403 : 502;
    return noStoreJson({ error: summaryError?.message || 'Failed to calculate payroll summary for export' }, status);
  }

  const normalized = normalizePayrollRpcSummary(rawSummary, periodStart, periodEnd, false);

  // Transform normalized RPC output into typed PayrollPeriodSummary
  const staffLines: StaffPayrollLine[] = normalized.staff_breakdown.map((s) => ({
    staffId: s.staff_id,
    staffName: s.staff_name,
    role: s.role,
    commissionRatePct: s.commission_rate_pct,
    serviceCount: s.service_count,
    grossServiceCents: s.gross_cents,
    commissionCents: s.commission_cents,
    directTipsCents: s.direct_tips_cents,
    pooledTipsCents: s.pooled_tips_cents,
    totalTipsCents: s.total_tips_cents,
    adjustmentsCents: s.adjustments_cents,
    netPayoutCents: s.payout_cents,
  }));

  const typedSummary: PayrollPeriodSummary = {
    periodStart: normalized.period_start,
    periodEnd: normalized.period_end,
    status: normalized.is_locked ? 'locked' : 'open',
    tipPoolMode,
    batherPoolPct,
    staffLines,
    totalGrossCents: normalized.total_gross_cents,
    totalCommissionCents: normalized.total_commission_cents,
    totalTipsCents: normalized.total_tips_cents,
    totalAdjustmentsCents: normalized.total_adjustments_cents,
    totalPayoutCents: normalized.total_payout_cents,
    totalHouseRetainedCents: normalized.total_house_cents,
  };

  const csvContent = format === 'quickbooks'
    ? formatQuickBooksPayrollCsv(typedSummary)
    : formatGustoPayrollCsv(typedSummary);

  const safeStart = periodStart.replace(/[^0-9-]/g, '');
  const safeEnd = periodEnd.replace(/[^0-9-]/g, '');
  const filename = `pawtrackr-payroll-${format}-${safeStart}-to-${safeEnd}.csv`;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
