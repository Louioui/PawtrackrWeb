import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Payroll ledger');
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = new Date(now.getTime() - 13 * 86400000).toISOString().slice(0, 10);

  const periodStart = url.searchParams.get('start_date') || defaultStart;
  const periodEnd = url.searchParams.get('end_date') || defaultEnd;
  const tipPoolMode = url.searchParams.get('tip_pool_mode') === 'bather_split' ? 'bather_split' : 'direct';
  const batherPoolPct = Math.max(0, Math.min(100, parseFloat(url.searchParams.get('bather_pool_pct') || '15.0')));

  // Fetch live calculated summary via RPC
  const { data: summaryData, error: summaryError } = await auth.ctx.supabase.rpc('calculate_payroll_summary', {
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_tip_pool_mode: tipPoolMode,
    p_bather_pool_pct: batherPoolPct,
  });

  if (summaryError) {
    return noStoreJson({ error: summaryError.message || 'Failed to calculate payroll summary' }, 502);
  }

  // Fetch past and current payroll periods
  const { data: periods, error: periodsError } = await auth.ctx.supabase
    .from('payroll_periods')
    .select('*')
    .order('period_start', { ascending: false })
    .limit(20);

  if (periodsError) {
    return noStoreJson({ error: periodsError.message || 'Failed to fetch payroll periods' }, 502);
  }

  return noStoreJson(
    {
      success: true,
      summary: summaryData,
      periods: periods || [],
    },
    200
  );
}
