// ============================================================================
// PAWTRACKR WEB — API SCHEMA VALIDATION, SANITIZATION & DIAGNOSTIC LOGGER (#21, #45)
// Prevents XSS, SQL Injection, and malformed payloads across all /api/* routes.
// ============================================================================

/**
 * Strips potentially dangerous HTML/script tags to prevent stored XSS (#45).
 */
export function sanitizeString(input: unknown, maxLength = 500): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function validateUUIDOrTenantId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  return /^[a-zA-Z0-9-]+$/.test(id) && id.length >= 3 && id.length <= 64;
}

export function validatePositiveAmount(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(num, 100000);
}

export function logApiDiagnostic(event: {
  route: string;
  businessId?: string;
  status: 'ok' | 'blocked' | 'error';
  detail?: string;
}) {
  if (process.env.NODE_ENV !== 'test') {
    console.info(
      `[Pawtrackr API] route=${event.route} tenant=${
        event.businessId ?? 'public'
      } status=${event.status} ${event.detail ?? ''}`
    );
  }
}
