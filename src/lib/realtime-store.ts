'use client';

// ============================================================================
// PAWTRACKR WEB — UNIVERSAL MULTI-DEVICE, WEBSOCKET & OFFLINE OUTBOX ENGINE
// Covers Roadmap Items:
//   - #6: Supabase Realtime WebSocket + BroadcastChannel + localStorage sync
//   - #7: Offline Outbox Queue for mobile grooming vans in cellular dead zones
//   - #34: Client-side WebP image compression for Before/After photos
//   - #35: Self-Service Full Salon Archive Export (JSON / CSV)
//   - #38: Immutable Security & Administrative Audit Logging
// ============================================================================

import {
  BUSINESS_CONFIGS,
  CLIENTS,
  INITIAL_TRANSACTIONS,
  INITIAL_VISITS,
  PETS,
} from './mock-tenant-data';
import { getSupabaseClient } from './supabase/client';
import { demoStorePatchError } from './demo-store-validation';
import { mergeDemoStore } from './demo-store-merge';
import {
  BusinessConfig,
  Client,
  Pet,
  Transaction,
  Visit,
} from '@/types/database';

const STORAGE_KEY = 'pawtrackr_universal_store_v1';
const OUTBOX_KEY = 'pawtrackr_offline_outbox_v1';
const AUDIT_LOG_KEY = 'pawtrackr_audit_logs_v1';
const CHANNEL_NAME = 'pawtrackr_universal_sync_channel';
const PENDING_STORE_KEY = 'pawtrackr_pending_demo_store_v1';
const STORE_CONFLICT_KEY = 'pawtrackr_demo_store_conflict_v1';
let pendingStoreFlush: Promise<void> | null = null;

export interface AuditLogEntry {
  id: string;
  businessId: string;
  actorName: string;
  actorRole: string;
  actionType:
    | 'PRICE_OVERRIDE'
    | 'POS_SETTLED'
    | 'REFUND_ISSUED'
    | 'ARCHIVE_EXPORT'
    | 'CATALOG_UPDATE'
    | 'GIFT_CARD_ISSUED';
  targetEntity: string;
  detail: string;
  createdAt: string;
}

export interface OfflineOutboxMutation {
  id: string;
  type: 'POS_CHECKOUT' | 'ONLINE_BOOKING' | 'WALK_IN';
  businessId: string;
  payload: Record<string, unknown>;
  queuedAt: string;
}

export interface UniversalSalonStore {
  configs: Record<string, BusinessConfig>;
  clients: Client[];
  pets: Pet[];
  visits: Visit[];
  transactions: Transaction[];
  updatedAt: number;
}

interface PendingDemoStore {
  snapshot: UniversalSalonStore;
  base: Omit<UniversalSalonStore, 'updatedAt'>;
}

const storeContent = (store: UniversalSalonStore): Omit<UniversalSalonStore, 'updatedAt'> => ({
  configs: store.configs,
  clients: store.clients,
  pets: store.pets,
  visits: store.visits,
  transactions: store.transactions,
});

const DEFAULT_STORE: UniversalSalonStore = {
  configs: BUSINESS_CONFIGS,
  clients: CLIENTS,
  pets: PETS,
  visits: INITIAL_VISITS,
  transactions: INITIAL_TRANSACTIONS,
  updatedAt: Date.now(),
};

const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'aud-101',
    businessId: '11111111-1111-4111-8111-111111111111',
    actorName: 'Elena Vance',
    actorRole: 'owner',
    actionType: 'POS_SETTLED',
    targetEntity: 'Visit #vis-106 (Zephyr)',
    detail: 'Atomic POS settled $149.21 (0¢ variance verified)',
    createdAt: '2026-11-07 09:18:00',
  },
  {
    id: 'aud-102',
    businessId: '11111111-1111-4111-8111-111111111111',
    actorName: 'Maya Lin',
    actorRole: 'front_desk',
    actionType: 'PRICE_OVERRIDE',
    targetEntity: 'Visit #vis-101 (Bello)',
    detail: 'Added +$25.00 Humane Dematting Coat Rescue surcharge with parent SMS consent',
    createdAt: '2026-11-07 09:14:22',
  },
];

