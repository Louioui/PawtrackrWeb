import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireActiveStaffSession(req, 'Advance curbside stop');
  if (!auth.ok) return auth.response;

  const resolvedParams = await params;
  const visitId = resolvedParams.id;
  if (!uuidPattern.test(visitId)) {
    return noStoreJson({ error: 'Valid visit UUID required' }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'Malformed JSON payload' }, 400);
  }

  const nextStatus = typeof body.next_status === 'string' ? body.next_status.trim() : '';
  if (!['en_route', 'arrived', 'curbside_active', 'completed', 'cancelled', 'scheduled'].includes(nextStatus)) {
    return noStoreJson({ error: 'Valid next_status is required' }, 400);
  }

  const { data, error } = await auth.ctx.supabase.rpc('advance_curbside_stop', {
    p_visit_id: visitId,
    p_next_status: nextStatus,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    const status = code === 'PW021' ? 404 : code === 'PW071' ? 422 : 500;
    return noStoreJson({ error: error.message || 'Failed to advance curbside stop' }, status);
  }

  return noStoreJson(data, 200);
}
