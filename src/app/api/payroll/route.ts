import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { normalizePayrollRpcSummary } from '@/lib/live-payroll';

export const dynamic = 'force-dynamic';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Payroll ledger', ['owner', 'manager']);
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
  const businessId = auth.ctx.membership.business_id;

  // Fetch past and current payroll periods first to determine lock status
  const { data: periods, error: periodsError } = await auth.ctx.supabase
    .from('payroll_periods')
    .select('*')
    .eq('business_id', businessId)
    .order('period_start', { ascending: false })
    .limit(20);

  if (periodsError) {
    return noStoreJson({ error: periodsError.message || 'Failed to fetch payroll periods' }, 502);
  }

  // Fetch live calculated summary via hardened RPC
  const { data: summaryData, error: summaryError } = await auth.ctx.supabase.rpc('calculate_payroll_summary', {
    p_business_id: businessId,
    p_start_date: periodStart,
    p_end_date: periodEnd,
    p_tip_pool_mode: tipPoolMode,
    p_bather_pool_pct: batherPoolPct,
  });

  if (summaryError) {
    const status = summaryError.code === 'P0058' || summaryError.code === 'P0059' ? 403 : 502;
    return noStoreJson({ error: summaryError.message || 'Failed to calculate payroll summary' }, status);
  }

  const matchingPeriod = (periods || []).find(
    (p) => p.period_start === periodStart && p.period_end === periodEnd
  );
  const isLocked = matchingPeriod ? matchingPeriod.status === 'locked' || matchingPeriod.status === 'exported' : false;

  const normalizedSummary = normalizePayrollRpcSummary(summaryData, periodStart, periodEnd, isLocked);

  return noStoreJson(
    {
      success: true,
      summary: normalizedSummary,
      periods: periods || [],
    },
    200
  );
}
