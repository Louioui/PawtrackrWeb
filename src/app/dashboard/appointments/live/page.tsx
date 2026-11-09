'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, RefreshCw, WifiOff } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { LiveReservation, LiveReservationDay, normalizeLiveReservationDay } from '@/lib/live-reservations';

const utcDay = () => new Date().toISOString().slice(0, 10);
const shiftDay = (day: string, change: number) => new Date(Date.parse(`${day}T12:00:00Z`) + change * 86400000).toISOString().slice(0, 10);
const minute = (value: string) => { const date = new Date(value); return date.getUTCHours() * 60 + date.getUTCMinutes(); };
const time = (value: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(new Date(value));
const statusLabel: Record<LiveReservation['status'], string> = {
  booked: 'Booked', dropped_off: 'Dropped off', bathing: 'Bathing', styling: 'Styling',
  ready: 'Ready', completed: 'Completed', cancelled: 'Canceled',
};
const statusClass: Record<LiveReservation['status'], string> = {
  booked: 'border-periwinkle-400/50 bg-periwinkle-500/15 text-periwinkle-200',
  dropped_off: 'border-sky-400/50 bg-sky-500/15 text-sky-200',
  bathing: 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200',
  styling: 'border-violet-400/50 bg-violet-500/15 text-violet-200',
  ready: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200',
  completed: 'border-zinc-500/50 bg-zinc-500/10 text-zinc-300',
  cancelled: 'border-zinc-600/50 bg-zinc-600/10 text-zinc-400',
};

export default function LiveAppointmentsPage() {
  const [day, setDay] = useState(utcDay);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [snapshot, setSnapshot] = useState<LiveReservationDay | null>(null);
  const [phase, setPhase] = useState<'checking' | 'ready' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(true);
  const [staffFilter, setStaffFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    const client = getSupabaseClient();
    if (!client) { setPhase('error'); setMessage('Supabase is not configured.'); return; }
    if (!navigator.onLine) { setOnline(false); return; }
    setOnline(true); setPhase('checking');
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (current !== requestId.current) return;
    if (sessionError || !session) { setSignedIn(false); setSnapshot(null); setPhase('ready'); return; }
    setSignedIn(true);
    try {
      const response = await fetch(`/api/reservations?date=${day}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
      });
      const body: unknown = await response.json();
      if (current !== requestId.current) return;
      if (response.status === 401) {
        setSignedIn(false); setSnapshot(null); setPhase('ready'); setMessage('Your session expired. Sign in again.'); return;
      }
      if (response.status === 403) {
        setSnapshot(null); setPhase('error'); setMessage('An active staff membership is required.'); return;
      }
      if (!response.ok) throw new Error((body as { error?: string }).error ?? 'Appointments could not be loaded.');
      const next = normalizeLiveReservationDay(body, day);
      setSnapshot(next); setMessage(''); setPhase('ready');
      setSelectedId((id) => id && next.reservations.some((item) => item.id === id) ? id : null);
    } catch (error) {
      if (current !== requestId.current) return;
      setPhase('error'); setMessage(error instanceof Error ? error.message : 'Appointments could not be loaded.');
    }
  }, [day]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    const reconnect = () => { setOnline(true); void refresh(); };
    const disconnect = () => setOnline(false);
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', reconnect); window.addEventListener('offline', disconnect);
    document.addEventListener('visibilitychange', resume);
    return () => {
      requestId.current += 1; window.clearInterval(timer);
      window.removeEventListener('online', reconnect); window.removeEventListener('offline', disconnect);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [refresh]);

  const changeDay = (next: string) => {
    requestId.current += 1; setSnapshot(null); setSelectedId(null); setStaffFilter('all'); setDay(next);
  };
  const signIn = async (event: FormEvent) => {
    event.preventDefault(); const client = getSupabaseClient(); if (!client) return;
    setPhase('checking'); setMessage('');
    const { error } = await client.auth.signInWithPassword({ email, password });
    setPassword('');
    if (error) { setPhase('error'); setMessage('Sign-in failed. Check your credentials and try again.'); return; }
    setSignedIn(true); void refresh();
  };
  const signOut = async () => {
    requestId.current += 1; await getSupabaseClient()?.auth.signOut();
    setSignedIn(false); setSnapshot(null); setSelectedId(null); setMessage(''); setPhase('ready');
  };

  const staff = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of snapshot?.reservations ?? []) names.set(item.staff_id ?? 'unassigned', item.staff_name);
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [snapshot]);
  const rows = useMemo(() => (snapshot?.reservations ?? []).filter((item) => staffFilter === 'all' || (item.staff_id ?? 'unassigned') === staffFilter), [snapshot, staffFilter]);
  const selected = rows.find((item) => item.id === selectedId) ?? null;
  const lanes = staffFilter === 'all' ? staff : staff.filter(([id]) => id === staffFilter);

  const detail = selected && <section aria-label="Selected appointment" className="rounded-xl border border-periwinkle-400/40 bg-periwinkle-500/10 p-4">
    <h2 className="text-lg font-bold text-white">{selected.pet_name}</h2>
    <p className="mt-1 text-sm text-zinc-300">{selected.service_package}</p>
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-zinc-400">Status</dt><dd className="text-white">{statusLabel[selected.status]}</dd>
      <dt className="text-zinc-400">UTC time</dt><dd className="text-white">{time(selected.scheduled_time)}–{time(selected.reservation_end)}</dd>
      <dt className="text-zinc-400">Client</dt><dd className="text-white">{selected.client_name}</dd>
      <dt className="text-zinc-400">Groomer</dt><dd className="text-white">{selected.staff_name}</dd>
      <dt className="text-zinc-400">Source</dt><dd className="text-white">Supabase visit</dd>
    </dl>
    <button type="button" onClick={() => setSelectedId(null)} className="mt-4 min-h-11 text-sm text-periwinkle-200 underline">Close details</button>
  </section>;

  return <main className="mx-auto max-w-[1600px] px-4 pb-20 pt-6 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/dashboard" className="text-sm text-periwinkle-300 hover:text-white">← Demo command center</Link>
      {signedIn && <button type="button" onClick={signOut} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-zinc-200">Sign out</button>}
    </div>
    <header className="mt-5">
      <p className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">Authenticated staff schedule</p>
      <h1 className="mt-1 text-3xl font-extrabold text-white">Live appointments</h1>
      <p className="mt-2 text-sm text-zinc-400">Supabase visits · UTC schedule · signed-in salon only</p>
    </header>
    {!isSupabaseConfigured && <p role="alert" className="mt-6 rounded-xl border border-amber-500/30 p-4 text-amber-200">This view needs a Pawtrackr Supabase connection.</p>}
    {isSupabaseConfigured && !signedIn && phase !== 'checking' && <form onSubmit={signIn} className="glass-card mt-6 max-w-md space-y-4 p-5">
      <h2 className="text-lg font-bold text-white">Staff sign-in</h2>
      <p className="text-sm text-zinc-400">Use your provisioned staff account. Demo PINs do not grant access.</p>
      <label className="block text-sm text-zinc-200">Email<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-white" /></label>
      <label className="block text-sm text-zinc-200">Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-white" /></label>
      <button type="submit" className="min-h-11 rounded-xl bg-periwinkle-500 px-5 font-bold text-obsidian-950">Sign in</button>
    </form>}
    {signedIn && <>
      <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">
        <button type="button" aria-label="Previous UTC day" onClick={() => changeDay(shiftDay(day, -1))} className="min-h-11 min-w-11 rounded-lg border border-white/15 text-white"><ChevronLeft className="mx-auto h-4 w-4" /></button>
        <label className="sr-only" htmlFor="appointment-day">UTC date</label>
        <input id="appointment-day" type="date" value={day} onChange={(event) => event.target.value && changeDay(event.target.value)} className="min-h-11 rounded-lg border border-white/15 bg-obsidian-800 px-3 text-white" />
        <button type="button" aria-label="Next UTC day" onClick={() => changeDay(shiftDay(day, 1))} className="min-h-11 min-w-11 rounded-lg border border-white/15 text-white"><ChevronRight className="mx-auto h-4 w-4" /></button>
        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white"><RefreshCw className="h-4 w-4" /> Refresh</button>
        <span role="status" aria-live="polite" className={`ml-auto text-xs ${online && phase === 'ready' ? 'text-emerald-300' : 'text-amber-300'}`}>
          {!online ? <><WifiOff className="mr-1 inline h-3 w-3" />Offline · {snapshot ? 'last loaded day' : 'no data'}</> : phase === 'checking' ? 'Refreshing…' : phase === 'error' ? snapshot ? 'Refresh failed · last loaded day' : 'Unavailable' : 'Server snapshot'}
        </span>
      </div>
      {snapshot && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
        <span>Source: Supabase visits</span><span>Date: {snapshot.date} UTC</span>
        <span>Updated: {new Date(snapshot.as_of).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</span>
        <span>{snapshot.active_count} active · {snapshot.completed_count} completed · {snapshot.cancelled_count} canceled</span>
      </div>}
      <div className="mt-4 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_240px]">
        <aside className="hidden border-r border-white/10 pr-3 lg:block" aria-label="Groomer filters">
          <h2 className="mb-3 text-sm font-bold text-white">Groomers</h2>
          <button type="button" onClick={() => setStaffFilter('all')} className={`mb-1 min-h-11 w-full rounded-lg px-3 text-left text-sm ${staffFilter === 'all' ? 'bg-periwinkle-500/20 text-white' : 'text-zinc-300'}`}>All groomers</button>
          {staff.map(([id, name]) => <button key={id} type="button" onClick={() => { setStaffFilter(id); setSelectedId(null); }} className={`mb-1 min-h-11 w-full rounded-lg px-3 text-left text-sm ${staffFilter === id ? 'bg-periwinkle-500/20 text-white' : 'text-zinc-300'}`}>{name}</button>)}
        </aside>
        <section aria-label="UTC appointment schedule" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">{day} <span className="text-sm font-normal text-zinc-400">UTC</span></h2>
            <details className="lg:hidden"><summary className="min-h-11 cursor-pointer rounded-lg border border-white/15 px-3 py-3 text-sm text-white">Filters {staffFilter !== 'all' ? '· 1' : ''}</summary><div className="absolute right-4 z-10 mt-1 min-w-48 rounded-xl border border-white/15 bg-obsidian-800 p-2 shadow-xl"><button type="button" onClick={() => setStaffFilter('all')} className="block min-h-11 w-full text-left text-sm text-white">All groomers</button>{staff.map(([id, name]) => <button key={id} type="button" onClick={() => { setStaffFilter(id); setSelectedId(null); }} className="block min-h-11 w-full text-left text-sm text-white">{name}</button>)}</div></details>
          </div>
          {!snapshot ? <p className="rounded-xl border border-white/10 p-6 text-sm text-zinc-400">{phase === 'checking' ? 'Loading salon appointments…' : 'No server schedule is available.'}</p> : rows.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-400">No appointments for this UTC day and groomer filter.</p> : <>
            <div className="live-agenda space-y-2" aria-label="Appointment agenda">
              {rows.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-pressed={selectedId === item.id} className={`flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left ${statusClass[item.status]} ${selectedId === item.id ? 'ring-2 ring-periwinkle-400' : ''}`}>
                <span className="w-24 shrink-0 font-mono text-xs text-zinc-200">{time(item.scheduled_time)}<br />{time(item.reservation_end)}</span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{item.pet_name}</strong><span className="block truncate text-xs text-zinc-300">{item.service_package} · {item.staff_name}</span><span className="block truncate text-xs text-zinc-400">{item.client_name}</span></span>
                <span className="text-xs font-semibold">{statusLabel[item.status]}</span>
              </button>)}
              {detail && <div className="lg:hidden">{detail}</div>}
            </div>
            <div className="live-timeline hidden overflow-x-auto rounded-xl border border-white/10" aria-label="Appointment timeline">
              <div className="min-w-[960px]">
                <div className="flex border-b border-white/10 bg-obsidian-800/70"><span className="w-32 shrink-0 p-3 text-xs text-zinc-400">Groomer</span><div className="relative h-12 flex-1">{Array.from({ length: 13 }, (_, i) => <span key={i} className="absolute top-3 -translate-x-1/2 font-mono text-[10px] text-zinc-400" style={{ left: `${i * 100 / 12}%` }}>{String(i * 2).padStart(2, '0')}:00</span>)}</div></div>
                {lanes.map(([id, name]) => <div key={id} className="flex min-h-24 border-b border-white/10"><div className="w-32 shrink-0 p-3 text-sm font-semibold text-zinc-200">{name}</div><div className="relative min-h-24 flex-1 bg-[repeating-linear-gradient(to_right,transparent,transparent_calc(8.333%_-_1px),rgba(255,255,255,0.08)_calc(8.333%_-_1px),rgba(255,255,255,0.08)_8.333%)]">{rows.filter((item) => (item.staff_id ?? 'unassigned') === id).map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-pressed={selectedId === item.id} title={`${item.pet_name}: ${time(item.scheduled_time)}–${time(item.reservation_end)} UTC`} className={`absolute top-3 h-16 overflow-hidden rounded-lg border px-2 text-left text-xs ${statusClass[item.status]} ${selectedId === item.id ? 'ring-2 ring-periwinkle-400' : ''}`} style={{ left: `${minute(item.scheduled_time) / 1440 * 100}%`, width: `${Math.max(3, Math.min(1440 - minute(item.scheduled_time), (Date.parse(item.reservation_end) - Date.parse(item.scheduled_time)) / 60000) / 1440 * 100)}%` }}><strong className="block truncate text-white">{item.pet_name}</strong><span className="block truncate">{statusLabel[item.status]}</span></button>)}</div></div>)}
              </div>
            </div>
          </>}
        </section>
        <aside className="hidden border-l border-white/10 pl-3 lg:block">{detail ?? <p className="text-sm text-zinc-400">Select an appointment for details.</p>}</aside>
      </div>
      {message && <p role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{message}</p>}
    </>}
  </main>;
}
