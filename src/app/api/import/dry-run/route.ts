import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { LegacyCompetitor, parseCompetitorCsv } from '@/lib/live-import-export';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Import dry-run', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'Malformed JSON payload' }, 400);
  }

  const rawCsv = typeof body.raw_csv === 'string' ? body.raw_csv : '';
  const source = (typeof body.source === 'string' ? body.source.toLowerCase() : 'generic_csv') as LegacyCompetitor;

  if (!rawCsv.trim()) {
    return noStoreJson({ error: 'raw_csv content is required' }, 400);
  }

  if (!['moego', 'daysmart', 'pawloyalty', 'square', 'generic_csv'].includes(source)) {
    return noStoreJson({ error: `Unsupported source software: ${source}` }, 400);
  }

  // Fetch existing clients to run duplicate detection
  const { data: existingClients, error: clientsError } = await auth.ctx.supabase
    .from('clients')
    .select('id, name, phone, email')
    .limit(2000);

  if (clientsError) {
    return noStoreJson({ error: 'Failed to fetch existing clients for duplicate matching' }, 502);
  }

  const parsed = parseCompetitorCsv(rawCsv, source, existingClients || []);

  return noStoreJson(
    {
      success: true,
      source: parsed.source,
      totalRows: parsed.totalRows,
      validRowsCount: parsed.validRows.length,
      duplicateCount: parsed.duplicateMatches.length,
      errorCount: parsed.errors.length,
      previewRows: parsed.validRows.slice(0, 10),
      duplicates: parsed.duplicateMatches.slice(0, 10),
      errors: parsed.errors,
    },
    200
  );
}
