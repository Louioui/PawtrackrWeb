import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // WF08: Manager Closeout requires owner or manager role
  const auth = await requireActiveStaffSession(req, 'End-of-day register closeout', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const salonDate =
    typeof body.salon_date === 'string' && /^\d{4}-\d\d-\d\d$/.test(body.salon_date)
      ? body.salon_date
      : new Date().toISOString().slice(0, 10);

  if (typeof body.counted_cash_cents !== 'number' || body.counted_cash_cents < 0) {
    return noStoreJson({ error: 'A valid non-negative counted_cash_cents integer is required.' }, 400);
  }

  const countedCashCents = Math.round(body.counted_cash_cents);
  const varianceReason = typeof body.variance_reason === 'string' ? body.variance_reason.trim() : null;
  const closeoutSummary =
    body.closeout_summary && typeof body.closeout_summary === 'object' && !Array.isArray(body.closeout_summary)
      ? body.closeout_summary
      : {};

  // Call atomic RPC close_salon_day
  const { data, error } = await auth.ctx.supabase.rpc('close_salon_day', {
    p_salon_date: salonDate,
    p_counted_cash_cents: countedCashCents,
    p_variance_reason: varianceReason,
    p_closeout_summary: closeoutSummary,
  });

  if (error) {
    let statusCode = 502;
    if (error.code === 'PW048' || error.code === 'PW051') {
      statusCode = 409;
    } else if (error.code === 'PW049' || error.code === 'PW021') {
      statusCode = 422;
    } else if (error.code === 'PW050') {
      statusCode = 403;
    }

    return noStoreJson(
      { error: error.message || 'Could not complete end-of-day closeout.' },
      statusCode,
    );
  }

  return noStoreJson(
    {
      ok: true,
      closeout: data,
      message: `Register day ${salonDate} successfully closed and locked by ${auth.ctx.membership.name}.`,
    },
    200,
  );
}
