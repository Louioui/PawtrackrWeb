import { NextRequest, NextResponse } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import {
  formatGustoPayrollCsv,
  formatQuickBooksPayrollCsv,
  normalizePayrollRpcSummary,
  PayrollPeriodSummary,
  StaffPayrollLine,
} from '@/lib/live-payroll';
import {
  generateNachaDirectDepositFile,
  NachaStaffDepositItem,
} from '@/lib/nacha-generator';
import {
  buildPayrollDisbursementJournalEntry,
  formatGeneralLedgerCsv,
} from '@/lib/general-ledger';

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
  const requestedFormat = (url.searchParams.get('format') || 'gusto').toLowerCase();

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

  const safeStart = periodStart.replace(/[^0-9-]/g, '');
  const safeEnd = periodEnd.replace(/[^0-9-]/g, '');

  // 1. NACHA ACH Fixed-Width File Export
  if (requestedFormat === 'nacha') {
    const depositItems: NachaStaffDepositItem[] = typedSummary.staffLines.map((line, idx) => ({
      staffId: line.staffId,
      staffName: line.staffName,
      // Default valid test routing number (Chase ABA 021000021) or sequence
      routingNumber: '021000021',
      accountNumber: `773900${padDigits(idx + 1, 4)}`,
      accountType: 'checking',
      amountCents: line.netPayoutCents,
    }));

    const nachaResult = generateNachaDirectDepositFile(depositItems, {
      immediateDestinationRouting: '021000021',
      immediateOriginEin: '123456789',
      destinationBankName: 'JPMORGAN CHASE',
      originSalonName: 'PAWTRACKR SALON',
      companyId: '123456789',
    });

    return new NextResponse(nachaResult.nachaContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=us-ascii',
        'Content-Disposition': `attachment; filename="pawtrackr-payroll-nacha-${safeStart}-to-${safeEnd}.ach"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // 2. Dual-Entry General Ledger CSV Export (QuickBooks / Xero / Sage)
  if (requestedFormat === 'general_ledger') {
    const journalEntry = buildPayrollDisbursementJournalEntry({
      entryNumber: `JE-PAY-${safeStart}`,
      date: periodEnd,
      periodStart,
      periodEnd,
      totalCommissionsCents: typedSummary.totalCommissionCents,
      totalTipsCents: typedSummary.totalTipsCents,
      totalPayoutCents: typedSummary.totalPayoutCents,
    });

    const glCsv = formatGeneralLedgerCsv({
      periodStart,
      periodEnd,
      businessName: 'Pawtrackr Salon',
      entries: [journalEntry],
      totalDebitCents: journalEntry.totalDebitCents,
      totalCreditCents: journalEntry.totalCreditCents,
      isBalanced: journalEntry.isBalanced,
    });

    return new NextResponse(glCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pawtrackr-payroll-general-ledger-${safeStart}-to-${safeEnd}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // 3. QuickBooks Payroll CSV
  if (requestedFormat === 'quickbooks') {
    const csvContent = formatQuickBooksPayrollCsv(typedSummary);
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pawtrackr-payroll-quickbooks-${safeStart}-to-${safeEnd}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // 4. Gusto Payroll CSV (Default)
  const csvContent = formatGustoPayrollCsv(typedSummary);
  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pawtrackr-payroll-gusto-${safeStart}-to-${safeEnd}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

function padDigits(num: number, width: number): string {
  return String(num).padStart(width, '0');
}
