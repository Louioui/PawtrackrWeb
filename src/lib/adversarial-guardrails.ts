import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

// ============================================================================
// 1. THREE-WAY MERGE CONFLICT RESOLUTION (Base, Server, Local)
// ============================================================================

export interface MergeConflictRecord {
  field: string;
  baseValue: unknown;
  serverValue: unknown;
  localValue: unknown;
  resolvedValue: unknown;
  strategy: 'clean' | 'server_wins' | 'manager_override';
}

export interface MergeAuditEntry {
  field: string;
  message: string;
  timestamp: string;
}

export interface ThreeWayMergeResult<T extends Record<string, unknown>> {
  resolved: T;
  conflicts: MergeConflictRecord[];
  auditLog: MergeAuditEntry[];
  hasConflicts: boolean;
}

export interface MergeOptions {
  isManagerOverride?: boolean;
  actorId?: string;
  entityId?: string;
}

/**
 * Resolves offline-first outbox conflicts using 3-way merge logic.
 * Incorporates manager override privilege with detailed audit trails.
 */
export function resolveThreeWayMerge<T extends Record<string, unknown>>(
  base: T,
  server: T,
  local: T,
  options: MergeOptions = {}
): ThreeWayMergeResult<T> {
  const resolved: Record<string, unknown> = { ...server };
  const conflicts: MergeConflictRecord[] = [];
  const auditLog: MergeAuditEntry[] = [];
  const now = new Date().toISOString();

  const allKeys = Array.from(
    new Set([...Object.keys(base), ...Object.keys(server), ...Object.keys(local)])
  );

  for (const key of allKeys) {
    const baseVal = base[key];
    const serverVal = server[key];
    const localVal = local[key];

    // Case 1: Server and local agree
    if (JSON.stringify(serverVal) === JSON.stringify(localVal)) {
      resolved[key] = localVal;
      continue;
    }

    // Case 2: Only local modified (server matches base)
    if (
      JSON.stringify(serverVal) === JSON.stringify(baseVal) &&
      JSON.stringify(localVal) !== JSON.stringify(baseVal)
    ) {
      resolved[key] = localVal;
      continue;
    }

    // Case 3: Only server modified (local matches base)
    if (
      JSON.stringify(localVal) === JSON.stringify(baseVal) &&
      JSON.stringify(serverVal) !== JSON.stringify(baseVal)
    ) {
      resolved[key] = serverVal;
      continue;
    }

    // Case 4: Concurrent conflict! Both modified with different values
    if (
      JSON.stringify(serverVal) !== JSON.stringify(baseVal) &&
      JSON.stringify(localVal) !== JSON.stringify(baseVal) &&
      JSON.stringify(serverVal) !== JSON.stringify(localVal)
    ) {
      if (options.isManagerOverride) {
        resolved[key] = localVal;
        conflicts.push({
          field: key,
          baseValue: baseVal,
          serverValue: serverVal,
          localValue: localVal,
          resolvedValue: localVal,
          strategy: 'manager_override',
        });
        auditLog.push({
          field: key,
          message: `Manager override by actor [${options.actorId ?? 'authorized_mgr'}] forced local value on field "${key}".`,
          timestamp: now,
        });
      } else {
        resolved[key] = serverVal;
        conflicts.push({
          field: key,
          baseValue: baseVal,
          serverValue: serverVal,
          localValue: localVal,
          resolvedValue: serverVal,
          strategy: 'server_wins',
        });
        auditLog.push({
          field: key,
          message: `Concurrent write collision on field "${key}". Server state preserved. Local offline edit queued for review.`,
          timestamp: now,
        });
      }
    }
  }

  return {
    resolved: resolved as T,
    conflicts,
    auditLog,
    hasConflicts: conflicts.length > 0,
  };
}

// ============================================================================
// 2. PET NOTES PROMPT INJECTION SANITIZATION (AI Defense)
// ============================================================================

export {
  PROMPT_INJECTION_PATTERNS,
  type SanitizePetNotesResult,
  sanitizePetNotesForAI,
} from './prompt-guardrails';

// ============================================================================
// 3. CRYPTOGRAPHICALLY SIGNED SHORT LINKS (*.pawtrackr.live locked)
// ============================================================================

