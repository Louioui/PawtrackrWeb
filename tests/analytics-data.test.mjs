import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsSnapshotStatus, analyticsSourceStatus, averageCheckoutChange, checkoutTotalChange, dailyCheckoutCsv, parseAnalyticsSelection, priorWindowAsOf, priorWindowEnd, summarizeAnalytics, weeklyCheckoutPacing } from '../src/lib/analytics-data.ts';

const now = new Date('2026-11-09T18:00:00Z');
const visit = (id, business_id = 'salon-a', addon_ids = []) => ({ id, business_id, addon_ids, package_name: 'Bath' });
const tx = (id, business_id, visit_id, amount, status, created_at) => ({ id, business_id, visit_id, amount, status, created_at });

test('analytics URL selection accepts known businesses and supported windows only', () => {
  assert.deepEqual(parseAnalyticsSelection('?business=salon-b&days=90', ['salon-a', 'salon-b'], 'salon-a'), { businessId: 'salon-b', days: 90 });
  assert.deepEqual(parseAnalyticsSelection('?business=unknown&days=365', ['salon-a', 'salon-b'], 'salon-a'), { businessId: 'salon-a', days: 30 });
  assert.deepEqual(parseAnalyticsSelection('?days=7', ['salon-a'], 'salon-a'), { businessId: 'salon-a', days: 7 });
});

test('uses integer cents, tenant isolation, status, and UTC window boundaries', () => {
  const result = summarizeAnalytics('salon-a', [
    tx('a', 'salon-a', 'v1', 10.01, 'completed', '2026-11-09T23:59:59Z'),
    tx('b', 'salon-a', 'v2', 20.02, 'completed', '2026-10-11T00:00:00Z'),
    tx('old', 'salon-a', 'v1', 8, 'completed', '2026-10-10T23:59:59Z'),
    tx('other', 'salon-b', 'v3', 500, 'completed', '2026-11-09T00:00:00Z'),
    tx('pending', 'salon-a', 'v1', 50, 'pending', '2026-11-09T00:00:00Z'),
    tx('refund', 'salon-a', 'v1', 50, 'refunded', '2026-11-09T00:00:00Z'),
    tx('future', 'salon-a', 'v1', 50, 'completed', '2026-11-10T00:00:00Z'),
  ], [visit('v1', 'salon-a', ['addon']), visit('v2'), visit('v3', 'salon-b')], 30, now);
  assert.equal(result.revenueCents, 3003);
  assert.equal(result.averageTicketCents, 1502);
  assert.equal(result.linkedVisitCount, 2);
  assert.equal(result.addonVisitCount, 1);
  assert.equal(result.addonAttachmentPercent, 50);
  assert.equal(result.daily.length, 30);
  assert.equal(result.daily[0].date, '2026-10-11');
  assert.equal(result.daily.at(-1).revenueCents, 1001);
  assert.deepEqual(result.packages, [{ name: 'Bath', revenueCents: 3003, count: 2 }]);
});

test('keeps unlinked checkout in total without inventing package attribution', () => {
  const result = summarizeAnalytics('salon-a', [tx('x', 'salon-a', 'missing', 12.34, 'completed', '2026-11-09T00:00:00Z')], [], 7, now);
  assert.equal(result.revenueCents, 1234);
  assert.equal(result.unmatchedTransactionCount, 1);
  assert.equal(result.linkedVisitCount, 0);
  assert.equal(result.addonAttachmentPercent, null);
  assert.deepEqual(result.packages, []);
});

test('empty period has zero totals and dated empty buckets', () => {
  const result = summarizeAnalytics('salon-a', [], [], 7, now);
  assert.equal(result.revenueCents, 0);
  assert.equal(result.averageTicketCents, 0);
  assert.equal(result.daily.length, 7);
  assert.equal(result.daily[0].date, '2026-11-03');
});

test('zero-dollar completed checkout remains a record without a positive daily plot', () => {
  const result = summarizeAnalytics('salon-a', [
    tx('free', 'salon-a', 'v1', 0, 'completed', '2026-11-09T10:00:00Z'),
  ], [visit('v1')], 7, now);
  assert.equal(result.transactionCount, 1);
  assert.equal(result.revenueCents, 0);
  assert.equal(result.activeDayCount, 0);
  assert.ok(result.daily.every((day) => day.revenueCents === 0));
});

