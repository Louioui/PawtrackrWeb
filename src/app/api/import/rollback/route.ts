import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Rollback import', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'Malformed JSON payload' }, 400);
  }

  const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
  if (!uuidPattern.test(jobId)) {
    return noStoreJson({ error: 'Valid job_id UUID is required' }, 400);
  }

  const { data, error } = await auth.ctx.supabase.rpc('rollback_import_job', {
    p_job_id: jobId,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    const status = code === 'PW074' ? 404 : code === 'PW045' ? 403 : 422;
    return noStoreJson({ error: error.message || 'Failed to rollback import job' }, status);
  }

  return noStoreJson(data, 200);
}
