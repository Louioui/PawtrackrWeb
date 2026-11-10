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
  BUSINESSES,
  BUSINESS_CONFIGS,
  CLIENTS,
  INITIAL_TRANSACTIONS,
  INITIAL_VISITS,
  PETS,
  STAFF_MEMBERS,
} from './mock-tenant-data';
import { getSupabaseClient } from './supabase/client';
import { demoStorePatchError } from './demo-store-validation';
import { mergeDemoStore } from './demo-store-merge';
import {
  BehaviorTag,
  Business,
  BusinessConfig,
  Client,
  Pet,
  ServiceAddon,
  ServicePackage,
  StaffMember,
  SubscriptionPlan,
  Transaction,
  Visit,
} from '@/types/database';

const STORAGE_KEY = 'pawtrackr_universal_store_v1';
const OUTBOX_KEY = 'pawtrackr_offline_outbox_v1';
const AUDIT_LOG_KEY = 'pawtrackr_audit_logs_v1';
const SESSION_KEY = 'pawtrackr_active_session_v1';
const CHANNEL_NAME = 'pawtrackr_universal_sync_channel';
const PENDING_STORE_KEY = 'pawtrackr_pending_demo_store_v1';
const STORE_CONFLICT_KEY = 'pawtrackr_demo_store_conflict_v1';
let pendingStoreFlush: Promise<void> | null = null;

export interface DemoUserSession {
  role: 'owner' | 'staff' | 'client';
  name: string;
  email: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  staffId?: string;
  staffSpecialty?: string;
  clientId?: string;
  petId?: string;
  signedInAt: string;
}

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

// ============================================================================
// DEMO USER SESSION & DYNAMIC SALON / CLIENT PROVISIONING HELPERS
// ============================================================================

export function loadDemoSession(): DemoUserSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoUserSession;
    if (!parsed || typeof parsed.role !== 'string' || typeof parsed.businessId !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDemoSession(
  session: Omit<DemoUserSession, 'signedInAt'>
): DemoUserSession {
  const next: DemoUserSession = {
    ...session,
    signedInAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('pawtrackr-session-sync', { detail: next }));
    } catch {
      // Ignore storage quota errors
    }
  }
  return next;
}

export function clearDemoSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new CustomEvent('pawtrackr-session-sync', { detail: null }));
  } catch {
    // Ignore storage errors
  }
}

export function resetUniversalStoreToDefault(): UniversalSalonStore {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(PENDING_STORE_KEY);
      window.localStorage.removeItem(STORE_CONFLICT_KEY);
      window.localStorage.removeItem(SESSION_KEY);
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel(CHANNEL_NAME);
        bc.postMessage({ type: 'STORE_UPDATED', payload: DEFAULT_STORE });
        bc.close();
      }
      window.dispatchEvent(
        new CustomEvent('pawtrackr-store-sync', { detail: DEFAULT_STORE })
      );
      window.dispatchEvent(
        new CustomEvent('pawtrackr-session-sync', { detail: null })
      );
      window.dispatchEvent(new Event('pawtrackr-demo-sync-status'));
    } catch {
      // Ignore storage errors
    }
  }
  return DEFAULT_STORE;
}