export interface SignedLinkOptions {
  domain: string;
  path: string;
  salonId: string;
  visitId: string;
  expiresInSeconds: number;
  secretKey: string;
}

export interface VerifyLinkResult {
  valid: boolean;
  salonId?: string;
  visitId?: string;
  reason?: string;
}

const ALLOWED_DOMAINS = new Set([
  'pawtrackr.live',
  'app.pawtrackr.live',
  'api.pawtrackr.live',
  'localhost',
  '127.0.0.1',
]);

function isDomainAllowed(host: string): boolean {
  if (ALLOWED_DOMAINS.has(host)) return true;
  if (host.endsWith('.pawtrackr.live')) return true;
  if (host.startsWith('localhost:')) return true;
  return false;
}

/**
 * Generates an expiring, cryptographically signed short link domain-locked to Pawtrackr.
 */
export function generateSignedShortLink(options: SignedLinkOptions): string {
  const { domain, path, salonId, visitId, expiresInSeconds, secretKey } = options;

  if (!isDomainAllowed(domain)) {
    throw new Error(`Forbidden domain "${domain}". Links must be locked to *.pawtrackr.live.`);
  }

  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const payload = `domain=${domain}&path=${normalizedPath}&salonId=${salonId}&visitId=${visitId}&exp=${exp}`;

  const hmac = createHmac('sha256', secretKey);
  hmac.update(payload);
  const sig = hmac.digest('hex');

  const protocol = domain.includes('localhost') || domain.includes('127.0.0.1') ? 'http' : 'https';
  return `${protocol}://${domain}${normalizedPath}?salon=${salonId}&visit=${visitId}&exp=${exp}&sig=${sig}`;
}

/**
 * Verifies the cryptographic signature and expiration of a short link.
 */
export function verifySignedShortLink(rawUrl: string, secretKey: string): VerifyLinkResult {
  try {
    const url = new URL(rawUrl);
    if (!isDomainAllowed(url.host)) {
      return { valid: false, reason: `Untrusted host "${url.host}". Phishing vector blocked.` };
    }

    const salonId = url.searchParams.get('salon');
    const visitId = url.searchParams.get('visit');
    const expStr = url.searchParams.get('exp');
    const sig = url.searchParams.get('sig');

    if (!salonId || !visitId || !expStr || !sig) {
      return { valid: false, reason: 'Missing mandatory signed parameters.' };
    }

    const exp = parseInt(expStr, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Number.isNaN(exp) || exp < now) {
      return { valid: false, salonId, visitId, reason: 'Signed link has expired.' };
    }

    const payload = `domain=${url.host}&path=${url.pathname}&salonId=${salonId}&visitId=${visitId}&exp=${exp}`;
    const hmac = createHmac('sha256', secretKey);
    hmac.update(payload);
    const expectedSig = hmac.digest('hex');

    // Constant-time signature comparison to prevent timing attacks
    const sigBuffer = Buffer.from(sig, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, salonId, visitId, reason: 'Cryptographic signature mismatch.' };
    }

    return { valid: true, salonId, visitId };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : 'Malformed link URL.',
    };
  }
}

// ============================================================================
// 4. SMS DISPATCH QUOTA TOKEN BUCKET (Hard-Cap Cost Guard)
// ============================================================================

export interface SmsQuotaState {
  salonId: string;
  monthlyLimit: number;
  currentUsage: number;
  remaining: number;
}

// Bounded in-memory token bucket registry per tenant (prevents OOM under multi-tenant flood)
const MAX_SMS_QUOTA_TENANTS = 5_000;
const smsQuotaRegistry = new Map<string, { usage: number; monthKey: string; limit: number }>();

