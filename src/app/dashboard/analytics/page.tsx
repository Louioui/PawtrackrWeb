'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Download, RefreshCw, WifiOff } from 'lucide-react';
import { BUSINESSES, BUSINESS_CONFIGS, INITIAL_TRANSACTIONS, INITIAL_VISITS, TENANT_BESPOKE_ID } from '@/lib/mock-tenant-data';
import { hasDemoStoreConflict, hasPendingDemoStore, loadUniversalStore, subscribeUniversalStore } from '@/lib/realtime-store';
import { formatCents } from '@/lib/pos-math';
import { AnalyticsWindow, analyticsSnapshotStatus, analyticsSourceStatus, averageCheckoutChange, checkoutTotalChange, dailyCheckoutCsv, parseAnalyticsSelection, priorWindowAsOf, priorWindowEnd, summarizeAnalytics, weeklyCheckoutPacing } from '@/lib/analytics-data';
import type { BusinessConfig, Transaction, Visit } from '@/types/database';

const WINDOWS: AnalyticsWindow[] = [7, 30, 90];
const money = (value: number) => formatCents(value);
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

export default function ExecutiveSalonAnalyticsPage() {
  const [activeBusinessId, setActiveBusinessId] = useState(TENANT_BESPOKE_ID);
  const [days, setDays] = useState<AnalyticsWindow>(30);
  const [selectionReady, setSelectionReady] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [visits, setVisits] = useState<Visit[]>(INITIAL_VISITS);
  const [configs, setConfigs] = useState<Record<string, BusinessConfig>>(BUSINESS_CONFIGS);
  const [serverStatus, setServerStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [lastServerResponseAt, setLastServerResponseAt] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(false);
  const [syncConflict, setSyncConflict] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const selection = parseAnalyticsSelection(window.location.search, BUSINESSES.map((item) => item.id), TENANT_BESPOKE_ID);
    setActiveBusinessId(selection.businessId);
    setDays(selection.days);
    setSelectionReady(true);
  }, []);

  useEffect(() => {
    if (!selectionReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set('business', activeBusinessId);
    url.searchParams.set('days', String(days));
    window.history.replaceState(window.history.state, '', url);
  }, [activeBusinessId, days, selectionReady]);

  useEffect(() => {
    if (!selectionReady) return;
    const update = () => {
      const store = loadUniversalStore();
      setTransactions(store.transactions);
      setVisits(store.visits);
      setConfigs(store.configs);
    };
    setNow(new Date());
    setOnline(navigator.onLine);
    setPendingSync(hasPendingDemoStore());
    setSyncConflict(hasDemoStoreConflict());
    update();
    setServerStatus('checking');
    setLastServerResponseAt(null);
    const unsubscribe = subscribeUniversalStore((store) => {
      setTransactions(store.transactions);
      setVisits(store.visits);
      setConfigs(store.configs);
    }, activeBusinessId, (status) => {
      setServerStatus(status);
      if (status === 'available') setLastServerResponseAt(Date.now());
    }, 60_000);
    const onOnline = () => {
      setOnline(true);
      setServerStatus('checking');
    };
    const onOffline = () => setOnline(false);
    const onSyncStatus = () => { setPendingSync(hasPendingDemoStore()); setSyncConflict(hasDemoStoreConflict()); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'pawtrackr_pending_demo_store_v1' || event.key === 'pawtrackr_demo_store_conflict_v1') onSyncStatus();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pawtrackr-demo-sync-status', onSyncStatus);
    window.addEventListener('storage', onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pawtrackr-demo-sync-status', onSyncStatus);
      window.removeEventListener('storage', onStorage);
    };
  }, [activeBusinessId, selectionReady]);

  useEffect(() => {
    const refreshClock = () => setNow(new Date());
    const timer = window.setInterval(refreshClock, 60_000);
    document.addEventListener('visibilitychange', refreshClock);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshClock);
    };
  }, []);

  const business = BUSINESSES.find((item) => item.id === activeBusinessId) ?? BUSINESSES[0];
  const summary = useMemo(
    () => summarizeAnalytics(business.id, transactions, visits, days, now ?? new Date('2026-11-09T00:00:00Z'), now ?? undefined),
    [business.id, transactions, visits, days, now]
  );
  const previousSummary = useMemo(
    () => summarizeAnalytics(business.id, transactions, visits, days, priorWindowEnd(now ?? new Date('2026-11-09T00:00:00Z'), days), priorWindowAsOf(now ?? new Date('2026-11-09T00:00:00Z'), days)),
    [business.id, transactions, visits, days, now]
  );
  const averageChange = averageCheckoutChange(summary, previousSummary);
  const totalChange = checkoutTotalChange(summary, previousSummary);
  const weeklyTargetCents = configs[business.id]?.custom_settings.weekly_checkout_target_cents;
  const weeklyPacing = weeklyTargetCents === undefined ? null : weeklyCheckoutPacing(business.id, transactions, visits, weeklyTargetCents, now ?? new Date('2026-11-09T00:00:00Z'));
  const firstDay = summary.daily[0]?.date;
  const lastDay = summary.daily.at(-1)?.date;
  const maxDaily = Math.max(1, ...summary.daily.map((item) => item.revenueCents));
  const maxPackage = Math.max(1, ...summary.packages.map((item) => item.revenueCents));
  const stale = lastServerResponseAt !== null && now !== null && now.getTime() - lastServerResponseAt > 15 * 60_000;
  const status = analyticsSourceStatus(online, serverStatus, lastServerResponseAt, now?.getTime() ?? 0, pendingSync, syncConflict);
  const chartHeight = 132;
  const chartWidth = 600;
  const points = summary.daily.map((item, index) => ({
    x: 8 + (index * (chartWidth - 16)) / Math.max(1, summary.daily.length - 1),
    y: chartHeight - 8 - (item.revenueCents / maxDaily) * (chartHeight - 20),
    amount: item.revenueCents,
    date: item.date,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const showDailyMarkers = days <= 30 || summary.activeDayCount === 1;

  const exportDailyData = () => {
    const csv = dailyCheckoutCsv(summary, business.id, pendingSync, analyticsSnapshotStatus(online, serverStatus, lastServerResponseAt, now?.getTime() ?? 0, pendingSync, syncConflict));
    const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `pawtrackr-demo-checkout-daily-${business.slug}-${firstDay}-${lastDay}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-zinc-200 hover:border-periwinkle-500/50"><ArrowLeft className="h-4 w-4" /> Command center</Link>
        <div className="flex flex-wrap items-center gap-2"><Link href="/dashboard/analytics/live" className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-3 text-xs font-semibold text-zinc-200 hover:border-periwinkle-500/50">Staff data view</Link><span className="rounded-full border border-periwinkle-500/40 bg-periwinkle-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-periwinkle-300">Demo data</span></div>
      </div>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-periwinkle-300"><BarChart3 className="h-4 w-4" /> Salon analytics</div>
          <h1 className="mt-1 text-3xl font-extrabold text-white">{business.name} performance</h1>
          <p className="mt-1 text-sm text-zinc-400">Recorded checkout totals and visit context</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="analytics-business">Demo business</label>
          <select id="analytics-business" value={activeBusinessId} onChange={(event) => setActiveBusinessId(event.target.value)} className="min-h-11 max-w-full rounded-xl border border-white/10 bg-obsidian-800 px-3 text-sm text-white">
            {BUSINESSES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <label className="sr-only" htmlFor="analytics-window">Time window</label>
          <select id="analytics-window" value={days} onChange={(event) => setDays(Number(event.target.value) as AnalyticsWindow)} className="min-h-11 rounded-xl border border-white/10 bg-obsidian-800 px-3 text-sm text-white">
            {WINDOWS.map((windowDays) => <option key={windowDays} value={windowDays}>Last {windowDays} days</option>)}
          </select>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
        <section className="glass-card min-w-0 p-5 sm:p-6" aria-labelledby="revenue-heading">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="revenue-heading" className="text-xl font-bold text-white">Completed checkout total</h2>
              <p className="mt-1 text-xs text-zinc-400">{firstDay && dateLabel(firstDay)}–{lastDay && dateLabel(lastDay)} · UTC transaction dates</p>
            </div>
            <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${online && serverStatus === 'available' && !stale && !pendingSync ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}`}>
              {online ? <RefreshCw className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{status}
            </span>
          </div>
          <button type="button" onClick={exportDailyData} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm font-semibold text-zinc-200 hover:border-periwinkle-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-periwinkle-400">
            <Download className="h-4 w-4" /> Export daily CSV
          </button>
          {summary.transactionCount === 0 ? (
            <div className="mt-5 flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-sm text-zinc-400">No completed checkouts in this period.</div>
          ) : (
            <>
              <div className="mt-5 flex items-baseline gap-2"><strong className="font-mono text-3xl text-white">{money(summary.revenueCents)}</strong><span className="text-xs text-zinc-400">from {summary.transactionCount} checkout{summary.transactionCount === 1 ? '' : 's'}</span></div>
              {summary.revenueCents === 0 ? <p className="mt-3 rounded-lg bg-periwinkle-500/10 px-3 py-2 text-xs text-periwinkle-200">All completed checkouts in this period total $0.00. There is no positive daily amount to plot.</p> : summary.activeDayCount < 2 ? <p className="mt-3 rounded-lg bg-periwinkle-500/10 px-3 py-2 text-xs text-periwinkle-200">Checkout totals appear on {summary.activeDayCount} day. A trend needs checkouts on at least two days.</p> : null}
              {summary.revenueCents > 0 && <div className="mt-4" role="img" aria-label={`Daily completed checkout totals from ${firstDay} to ${lastDay}. Total ${money(summary.revenueCents)} from ${summary.transactionCount} checkouts. Daily scale zero to ${money(maxDaily)}.`}>
                <div className="flex gap-2">
                  <div aria-hidden="true" className="flex h-44 min-w-[4.5rem] flex-col justify-between py-3 text-right font-mono text-[10px] text-zinc-400 sm:text-xs">
                    <span>{money(maxDaily)}</span>
                    <span>{money(Math.round(maxDaily / 2))}</span>
                    <span>$0.00</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-44 w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
                      {[0, 0.5, 1].map((fraction) => <line key={fraction} x1="8" x2="592" y1={chartHeight - 8 - fraction * (chartHeight - 20)} y2={chartHeight - 8 - fraction * (chartHeight - 20)} stroke="#4c4658" strokeDasharray="4 5" strokeWidth="1" />)}
                      {summary.activeDayCount > 1 ? <polyline fill="none" stroke="#8B95FF" strokeWidth="3" vectorEffect="non-scaling-stroke" points={line} /> : null}
                      {showDailyMarkers && points.filter((point) => point.amount > 0).map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="5" fill="#8B95FF"><title>{`${dateLabel(point.date)}: ${money(point.amount)}`}</title></circle>)}
                    </svg>
                    <div className="flex justify-between text-xs text-zinc-400"><span>{firstDay && dateLabel(firstDay)}</span><span>{lastDay && dateLabel(lastDay)}</span></div>
                  </div>
                </div>
              </div>}
            </>
          )}
          <details className="mt-4 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200">
            <summary className="cursor-pointer py-1 font-semibold">View daily values</summary>
            <div className="mt-3 max-h-64 overflow-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Daily completed checkout totals in UTC</caption>
                <thead className="sticky top-0 bg-obsidian-800 text-zinc-400"><tr><th scope="col" className="py-2">UTC date</th><th scope="col" className="py-2 text-right">Checkout total</th></tr></thead>
                <tbody className="divide-y divide-white/10">{summary.daily.map((day) => <tr key={day.date}><th scope="row" className="py-2 font-normal">{day.date}</th><td className="py-2 text-right font-mono">{money(day.revenueCents)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
          <p className="mt-4 border-t border-white/10 pt-3 text-xs text-zinc-400">Source: Pawtrackr demo checkout records. “Completed” means the app recorded checkout completion; it does not confirm payment settlement. Totals include tax and tips. Pending and refunded records are excluded. {syncConflict ? 'Another browser changed the demo ledger. This browser kept its local edits and did not overwrite the server; resolve the conflict before relying on sync.' : lastServerResponseAt ? `Last successful server response: ${new Date(lastServerResponseAt).toLocaleString()}.` : serverStatus === 'unavailable' ? 'Showing the local snapshot because the demo server is unavailable.' : 'Showing the local snapshot while the server is checked.'}</p>
        </section>

        <section className="glass-card p-5 sm:p-6" aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="text-xl font-bold text-white">Period summary</h2>
          <dl className="mt-4 divide-y divide-white/10">
            <div className="flex justify-between gap-4 py-3"><dt className="text-sm text-zinc-300">Completed checkout total</dt><dd className="text-right"><span className="font-mono font-bold text-white">{money(summary.revenueCents)}</span><span className="mt-1 block text-xs text-zinc-400">{previousSummary.transactionCount ? `Prior ${days} days through the same UTC time: ${money(previousSummary.revenueCents)}` : `No checkouts in the prior ${days} days through the same UTC time`}</span>{totalChange.changeCents !== null && <span className={`mt-1 block text-xs ${totalChange.changeCents >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{totalChange.changeCents >= 0 ? '+' : '−'}{money(Math.abs(totalChange.changeCents))}{totalChange.changePercent !== null ? ` (${totalChange.changePercent >= 0 ? '+' : ''}${totalChange.changePercent}%)` : ''} vs prior comparable window</span>}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-sm text-zinc-300">Visits linked to checkouts</dt><dd className="font-mono font-bold text-white">{summary.linkedVisitCount}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-sm text-zinc-300">Average checkout</dt><dd className="text-right"><span className="font-mono font-bold text-white">{summary.transactionCount ? money(summary.averageTicketCents) : '—'}</span><span className="mt-1 block text-xs text-zinc-400">{previousSummary.transactionCount ? `Prior comparable window: ${money(previousSummary.averageTicketCents)} from ${previousSummary.transactionCount} checkout${previousSummary.transactionCount === 1 ? '' : 's'}` : 'No checkouts in the prior comparable window'}</span>{averageChange.changeCents !== null && <span className={`mt-1 block text-xs ${averageChange.changeCents >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{averageChange.changeCents >= 0 ? '+' : '−'}{money(Math.abs(averageChange.changeCents))}{averageChange.changePercent !== null ? ` (${averageChange.changePercent >= 0 ? '+' : ''}${averageChange.changePercent}%)` : ''} vs prior comparable window</span>}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-sm text-zinc-300">Add-on selection among linked visits</dt><dd className="text-right"><span className="font-mono font-bold text-white">{summary.addonAttachmentPercent === null ? '—' : `${summary.addonAttachmentPercent}%`}</span><span className="mt-1 block text-xs text-zinc-400">{summary.addonVisitCount} of {summary.linkedVisitCount} linked visits</span></dd></div>
          </dl>
          {weeklyPacing ? <div className="mt-5 rounded-xl border border-white/10 bg-obsidian-900/70 p-4" aria-label="Weekly demo checkout pacing">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-white">Weekly checkout pacing</h3><span className="font-mono text-sm text-white">{money(weeklyPacing.recordedCents)} / {money(weeklyPacing.targetCents)}</span></div>
            <p className="mt-1 text-xs text-zinc-400">Owner-set demo target · UTC {weeklyPacing.weekStart} through {weeklyPacing.throughDate}</p>
            <div className="mt-3 h-2.5 rounded-full bg-white/10" role="progressbar" aria-label="Recorded demo checkouts toward weekly target" aria-valuemin={0} aria-valuemax={weeklyPacing.targetCents} aria-valuenow={Math.min(weeklyPacing.recordedCents, weeklyPacing.targetCents)} aria-valuetext={`${money(weeklyPacing.recordedCents)} of ${money(weeklyPacing.targetCents)}`}><div className="h-full rounded-full bg-periwinkle-500" style={{ width: `${weeklyPacing.targetCents > 0 ? Math.min(100, weeklyPacing.recordedCents / weeklyPacing.targetCents * 100) : 100}%` }} /></div>
            <p className="mt-2 text-xs text-zinc-300">Linear pace through today: {money(weeklyPacing.expectedCents)} · {weeklyPacing.gapCents >= 0 ? `${money(weeklyPacing.gapCents)} ahead` : `${money(-weeklyPacing.gapCents)} behind`}</p>
          </div> : <p className="mt-5 text-xs text-zinc-400">Set an optional weekly demo checkout target in Settings to see pacing.</p>}
          <p className="mt-4 text-xs text-zinc-400">Add-on selection uses distinct visits linked to completed checkouts as its denominator. Unlinked checkouts are excluded from this rate. Itemized add-on revenue is unavailable in the current records.</p>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,1fr)]">
        <section className="glass-card p-5 sm:p-6" aria-labelledby="packages-heading">
          <h2 id="packages-heading" className="text-lg font-bold text-white">Checkout total by booked package</h2>
          <p className="mt-1 text-xs text-zinc-400">Full checkout total, including tax and tips, grouped by linked visit package.</p>
          {summary.packages.length ? <div className="mt-5 space-y-4">{summary.packages.map((row) => <div key={row.name}>
            <div className="flex flex-wrap justify-between gap-1 text-sm"><span className="text-zinc-200">{row.name}</span><span className="font-mono font-semibold text-white">{money(row.revenueCents)}</span></div>
            <div className="mt-2 h-2.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-periwinkle-500" style={{ width: `${(row.revenueCents / maxPackage) * 100}%` }} /></div>
            <p className="mt-1 text-xs text-zinc-500">{row.count} checkout{row.count === 1 ? '' : 's'}</p>
          </div>)}</div> : <p className="mt-5 text-sm text-zinc-400">No linked package totals in this period.</p>}
          {summary.unmatchedTransactionCount > 0 ? <p className="mt-4 text-xs text-amber-300">{summary.unmatchedTransactionCount} checkout(s) have no matching visit and are included only in the total.</p> : null}
        </section>
        <section className="glass-card p-5 sm:p-6" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="text-lg font-bold text-white">Recent completed checkouts</h2>
          <p className="mt-1 text-xs text-zinc-400">Latest records in the selected period · UTC</p>
          {summary.recent.length ? <ul className="mt-4 divide-y divide-white/10">{summary.recent.map((transaction) => {
            const visit = visits.find((item) => item.id === transaction.visit_id && item.business_id === business.id);
            return <li key={transaction.id} className="flex justify-between gap-3 py-3 text-sm"><span className="min-w-0"><span className="block truncate text-zinc-200">{visit?.package_name ?? 'Unlinked checkout'}</span><span className="text-xs text-zinc-500">{new Date(transaction.created_at).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} UTC</span></span><span className="shrink-0 font-mono text-white">{money(Math.round(transaction.amount * 100))}</span></li>;
          })}</ul> : <p className="mt-5 text-sm text-zinc-400">No completed checkouts to show.</p>}
        </section>
      </div>
    </div>
  );
}