export function subscribeDemoSession(
  onUpdate: (session: DemoUserSession | null) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleCustom = (ev: Event) => {
    const customEv = ev as CustomEvent<DemoUserSession | null>;
    onUpdate(customEv.detail ?? loadDemoSession());
  };
  const handleStorage = (ev: StorageEvent) => {
    if (ev.key === SESSION_KEY) {
      onUpdate(loadDemoSession());
    }
  };
  window.addEventListener('pawtrackr-session-sync', handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener('pawtrackr-session-sync', handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}

export function getStoreBusinesses(
  configs: Record<string, BusinessConfig> = loadUniversalStore().configs
): Business[] {
  const seenIds = new Set(BUSINESSES.map((b) => b.id));
  const seenSlugs = new Set(BUSINESSES.map((b) => b.slug));
  const custom: Business[] = [];

  for (const config of Object.values(configs)) {
    const profile = config?.custom_settings?.business_profile;
    if (
      profile &&
      typeof profile.id === 'string' &&
      typeof profile.name === 'string' &&
      typeof profile.slug === 'string' &&
      !seenIds.has(profile.id) &&
      !seenSlugs.has(profile.slug)
    ) {
      seenIds.add(profile.id);
      seenSlugs.add(profile.slug);
      custom.push(profile);
    }
  }

  return [...BUSINESSES, ...custom];
}

export function getStoreStaff(
  configs: Record<string, BusinessConfig>,
  businessId: string
): StaffMember[] {
  const customRoster = configs[businessId]?.custom_settings?.staff_roster;
  if (Array.isArray(customRoster) && customRoster.length > 0) {
    return customRoster;
  }
  return STAFF_MEMBERS.filter((s) => s.business_id === businessId);
}

export function resolveStoreTenantBySlug(
  store: UniversalSalonStore,
  slug: string
) {
  const businesses = getStoreBusinesses(store.configs);
  const business = businesses.find((b) => b.slug === slug) ?? BUSINESSES[0];
  const config = store.configs[business.id] ?? BUSINESS_CONFIGS[business.id] ?? BUSINESS_CONFIGS[BUSINESSES[0].id];
  const staff = getStoreStaff(store.configs, business.id);
  const clients = store.clients.filter((c) => c.business_id === business.id);
  const pets = store.pets.filter((p) => p.business_id === business.id);
  const visits = store.visits.filter((v) => v.business_id === business.id);
  const transactions = store.transactions.filter((t) => t.business_id === business.id);

  return {
    business,
    config,
    staff,
    clients,
    pets,
    visits,
    transactions,
  };
}

export interface ProvisionDemoSalonInput {
  salonName: string;
  slug: string;
  tagline: string;
  address: string;
  cityState: string;
  phone: string;
  ownerName: string;
  ownerEmail: string;
  ownerSpecialty: string;
  secondGroomerName?: string;
  secondGroomerSpecialty?: string;
  plan?: SubscriptionPlan;
  taxRate: number;
  loyaltyPointsPerDollar: number;
  openTime: string;
  closeTime: string;
  packages: ServicePackage[];
  addons: ServiceAddon[];
}

export function provisionDemoSalon(input: ProvisionDemoSalonInput) {
  const store = loadUniversalStore();
  const cleanSlug = input.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `salon-${Date.now().toString(36)}`;

  const existingBiz = getStoreBusinesses(store.configs).find(
    (b) => b.slug === cleanSlug
  );
  const businessId =
    existingBiz && !BUSINESSES.some((b) => b.id === existingBiz.id)
      ? existingBiz.id
      : `biz-${Date.now().toString(36)}`;

  const nowIso = new Date().toISOString();
  const business: Business = {
    id: businessId,
    name: input.salonName.trim(),
    slug: cleanSlug,
    owner_email: input.ownerEmail.trim(),
    phone: input.phone.trim() || '(415) 555-0140',
    city_state: input.cityState.trim() || 'San Francisco, CA',
    subscription_plan: input.plan ?? 'salon_pro',
    subscription_status: 'active',
    created_at: nowIso,
  };

  const ownerStaffId = `st-own-${Date.now().toString(36)}`;
  const staffRoster: StaffMember[] = [
    {
      id: ownerStaffId,
      business_id: businessId,
      name: input.ownerName.trim() || 'Salon Owner',
      role: 'owner',
      specialty: input.ownerSpecialty.trim() || 'Founder & Master Groomer',
      color_hex: '#8B95FF',
      active_dogs_count: 1,
    },
  ];

  if (input.secondGroomerName?.trim()) {
    staffRoster.push({
      id: `st-grm-${Date.now().toString(36)}`,
      business_id: businessId,
      name: input.secondGroomerName.trim(),
      role: 'groomer',
      specialty:
        input.secondGroomerSpecialty?.trim() || 'Breed Styling & Hydro-Bath Specialist',
      color_hex: '#10B981',
      active_dogs_count: 0,
    });
  }

  const safeTaxRate = Math.min(30, Math.max(0, Number(input.taxRate) || 8.5));
  const safeLoyalty = Math.min(
    10,
    Math.max(1, Math.round(Number(input.loyaltyPointsPerDollar) || 2))
  );

  const config: BusinessConfig = {
    business_id: businessId,
    tax_rate: safeTaxRate,
    currency: 'USD',
    loyalty_points_per_dollar: safeLoyalty,
    custom_settings: {
      tagline:
        input.tagline.trim() ||
        'Modern Coat Styling, Low-Stress Hydro-Bath & Personalized Pet Care',
      address:
        input.address.trim() || `${business.city_state}`,
      rating: 5.0,
      reviewCount: 12,
      operating_hours: {
        open: input.openTime || '08:30',
        close: input.closeTime || '18:00',
      },
      packages:
        input.packages.length > 0
          ? input.packages
          : [
              {
                id: `pkg-full-${Date.now().toString(36)}`,
                name: 'Signature Full Breed Groom & Spa Bath',
                description:
                  'Warm hydro-massage bath, fluff dry, full breed haircut, ear cleaning, sanitary trim, and nail buffing.',
                price: 125,
                durationMinutes: 90,
                badge: 'Most Popular',
              },
              {
                id: `pkg-bath-${Date.now().toString(36)}`,
                name: 'Luxury Bath, Deshed & Tidy Trim',
                description:
                  'Deep coat conditioning bath, high-velocity undercoat blowout, face/paw/sanitary tidy, and blueberry facial.',
                price: 85,
                durationMinutes: 60,
              },
            ],
      addons:
        input.addons.length > 0
          ? input.addons
          : [
              {
                id: `add-facial-${Date.now().toString(36)}`,
                name: 'Organic Blueberry Tear-Stain Facial',
                price: 18,
                category: 'spa',
              },
              {
                id: `add-demat-${Date.now().toString(36)}`,
                name: 'Gentle Coat Detangle & Conditioning (+20m)',
                price: 25,
                category: 'coat_rescue',
              },
            ],
      business_profile: business,
      staff_roster: staffRoster,
    },
  };

  // Seed one welcome client, pet, and upcoming appointment so the new salon's
  // Command Center schedule & POS are immediately testable out of the box!
  const sampleClientId = `cl-welcome-${Date.now().toString(36)}`;
  const samplePetId = `pet-welcome-${Date.now().toString(36)}`;
  const sampleVisitId = `vis-welcome-${Date.now().toString(36)}`;
  const firstPkg = config.custom_settings.packages[0];
  const todayStr = nowIso.slice(0, 10);

  const welcomeClient: Client = {
    id: sampleClientId,
    business_id: businessId,
    name: 'Clara & Sam Bennett',
    phone: '(415) 602-8831',
    email: 'clara.bennett@icloud.com',
    address: business.city_state,
    loyalty_points: 180,
    lifetime_spend: firstPkg.price,
    created_at: nowIso,
  };

  const welcomePet: Pet = {
    id: samplePetId,
    business_id: businessId,
    client_id: sampleClientId,
    name: 'Sunny',
    species: 'Canine',
    breed: 'Mini Goldendoodle',
    weight_lbs: 24.0,
    age_years: 2,
    coat_type: 'Soft Wavy Fleece',
    rabies_verified: true,
    behavior_notes: 'First appointment at the studio! Friendly and loves warm bath water.',
    behavior_tags: ['extra_care'],
    avatar_url:
      'https://images.unsplash.com/photo-1591769225440-811ad7d6eab3?auto=format&fit=crop&w=600&q=80',
    weight_history: [{ date: todayStr, weight_lbs: 24.0 }],
    photo_gallery: [],
  };

  const welcomeVisit: Visit = {
    id: sampleVisitId,
    business_id: businessId,
    client_id: sampleClientId,
    pet_id: samplePetId,
    staff_id: ownerStaffId,
    status: 'booked',
    booking_source: 'online',
    package_id: firstPkg.id,
    package_name: firstPkg.name,
    base_price: firstPkg.price,
    addon_ids: [],
    total_amount: firstPkg.price,
    scheduled_time: `${todayStr}T10:30:00`,
    time_label: '10:30 AM',
    duration_minutes: firstPkg.durationMinutes,
    bay_or_van: 'Styling Table #1',
    report_card_notes: 'Confirmed online appointment — ready for check-in.',
    weight_logged_lbs: 24.0,
    created_at: nowIso,
  };

  saveUniversalStore({
    configs: {
      ...store.configs,
      [businessId]: config,
    },
    clients: [welcomeClient, ...store.clients],
    pets: [welcomePet, ...store.pets],
    visits: [welcomeVisit, ...store.visits],
  });

  const session = saveDemoSession({
    role: 'owner',
    name: staffRoster[0].name,
    email: business.owner_email,
    businessId: business.id,
    businessSlug: business.slug,
    businessName: business.name,
    staffId: ownerStaffId,
    staffSpecialty: staffRoster[0].specialty,
  });

  return { business, config, staffRoster, session };
}

export interface ProvisionDemoClientInput {
  businessId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  petName: string;
  petBreed: string;
  petWeightLbs: number;
  petAgeYears: number;
  petCoatType: string;
  behaviorTags: BehaviorTag[];
  behaviorNotes: string;
}

export function provisionDemoClientAndPet(input: ProvisionDemoClientInput) {
  const store = loadUniversalStore();
  const businesses = getStoreBusinesses(store.configs);
  const business =
    businesses.find((b) => b.id === input.businessId) ?? BUSINESSES[0];

  const nowIso = new Date().toISOString();
  const todayStr = nowIso.slice(0, 10);
  const clientId = `cl-user-${Date.now().toString(36)}`;
  const petId = `pet-user-${Date.now().toString(36)}`;
  const safeWeight = Math.min(300, Math.max(1, Number(input.petWeightLbs) || 22));
  const safeAge = Math.min(30, Math.max(0, Math.round(Number(input.petAgeYears) || 2)));

  const client: Client = {
    id: clientId,
    business_id: business.id,
    name: input.clientName.trim(),
    phone: input.clientPhone.trim() || '(415) 555-0188',
    email: input.clientEmail.trim(),
    address: input.clientAddress.trim() || business.city_state,
    loyalty_points: 100, // Welcome bonus points
    lifetime_spend: 0,
    created_at: nowIso,
  };

  const pet: Pet = {
    id: petId,
    business_id: business.id,
    client_id: clientId,
    name: input.petName.trim(),
    species: 'Canine',
    breed: input.petBreed.trim() || 'Mixed Breed',
    weight_lbs: safeWeight,
    age_years: safeAge,
    coat_type: input.petCoatType.trim() || 'Combination Coat',
    rabies_verified: true,
    behavior_notes:
      input.behaviorNotes.trim() ||
      'Pet parent profile created online. Prefers gentle introduction at check-in.',
    behavior_tags: input.behaviorTags,
    avatar_url:
      'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=600&q=80',
    weight_history: [{ date: todayStr, weight_lbs: safeWeight }],
    photo_gallery: [],
  };

  saveUniversalStore({
    clients: [client, ...store.clients],
    pets: [pet, ...store.pets],
  });

  const session = saveDemoSession({
    role: 'client',
    name: client.name,
    email: client.email,
    businessId: business.id,
    businessSlug: business.slug,
    businessName: business.name,
    clientId: client.id,
    petId: pet.id,
  });

  return { client, pet, business, session };
}
