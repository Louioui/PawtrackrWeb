// ============================================================================
// PAWTRACKR WEB — DISTRIBUTED W3C OPENTELEMETRY TRACE CONTEXT & SPAN TELEMETRY
// Edge-runtime & Node 22 strip-types compatible (Web Crypto API only).
// Implements W3C Trace Context v1 (`traceparent`: 00-<traceId>-<spanId>-<flags>)
// and bounded ring-buffer span metrics for synthetic canary monitoring.
// ============================================================================

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  traceFlags: string;
  traceparent: string;
  requestId: string;
}

export interface TelemetrySpanRecord {
  traceId: string;
  spanId: string;
  requestId: string;
  operation: string;
  route: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
}

const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;
const ZERO_TRACE_ID = '00000000000000000000000000000000';
const ZERO_SPAN_ID = '0000000000000000';
const MAX_SPAN_BUFFER = 256;

const recentSpans: TelemetrySpanRecord[] = [];

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLength; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  // Ensure non-zero W3C identifier
  if (/^0+$/.test(hex)) {
    hex = `1${hex.slice(1)}`;
  }
  return hex;
}

function createRequestId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `req_${randomHex(12)}`;
}

/**
 * Parses an incoming W3C `traceparent` header or mints a new root trace context,
 * generating a child `spanId` for the current hop and a sanitized `x-request-id`.
 */
export function parseOrCreateTraceContext(headers?: Pick<Headers, 'get'> | null): TraceContext {
  const rawTraceparent = headers?.get('traceparent')?.trim() ?? '';
  const rawRequestId = headers?.get('x-request-id')?.trim() ?? '';

  let traceId = '';
  let parentSpanId: string | null = null;
  let traceFlags = '01';

  const match = TRACEPARENT_PATTERN.exec(rawTraceparent);
  if (match) {
    const candidateTrace = match[1].toLowerCase();
    const candidateParent = match[2].toLowerCase();
    const candidateFlags = match[3].toLowerCase();
    if (candidateTrace !== ZERO_TRACE_ID && candidateParent !== ZERO_SPAN_ID) {
      traceId = candidateTrace;
      parentSpanId = candidateParent;
      traceFlags = candidateFlags;
    }
  }

  if (!traceId) {
    traceId = randomHex(16);
  }

  const spanId = randomHex(8);
  const traceparent = `00-${traceId}-${spanId}-${traceFlags}`;
  const requestId = SAFE_REQUEST_ID_PATTERN.test(rawRequestId) ? rawRequestId : createRequestId();

  return {
    traceId,
    spanId,
    parentSpanId,
    traceFlags,
    traceparent,
    requestId,
  };
}

/**
 * Records a bounded telemetry span in memory (strict 256-entry ring buffer).
 */
export function recordTelemetrySpan(span: TelemetrySpanRecord): void {
  if (recentSpans.length >= MAX_SPAN_BUFFER) {
    recentSpans.shift();
  }
  recentSpans.push(span);
}

/**
 * Returns aggregated latency and error metrics across the bounded telemetry ring buffer.
 */
export function getTelemetrySnapshot(): {
  bufferedSpans: number;
  maxBufferCapacity: number;
  errorCount: number;
  errorRatePct: number;
  p95LatencyMs: number;
} {
  const count = recentSpans.length;
  if (count === 0) {
    return {
      bufferedSpans: 0,
      maxBufferCapacity: MAX_SPAN_BUFFER,
      errorCount: 0,
      errorRatePct: 0,
      p95LatencyMs: 0,
    };
  }

  let errors = 0;
  const durations: number[] = [];
  for (const s of recentSpans) {
    if (s.statusCode >= 500) errors += 1;
    durations.push(Math.max(0, s.durationMs));
  }
  durations.sort((a, b) => a - b);
  const p95Index = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));

  return {
    bufferedSpans: count,
    maxBufferCapacity: MAX_SPAN_BUFFER,
    errorCount: errors,
    errorRatePct: Math.round((errors / count) * 10000) / 100,
    p95LatencyMs: Math.round((durations[p95Index] ?? 0) * 100) / 100,
  };
}

export function clearTelemetryForTest(): void {
  recentSpans.length = 0;
}
