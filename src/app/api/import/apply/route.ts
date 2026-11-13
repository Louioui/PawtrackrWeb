import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Apply import', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'Malformed JSON payload' }, 400);
  }

  const source = typeof body.source === 'string' ? body.source.toLowerCase().trim() : 'generic_csv';
  const fileName = typeof body.file_name === 'string' ? body.file_name.trim() : 'import.csv';
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (rows.length === 0) {
    return noStoreJson({ error: 'rows array cannot be empty' }, 400);
  }

  // Map candidate fields to snake_case for RPC intake
  const mappedRows = rows.map((r: Record<string, unknown>) => ({
    client_name: String(r.clientName || r.client_name || ''),
    client_phone: String(r.clientPhone || r.client_phone || ''),
    client_email: r.clientEmail || r.client_email ? String(r.clientEmail || r.client_email) : null,
    pet_name: String(r.petName || r.pet_name || ''),
    breed: r.breed ? String(r.breed) : 'Mixed Breed',
    weight_lbs: typeof r.weightLbs === 'number' ? r.weightLbs : (typeof r.weight_lbs === 'number' ? r.weight_lbs : 25.0),
    legacy_notes: String(r.legacyNotes || r.legacy_notes || ''),
  }));

  const { data, error } = await auth.ctx.supabase.rpc('apply_import_job', {
    p_source_software: source,
    p_file_name: fileName,
    p_rows: mappedRows,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    const status = code === 'PW045' ? 403 : 422;
    return noStoreJson({ error: error.message || 'Failed to apply import job' }, status);
  }

  return noStoreJson(data, 200);
}
