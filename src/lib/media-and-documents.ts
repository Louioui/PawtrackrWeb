// ============================================================================
// PAWTRACKR SLICE 5: PRIVATE STORAGE & PET DOCUMENTS (WF07 / WF20)
// Type definitions, input validation, and media signing utilities
// ============================================================================

export type DocumentType =
  | 'rabies_certificate'
  | 'bordetella'
  | 'dhpp'
  | 'vet_records'
  | 'liability_waiver'
  | 'other';

export const DOCUMENT_TYPES: ReadonlyArray<DocumentType> = [
  'rabies_certificate',
  'bordetella',
  'dhpp',
  'vet_records',
  'liability_waiver',
  'other',
] as const;

export type DocumentStatus = 'uploaded' | 'verified' | 'rejected' | 'expired';

export const DOCUMENT_STATUSES: ReadonlyArray<DocumentStatus> = [
  'uploaded',
  'verified',
  'rejected',
  'expired',
] as const;

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

export const MAX_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 900; // 15 minutes

export type PetDocumentRecord = {
  id: string;
  business_id: string;
  pet_id: string;
  client_id: string;
  document_type: DocumentType;
  file_path: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string;
  status: DocumentStatus;
  verification_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  signed_url?: string;
};

export type DocumentUploadPayload = {
  petId: string;
  clientId: string;
  documentType: DocumentType;
  filePath: string;
  fileName: string;
  fileSizeBytes?: number;
  mimeType: string;
};

export type DocumentVerificationPayload = {
  documentId: string;
  status: 'verified' | 'rejected' | 'expired';
  expiresAt?: string | null;
  notes?: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function formatDocumentTypeLabel(type: DocumentType): string {
  switch (type) {
    case 'rabies_certificate':
      return 'Rabies Certificate';
    case 'bordetella':
      return 'Bordetella (Kennel Cough)';
    case 'dhpp':
      return 'DHPP / Distemper Vaccine';
    case 'vet_records':
      return 'Veterinary Medical Records';
    case 'liability_waiver':
      return 'Signed Liability Waiver';
    case 'other':
      return 'General Pet Document';
  }
}

export function isDocumentExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const todayUtc = new Date().toISOString().slice(0, 10);
  return expiresAt < todayUtc;
}

export function sanitizeStoragePath(
  businessId: string,
  rawPath: string
): { valid: boolean; path?: string; error?: string } {
  if (!rawPath || typeof rawPath !== 'string') {
    return { valid: false, error: 'Storage path is required.' };
  }

  const clean = rawPath.trim();
  if (clean.includes('..') || clean.includes('//') || clean.startsWith('/')) {
    return { valid: false, error: 'Path traversal or malformed path detected.' };
  }

  const parts = clean.split('/');
  if (parts.length < 2) {
    return { valid: false, error: 'Path must contain at least folder and file name.' };
  }

  if (parts[0] !== businessId) {
    return { valid: false, error: 'Path must begin with salon business ID for tenant isolation.' };
  }

  return { valid: true, path: clean };
}

export function validateDocumentUploadInput(
  input: unknown
): { valid: boolean; payload?: DocumentUploadPayload; error?: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Upload payload is required.' };
  }

  const r = input as Record<string, unknown>;

  if (typeof r.petId !== 'string' || !uuidPattern.test(r.petId)) {
    return { valid: false, error: 'Valid pet UUID is required.' };
  }

  if (typeof r.clientId !== 'string' || !uuidPattern.test(r.clientId)) {
    return { valid: false, error: 'Valid client UUID is required.' };
  }

  if (
    typeof r.documentType !== 'string' ||
    !DOCUMENT_TYPES.includes(r.documentType as DocumentType)
  ) {
    return {
      valid: false,
      error: `Invalid document type. Allowed: ${DOCUMENT_TYPES.join(', ')}.`,
    };
  }

  if (typeof r.filePath !== 'string' || !r.filePath.trim()) {
    return { valid: false, error: 'File path is required.' };
  }

  if (typeof r.fileName !== 'string' || !r.fileName.trim()) {
    return { valid: false, error: 'File name is required.' };
  }

  if (typeof r.mimeType !== 'string' || !ALLOWED_MIME_TYPES.has(r.mimeType.toLowerCase())) {
    return {
      valid: false,
      error: `Unsupported MIME type: ${r.mimeType}. Allowed: JPEG, PNG, WebP, HEIC, PDF.`,
    };
  }

  if (r.fileSizeBytes !== undefined) {
    const size = Number(r.fileSizeBytes);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_DOCUMENT_SIZE_BYTES) {
      return {
        valid: false,
        error: `File size must be between 1 byte and ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)} MB.`,
      };
    }
  }

  return {
    valid: true,
    payload: {
      petId: r.petId,
      clientId: r.clientId,
      documentType: r.documentType as DocumentType,
      filePath: r.filePath.trim(),
      fileName: r.fileName.trim(),
      fileSizeBytes: r.fileSizeBytes ? Number(r.fileSizeBytes) : undefined,
      mimeType: r.mimeType.toLowerCase(),
    },
  };
}

export function validateDocumentVerificationInput(
  input: unknown
): { valid: boolean; payload?: DocumentVerificationPayload; error?: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Verification payload is required.' };
  }

  const r = input as Record<string, unknown>;

  if (typeof r.documentId !== 'string' || !uuidPattern.test(r.documentId)) {
    return { valid: false, error: 'Valid document UUID is required.' };
  }

  if (
    typeof r.status !== 'string' ||
    !['verified', 'rejected', 'expired'].includes(r.status)
  ) {
    return {
      valid: false,
      error: 'Status must be one of: verified, rejected, expired.',
    };
  }

  let cleanExpiresAt: string | null = null;
  if (r.expiresAt !== undefined && r.expiresAt !== null) {
    if (typeof r.expiresAt !== 'string' || !datePattern.test(r.expiresAt)) {
      return { valid: false, error: 'Expiration date must be formatted as YYYY-MM-DD.' };
    }
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (r.status === 'verified' && r.expiresAt < todayUtc) {
      return { valid: false, error: 'Cannot verify a document with an expiration date in the past.' };
    }
    cleanExpiresAt = r.expiresAt;
  }

  const notes = typeof r.notes === 'string' ? r.notes.trim() : null;

  return {
    valid: true,
    payload: {
      documentId: r.documentId,
      status: r.status as 'verified' | 'rejected' | 'expired',
      expiresAt: cleanExpiresAt,
      notes,
    },
  };
}