test('duplicate IDs count once and two checkouts on one day do not imply a trend', () => {
  const result = summarizeAnalytics('salon-a', [
    tx('first', 'salon-a', 'v1', 9.99, 'completed', '2026-11-09T01:00:00Z'),
    tx('first', 'salon-a', 'v1', 9.99, 'completed', '2026-11-09T01:00:00Z'),
    tx('second', 'salon-a', 'v1', 10.01, 'completed', '2026-11-09T02:00:00Z'),
    tx('bad-date', 'salon-a', 'v1', 20, 'completed', 'not-a-date'),
  ], [visit('v1', 'salon-a', ['addon'])], 7, now);
  assert.equal(result.revenueCents, 2000);
  assert.equal(result.transactionCount, 2);
  assert.equal(result.linkedVisitCount, 1);
  assert.equal(result.addonVisitCount, 1);
  assert.equal(result.addonAttachmentPercent, 100);
  assert.equal(result.activeDayCount, 1);
});

test('daily CSV exports exactly the selected UTC buckets and integer cents', () => {
  const result = summarizeAnalytics('salon-a', [
    tx('x', 'salon-a', 'v1', 12.34, 'completed', '2026-11-09T13:00:00Z'),
  ], [visit('v1')], 7, now);
  const rows = dailyCheckoutCsv(result, 'salon-a', true, 'pending_sync').trim().split('\r\n');
  assert.equal(rows.length, 8);
  assert.equal(rows[0], 'business_id,utc_date,recorded_completed_demo_checkout_cents,pending_sync,snapshot_status');
  assert.equal(rows[1], 'salon-a,2026-11-03,0,true,pending_sync');
  assert.equal(rows.at(-1), 'salon-a,2026-11-09,1234,true,pending_sync');
});

test('average checkout compares equal UTC windows and leaves missing baselines undefined', () => {
  const transactions = [
    tx('prior', 'salon-a', 'v1', 20, 'completed', '2026-11-02T23:59:59Z'),
    tx('current', 'salon-a', 'v1', 25, 'completed', '2026-11-09T00:00:00Z'),
    tx('outside', 'salon-a', 'v1', 100, 'completed', '2026-10-26T23:59:59Z'),
  ];
  const current = summarizeAnalytics('salon-a', transactions, [visit('v1')], 7, now);
  const previous = summarizeAnalytics('salon-a', transactions, [visit('v1')], 7, priorWindowEnd(now, 7));
  assert.equal(previous.daily[0].date, '2026-10-27');
  assert.equal(previous.daily.at(-1).date, '2026-11-02');
  assert.deepEqual(averageCheckoutChange(current, previous), { changeCents: 500, changePercent: 25 });
  assert.deepEqual(averageCheckoutChange(current, summarizeAnalytics('salon-a', [], [], 7, now)), { changeCents: null, changePercent: null });
  const zero = summarizeAnalytics('salon-a', [tx('free', 'salon-a', 'v1', 0, 'completed', '2026-11-02T12:00:00Z')], [visit('v1')], 7, priorWindowEnd(now, 7));
  assert.deepEqual(averageCheckoutChange(current, zero), { changeCents: 2500, changePercent: null });
});

test('total comparison stops the prior window at the same UTC time', () => {
  const transactions = [
    tx('prior-in', 'salon-a', 'v1', 20, 'completed', '2026-11-02T17:59:59Z'),
    tx('prior-late', 'salon-a', 'v1', 100, 'completed', '2026-11-02T19:00:00Z'),
    tx('current', 'salon-a', 'v1', 25, 'completed', '2026-11-09T17:00:00Z'),
  ];
  const current = summarizeAnalytics('salon-a', transactions, [visit('v1')], 7, now, now);
  const previous = summarizeAnalytics('salon-a', transactions, [visit('v1')], 7, priorWindowEnd(now, 7), priorWindowAsOf(now, 7));
  assert.equal(previous.revenueCents, 2000);
  assert.deepEqual(checkoutTotalChange(current, previous), { changeCents: 500, changePercent: 25 });
  assert.deepEqual(averageCheckoutChange(current, previous), { changeCents: 500, changePercent: 25 });
  assert.deepEqual(checkoutTotalChange(current, summarizeAnalytics('salon-a', [], [], 7, now)), { changeCents: null, changePercent: null });
  const zero = summarizeAnalytics('salon-a', [tx('free', 'salon-a', 'v1', 0, 'completed', '2026-11-02T12:00:00Z')], [visit('v1')], 7, priorWindowEnd(now, 7));
  assert.deepEqual(checkoutTotalChange(current, zero), { changeCents: 2500, changePercent: null });
});

