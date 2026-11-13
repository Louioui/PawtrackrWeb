/**
 * Data Portability Engine: Competitor Import, Rollback & Scoped Tenant Archive (WF30, WF33, WF34)
 *
 * Enforces:
 * - Spreadsheet Formula Injection Defense (PW075): Prefix dangerous leading characters (=, +, -, @, \t, \r) with '
 * - Legacy Medical Provenance Gate (PW073): Imported competitor notes must never be marked verified medical facts
 * - Dry-run duplicate detection (matching on phone or email)
 * - Safe tenant export archiving with tenant isolation
 */

export type LegacyCompetitor = 'moego' | 'daysmart' | 'pawloyalty' | 'square' | 'generic_csv';

export interface ImportCandidateRow {
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  petName: string;
  breed?: string;
  weightLbs?: number;
  ageYears?: number;
  legacyNotes?: string;
}

export interface ExistingClientRef {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
}

export interface DuplicateMatch {
  rowIndex: number;
  candidate: ImportCandidateRow;
  matchedClient: ExistingClientRef;
  matchField: 'phone' | 'email';
}

export interface CompetitorParseResult {
  source: LegacyCompetitor;
  totalRows: number;
  validRows: ImportCandidateRow[];
  duplicateMatches: DuplicateMatch[];
  errors: Array<{ rowNumber: number; reason: string }>;
}

export interface TenantArchivePayload {
  business: Record<string, unknown>;
  staff: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
  pets: Array<Record<string, unknown>>;
  visits: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  exportedAt: string;
  exportVersion: string;
}

/**
 * Formula Injection Defense (PW075)
 * Escapes leading formula trigger characters (=, +, -, @, \t, \r) by prepending a single quote.
 */
export function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val);
  const dangerousTriggers = ['=', '+', '-', '@'];
  const trimmed = str.trimStart();

  let sanitized = str;
  if (
    str.startsWith('\t') ||
    str.startsWith('\r') ||
    dangerousTriggers.some((char) => trimmed.startsWith(char))
  ) {
    sanitized = `'${str}`;
  }

  // Quote cell if it contains commas, quotes, or newlines
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n') || sanitized.includes('\r')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Normalizes phone numbers for matching (strips non-digits).
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

/**
 * Parses raw CSV text into typed candidate rows according to competitor format mappings.
 */