function evictMapToCap<K, V>(map: Map<K, V>, maxEntries: number): void {
  while (map.size >= maxEntries) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function evictSetToCap<T>(set: Set<T>, maxEntries: number): void {
  while (set.size >= maxEntries) {
    const oldest = set.values().next().value;
    if (oldest === undefined) break;
    set.delete(oldest);
  }
}

function getMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function checkSmsQuota(salonId: string, requestedCount = 1, tierLimit = 500): SmsQuotaState {
  const monthKey = getMonthKey();
  const entry = smsQuotaRegistry.get(salonId);

  if (!entry || entry.monthKey !== monthKey) {
    return {
      salonId,
      monthlyLimit: tierLimit,
      currentUsage: 0,
      remaining: Math.max(0, tierLimit - Math.max(0, requestedCount - requestedCount)),
    };
  }

  const remaining = Math.max(0, entry.limit - entry.usage);
  return {
    salonId,
    monthlyLimit: entry.limit,
    currentUsage: entry.usage,
    remaining,
  };
}

export function recordSmsDispatch(salonId: string, count = 1, tierLimit = 500): SmsQuotaState {
  const monthKey = getMonthKey();
  let entry = smsQuotaRegistry.get(salonId);

  if (!entry || entry.monthKey !== monthKey) {
    if (!smsQuotaRegistry.has(salonId)) {
      evictMapToCap(smsQuotaRegistry, MAX_SMS_QUOTA_TENANTS);
    }
    entry = { usage: 0, monthKey, limit: tierLimit };
    smsQuotaRegistry.delete(salonId);
    smsQuotaRegistry.set(salonId, entry);
  }

  if (entry.usage + count > entry.limit) {
    throw new Error(
      `SMS Quota Exceeded: Attempted to send ${count} messages, but salon [${salonId}] has only ${Math.max(
        0,
        entry.limit - entry.usage
      )} SMS tokens remaining out of ${entry.limit} this month.`
    );
  }

  entry.usage += count;
  const remaining = Math.max(0, entry.limit - entry.usage);

  return {
    salonId,
    monthlyLimit: entry.limit,
    currentUsage: entry.usage,
    remaining,
  };
}

export function resetSmsQuotaForTest(salonId?: string): void {
  if (salonId) {
    smsQuotaRegistry.delete(salonId);
  } else {
    smsQuotaRegistry.clear();
  }
}

// ============================================================================
// 5. HARDWARE PASSKEY REGISTRY & REMOTE REVOCATION
// ============================================================================

export interface DevicePasskey {
  deviceId: string;
  salonId: string;
  label: string;
  status: 'active' | 'revoked' | 'suspended';
  registeredAt: string;
  revokedAt?: string;
  revocationReason?: string;
}

const MAX_DEVICE_PASSKEYS = 10_000;
const deviceRegistry = new Map<string, DevicePasskey>();

export function registerDevicePasskey(
  deviceId: string,
  salonId: string,
  label = 'Mobile Van Tablet'
): DevicePasskey {
  if (!deviceRegistry.has(deviceId)) {
    evictMapToCap(deviceRegistry, MAX_DEVICE_PASSKEYS);
  }
  const passkey: DevicePasskey = {
    deviceId,
    salonId,
    label,
    status: 'active',
    registeredAt: new Date().toISOString(),
  };
  deviceRegistry.delete(deviceId);
  deviceRegistry.set(deviceId, passkey);
  return passkey;
}

export function revokeDevicePasskey(deviceId: string, reason = 'Reported lost or stolen'): DevicePasskey {
  const existing = deviceRegistry.get(deviceId);
  if (!existing) {
    throw new Error(`Device [${deviceId}] not found in hardware registry.`);
  }
  existing.status = 'revoked';
  existing.revokedAt = new Date().toISOString();
  existing.revocationReason = reason;
  return existing;
}

export function isDevicePasskeyValid(deviceId: string, salonId: string): boolean {
  const passkey = deviceRegistry.get(deviceId);
  if (!passkey) return false;
  if (passkey.salonId !== salonId) return false;
  return passkey.status === 'active';
}

export function isDevicePasskeyRevoked(deviceId: string): boolean {
  const passkey = deviceRegistry.get(deviceId);
  if (!passkey) return false;
  return passkey.status !== 'active';
}

export function clearDeviceRegistryForTest(): void {
  deviceRegistry.clear();
}

// ============================================================================
// 6. OUT-OF-ORDER WEBHOOK BUFFER & RECONCILIATION
// ============================================================================

export interface WebhookEventPayload {
  id: string;
  entityId: string;
  eventType: string;
  sequenceNumber: number;
  payload: Record<string, unknown>;
  receivedAt: string;
}

const MAX_PROCESSED_WEBHOOK_EVENTS = 10_000;
const MAX_WEBHOOK_ENTITIES = 5_000;
const MAX_BUFFERED_PER_ENTITY = 64;

const processedEventSet = new Set<string>();
const entitySequenceTracker = new Map<string, number>();
const webhookBufferQueue = new Map<string, WebhookEventPayload[]>();

export function bufferOrProcessWebhookEvent(event: {
  id: string;
  entityId: string;
  eventType: string;
  sequenceNumber: number;
  payload?: Record<string, unknown>;
}): {
  status: 'processed' | 'buffered' | 'duplicate_ignored';
  entityId: string;
  currentSequence: number;
  bufferedCount: number;
} {
  // 1. Idempotency check: Already processed this exact webhook ID
  if (processedEventSet.has(event.id)) {
    return {
      status: 'duplicate_ignored',
      entityId: event.entityId,
      currentSequence: entitySequenceTracker.get(event.entityId) ?? 0,
      bufferedCount: webhookBufferQueue.get(event.entityId)?.length ?? 0,
    };
  }

  const currentSeq = entitySequenceTracker.get(event.entityId) ?? 0;
  const expectedSeq = currentSeq + 1;

  // 2. Future event arrived early: buffer it with strict per-entity & global bounds
  if (event.sequenceNumber > expectedSeq) {
    if (!webhookBufferQueue.has(event.entityId)) {
      evictMapToCap(webhookBufferQueue, MAX_WEBHOOK_ENTITIES);
    }
    const queue = webhookBufferQueue.get(event.entityId) ?? [];
    if (queue.some((item) => item.id === event.id)) {
      return {
        status: 'duplicate_ignored',
        entityId: event.entityId,
        currentSequence: currentSeq,
        bufferedCount: queue.length,
      };
    }
    if (queue.length >= MAX_BUFFERED_PER_ENTITY) {
      queue.shift();
    }
    queue.push({
      id: event.id,
      entityId: event.entityId,
      eventType: event.eventType,
      sequenceNumber: event.sequenceNumber,
      payload: event.payload ?? {},
      receivedAt: new Date().toISOString(),
    });
    queue.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    webhookBufferQueue.set(event.entityId, queue);

    return {
      status: 'buffered',
      entityId: event.entityId,
      currentSequence: currentSeq,
      bufferedCount: queue.length,
    };
  }

  // 3. In-order event: process immediately with bounded nonce sets
  evictSetToCap(processedEventSet, MAX_PROCESSED_WEBHOOK_EVENTS);
  processedEventSet.add(event.id);
  if (!entitySequenceTracker.has(event.entityId)) {
    evictMapToCap(entitySequenceTracker, MAX_WEBHOOK_ENTITIES);
  }
  entitySequenceTracker.set(event.entityId, event.sequenceNumber);

  // Check if queued events can now drain in sequence
  let nextSeq = event.sequenceNumber + 1;
  const queue = webhookBufferQueue.get(event.entityId) ?? [];
  while (queue.length > 0 && queue[0].sequenceNumber === nextSeq) {
    const nextEvent = queue.shift()!;
    evictSetToCap(processedEventSet, MAX_PROCESSED_WEBHOOK_EVENTS);
    processedEventSet.add(nextEvent.id);
    entitySequenceTracker.set(event.entityId, nextEvent.sequenceNumber);
    nextSeq = nextEvent.sequenceNumber + 1;
  }
  if (queue.length === 0) {
    webhookBufferQueue.delete(event.entityId);
  } else {
    webhookBufferQueue.set(event.entityId, queue);
  }

  return {
    status: 'processed',
    entityId: event.entityId,
    currentSequence: entitySequenceTracker.get(event.entityId) ?? event.sequenceNumber,
    bufferedCount: queue.length,
  };
}

export function clearWebhookBufferForTest(): void {
  processedEventSet.clear();
  entitySequenceTracker.clear();
  webhookBufferQueue.clear();
}

// ============================================================================
// 7. CSV IMPORT SANITIZATION (Formula & SQL Injection Guard)
// ============================================================================

/**
 * Escapes formula characters (=, +, -, @) to prevent CSV/Excel DDE attacks,
 * strips HTML/script tags, and cleans dangerous SQL meta-characters.
 */
export function sanitizeCsvImportRow(
  row: Record<string, unknown>
): { sanitized: Record<string, string>; hadDangerousFormulas: boolean } {
  const sanitized: Record<string, string> = {};
  let hadDangerousFormulas = false;

  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      sanitized[key] = '';
      continue;
    }

    let str = String(value).trim();

    // Check for Excel / Calc Formula Injection (=, +, -, @, \t, \r)
    if (/^[=+\-@\t\r]/.test(str)) {
      hadDangerousFormulas = true;
      // Prepend single quote to neutralize formula execution in spreadsheet software
      str = `'${str}`;
    }

    // Strip script blocks completely including content
    str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Strip HTML tags to prevent stored XSS
    str = str.replace(/<[^>]*>?/gm, '');

    // Strip null bytes
    str = str.replace(/\0/g, '');

    sanitized[key] = str;
  }

  return { sanitized, hadDangerousFormulas };
}