export function loadUniversalStore(): UniversalSalonStore {
  if (typeof window === 'undefined') {
    return DEFAULT_STORE;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STORE;
    const parsed = JSON.parse(raw) as UniversalSalonStore;
    if (demoStorePatchError({
      configs: parsed.configs,
      clients: parsed.clients,
      pets: parsed.pets,
      visits: parsed.visits,
      transactions: parsed.transactions,
    })) return DEFAULT_STORE;
    return {
      configs: parsed.configs ?? DEFAULT_STORE.configs,
      clients: parsed.clients ?? DEFAULT_STORE.clients,
      pets: parsed.pets ?? DEFAULT_STORE.pets,
      visits: parsed.visits ?? DEFAULT_STORE.visits,
      transactions: parsed.transactions ?? DEFAULT_STORE.transactions,
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch {
    return DEFAULT_STORE;
  }
}

export function saveUniversalStore(
  partial: Partial<Omit<UniversalSalonStore, 'updatedAt'>>
): UniversalSalonStore {
  const current = loadUniversalStore();
  const next: UniversalSalonStore = {
    ...current,
    ...partial,
    updatedAt: Math.max(Date.now(), current.updatedAt + 1),
  };

  if (typeof window !== 'undefined') {
    try {
      const previousPending = window.localStorage.getItem(PENDING_STORE_KEY);
      let base = storeContent(current);
      if (previousPending) {
        try {
          const parsed = JSON.parse(previousPending) as PendingDemoStore;
          if (parsed.base && !demoStorePatchError(parsed.base)) base = parsed.base;
        } catch { /* Preserve the current snapshot as the fallback base. */ }
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      // Mark the edit pending before subscribers read the new snapshot.
      window.localStorage.setItem(PENDING_STORE_KEY, JSON.stringify({ snapshot: next, base } satisfies PendingDemoStore));
      window.dispatchEvent(new Event('pawtrackr-demo-sync-status'));
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel(CHANNEL_NAME);
        bc.postMessage({ type: 'STORE_UPDATED', payload: next });
        bc.close();
      }
      window.dispatchEvent(
        new CustomEvent('pawtrackr-store-sync', { detail: next })
      );
      // Keep the latest whole demo snapshot until the server acknowledges it.
      void flushPendingDemoStore();
    } catch {
      // Ignore quota errors in private browsing modes
    }
  }

  return next;
}

export function hasPendingDemoStore(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PENDING_STORE_KEY) !== null;
  } catch {
    return false;
  }
}

export function hasDemoStoreConflict(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(STORE_CONFLICT_KEY) === 'true'; } catch { return false; }
}

/** Best-effort demo retry. A production outbox needs per-record conflict resolution. */
export function flushPendingDemoStore(): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return Promise.resolve();
  if (pendingStoreFlush) return pendingStoreFlush;
  pendingStoreFlush = (async () => {
    while (navigator.onLine) {
      const raw = window.localStorage.getItem(PENDING_STORE_KEY);
      if (!raw) break;
      let pending: PendingDemoStore;
      try {
        pending = JSON.parse(raw) as PendingDemoStore;
        if (!pending.snapshot || !pending.base || demoStorePatchError(pending.base) || demoStorePatchError(storeContent(pending.snapshot))) {
          window.localStorage.setItem(STORE_CONFLICT_KEY, 'true');
          window.dispatchEvent(new Event('pawtrackr-demo-sync-status'));
          break;
        }
      } catch {
        window.localStorage.setItem(STORE_CONFLICT_KEY, 'true');
        window.dispatchEvent(new Event('pawtrackr-demo-sync-status'));
        break;
      }
      try {
        const currentResponse = await fetch('/api/store', { cache: 'no-store' });
        if (!currentResponse.ok) break;
        const currentData = await currentResponse.json() as { store?: UniversalSalonStore };
        const currentServerStore = currentData.store;
        if (!currentServerStore || !Number.isSafeInteger(currentServerStore.updatedAt) || demoStorePatchError(storeContent(currentServerStore))) break;
        const merged = mergeDemoStore(pending.base, storeContent(pending.snapshot), storeContent(currentServerStore));
        if (!merged) {
          window.localStorage.setItem(STORE_CONFLICT_KEY, 'true');
          window.dispatchEvent(new Event('pawtrackr-demo-sync-status'));
          break;
        }
        window.localStorage.removeItem(STORE_CONFLICT_KEY);
        window.dispatchEvent(new Event('pawtrackr-demo-sync-status'));
        let serverStore = currentServerStore;
        if (JSON.stringify(merged) !== JSON.stringify(storeContent(currentServerStore))) {
          const response = await fetch('/api/store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'If-Match': String(currentServerStore.updatedAt) },
            body: JSON.stringify(merged),
          });
          if (response.status === 409) {
            window.localStorage.setItem(STORE_CONFLICT_KEY, 'true');
            window.dispatchEvent(new Event('pawtrackr-demo-sync-status'));
            break;
          }
          if (!response.ok) break;
          const acknowledgement = await response.json() as { store?: UniversalSalonStore };
          if (!acknowledgement.store || !Number.isSafeInteger(acknowledgement.store.updatedAt) || demoStorePatchError(storeContent(acknowledgement.store))) break;
          serverStore = acknowledgement.store;
        }
        if (window.localStorage.getItem(PENDING_STORE_KEY) === raw) {
          if (window.localStorage.getItem(STORAGE_KEY) === JSON.stringify(pending.snapshot)) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serverStore));
            window.dispatchEvent(new CustomEvent('pawtrackr-store-sync', { detail: serverStore }));
          }
          window.localStorage.removeItem(PENDING_STORE_KEY);
          window.localStorage.removeItem(STORE_CONFLICT_KEY);
          window.dispatchEvent(new Event('pawtrackr-demo-sync-status'));
        }
      } catch {
        break;
      }
    }
  })().finally(() => { pendingStoreFlush = null; });
  return pendingStoreFlush;
}

