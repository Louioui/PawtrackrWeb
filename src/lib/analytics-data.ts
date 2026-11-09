import type { Transaction, Visit } from '@/types/database';

export type AnalyticsWindow = 7 | 30 | 90;
export type ServerStatus = 'checking' | 'available' | 'unavailable';
export type AnalyticsSnapshotStatus = 'sync_conflict' | 'pending_sync' | 'browser_offline' | 'server_unavailable' | 'checking_server' | 'server_delayed' | 'server_reached';

export function parseAnalyticsSelection(
  search: string,
  businessIds: readonly string[],
  defaultBusinessId: string
): { businessId: string; days: AnalyticsWindow } {
  const params = new URLSearchParams(search);
  const requestedBusiness = params.get('business');
  const requestedDays = Number(params.get('days'));
  return {
    businessId: requestedBusiness && businessIds.includes(requestedBusiness) ? requestedBusiness : defaultBusinessId,
    days: requestedDays === 7 || requestedDays === 30 || requestedDays === 90 ? requestedDays : 30,
  };
}

export function priorWindowEnd(now: Date, days: AnalyticsWindow): Date {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - days);
  return end;
}

export function priorWindowAsOf(now: Date, days: AnalyticsWindow): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export function checkoutTotalChange(current: AnalyticsSummary, previous: AnalyticsSummary): {
  changeCents: number | null;
  changePercent: number | null;
} {
  if (!previous.transactionCount) return { changeCents: null, changePercent: null };
  const changeCents = current.revenueCents - previous.revenueCents;
  return {
    changeCents,
    changePercent: previous.revenueCents > 0
      ? Math.round((changeCents / previous.revenueCents) * 1000) / 10
      : null,
  };
}

export function weeklyCheckoutPacing(businessId: string, transactions: Transaction[], visits: Visit[], targetCents: number, now: Date) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayIndex = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - dayIndex);
  const weekly = summarizeAnalytics(businessId, transactions, visits, 7, today, now);
  const recordedCents = weekly.daily.filter((day) => day.date >= monday.toISOString().slice(0, 10)).reduce((sum, day) => sum + day.revenueCents, 0);
  const expectedCents = Math.round(targetCents * (dayIndex + 1) / 7);
  return { weekStart: monday.toISOString().slice(0, 10), throughDate: today.toISOString().slice(0, 10), recordedCents, expectedCents, targetCents, gapCents: recordedCents - expectedCents };
}

export function averageCheckoutChange(current: AnalyticsSummary, previous: AnalyticsSummary): {
  changeCents: number | null;
  changePercent: number | null;
} {
  if (!current.transactionCount || !previous.transactionCount) {
    return { changeCents: null, changePercent: null };
  }
  const changeCents = current.averageTicketCents - previous.averageTicketCents;
  return {
    changeCents,
    changePercent: previous.averageTicketCents > 0
      ? Math.round((changeCents / previous.averageTicketCents) * 1000) / 10
      : null,
  };
}

export function analyticsSourceStatus(
  online: boolean,
  serverStatus: ServerStatus,
  lastServerResponseAt: number | null,
  now: number,
  pendingSync = false,
  syncConflict = false
): string {
  if (syncConflict) return 'Sync conflict · local edits preserved';
  if (pendingSync) return online ? 'Local edits pending sync' : 'Browser offline · edits pending sync';
  if (!online) return 'Browser offline · local snapshot';
  if (serverStatus === 'unavailable') return 'Server unavailable · local snapshot';
  if (serverStatus === 'checking') return 'Checking server · local snapshot';
  if (lastServerResponseAt === null || now - lastServerResponseAt > 15 * 60_000) {
    return 'Server update delayed · local snapshot';
  }
  return 'Server reached · demo snapshot';
}

export interface AnalyticsSummary {
  revenueCents: number;
  transactionCount: number;
  linkedVisitCount: number;
  averageTicketCents: number;
  addonVisitCount: number;
  addonAttachmentPercent: number | null;
  activeDayCount: number;
  daily: { date: string; revenueCents: number }[];
  packages: { name: string; revenueCents: number; count: number }[];
  recent: Transaction[];
  unmatchedTransactionCount: number;
}