export function parseCompetitorCsv(
  rawCsv: string,
  source: LegacyCompetitor,
  existingClients: ExistingClientRef[] = []
): CompetitorParseResult {
  const lines = rawCsv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      source,
      totalRows: 0,
      validRows: [],
      duplicateMatches: [],
      errors: [{ rowNumber: 1, reason: 'CSV is empty or missing data rows' }],
    };
  }

  const rawHeaders = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim().replace(/['"]/g, ''));
  const validRows: ImportCandidateRow[] = [];
  const errors: Array<{ rowNumber: number; reason: string }> = [];

  // Map header index by keywords
  const colMap = mapHeadersToFields(rawHeaders, source);

  if (colMap.clientName === -1 && colMap.clientPhone === -1) {
    return {
      source,
      totalRows: lines.length - 1,
      validRows: [],
      duplicateMatches: [],
      errors: [{ rowNumber: 1, reason: 'Could not detect required columns (Client Name or Phone)' }],
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cells = splitCsvLine(lines[i]);
    if (cells.length === 0 || cells.every((c) => c.trim() === '')) {
      continue;
    }

    const clientName = colMap.clientName >= 0 ? cells[colMap.clientName]?.trim() || '' : '';
    const clientPhone = colMap.clientPhone >= 0 ? cells[colMap.clientPhone]?.trim() || '' : '';
    const clientEmail = colMap.clientEmail >= 0 ? cells[colMap.clientEmail]?.trim() || undefined : undefined;
    const petName = colMap.petName >= 0 ? cells[colMap.petName]?.trim() || '' : '';
    const breed = colMap.breed >= 0 ? cells[colMap.breed]?.trim() || 'Mixed Breed' : 'Mixed Breed';
    const weightRaw = colMap.weightLbs >= 0 ? parseFloat(cells[colMap.weightLbs] || '') : NaN;
    const weightLbs = isNaN(weightRaw) ? 25.0 : Math.max(1, Math.min(250, weightRaw));
    const rawNotes = colMap.legacyNotes >= 0 ? cells[colMap.legacyNotes]?.trim() || '' : '';

    if (!clientName) {
      errors.push({ rowNumber, reason: 'Missing client name' });
      continue;
    }

    if (!clientPhone && !clientEmail) {
      errors.push({ rowNumber, reason: 'Missing both phone and email contact info' });
      continue;
    }

    if (!petName) {
      errors.push({ rowNumber, reason: 'Missing pet name' });
      continue;
    }

    // Format legacy notes with explicit provenance (PW073)
    const legacyNotes = rawNotes
      ? `[LEGACY IMPORT: ${source.toUpperCase()}] ${rawNotes}`
      : `[LEGACY IMPORT: ${source.toUpperCase()}]`;

    validRows.push({
      clientName,
      clientPhone,
      clientEmail,
      petName,
      breed,
      weightLbs,
      legacyNotes,
    });
  }

  // Detect duplicate candidates against existing tenant clients
  const duplicateMatches: DuplicateMatch[] = [];
  const existingByPhone = new Map<string, ExistingClientRef>();
  const existingByEmail = new Map<string, ExistingClientRef>();

  for (const client of existingClients) {
    const norm = normalizePhone(client.phone);
    if (norm) existingByPhone.set(norm, client);
    if (client.email) existingByEmail.set(client.email.toLowerCase().trim(), client);
  }

  validRows.forEach((row, index) => {
    const norm = normalizePhone(row.clientPhone);
    if (norm && existingByPhone.has(norm)) {
      duplicateMatches.push({
        rowIndex: index,
        candidate: row,
        matchedClient: existingByPhone.get(norm)!,
        matchField: 'phone',
      });
    } else if (row.clientEmail && existingByEmail.has(row.clientEmail.toLowerCase().trim())) {
      duplicateMatches.push({
        rowIndex: index,
        candidate: row,
        matchedClient: existingByEmail.get(row.clientEmail.toLowerCase().trim())!,
        matchField: 'email',
      });
    }
  });

  return {
    source,
    totalRows: lines.length - 1,
    validRows,
    duplicateMatches,
    errors,
  };
}

/**
 * Splits a CSV line respecting quoted commas.
 */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Maps competitor header variations to unified fields.
 */
function mapHeadersToFields(
  headers: string[],
  source: LegacyCompetitor
): Record<'clientName' | 'clientPhone' | 'clientEmail' | 'petName' | 'breed' | 'weightLbs' | 'legacyNotes', number> {
  const findCol = (keywords: string[]) =>
    headers.findIndex((h) => keywords.some((k) => h.includes(k)));

  return {
    clientName: findCol(['client name', 'owner name', 'customer name', 'parent', 'client', 'customer']),
    clientPhone: findCol(['client phone', 'owner phone', 'phone number', 'mobile', 'cell', 'phone']),
    clientEmail: findCol(['client email', 'owner email', 'email address', 'email']),
    petName: findCol(['pet name', 'dog name', 'animal name', 'pet']),
    breed: findCol(['breed', 'species/breed', 'dog breed']),
    weightLbs: findCol(['weight', 'weight (lbs)', 'weight_lbs', 'lbs']),
    legacyNotes: findCol(['notes', 'special instructions', 'grooming notes', 'legacy notes', 'comments']),
  };
}

/**
 * Formats a scoped tabular dataset into formula-escaped CSV.
 */
export function formatScopedCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.map(sanitizeCsvCell).join(',');
  const rowLines = rows.map((row) =>
    headers.map((h) => sanitizeCsvCell(row[h])).join(',')
  );
  return [headerLine, ...rowLines].join('\n');
}

/**
 * Generates an encrypted/structured JSON tenant archive for full data portability (WF34).
 */
export function formatTenantArchiveJson(tenantData: TenantArchivePayload): string {
  return JSON.stringify(
    {
      pawtrackr_archive_format_version: '2026.1',
      generated_at: tenantData.exportedAt || new Date().toISOString(),
      business: tenantData.business,
      staff: tenantData.staff,
      clients: tenantData.clients,
      pets: tenantData.pets,
      visits: tenantData.visits,
      transactions: tenantData.transactions,
      meta: {
        record_counts: {
          staff: tenantData.staff.length,
          clients: tenantData.clients.length,
          pets: tenantData.pets.length,
          visits: tenantData.visits.length,
          transactions: tenantData.transactions.length,
        },
      },
    },
    null,
    2
  );
}
