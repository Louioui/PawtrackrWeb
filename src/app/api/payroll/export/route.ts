import { NextRequest, NextResponse } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import {
  formatGustoPayrollCsv,
  formatQuickBooksPayrollCsv,
  PayrollPeriodSummary,
  StaffPayrollLine,
} from '@/lib/live-payroll';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Payroll export', ['owner', 'manager', 'front_desk']);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = new Date(now.getTime() - 13 * 86400000).toISOString().slice(0, 10);

  const periodStart = url.searchParams.get('start_date') || defaultStart;
  const periodEnd = url.searchParams.get('end_date') || defaultEnd;
  const tipPoolMode = url.searchParams.get('tip_pool_mode') === 'bather_split' ? 'bather_split' : 'direct';
  const batherPoolPct = Math.max(0, Math.min(100, parseFloat(url.searchParams.get('bather_pool_pct') || '15.0')));
  const format = url.searchParams.get('format') === 'quickbooks' ? 'quickbooks' : 'gusto';

  // Calculate live summary data
  const { data: rawSummary, error: summaryError } = await auth.ctx.supabase.rpc('calculate_payroll_summary', {
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_tip_pool_mode: tipPoolMode,
    p_bather_pool_pct: batherPoolPct,
  });

  if (summaryError || !rawSummary) {
    return noStoreJson({ error: summaryError?.message || 'Failed to calculate payroll summary for export' }, 502);
  }

  // Transform raw RPC output into typed PayrollPeriodSummary
  const rawStaffLines = Array.isArray(rawSummary.staff_breakdown) ? rawSummary.staff_breakdown : [];
  const staffLines: StaffPayrollLine[] = rawStaffLines.map((s: Record<string, unknown>) => ({
    staffId: String(s.staff_id || ''),
    staffName: String(s.staff_name || 'Staff Member'),
    role: String(s.role || 'groomer'),
    commissionRatePct: Number(s.commission_rate_pct || 0),
    serviceCount: Number(s.service_count || 0),
    grossServiceCents: Number(s.gross_cents || 0),
    commissionCents: Number(s.commission_cents || 0),
    directTipsCents: Number(s.direct_tips_cents || 0),
    pooledTipsCents: Number(s.pooled_tips_cents || 0),
    totalTipsCents: Number(s.total_tips_cents || 0),
    adjustmentsCents: Number(s.adjustments_cents || 0),
    netPayoutCents: Number(s.payout_cents || 0),
  }));

  const typedSummary: PayrollPeriodSummary = {
    periodStart: String(rawSummary.period_start || periodStart),
    periodEnd: String(rawSummary.period_end || periodEnd),
    status: rawSummary.is_locked ? 'locked' : 'open',
    tipPoolMode,
    batherPoolPct,
    staffLines,
    totalGrossCents: Number(rawSummary.total_gross_cents || 0),
    totalCommissionCents: Number(rawSummary.total_commission_cents || 0),
    totalTipsCents: Number(rawSummary.total_tips_cents || 0),
    totalAdjustmentsCents: Number(rawSummary.total_adjustments_cents || 0),
    totalPayoutCents: Number(rawSummary.total_payout_cents || 0),
    totalHouseRetainedCents: Number(rawSummary.total_house_cents || 0),
  };

  const csvContent = format === 'quickbooks'
    ? formatQuickBooksPayrollCsv(typedSummary)
    : formatGustoPayrollCsv(typedSummary);

  const filename = `pawtrackr-payroll-${format}-${periodStart}-to-${periodEnd}.csv`;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