export function analyticsSnapshotStatus(
  online: boolean,
  serverStatus: ServerStatus,
  lastServerResponseAt: number | null,
  now: number,
  pendingSync: boolean,
  syncConflict = false
): AnalyticsSnapshotStatus {
  if (syncConflict) return 'sync_conflict';
  if (pendingSync) return 'pending_sync';
  if (!online) return 'browser_offline';
  if (serverStatus === 'unavailable') return 'server_unavailable';
  if (serverStatus === 'checking') return 'checking_server';
  if (lastServerResponseAt === null || now - lastServerResponseAt > 15 * 60_000) return 'server_delayed';
  return 'server_reached';
}

export function dailyCheckoutCsv(summary: AnalyticsSummary, businessId: string, pendingSync: boolean, snapshotStatus: AnalyticsSnapshotStatus): string {
  return [
    'business_id,utc_date,recorded_completed_demo_checkout_cents,pending_sync,snapshot_status',
    ...summary.daily.map((day) => `${businessId},${day.date},${day.revenueCents},${pendingSync},${snapshotStatus}`),
  ].join('\r\n') + '\r\n';
}

const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);

export function summarizeAnalytics(
  businessId: string,
  transactions: Transaction[],
  visits: Visit[],
  days: AnalyticsWindow,
  now: Date,
  asOf?: Date
): AnalyticsSummary {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const tomorrow = new Date(end);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const visitById = new Map(
    visits.filter((visit) => visit.business_id === businessId).map((visit) => [visit.id, visit])
  );
  // A refunded copy wins if a sync merge left an older completed copy behind.
  const refundedIds = new Set(
    transactions
      .filter((transaction) => transaction.business_id === businessId && transaction.status === 'refunded' &&
        (asOf === undefined || Date.parse(transaction.created_at) <= asOf.getTime()))
      .map((transaction) => transaction.id)
  );
  const seenTransactionIds = new Set<string>();
  const completed = transactions
    .filter((transaction) => {
      const at = new Date(transaction.created_at).getTime();
      if (seenTransactionIds.has(transaction.id) || refundedIds.has(transaction.id)) return false;
      if (transaction.business_id !== businessId || transaction.status !== 'completed' ||
          !Number.isFinite(at) || at < start.getTime() || at >= tomorrow.getTime() ||
          (asOf !== undefined && at > asOf.getTime()) ||
          !Number.isFinite(transaction.amount) || transaction.amount < 0) return false;
      seenTransactionIds.add(transaction.id);
      return true;
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const daily = Array.from({ length: days }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return { date: day.toISOString().slice(0, 10), revenueCents: 0 };
  });
  const dailyByDate = new Map(daily.map((day) => [day.date, day]));
  const packages = new Map<string, { name: string; revenueCents: number; count: number }>();
  const linkedVisits = new Set<string>();
  const addonVisits = new Set<string>();
  let revenueCents = 0;
  let unmatchedTransactionCount = 0;

  for (const transaction of completed) {
    const amountCents = cents(transaction.amount);
    revenueCents += amountCents;
    const date = new Date(transaction.created_at).toISOString().slice(0, 10);
    const day = dailyByDate.get(date);
    if (day) day.revenueCents += amountCents;

    const visit = visitById.get(transaction.visit_id);
    if (!visit) {
      unmatchedTransactionCount += 1;
      continue;
    }
    linkedVisits.add(visit.id);
    if (visit.addon_ids.length > 0) addonVisits.add(visit.id);
    const name = visit.package_name || 'Unnamed package';
    const row = packages.get(name) ?? { name, revenueCents: 0, count: 0 };
    row.revenueCents += amountCents;
    row.count += 1;
    packages.set(name, row);
  }

  return {
    revenueCents,
    transactionCount: completed.length,
    linkedVisitCount: linkedVisits.size,
    averageTicketCents: completed.length ? Math.round(revenueCents / completed.length) : 0,
    addonVisitCount: addonVisits.size,
    addonAttachmentPercent: linkedVisits.size
      ? Math.round((addonVisits.size / linkedVisits.size) * 1000) / 10
      : null,
    activeDayCount: daily.filter((day) => day.revenueCents > 0).length,
    daily,
    packages: [...packages.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    recent: completed.slice(0, 5),
    unmatchedTransactionCount,
  };
}