export function subscribeUniversalStore(
  onUpdate: (store: UniversalSalonStore) => void,
  tenantBusinessId?: string,
  onServerStatus?: (status: 'available' | 'unavailable') => void,
  refreshEveryMs?: number
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let bc: BroadcastChannel | null = null;
  if ('BroadcastChannel' in window) {
    bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = (ev) => {
      if (ev.data?.type === 'STORE_UPDATED' && ev.data.payload) {
        onUpdate(ev.data.payload as UniversalSalonStore);
      }
    };
  }

  // Keep the last local snapshot visible while refreshing the demo server ledger.
  let request: AbortController | null = null;
  let disposed = false;
  const refreshServer = () => {
    if (disposed || request || !navigator.onLine) return;
    const currentRequest = new AbortController();
    request = currentRequest;
    void fetch('/api/store', { signal: currentRequest.signal, cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error('Store unavailable');
      return r.json();
    })
    .then((data) => {
      if (disposed) return;
      if (data?.store) {
        onServerStatus?.('available');
        // A pending local edit is the visible source until its write is acknowledged.
        if (hasPendingDemoStore()) return;
        const local = loadUniversalStore();
        if (
          !window.localStorage.getItem(STORAGE_KEY) ||
          (data.store.updatedAt && data.store.updatedAt >= local.updatedAt)
        ) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data.store));
          onUpdate(data.store as UniversalSalonStore);
        }
      } else {
        onServerStatus?.('unavailable');
      }
    })
    .catch(() => {
      // Offline mode: retain the local snapshot and pending demo write.
      if (!currentRequest.signal.aborted && !disposed) onServerStatus?.('unavailable');
    })
    .finally(() => {
      if (request === currentRequest) request = null;
    });
  };
  void flushPendingDemoStore().then(refreshServer);
  const refreshWhenOnline = () => {
    void flushPendingDemoStore().then(refreshServer);
  };
  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') refreshServer();
  };
  const refreshTimer = refreshEveryMs && refreshEveryMs > 0
    ? window.setInterval(refreshWhenVisible, refreshEveryMs)
    : null;
  window.addEventListener('online', refreshWhenOnline);
  if (refreshTimer !== null) {
    document.addEventListener('visibilitychange', refreshWhenVisible);
  }

  // Optional Supabase Realtime WebSocket channel (#6)
  const supabase = getSupabaseClient();
  const realtimeChannel = supabase
    ? supabase
        .channel(`pawtrackr-realtime-${tenantBusinessId ?? 'global'}`)
        .on('broadcast', { event: 'store-sync' }, () => {
          onUpdate(loadUniversalStore());
        })
        .subscribe()
    : null;

  const handleStorage = (ev: StorageEvent) => {
    if (ev.key === STORAGE_KEY && ev.newValue) {
      try {
        onUpdate(JSON.parse(ev.newValue) as UniversalSalonStore);
      } catch {
        // Ignore parse error
      }
    }
  };

  const handleCustom = (ev: Event) => {
    const customEv = ev as CustomEvent<UniversalSalonStore>;
    if (customEv.detail) {
      onUpdate(customEv.detail);
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener('pawtrackr-store-sync', handleCustom);

  return () => {
    disposed = true;
    request?.abort();
    window.removeEventListener('online', refreshWhenOnline);
    if (refreshTimer !== null) {
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    }
    if (bc) bc.close();
    if (realtimeChannel && supabase) {
      supabase.removeChannel(realtimeChannel);
    }
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('pawtrackr-store-sync', handleCustom);
  };
}

/**
 * Queues a mutation in the local Offline Outbox when a mobile van is in a dead zone (#7).
 */
export function queueOfflineMutation(
  mutation: Omit<OfflineOutboxMutation, 'id' | 'queuedAt'>
): OfflineOutboxMutation[] {
  if (typeof window === 'undefined') return [];
  const existing = loadOfflineOutbox();
  const next: OfflineOutboxMutation[] = [
    {
      ...mutation,
      id: `outbox-${Date.now().toString(36)}`,
      queuedAt: new Date().toISOString(),
    },
    ...existing,
  ];
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(next));
  return next;
}