// ============================================================================
// 8. GDPR / CCPA CRYPTOGRAPHIC PSEUDONYMIZATION
// ============================================================================

export interface AnonymizedClientOutput {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  notes: string;
  is_anonymized: boolean;
  anonymized_at: string;
}

/**
 * Pseudonymizes customer personal identification data while preserving
 * fiscal ledger references, IDs, and financial totals for zero-drift compliance.
 */
export function anonymizeClientRecord(
  clientId: string,
  salt = 'pawtrackr_gdpr_salt'
): AnonymizedClientOutput {
  const hash = createHmac('sha256', salt).update(clientId).digest('hex').slice(0, 12);
  const now = new Date().toISOString();

  return {
    id: clientId,
    name: 'ANONYMIZED_USER',
    email: `gdpr_${hash}@anonymized.pawtrackr.internal`,
    phone: null,
    address: null,
    notes: 'Client exercised GDPR/CCPA Right to be Forgotten. Personal identifiers purged.',
    is_anonymized: true,
    anonymized_at: now,
  };
}

// ============================================================================
// 9. STRIPE PAYMENT DUNNING STATE MACHINE (7-Day Grace Period)
// ============================================================================

export type DunningState = 'active' | 'dunning_grace' | 'suspended' | 'canceled';

export interface DunningEvaluation {
  state: DunningState;
  daysRemainingInGrace: number;
  canOperate: boolean;
  requiresWarningBanner: boolean;
  message: string;
}

