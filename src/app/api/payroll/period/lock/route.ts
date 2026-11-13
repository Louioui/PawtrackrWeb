import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // WF08: Manager Closeout / Payroll Lock requires owner or manager role
  const auth = await requireActiveStaffSession(req, 'Payroll period lock', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const periodStart = typeof body.period_start === 'string' ? body.period_start : null;
  const periodEnd = typeof body.period_end === 'string' ? body.period_end : null;

  if (!periodStart || !/^\d{4}-\d\d-\d\d$/.test(periodStart) || !periodEnd || !/^\d{4}-\d\d-\d\d$/.test(periodEnd)) {
    return noStoreJson({ error: 'Valid period_start and period_end dates (YYYY-MM-DD) are required.' }, 400);
  }

  const tipPoolMode = body.tip_pool_mode === 'bather_split' ? 'bather_split' : 'direct';
  const batherPoolPct =
    typeof body.bather_pool_pct === 'number'
      ? Math.max(0, Math.min(100, body.bather_pool_pct))
      : 15.0;
  const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

  const { data, error } = await auth.ctx.supabase.rpc('lock_payroll_period', {
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_tip_pool_mode: tipPoolMode,
    p_bather_pool_pct: batherPoolPct,
    p_notes: notes,
  });

  if (error) {
    let statusCode = 502;
    if (error.code === 'PW050') statusCode = 403;
    if (error.code === 'PW060') statusCode = 409;
    return noStoreJson({ error: error.message || 'Failed to lock payroll period' }, statusCode);
  }

  return noStoreJson(data, 200);
}
