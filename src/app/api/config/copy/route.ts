import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  // Only owners can copy salon configurations across boundaries (WF30 / PW072)
  const auth = await requireActiveStaffSession(req, 'Copy salon configuration', ['owner']);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'Malformed JSON payload' }, 400);
  }

  const sourceBusinessId = typeof body.source_business_id === 'string' ? body.source_business_id.trim() : '';
  const targetBusinessId = typeof body.target_business_id === 'string' ? body.target_business_id.trim() : '';
  const dryRun = body.dry_run !== false; // defaults to dry run for safety

  if (!uuidPattern.test(sourceBusinessId) || !uuidPattern.test(targetBusinessId)) {
    return noStoreJson({ error: 'Valid source_business_id and target_business_id UUIDs are required' }, 400);
  }

  if (sourceBusinessId === targetBusinessId) {
    return noStoreJson({ error: 'Source and target salons cannot be identical' }, 400);
  }

  const { data, error } = await auth.ctx.supabase.rpc('copy_salon_configuration', {
    p_source_business_id: sourceBusinessId,
    p_target_business_id: targetBusinessId,
    p_dry_run: dryRun,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    const status = code === 'PW072' ? 403 : 422;
    return noStoreJson({ error: error.message || 'Configuration copy failed' }, status);
  }

  return noStoreJson(data, 200);
}