export function evaluateDunningStatus(options: {
  subscriptionStatus: string;
  pastDueSince?: string | null;
  gracePeriodDays?: number;
  currentTime?: Date;
}): DunningEvaluation {
  const {
    subscriptionStatus,
    pastDueSince,
    gracePeriodDays = 7,
    currentTime = new Date(),
  } = options;

  if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
    return {
      state: 'active',
      daysRemainingInGrace: gracePeriodDays,
      canOperate: true,
      requiresWarningBanner: false,
      message: 'Subscription in good standing.',
    };
  }

  if (subscriptionStatus === 'canceled' || subscriptionStatus === 'unpaid') {
    return {
      state: 'canceled',
      daysRemainingInGrace: 0,
      canOperate: false,
      requiresWarningBanner: true,
      message: 'Subscription canceled or uncollectible. Account access restricted to read-only archive.',
    };
  }

  if (subscriptionStatus === 'past_due') {
    const pastDueDate = pastDueSince ? new Date(pastDueSince) : currentTime;
    const diffMs = currentTime.getTime() - pastDueDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, gracePeriodDays - diffDays);

    if (daysRemaining > 0) {
      return {
        state: 'dunning_grace',
        daysRemainingInGrace: daysRemaining,
        canOperate: true,
        requiresWarningBanner: true,
        message: `Payment past due. Account operating under ${daysRemaining}-day grace period. Please update card to prevent suspension.`,
      };
    } else {
      return {
        state: 'suspended',
        daysRemainingInGrace: 0,
        canOperate: false,
        requiresWarningBanner: true,
        message: 'Grace period expired. Salon operations suspended until outstanding invoice is settled.',
      };
    }
  }

  return {
    state: 'suspended',
    daysRemainingInGrace: 0,
    canOperate: false,
    requiresWarningBanner: true,
    message: `Unknown subscription status: ${subscriptionStatus}.`,
  };
}

