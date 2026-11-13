import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'List import jobs', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.ctx.supabase
    .from('import_jobs')
    .select('id, source_software, file_name, status, total_rows, valid_rows, duplicate_rows, error_rows, applied_at, rolled_back_at, created_at, staff:staff_members(id, name)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return noStoreJson({ error: error.message || 'Failed to fetch import jobs' }, 502);
  }

  return noStoreJson({ jobs: data || [] }, 200);
}
