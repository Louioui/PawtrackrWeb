import { NextRequest } from 'next/server';
import { sanitizeCsvImportRow, sanitizePetNotesForAI } from '@/lib/adversarial-guardrails';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const MAX_IMPORT_ROWS = 2_500;

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
  const rawFileName = typeof body.file_name === 'string' ? body.file_name.trim() : 'import.csv';
  const fileName = rawFileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'import.csv';
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (rows.length === 0) {
    return noStoreJson({ error: 'rows array cannot be empty' }, 400);
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return noStoreJson({ error: `Import batch cannot exceed ${MAX_IMPORT_ROWS} rows per job.` }, 413);
  }

  // Sanitize every row against CSV formula DDE injection, XSS tags, and LLM prompt injection
  const mappedRows = rows.map((r: Record<string, unknown>) => {
    const csvGuard = sanitizeCsvImportRow({
      client_name: String(r.clientName || r.client_name || ''),
      client_phone: String(r.clientPhone || r.client_phone || ''),
      client_email: r.clientEmail || r.client_email ? String(r.clientEmail || r.client_email) : '',
      pet_name: String(r.petName || r.pet_name || ''),
      breed: r.breed ? String(r.breed) : 'Mixed Breed',
      legacy_notes: String(r.legacyNotes || r.legacy_notes || ''),
    });
    const aiGuard = sanitizePetNotesForAI(csvGuard.sanitized.legacy_notes);
    const rawWeight =
      typeof r.weightLbs === 'number'
        ? r.weightLbs
        : typeof r.weight_lbs === 'number'
          ? r.weight_lbs
          : 25.0;

    return {
      client_name: csvGuard.sanitized.client_name.slice(0, 120),
      client_phone: csvGuard.sanitized.client_phone.slice(0, 32),
      client_email: csvGuard.sanitized.client_email ? csvGuard.sanitized.client_email.slice(0, 254) : null,
      pet_name: csvGuard.sanitized.pet_name.slice(0, 80),
      breed: (csvGuard.sanitized.breed || 'Mixed Breed').slice(0, 80),
      weight_lbs: Number.isFinite(rawWeight) && rawWeight > 0 && rawWeight <= 300 ? rawWeight : 25.0,
      legacy_notes: aiGuard.sanitizedText.slice(0, 2000),
    };
  });

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