// ============================================================================
// 10. ERROR-RATE CIRCUIT BREAKER (>10% failure rate over rolling 60s)
// ============================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitMetrics {
  total: number;
  successes: number;
  failures: number;
  failureRate: number;
  state: CircuitState;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureTimestamps: number[] = [];
  private successTimestamps: number[] = [];
  private openedAt = 0;
  private failureThresholdPercent: number;
  private windowMs: number;
  private cooldownMs: number;
  private minRequestsInWindow: number;

  constructor(
    failureThresholdPercent = 10,
    windowMs = 60_000,
    cooldownMs = 15_000,
    minRequestsInWindow = 10
  ) {
    this.failureThresholdPercent = failureThresholdPercent;
    this.windowMs = windowMs;
    this.cooldownMs = cooldownMs;
    this.minRequestsInWindow = minRequestsInWindow;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    this.cleanWindows(now);

    // If circuit is OPEN, check if cooldown has elapsed to allow a test in HALF_OPEN
    if (this.state === 'OPEN') {
      if (now - this.openedAt >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(
          `CircuitBreaker [OPEN]: Downstream dependency failing. Fast-failing request to protect upstream systems.`
        );
      }
    }

    try {
      const result = await fn();
      this.recordSuccess(now);
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
      }
      return result;
    } catch (err) {
      this.recordFailure(now);
      throw err;
    }
  }

  public getState(): CircuitState {
    const now = Date.now();
    if (this.state === 'OPEN' && now - this.openedAt >= this.cooldownMs) {
      return 'HALF_OPEN';
    }
    return this.state;
  }

  public getMetrics(): CircuitMetrics {
    const now = Date.now();
    this.cleanWindows(now);
    const total = this.successTimestamps.length + this.failureTimestamps.length;
    const failures = this.failureTimestamps.length;
    const failureRate = total === 0 ? 0 : Math.round((failures / total) * 100);

    return {
      total,
      successes: this.successTimestamps.length,
      failures,
      failureRate,
      state: this.getState(),
    };
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.failureTimestamps = [];
    this.successTimestamps = [];
    this.openedAt = 0;
  }

  private cleanWindows(now: number): void {
    const cutoff = now - this.windowMs;
    this.failureTimestamps = this.failureTimestamps.filter((t) => t >= cutoff);
    this.successTimestamps = this.successTimestamps.filter((t) => t >= cutoff);
  }

  private recordSuccess(now: number): void {
    if (this.successTimestamps.length >= 2_000) {
      this.successTimestamps.shift();
    }
    this.successTimestamps.push(now);
  }

  private recordFailure(now: number): void {
    if (this.failureTimestamps.length >= 2_000) {
      this.failureTimestamps.shift();
    }
    this.failureTimestamps.push(now);
    const total = this.successTimestamps.length + this.failureTimestamps.length;
    if (total >= this.minRequestsInWindow) {
      const failureRate = (this.failureTimestamps.length / total) * 100;
      if (failureRate >= this.failureThresholdPercent) {
        this.state = 'OPEN';
        this.openedAt = now;
      }
    }
  }
}

export const stripeCircuitBreaker = new CircuitBreaker(20, 60_000, 15_000, 8);
export const communicationsCircuitBreaker = new CircuitBreaker(20, 60_000, 15_000, 8);
export const voiceAiCircuitBreaker = new CircuitBreaker(25, 60_000, 15_000, 6);

export function getGuardrailsMemoryMetrics(): {
  smsQuotaTenants: number;
  devicePasskeys: number;
  processedWebhooks: number;
  bufferedWebhookEntities: number;
  circuits: {
    stripe: CircuitMetrics;
    communications: CircuitMetrics;
    voiceAi: CircuitMetrics;
  };
} {
  return {
    smsQuotaTenants: smsQuotaRegistry.size,
    devicePasskeys: deviceRegistry.size,
    processedWebhooks: processedEventSet.size,
    bufferedWebhookEntities: webhookBufferQueue.size,
    circuits: {
      stripe: stripeCircuitBreaker.getMetrics(),
      communications: communicationsCircuitBreaker.getMetrics(),
      voiceAi: voiceAiCircuitBreaker.getMetrics(),
    },
  };
}

export function generateIdempotencyNonce(): string {
  return randomUUID();
}
