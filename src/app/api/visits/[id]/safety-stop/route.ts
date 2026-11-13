import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { roundToCents } from '@/lib/live-pos';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // WF05 / WF14: Unsafe service interruption, partial groom & incident report
  const auth = await requireActiveStaffSession(req, 'Service safety stop', [
    'owner',
    'manager',
    'senior_groomer',
    'groomer',
  ]);
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

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return noStoreJson({ error: 'A reason for stopping service is required.' }, 422);
  }

  const incidentType = typeof body.incidentType === 'string' ? body.incidentType.trim() : null;
  const severity = typeof body.severity === 'string' ? body.severity.trim() : null;
  const firstAid = typeof body.firstAid === 'string' ? body.firstAid.trim() : null;
  const vetContacted = Boolean(body.vetContacted);
  const suggestedCharge = roundToCents(Number(body.suggestedCharge) || 0);

  const { data, error } = await auth.ctx.supabase.rpc('stop_service_safety_concern', {
    p_visit_id: id,
    p_reason: reason,
    p_incident_type: incidentType,
    p_severity: severity,
    p_first_aid: firstAid,
    p_vet_contacted: vetContacted,
    p_suggested_charge: suggestedCharge,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === 'PW028') return noStoreJson({ error: error.message, code: 'PW028' }, 404);
    return noStoreJson({ error: error.message || 'Failed to stop service.' }, 500);
  }

  return noStoreJson({ ok: true, result: data }, 200);
}
