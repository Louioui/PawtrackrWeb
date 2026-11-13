import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  // WF15: Generate 2-hour slot hold offer
  const auth = await requireActiveStaffSession(req, 'Generate waitlist offer', [
    'owner',
    'manager',
    'front_desk',
  ]);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const waitlistEntryId =
    typeof body.waitlistEntryId === 'string' ? body.waitlistEntryId.trim() : '';
  const offeredStart = typeof body.offeredStart === 'string' ? body.offeredStart.trim() : '';
  const offeredEnd = typeof body.offeredEnd === 'string' ? body.offeredEnd.trim() : '';
  const assignedStaffId =
    typeof body.assignedStaffId === 'string' ? body.assignedStaffId.trim() : '';
  const assignedStationId =
    typeof body.assignedStationId === 'string' && uuidPattern.test(body.assignedStationId)
      ? body.assignedStationId.trim()
      : null;
  const holdDurationMinutes =
    typeof body.holdDurationMinutes === 'number'
      ? Math.max(15, Math.min(1440, Math.floor(body.holdDurationMinutes)))
      : 120;

  if (!uuidPattern.test(waitlistEntryId)) {
    return noStoreJson({ error: 'Valid waitlist entry UUID is required.' }, 400);
  }
  if (!uuidPattern.test(assignedStaffId)) {
    return noStoreJson({ error: 'Valid assigned staff UUID is required.' }, 400);
  }

  const startDate = new Date(offeredStart);
  const endDate = new Date(offeredEnd);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
    return noStoreJson({ error: 'Valid offered start and end timestamps are required (end > start).' }, 400);
  }

  const { data, error } = await auth.ctx.supabase.rpc('generate_waitlist_offer', {
    p_waitlist_entry_id: waitlistEntryId,
    p_offered_start: startDate.toISOString(),
    p_offered_end: endDate.toISOString(),
    p_assigned_staff_id: assignedStaffId,
    p_assigned_station_id: assignedStationId,
    p_hold_duration_minutes: holdDurationMinutes,
  });

  if (error) {
    return noStoreJson({ error: error.message || 'Failed to generate waitlist slot offer' }, 422);
  }

  return noStoreJson({ success: true, ...data }, 201);
}
