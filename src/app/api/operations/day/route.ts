import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Salon operations');
  if (!auth.ok) return auth.response;

  const dateParam = req.nextUrl.searchParams.get('date');
  const salonDate =
    dateParam && /^\d{4}-\d\d-\d\d$/.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);

  // 1. Fetch salon day record for the requested date
  const { data: dayRow, error: dayError } = await auth.ctx.supabase
    .from('daily_salon_days')
    .select('salon_date, status, opened_at, opened_by, closed_at, closed_by, expected_cash_cents, counted_cash_cents, cash_variance_cents, variance_reason, closeout_summary, opening_checklist, created_at, updated_at')
    .eq('business_id', auth.ctx.membership.business_id)
    .eq('salon_date', salonDate)
    .maybeSingle();

  if (dayError) {
    return noStoreJson({ error: 'Salon day record could not be loaded.' }, 502);
  }

  // 2. Count active stations
  const { count: stationCount, error: stationError } = await auth.ctx.supabase
    .from('salon_stations')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', auth.ctx.membership.business_id)
    .eq('is_active', true);

  // 3. Count active shifts scheduled for today
  const { count: shiftCount, error: shiftError } = await auth.ctx.supabase
    .from('staff_shifts')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', auth.ctx.membership.business_id)
    .eq('shift_date', salonDate);

  // 4. Count unassigned visits for today
  const { count: unassignedVisitsCount, error: visitsError } = await auth.ctx.supabase
    .from('visits')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', auth.ctx.membership.business_id)
    .is('staff_id', null)
    .gte('scheduled_time', `${salonDate}T00:00:00.000Z`)
    .lt('scheduled_time', `${salonDate}T23:59:59.999Z`);

  return noStoreJson(
    {
      source: 'supabase_daily_salon_days',
      business_id: auth.ctx.membership.business_id,
      salon_date: salonDate,
      status: dayRow?.status ?? 'closed',
      opened_at: dayRow?.opened_at ?? null,
      opened_by: dayRow?.opened_by ?? null,
      closed_at: dayRow?.closed_at ?? null,
      closed_by: dayRow?.closed_by ?? null,
      expected_cash_cents: dayRow?.expected_cash_cents ?? 0,
      counted_cash_cents: dayRow?.counted_cash_cents ?? 0,
      cash_variance_cents: dayRow?.cash_variance_cents ?? 0,
      variance_reason: dayRow?.variance_reason ?? null,
      closeout_summary: dayRow?.closeout_summary ?? {},
      opening_checklist: dayRow?.opening_checklist ?? {},
      station_count: stationCount ?? 0,
      active_shifts_count: shiftCount ?? 0,
      unassigned_visits_count: unassignedVisitsCount ?? 0,
    },
    200,
  );
}

export async function POST(req: NextRequest) {
  // WF18: Manager Opening Check requires owner or manager role
  const auth = await requireActiveStaffSession(req, 'Salon opening', ['owner', 'manager']);
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

  const checklist =
    body.checklist && typeof body.checklist === 'object' && !Array.isArray(body.checklist)
      ? (body.checklist as Record<string, boolean>)
      : {
          shifts_confirmed: true,
          stations_ready: true,
          supplies_stocked: true,
          emergency_contacts_verified: true,
        };

  // Call atomic RPC manager_open_day
  const { data, error } = await auth.ctx.supabase.rpc('manager_open_day', {
    p_salon_date: salonDate,
    p_checklist: checklist,
  });

  if (error) {
    return noStoreJson(
      { error: error.message || 'Could not complete manager opening check.' },
      error.code?.startsWith('PW') ? 400 : 502,
    );
  }

  return noStoreJson(
    {
      ok: true,
      day: data,
      message: `Salon opened for ${salonDate} by ${auth.ctx.membership.name}.`,
    },
    200,
  );
}
