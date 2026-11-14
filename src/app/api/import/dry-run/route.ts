import { NextRequest } from 'next/server';
import { sanitizeCsvImportRow, sanitizePetNotesForAI } from '@/lib/adversarial-guardrails';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { LegacyCompetitor, parseCompetitorCsv } from '@/lib/live-import-export';

export const dynamic = 'force-dynamic';

const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB DoS payload guard

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
  if (rawCsv.length > MAX_CSV_BYTES) {
    return noStoreJson({ error: 'CSV payload exceeds 2 MB safety limit.' }, 413);
  }

  if (!['moego', 'daysmart', 'pawloyalty', 'square', 'generic_csv'].includes(source)) {
    return noStoreJson({ error: `Unsupported source software: ${source}` }, 400);
  }

  // Fetch existing clients scoped strictly to caller's business_id
  const { data: existingClients, error: clientsError } = await auth.ctx.supabase
    .from('clients')
    .select('id, name, phone, email')
    .eq('business_id', auth.ctx.membership.business_id)
    .limit(2000);

  if (clientsError) {
    return noStoreJson({ error: 'Failed to fetch existing clients for duplicate matching' }, 502);
  }

  const parsed = parseCompetitorCsv(rawCsv, source, existingClients || []);

  let defangedFormulaCount = 0;
  let promptInjectionCount = 0;

  const hardenedPreview = parsed.validRows.slice(0, 10).map((row) => {
    const csvGuard = sanitizeCsvImportRow({
      clientName: row.clientName,
      clientPhone: row.clientPhone,
      clientEmail: row.clientEmail ?? '',
      petName: row.petName,
      breed: row.breed,
      legacyNotes: row.legacyNotes,
    });
    if (csvGuard.hadDangerousFormulas) defangedFormulaCount += 1;

    const aiGuard = sanitizePetNotesForAI(csvGuard.sanitized.legacyNotes);
    if (aiGuard.injectionDetected) promptInjectionCount += 1;

    return {
      ...row,
      clientName: csvGuard.sanitized.clientName,
      clientPhone: csvGuard.sanitized.clientPhone,
      clientEmail: csvGuard.sanitized.clientEmail || null,
      petName: csvGuard.sanitized.petName,
      breed: csvGuard.sanitized.breed,
      legacyNotes: aiGuard.sanitizedText,
    };
  });

  return noStoreJson(
    {
      success: true,
      source: parsed.source,
      totalRows: parsed.totalRows,
      validRowsCount: parsed.validRows.length,
      duplicateCount: parsed.duplicateMatches.length,
      errorCount: parsed.errors.length,
      securityScan: {
        defangedFormulaRows: defangedFormulaCount,
        promptInjectionsNeutralized: promptInjectionCount,
      },
      previewRows: hardenedPreview,
      duplicates: parsed.duplicateMatches.slice(0, 10),
      errors: parsed.errors,
    },
    200,
  );
}
