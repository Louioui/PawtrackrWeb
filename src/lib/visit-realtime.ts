// Realtime is only a "something changed" signal for the staff calendar. Rows
// are never taken from the socket payload: the calendar refetches through
// GET /api/reservations, which stays the single token-verified, RLS-backed
// read path. Supabase Realtime also applies the visits SELECT policy to every
// event, so another salon's changes are not delivered in the first place.

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const VISIT_REFRESH_DEBOUNCE_MS = 400;

export type VisitRealtimeState = 'off' | 'connecting' | 'live' | 'interrupted';

export function visitChannelName(businessId: unknown): string | null {
  return typeof businessId === 'string' && uuid.test(businessId) ? `room-visits-${businessId.toLowerCase()}` : null;
}

export function visitChannelFilter(businessId: unknown): string | null {
  return typeof businessId === 'string' && uuid.test(businessId) ? `business_id=eq.${businessId.toLowerCase()}` : null;
}

type ChangePayload = { new?: unknown; old?: unknown };

const tenantOf = (row: unknown): string | null => {
  if (!row || typeof row !== 'object') return null;
  const value = (row as { business_id?: unknown }).business_id;
  return typeof value === 'string' ? value.toLowerCase() : null;
};

// A row that names a different salon is ignored. A row with no tenant (a
// DELETE carries only the primary key) still triggers a refetch, because the
// refetch itself is tenant-scoped and cannot leak anything.
export function visitChangeConcernsTenant(payload: unknown, businessId: string): boolean {
  if (!uuid.test(businessId) || !payload || typeof payload !== 'object') return false;
  const { new: next, old: previous } = payload as ChangePayload;
  const tenants = [tenantOf(next), tenantOf(previous)].filter((value): value is string => value !== null);
  return tenants.length === 0 || tenants.includes(businessId.toLowerCase());
}

export function visitRealtimeStateFrom(status: string): VisitRealtimeState {
  if (status === 'SUBSCRIBED') return 'live';
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') return 'interrupted';
  return 'connecting';
}
