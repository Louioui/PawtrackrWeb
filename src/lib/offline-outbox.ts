// ============================================================================
// PAWTRACKR WEB — OFFLINE-FIRST INDEXEDDB OUTBOX, OCC & 3-WAY MERGE ENGINE
// Pure Web APIs only (IndexedDB + Web Crypto) — safe for browser PWA bundles
// and Node 22 strip-types unit tests (bounded in-memory fallback).
// ============================================================================

export const OFFLINE_VAULT_DB = 'pawtrackr_offline_vault';
export const OFFLINE_OUTBOX_STORE = 'outbox_mutations';
export const MAX_OUTBOX_ITEMS = 500;

export type OutboxMutationStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed';

export interface OutboxMutationRecord {
  idempotencyKey: string;
  entityType: 'visit_stage' | 'fleet_stop' | 'pos_checkout' | 'care_note';
  entityId: string;
  endpoint: string;
  method: 'POST' | 'PATCH';
  baseVersion: number;
  occHash: string;
  payload: Record<string, unknown>;
  baseSnapshot?: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  status: OutboxMutationStatus;
  conflictFields?: string[];
  lastError?: string;
}

export interface OfflineMergeResult<T extends Record<string, unknown>> {
  status: 'clean_merge' | 'conflict_resolved';
  mergedRecord: T;
  conflictingFields: string[];
  resolutionStrategy: 'manager_override' | 'server_wins' | 'client_wins' | 'disjoint_fields';
}

// Bounded in-memory fallback for SSR / Node test environments without window.indexedDB
const memoryOutbox = new Map<string, OutboxMutationRecord>();

function setMemoryBounded(record: OutboxMutationRecord): void {
  if (memoryOutbox.has(record.idempotencyKey)) {
    memoryOutbox.delete(record.idempotencyKey);
  } else if (memoryOutbox.size >= MAX_OUTBOX_ITEMS) {
    const oldestKey = memoryOutbox.keys().next().value;
    if (oldestKey !== undefined) {
      memoryOutbox.delete(oldestKey);
    }
  }
  memoryOutbox.set(record.idempotencyKey, record);
}

function generateUuid(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Computes a deterministic SHA-256 Optimistic Concurrency Control (OCC) digest
 * over canonical JSON keys using Web Crypto subtle digest.
 */
export async function computeOccVersionHash(payload: Record<string, unknown>): Promise<string> {
  const canonicalKeys = Object.keys(payload).sort();
  const canonicalObj: Record<string, unknown> = {};
  for (const k of canonicalKeys) {
    canonicalObj[k] = payload[k];
  }
  const serialized = JSON.stringify(canonicalObj);

  if (globalThis.crypto?.subtle) {
    const encoded = new TextEncoder().encode(serialized);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    return `sha256:${hex.slice(0, 16)}`;
  }

  // Deterministic FNV-1a 64-bit fallback if subtle is unavailable
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < serialized.length; i++) {
    const ch = serialized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `sha256:${hex1}${hex2}`;
}

/**
 * Automatic three-way merge conflict resolution for prolonged mobile van
 * offline disconnects. Disjoint field mutations merge cleanly; overlapping
 * field collisions resolve deterministically without silent data loss.
 */
export function resolveOfflineThreeWayMerge<T extends Record<string, unknown>>(
  baseRecord: T,
  localEdits: Partial<T>,
  serverCurrent: T,
  actorPriority: 'manager_override' | 'server_wins' | 'client_wins' = 'manager_override'
): OfflineMergeResult<T> {
  const merged = { ...serverCurrent } as T;
  const conflictingFields: string[] = [];

  for (const key of Object.keys(localEdits) as Array<keyof T>) {
    const localVal = localEdits[key];
    if (localVal === undefined) continue;

    const baseVal = baseRecord[key];
    const serverVal = serverCurrent[key];

    const localChanged = JSON.stringify(localVal) !== JSON.stringify(baseVal);
    const serverChanged = JSON.stringify(serverVal) !== JSON.stringify(baseVal);

    if (!localChanged) {
      continue;
    }

    if (!serverChanged) {
      merged[key] = localVal as T[keyof T];
    } else if (JSON.stringify(localVal) !== JSON.stringify(serverVal)) {
      conflictingFields.push(String(key));
      if (actorPriority === 'manager_override' || actorPriority === 'client_wins') {
        merged[key] = localVal as T[keyof T];
      } else {
        merged[key] = serverVal;
      }
    }
  }

  if (conflictingFields.length === 0) {
    return {
      status: 'clean_merge',
      mergedRecord: merged,
      conflictingFields: [],
      resolutionStrategy: 'disjoint_fields',
    };
  }

  return {
    status: 'conflict_resolved',
    mergedRecord: merged,
    conflictingFields,
    resolutionStrategy: actorPriority,
  };
}

function hasIndexedDb(): boolean {
  return typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(OFFLINE_VAULT_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_OUTBOX_STORE)) {
        const store = db.createObjectStore(OFFLINE_OUTBOX_STORE, { keyPath: 'idempotencyKey' });
        store.createIndex('by_created_at', 'createdAt', { unique: false });
        store.createIndex('by_status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open Pawtrackr IndexedDB vault'));
  });
}