test('source status separates checking, unavailable, offline, and delayed snapshots', () => {
  const time = Date.parse('2026-11-09T18:00:00Z');
  assert.equal(analyticsSourceStatus(true, 'checking', null, time), 'Checking server · local snapshot');
  assert.equal(analyticsSourceStatus(true, 'unavailable', null, time), 'Server unavailable · local snapshot');
  assert.equal(analyticsSourceStatus(false, 'available', time, time), 'Browser offline · local snapshot');
  assert.equal(analyticsSourceStatus(true, 'available', time - 16 * 60_000, time), 'Server update delayed · local snapshot');
  assert.equal(analyticsSourceStatus(true, 'available', time - 60_000, time), 'Server reached · demo snapshot');
  assert.equal(analyticsSourceStatus(true, 'available', time, time, true), 'Local edits pending sync');
  assert.equal(analyticsSourceStatus(false, 'available', time, time, true), 'Browser offline · edits pending sync');
  assert.equal(analyticsSourceStatus(true, 'available', time, time, true, true), 'Sync conflict · local edits preserved');
  assert.equal(analyticsSnapshotStatus(true, 'checking', null, time, false), 'checking_server');
  assert.equal(analyticsSnapshotStatus(true, 'unavailable', null, time, false), 'server_unavailable');
  assert.equal(analyticsSnapshotStatus(false, 'available', time, time, false), 'browser_offline');
  assert.equal(analyticsSnapshotStatus(true, 'available', time - 16 * 60_000, time, false), 'server_delayed');
  assert.equal(analyticsSnapshotStatus(true, 'available', time, time, false), 'server_reached');
  assert.equal(analyticsSnapshotStatus(false, 'unavailable', null, time, true), 'pending_sync');
  assert.equal(analyticsSnapshotStatus(true, 'available', time, time, true, true), 'sync_conflict');
});

test('a refunded copy suppresses an older completed copy with the same ID', () => {
  const result = summarizeAnalytics('salon-a', [
    tx('same', 'salon-a', 'v1', 30, 'completed', '2026-11-08T10:00:00Z'),
    tx('keep', 'salon-a', 'v1', 12, 'completed', '2026-11-09T10:00:00Z'),
    tx('same', 'salon-a', 'v1', 30, 'refunded', '2026-11-08T10:00:00Z'),
    tx('keep', 'salon-b', 'v2', 999, 'refunded', '2026-11-09T10:00:00Z'),
  ], [visit('v1')], 7, now);
  assert.equal(result.revenueCents, 1200);
  assert.equal(result.transactionCount, 1);
  assert.equal(result.packages[0].revenueCents, 1200);
});

test('weekly pacing uses the current UTC Monday through today and an owner target', () => {
  const pacing = weeklyCheckoutPacing('salon-a', [
    tx('last-week', 'salon-a', 'v1', 100, 'completed', '2026-11-08T12:00:00Z'),
    tx('today', 'salon-a', 'v1', 30, 'completed', '2026-11-09T10:00:00Z'),
    tx('other', 'salon-b', 'v2', 500, 'completed', '2026-11-09T10:00:00Z'),
    tx('pending', 'salon-a', 'v1', 70, 'pending', '2026-11-09T10:00:00Z'),
  ], [visit('v1')], 70000, now);
  assert.deepEqual(pacing, { weekStart: '2026-11-09', throughDate: '2026-11-09', recordedCents: 3000, expectedCents: 10000, targetCents: 70000, gapCents: -7000 });
});

test('current-period views exclude later timestamps on the same UTC day', () => {
  const records = [
    tx('past', 'salon-a', 'v1', 12, 'completed', '2026-11-09T17:00:00Z'),
    tx('future', 'salon-a', 'v1', 80, 'completed', '2026-11-09T19:00:00Z'),
  ];
  const summary = summarizeAnalytics('salon-a', records, [visit('v1')], 7, now, now);
  assert.equal(summary.revenueCents, 1200);
  assert.equal(summary.transactionCount, 1);
  assert.equal(weeklyCheckoutPacing('salon-a', records, [visit('v1')], 7000, now).recordedCents, 1200);
});
