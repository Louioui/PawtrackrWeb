import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // WF01: Front desk arrival & check-in
  const auth = await requireActiveStaffSession(req, 'Visit check-in', ['owner', 'manager', 'front_desk']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return noStoreJson({ error: 'Valid visit UUID is required.' }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const collectorName = typeof body.collector_name === 'string' ? body.collector_name.trim() : '';
  if (!collectorName) {
    return noStoreJson({ error: 'Authorized collector name is required at check-in (WF01).' }, 400);
  }

  const collectorPhone =
    typeof body.collector_phone === 'string' && body.collector_phone.trim()
      ? body.collector_phone.trim().slice(0, 30)
      : null;

  const weightLbs =
    typeof body.weight_lbs === 'number' && Number.isFinite(body.weight_lbs) && body.weight_lbs > 0
      ? body.weight_lbs
      : null;

  const waiverId =
    typeof body.waiver_id === 'string' && uuidPattern.test(body.waiver_id)
      ? body.waiver_id
      : null;

  const waiverStatus =
    body.waiver_status === 'refused'
      ? 'refused'
      : body.waiver_status === 'missing'
      ? 'missing'
      : 'verified';

  const isLate = Boolean(body.is_late);
  const lateMinutes =
    typeof body.late_minutes === 'number' && Number.isInteger(body.late_minutes) && body.late_minutes >= 0
      ? body.late_minutes
      : 0;

  const stationId =
    typeof body.station_id === 'string' && uuidPattern.test(body.station_id)
      ? body.station_id
      : null;

  const staffId =
    typeof body.staff_id === 'string' && uuidPattern.test(body.staff_id)
      ? body.staff_id
      : null;

  const { data, error } = await auth.ctx.supabase.rpc('check_in_visit', {
    p_visit_id: id,
    p_collector_name: collectorName,
    p_collector_phone: collectorPhone,
    p_weight_lbs: weightLbs,
    p_waiver_id: waiverId,
    p_waiver_status: waiverStatus,
    p_is_late: isLate,
    p_late_minutes: lateMinutes,
    p_station_id: stationId,
    p_staff_id: staffId,
  });

  if (error) {
    const status = error.code?.startsWith('PW') ? 400 : 502;
    return noStoreJson({ error: error.message || 'Check-in failed.' }, status);
  }

  return noStoreJson(
    {
      ok: true,
      visit: data,
      message:
        waiverStatus === 'refused'
          ? 'Visit checked in on WAIVER HOLD pending manager decision.'
          : 'Visit successfully checked in.',
    },
    200,
  );
}
