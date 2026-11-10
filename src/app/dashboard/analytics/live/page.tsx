'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, RefreshCw, WifiOff } from 'lucide-react';
import { formatCents } from '@/lib/pos-math';
import { LiveEligibleVisit, normalizeEligibleVisits } from '@/lib/production-analytics';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

type WindowDays = 7 | 30 | 90;
type Daily = { utc_date: string; recorded_checkout_cents: number; checkout_count: number };
type Snapshot = {
  source: 'supabase_recorded_checkouts';
  settlement_confirmed: false;
  business_id: string;
  as_of: string;
  timezone: 'UTC';
  days: WindowDays;
  recorded_checkout_cents: number;
  checkout_count: number;
  daily: Daily[];
  eligible_visits?: LiveEligibleVisit[];
};

function isSnapshot(value: unknown, days: WindowDays): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Snapshot>;
  if (row.eligible_visits !== undefined) {
    try {
      normalizeEligibleVisits(row.eligible_visits);
    } catch {
      return false;
    }
  }
  return row.source === 'supabase_recorded_checkouts' && row.settlement_confirmed === false &&
    row.timezone === 'UTC' && row.days === days && typeof row.business_id === 'string' &&
    typeof row.as_of === 'string' && Number.isSafeInteger(row.recorded_checkout_cents) &&
    Number.isSafeInteger(row.checkout_count) && Array.isArray(row.daily) && row.daily.length === days &&
    row.daily.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.utc_date) &&
      Number.isSafeInteger(day.recorded_checkout_cents) && day.recorded_checkout_cents >= 0 &&
      Number.isSafeInteger(day.checkout_count) && day.checkout_count >= 0) &&
    row.daily.reduce((sum, day) => sum + day.recorded_checkout_cents, 0) === row.recorded_checkout_cents &&
    row.daily.reduce((sum, day) => sum + day.checkout_count, 0) === row.checkout_count;
}