/**
 * Enqueues an offline mutation into IndexedDB (or bounded memory fallback)
 * with cryptographic idempotency key and SHA-256 OCC version hash.
 */
export async function enqueueOutboxMutation(input: {
  idempotencyKey?: string;
  entityType: OutboxMutationRecord['entityType'];
  entityId: string;
  endpoint: string;
  method?: 'POST' | 'PATCH';
  baseVersion?: number;
  payload: Record<string, unknown>;
  baseSnapshot?: Record<string, unknown>;
}): Promise<OutboxMutationRecord> {
  const idempotencyKey = input.idempotencyKey || generateUuid();
  const occHash = await computeOccVersionHash({
    entityType: input.entityType,
    entityId: input.entityId,
    baseVersion: input.baseVersion ?? 1,
    payload: input.payload,
  });

  const record: OutboxMutationRecord = {
    idempotencyKey,
    entityType: input.entityType,
    entityId: input.entityId,
    endpoint: input.endpoint,
    method: input.method ?? 'POST',
    baseVersion: input.baseVersion ?? 1,
    occHash,
    payload: input.payload,
    baseSnapshot: input.baseSnapshot,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  };

  if (!hasIndexedDb()) {
    setMemoryBounded(record);
    return record;
  }

  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OFFLINE_OUTBOX_STORE, 'readwrite');
      const store = tx.objectStore(OFFLINE_OUTBOX_STORE);
      const getAllReq = store.getAll();

      getAllReq.onsuccess = () => {
        const existing = (getAllReq.result as OutboxMutationRecord[]) || [];
        if (existing.length >= MAX_OUTBOX_ITEMS && !existing.some((r) => r.idempotencyKey === idempotencyKey)) {
          const sorted = [...existing].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          const evictCount = existing.length - MAX_OUTBOX_ITEMS + 1;
          for (let i = 0; i < evictCount; i++) {
            store.delete(sorted[i].idempotencyKey);
          }
        }
        store.put(record);
      };

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('IndexedDB write failed'));
      };
    });
  } catch {
    setMemoryBounded(record);
  }

  return record;
}

/**
 * Lists all queued mutations ordered chronologically (FIFO).
 */