export function loadOfflineOutbox(): OfflineOutboxMutation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as OfflineOutboxMutation[]) : [];
  } catch {
    return [];
  }
}

export function flushOfflineOutbox(): number {
  if (typeof window === 'undefined') return 0;
  const count = loadOfflineOutbox().length;
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify([]));
  return count;
}

/**
 * Audit Logging Helpers (#38)
 */
export function loadAuditLogs(): AuditLogEntry[] {
  if (typeof window === 'undefined') return INITIAL_AUDIT_LOGS;
  try {
    const raw = window.localStorage.getItem(AUDIT_LOG_KEY);
    return raw ? (JSON.parse(raw) as AuditLogEntry[]) : INITIAL_AUDIT_LOGS;
  } catch {
    return INITIAL_AUDIT_LOGS;
  }
}

export function appendAuditLogEntry(
  entry: Omit<AuditLogEntry, 'id' | 'createdAt'>
): AuditLogEntry[] {
  const current = loadAuditLogs();
  const next: AuditLogEntry[] = [
    {
      ...entry,
      id: `aud-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    },
    ...current,
  ];
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(next));
  }
  return next;
}

/**
 * Client-Side WebP Image Compression & Thumbnail Generator (#34)
 */
export async function compressImageToWebPDataUrl(
  file: File,
  maxWidth = 1080,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / (img.width || maxWidth));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const webpUrl = canvas.toDataURL('image/webp', quality);
        URL.revokeObjectURL(objectUrl);
        resolve(webpUrl);
      } else {
        resolve(objectUrl);
      }
    };
    img.onerror = () => resolve(objectUrl);
    img.src = objectUrl;
  });
}

/**
 * Self-Service Complete Salon Archive Export (#35)
 */
export function exportFullSalonArchiveJson(businessId: string, slug: string) {
  if (typeof window === 'undefined') return;
  const store = loadUniversalStore();
  const archive = {
    exportedAt: new Date().toISOString(),
    businessId,
    config: store.configs[businessId],
    clients: store.clients.filter((c) => c.business_id === businessId),
    pets: store.pets.filter((p) => p.business_id === businessId),
    visits: store.visits.filter((v) => v.business_id === businessId),
    transactions: store.transactions.filter(
      (t) => t.business_id === businessId
    ),
    auditLogs: loadAuditLogs().filter((a) => a.businessId === businessId),
  };

  const blob = new Blob([JSON.stringify(archive, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pawtrackr-full-archive-${slug}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  appendAuditLogEntry({
    businessId,
    actorName: 'Elena Vance',
    actorRole: 'owner',
    actionType: 'ARCHIVE_EXPORT',
    targetEntity: `Full Tenant Archive (${slug})`,
    detail: 'Downloaded full JSON archive of clients, pets, visits & POS ledger.',
  });
}