export default function LiveSalonAnalyticsPage() {
  const [days, setDays] = useState<WindowDays>(30);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(true);
  const [visitId, setVisitId] = useState('');
  const [subtotalCents, setSubtotalCents] = useState(0);
  const [discountCents, setDiscountCents] = useState(0);
  const [taxCents, setTaxCents] = useState(0);
  const [tipCents, setTipCents] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'apple_pay' | 'cash' | 'split'>('card');
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);
  const checkoutMenuRef = useRef<HTMLDetailsElement>(null);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const client = getSupabaseClient();
    if (!client) { setState('error'); setMessage('Supabase is not configured.'); return; }
    if (!navigator.onLine) { setOnline(false); return; }
    setOnline(true);
    setState('checking');
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (currentRequest !== requestId.current) return;
    if (sessionError || !session) {
      setSignedIn(false); setSnapshot(null); setState('ready'); return;
    }
    setSignedIn(true);
    try {
      const response = await fetch(`/api/analytics?days=${days}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
      });
      const body: unknown = await response.json();
      if (currentRequest !== requestId.current) return;
      if (response.status === 401) {
        setSignedIn(false); setSnapshot(null); setState('ready');
        setMessage('Your session expired. Sign in again.'); return;
      }
      if (response.status === 403) {
        setSnapshot(null); setState('error');
        setMessage('An active staff membership is required to view salon analytics.'); return;
      }
      if (!response.ok) throw new Error((body as { error?: string }).error ?? 'Analytics could not be loaded.');
      if (!isSnapshot(body, days)) throw new Error('Analytics returned an invalid snapshot.');
      setSnapshot(body);
      setMessage(''); setState('ready');
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Analytics could not be loaded.');
    }
  }, [days]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    const reconnect = () => { setOnline(true); void refresh(); };
    const disconnect = () => setOnline(false);
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', disconnect);
    document.addEventListener('visibilitychange', resume);
    return () => {
      requestId.current += 1;
      window.clearInterval(timer);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', disconnect);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [refresh]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setState('checking'); setMessage('');
    const { error } = await client.auth.signInWithPassword({ email, password });
    setPassword('');
    if (error) { setState('error'); setMessage('Sign-in failed. Check your credentials and try again.'); return; }
    setSignedIn(true);
    void refresh();
  };

  const signOut = async () => {
    requestId.current += 1;
    await getSupabaseClient()?.auth.signOut();
    setSignedIn(false); setSnapshot(null); setMessage(''); setState('ready');
  };

  const eligibleVisits = useMemo(() => snapshot?.eligible_visits ?? [], [snapshot]);
  const totalPreviewCents = Math.max(0, subtotalCents - discountCents) + taxCents + tipCents;

  useEffect(() => {
    if (!eligibleVisits.length) {
      setVisitId('');
      return;
    }
    const current = eligibleVisits.find((item) => item.id === visitId) ?? eligibleVisits[0];
    if (current.id !== visitId) {
      setVisitId(current.id);
      setSubtotalCents(current.quoted_cents);
      setDiscountCents(0);
      setTaxCents(0);
      setTipCents(0);
    }
  }, [eligibleVisits, visitId]);

  const recordCheckout = async (event: FormEvent) => {
    event.preventDefault();
    if (!visitId || saving) return;
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(true); setMessage('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { setSignedIn(false); setSnapshot(null); setMessage('Your session expired. Sign in again.'); return; }
      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          visit_id: visitId,
          subtotal_cents: subtotalCents,
          discount_cents: discountCents,
          tax_cents: taxCents,
          tip_cents: tipCents,
          payment_method: paymentMethod,
        }),
      });
      const body: unknown = await response.json();
      if (response.status === 401) { setSignedIn(false); setSnapshot(null); setMessage('Your session expired. Sign in again.'); return; }
      if (!response.ok) throw new Error((body as { error?: string }).error ?? 'The checkout record could not be saved.');
      checkoutMenuRef.current?.removeAttribute('open');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The checkout record could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const chart = useMemo(() => {
    if (!snapshot) return { line: '', max: 0 };
    const max = Math.max(1, ...snapshot.daily.map((item) => item.recorded_checkout_cents));
    const line = snapshot.daily.map((item, index) => {
      const x = 8 + index * 684 / Math.max(1, snapshot.daily.length - 1);
      const y = 160 - item.recorded_checkout_cents / max * 144;
      return `${x},${y}`;
    }).join(' ');
    return { line, max };
  }, [snapshot]);

  const exportCsv = () => {
    if (!snapshot) return;
    const csv = ['business_id,utc_date,recorded_completed_checkout_cents,checkout_count,settlement_confirmed,as_of',
      ...snapshot.daily.map((day) => `${snapshot.business_id},${day.utc_date},${day.recorded_checkout_cents},${day.checkout_count},false,${snapshot.as_of}`)].join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pawtrackr-recorded-checkouts-${snapshot.days}d.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/dashboard/analytics" className="text-sm text-periwinkle-300 hover:text-white">← Demo analytics</Link>
        <Link href="/dashboard/appointments/live" className="text-sm text-periwinkle-300 hover:text-white">Live appointments →</Link>
      </div>
      {signedIn && <button type="button" onClick={signOut} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-zinc-200">Sign out</button>}
    </div>
    <header className="mb-6">
      <p className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">Authenticated staff view</p>
      <h1 className="mt-2 text-3xl font-extrabold text-white">Recorded checkout analytics</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-400">Supabase transaction records for your active salon. Checkout completion does not confirm payment settlement.</p>
    </header>

    {!isSupabaseConfigured && <p role="alert" className="glass-card p-5 text-amber-300">This view needs a Pawtrackr Supabase connection.</p>}
    {isSupabaseConfigured && !signedIn && state !== 'checking' && <form onSubmit={signIn} className="glass-card max-w-md space-y-4 p-5 sm:p-6">
      <h2 className="text-lg font-bold text-white">Staff sign-in</h2>
      <p className="text-sm text-zinc-400">Use your provisioned Pawtrackr staff account. Demo PINs do not grant access here.</p>
      <label className="block text-sm text-zinc-200">Email<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-white" /></label>
      <label className="block text-sm text-zinc-200">Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-white" /></label>
      <button type="submit" className="min-h-11 rounded-xl bg-periwinkle-500 px-5 font-bold text-obsidian-950">Sign in</button>
    </form>}

    {signedIn && <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="live-days" className="text-sm text-zinc-300">Period</label>
        <select id="live-days" value={days} onChange={(event) => { requestId.current += 1; setSnapshot(null); setDays(Number(event.target.value) as WindowDays); }} className="min-h-11 rounded-xl border border-white/15 bg-obsidian-800 px-3 text-white">
          {[7, 30, 90].map((value) => <option key={value} value={value}>Last {value} UTC days</option>)}
        </select>
        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm text-zinc-200"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>
      {eligibleVisits.length > 0 && <details ref={checkoutMenuRef} className="mb-4 rounded-xl border border-white/10 bg-obsidian-800/60 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-periwinkle-200">Record completed checkout</summary>
        <p className="mt-1 text-xs text-zinc-400">Records an app checkout for a salon visit in integer cents. Payment settlement remains unverified.</p>
        <form onSubmit={recordCheckout} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="block text-xs text-zinc-300 sm:col-span-2">Visit
            <select
              value={visitId}
              onChange={(event) => {
                const nextId = event.target.value;
                setVisitId(nextId);
                const found = eligibleVisits.find((item) => item.id === nextId);
                if (found) setSubtotalCents(found.quoted_cents);
              }}
              className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white"
            >
              {eligibleVisits.map((visit) => (
                <option key={visit.id} value={visit.id}>{visit.pet_name} · {visit.service_package} ({formatCents(visit.quoted_cents)})</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-zinc-300">Subtotal (¢)
            <input type="number" min={0} max={100000000} step={1} required value={subtotalCents} onChange={(event) => setSubtotalCents(Math.max(0, Number(event.target.value) || 0))} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
          </label>
          <label className="block text-xs text-zinc-300">Discount (¢)
            <input type="number" min={0} max={subtotalCents} step={1} required value={discountCents} onChange={(event) => setDiscountCents(Math.max(0, Number(event.target.value) || 0))} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
          </label>
          <label className="block text-xs text-zinc-300">Tax (¢)
            <input type="number" min={0} max={100000000} step={1} required value={taxCents} onChange={(event) => setTaxCents(Math.max(0, Number(event.target.value) || 0))} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
          </label>
          <label className="block text-xs text-zinc-300">Tip (¢)
            <input type="number" min={0} max={100000000} step={1} required value={tipCents} onChange={(event) => setTipCents(Math.max(0, Number(event.target.value) || 0))} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
          </label>
          <label className="block text-xs text-zinc-300">Payment method
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'card' | 'apple_pay' | 'cash' | 'split')} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white">
              <option value="card">Card</option>
              <option value="apple_pay">Apple Pay</option>
              <option value="cash">Cash</option>
              <option value="split">Split</option>
            </select>
          </label>
          <div className="flex items-end justify-between gap-3 sm:col-span-2 lg:col-span-5">
            <span className="font-mono text-sm text-zinc-200">Recorded total: <strong>{formatCents(totalPreviewCents)}</strong></span>
            <button type="submit" disabled={saving || discountCents > subtotalCents} className="min-h-11 rounded-lg bg-periwinkle-500 px-4 text-sm font-bold text-obsidian-950">{saving ? 'Recording…' : 'Record checkout'}</button>
          </div>
        </form>
      </details>}
      <section className="glass-card p-5 sm:p-6" aria-labelledby="live-chart-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="live-chart-heading" className="text-xl font-bold text-white">Completed checkout total</h2><p className="mt-1 text-xs text-zinc-400">UTC transaction dates · includes recorded tax and tips</p></div>
          <span role="status" aria-live="polite" className={`text-xs ${online && state === 'ready' ? 'text-emerald-300' : 'text-amber-300'}`}>{!online ? <><WifiOff className="mr-1 inline h-3 w-3" />{snapshot ? 'Offline · last loaded snapshot' : 'Offline · no snapshot'}</> : state === 'checking' ? 'Refreshing…' : state === 'error' ? snapshot ? 'Refresh failed · last loaded snapshot' : 'Snapshot unavailable' : 'Server snapshot'}</span>
        </div>
        {snapshot ? <>
          <div className="mt-5 flex flex-wrap items-baseline gap-3"><strong className="font-mono text-3xl text-white">{formatCents(snapshot.recorded_checkout_cents)}</strong><span className="text-sm text-zinc-400">{snapshot.checkout_count} completed checkout{snapshot.checkout_count === 1 ? '' : 's'}</span></div>
          {snapshot.checkout_count === 0 ? <p className="mt-5 rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-400">No completed checkouts in this period.</p> : <div className="mt-6" role="img" aria-label={`Daily recorded checkout totals from ${snapshot.daily[0].utc_date} to ${snapshot.daily.at(-1)?.utc_date}, zero to ${formatCents(chart.max)}. Total ${formatCents(snapshot.recorded_checkout_cents)}.`}>
            <div className="flex gap-3"><div aria-hidden="true" className="flex h-44 flex-col justify-between py-2 text-right font-mono text-xs text-zinc-400"><span>{formatCents(chart.max)}</span><span>$0.00</span></div><svg viewBox="0 0 700 170" preserveAspectRatio="none" className="h-44 min-w-0 flex-1" aria-hidden="true"><line x1="8" x2="692" y1="160" y2="160" stroke="#777187" /><polyline points={chart.line} fill="none" stroke="#8B95FF" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg></div>
            <div className="ml-20 flex justify-between text-xs text-zinc-400"><span>{snapshot.daily[0].utc_date}</span><span>{snapshot.daily.at(-1)?.utc_date}</span></div>
          </div>}
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={exportCsv} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm text-zinc-200"><Download className="h-4 w-4" /> Export daily CSV</button></div>
          <details className="mt-4 rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-sm font-semibold text-zinc-200">View daily values</summary><div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-sm"><caption className="sr-only">Daily recorded checkout totals in UTC</caption><thead><tr className="text-left text-zinc-400"><th scope="col" className="py-2">UTC date</th><th scope="col" className="py-2 text-right">Checkouts</th><th scope="col" className="py-2 text-right">Total</th></tr></thead><tbody>{snapshot.daily.map((day) => <tr key={day.utc_date} className="border-t border-white/10 text-zinc-200"><th scope="row" className="py-2 text-left font-normal">{day.utc_date}</th><td className="py-2 text-right">{day.checkout_count}</td><td className="py-2 text-right font-mono">{formatCents(day.recorded_checkout_cents)}</td></tr>)}</tbody></table></div></details>
          <p className="mt-4 border-t border-white/10 pt-3 text-xs text-zinc-400">Source: Pawtrackr Supabase completed transaction records for the signed-in staff member’s active salon. As of {new Date(snapshot.as_of).toLocaleString()}. Pending and refunded transactions are excluded. Payment settlement is unverified.</p>
        </> : <p className="mt-5 text-sm text-zinc-400">{state === 'checking' ? 'Loading your salon records…' : 'No server snapshot is available.'}</p>}
      </section>
    </>}
    {message && <p role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{message}</p>}
  </main>;
}