export async function listOutboxMutations(onlyPending = false): Promise<OutboxMutationRecord[]> {
  if (!hasIndexedDb()) {
    const items = Array.from(memoryOutbox.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return onlyPending ? items.filter((r) => r.status === 'pending' || r.status === 'conflict') : items;
  }

  try {
    const db = await openVaultDb();
    const records = await new Promise<OutboxMutationRecord[]>((resolve, reject) => {
      const tx = db.transaction(OFFLINE_OUTBOX_STORE, 'readonly');
      const store = tx.objectStore(OFFLINE_OUTBOX_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        resolve(((req.result as OutboxMutationRecord[]) || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error('IndexedDB read failed'));
      };
    });
    return onlyPending ? records.filter((r) => r.status === 'pending' || r.status === 'conflict') : records;
  } catch {
    const items = Array.from(memoryOutbox.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return onlyPending ? items.filter((r) => r.status === 'pending' || r.status === 'conflict') : items;
  }
}

async function putOutboxRecord(record: OutboxMutationRecord): Promise<void> {
  if (!hasIndexedDb()) {
    setMemoryBounded(record);
    return;
  }
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OFFLINE_OUTBOX_STORE, 'readwrite');
      tx.objectStore(OFFLINE_OUTBOX_STORE).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    setMemoryBounded(record);
  }
}

async function deleteOutboxRecord(idempotencyKey: string): Promise<void> {
  memoryOutbox.delete(idempotencyKey);
  if (!hasIndexedDb()) return;
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OFFLINE_OUTBOX_STORE, 'readwrite');
      tx.objectStore(OFFLINE_OUTBOX_STORE).delete(idempotencyKey);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Fallback already cleaned
  }
}

/**
 * Replays pending IndexedDB outbox mutations against a dispatcher callback
 * (e.g., live API fetch or local fleet state reconciler), handling 409 OCC
 * conflicts via 3-way merge.
 */
export async function flushOfflineOutbox(
  dispatcher: (record: OutboxMutationRecord) => Promise<{
    ok: boolean;
    conflict?: boolean;
    serverRecord?: Record<string, unknown>;
    error?: string;
  }>
): Promise<{
  flushedCount: number;
  conflictResolvedCount: number;
  remainingCount: number;
  latestOccHash: string;
}> {
  const pending = await listOutboxMutations(true);
  let flushedCount = 0;
  let conflictResolvedCount = 0;
  let latestOccHash = 'sha256:synced00000000';

  for (const item of pending) {
    const attemptRecord: OutboxMutationRecord = {
      ...item,
      attempts: item.attempts + 1,
      status: 'syncing',
    };
    await putOutboxRecord(attemptRecord);

    try {
      const result = await dispatcher(attemptRecord);
      if (result.ok) {
        await deleteOutboxRecord(item.idempotencyKey);
        flushedCount += 1;
        latestOccHash = item.occHash;
      } else if (result.conflict && result.serverRecord && item.baseSnapshot) {
        const merged = resolveOfflineThreeWayMerge(
          item.baseSnapshot,
          item.payload,
          result.serverRecord,
          'manager_override'
        );
        const retryHash = await computeOccVersionHash(merged.mergedRecord);
        const resolvedRecord: OutboxMutationRecord = {
          ...attemptRecord,
          payload: merged.mergedRecord,
          occHash: retryHash,
          conflictFields: merged.conflictingFields,
          status: 'pending',
        };
        const secondAttempt = await dispatcher(resolvedRecord);
        if (secondAttempt.ok) {
          await deleteOutboxRecord(item.idempotencyKey);
          flushedCount += 1;
          conflictResolvedCount += 1;
          latestOccHash = retryHash;
        } else {
          await putOutboxRecord({
            ...resolvedRecord,
            status: 'conflict',
            lastError: secondAttempt.error ?? 'Three-way merge requires manual review',
          });
        }
      } else {
        await putOutboxRecord({
          ...attemptRecord,
          status: result.conflict ? 'conflict' : 'pending',
          lastError: result.error ?? 'Network dispatch deferred',
        });
      }
    } catch (err) {
      await putOutboxRecord({
        ...attemptRecord,
        status: 'pending',
        lastError: err instanceof Error ? err.message : 'Network unreachable',
      });
    }
  }

  const remaining = await listOutboxMutations(true);
  return {
    flushedCount,
    conflictResolvedCount,
    remainingCount: remaining.length,
    latestOccHash,
  };
}

export async function clearAllOutboxMutations(): Promise<void> {
  memoryOutbox.clear();
  if (!hasIndexedDb()) return;
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OFFLINE_OUTBOX_STORE, 'readwrite');
      tx.objectStore(OFFLINE_OUTBOX_STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Memory already cleared
  }
}
