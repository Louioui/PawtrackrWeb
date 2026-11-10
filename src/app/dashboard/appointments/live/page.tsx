'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Download, RefreshCw, WifiOff } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { LiveReservation, LiveReservationDay, liveReservationCsv, normalizeLiveReservationDay, resolveSalonLocalTime } from '@/lib/live-reservations';

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
  const [statusDraft, setStatusDraft] = useState<LiveReservation['status']>('booked');
  const [bookingPetId, setBookingPetId] = useState('');
  const [bookingStaffId, setBookingStaffId] = useState('');
  const [bookingPackageId, setBookingPackageId] = useState('');
  const [bookingTime, setBookingTime] = useState('09:00');
  const [bookingLocalDate, setBookingLocalDate] = useState(utcDay);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);
  const filterMenuRef = useRef<HTMLDetailsElement>(null);
  const bookingMenuRef = useRef<HTMLDetailsElement>(null);

  const selectStaffFilter = (nextStaffId: string) => {
    setStaffFilter(nextStaffId);
    setSelectedId((current) => {
      if (!current || nextStaffId === 'all') return current;
      const item = snapshot?.reservations.find((row) => row.id === current);
      return item && (item.staff_id ?? 'unassigned') === nextStaffId ? current : null;
    });
    filterMenuRef.current?.removeAttribute('open');
  };

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
    requestId.current += 1; setSnapshot(null); setSelectedId(null); setStaffFilter('all'); setBookingLocalDate(next); setDay(next);
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
  const firstMinute = rows.length ? Math.min(...rows.map((item) => minute(item.scheduled_time))) : 480;
  const lastMinute = rows.length ? Math.max(...rows.map((item) => Math.min(1440, minute(item.scheduled_time) + (Date.parse(item.reservation_end) - Date.parse(item.scheduled_time)) / 60000))) : 1080;
  const axisStart = Math.max(0, Math.floor(firstMinute / 60) * 60 - 60);
  const axisEnd = Math.min(1440, Math.max(axisStart + 360, Math.ceil(lastMinute / 60) * 60 + 60));
  const axisSpan = axisEnd - axisStart;
  const axisTicks = Array.from({ length: Math.floor(axisSpan / 60) + 1 }, (_, index) => axisStart + index * 60);
  const bookingOptions = snapshot?.booking_options;
  const canBook = (bookingOptions?.pets.length ?? 0) > 0 && (bookingOptions?.groomers.length ?? 0) > 0 && (bookingOptions?.services.length ?? 0) > 0;

  const exportCsv = () => {
    if (!snapshot) return;
    const csv = liveReservationCsv(snapshot, rows, online && phase === 'ready' ? 'server_snapshot' : 'last_loaded');
    const objectUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `pawtrackr-appointments-${snapshot.date}-utc.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  };

  useEffect(() => {
    if (selected) setStatusDraft(selected.status);
  }, [selected]);

  useEffect(() => {
    if (!bookingOptions) return;
    if (bookingOptions.pets.length && !bookingOptions.pets.some((item) => item.id === bookingPetId)) {
      setBookingPetId(bookingOptions.pets[0].id);
    }
    if (bookingOptions.groomers.length && !bookingOptions.groomers.some((item) => item.id === bookingStaffId)) {
      setBookingStaffId(bookingOptions.groomers[0].id);
    }
    if (bookingOptions.services.length && !bookingOptions.services.some((item) => item.id === bookingPackageId)) {
      setBookingPackageId(bookingOptions.services[0].id);
    }
  }, [bookingOptions, bookingPetId, bookingStaffId, bookingPackageId]);

  const updateStatus = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || saving || statusDraft === selected.status) return;
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(true); setMessage('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { setSignedIn(false); setSnapshot(null); setMessage('Your session expired. Sign in again.'); return; }
      const response = await fetch('/api/reservations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: selected.id, status: statusDraft }),
      });
      const body: unknown = await response.json();
      if (response.status === 401) { setSignedIn(false); setSnapshot(null); setMessage('Your session expired. Sign in again.'); return; }
      if (!response.ok) throw new Error((body as { error?: string }).error ?? 'The reservation status could not be updated.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The reservation status could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const createReservation = async (event: FormEvent) => {
    event.preventDefault();
    if (!bookingOptions || saving) return;
    const pet = bookingOptions.pets.find((item) => item.id === bookingPetId);
    const client = getSupabaseClient();
    if (!pet || !bookingStaffId || !bookingPackageId || !bookingTime || !client) return;
    const zone = bookingOptions.time_zone ?? 'UTC';
    const local = zone === 'UTC'
      ? { kind: 'ok' as const, instant: `${day}T${bookingTime}:00.000Z` }
      : resolveSalonLocalTime(bookingLocalDate, bookingTime, zone);
    if (local.kind !== 'ok') {
      setMessage(local.kind === 'ambiguous'
        ? 'This local time occurs twice when clocks change. Choose another time.'
        : 'This local date and time does not exist in the salon time zone.');
      return;
    }
    setSaving(true); setMessage('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { setSignedIn(false); setSnapshot(null); setMessage('Your session expired. Sign in again.'); return; }
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          client_id: pet.client_id,
          pet_id: pet.id,
          staff_id: bookingStaffId,
          package_id: bookingPackageId,
          scheduled_time: local.instant,
        }),
      });
      const body: unknown = await response.json();
      if (response.status === 401) { setSignedIn(false); setSnapshot(null); setMessage('Your session expired. Sign in again.'); return; }
      if (!response.ok) throw new Error((body as { error?: string }).error ?? 'The reservation could not be saved.');
      const createdId = (body as { reservation?: { id?: string } }).reservation?.id;
      if (createdId) setSelectedId(createdId);
      bookingMenuRef.current?.removeAttribute('open');
      const resultDay = local.instant.slice(0, 10);
      if (resultDay !== day) { changeDay(resultDay); if (createdId) setSelectedId(createdId); }
      else await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The reservation could not be saved.');
    } finally {
      setSaving(false);
    }
  };

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
    <form onSubmit={updateStatus} className="mt-4 flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
      <label className="block min-w-36 flex-1 text-xs text-zinc-300">Update status
        <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value as LiveReservation['status'])} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white">
          {(Object.entries(statusLabel) as [LiveReservation['status'], string][]).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </label>
      <button type="submit" disabled={saving || statusDraft === selected.status} className="min-h-11 rounded-lg bg-periwinkle-500 px-3 text-xs font-bold text-obsidian-950">{saving ? 'Saving…' : 'Save status'}</button>
    </form>
    <button type="button" onClick={() => setSelectedId(null)} className="mt-4 min-h-11 text-sm text-periwinkle-200 underline">Close details</button>
  </section>;

  return <main className="mx-auto max-w-[1600px] px-4 pb-20 pt-6 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <details className="md:hidden"><summary className="min-h-11 cursor-pointer text-sm text-periwinkle-300">Other staff views</summary><div className="mt-2 flex flex-col gap-3 pb-2">
        <Link href="/dashboard" className="text-sm text-periwinkle-300">Demo command center</Link>
        <Link href="/dashboard/clients/live" className="text-sm text-periwinkle-300">Salon clients & pets</Link>
        <Link href="/dashboard/settings/live" className="text-sm text-periwinkle-300">Live catalog & groomers</Link>
        <Link href="/dashboard/analytics/live" className="text-sm text-periwinkle-300">Recorded checkout analytics</Link>
      </div></details>
      <div className="hidden flex-wrap items-center gap-4 md:flex">
        <Link href="/dashboard" className="text-sm text-periwinkle-300 hover:text-white">← Demo command center</Link>
        <Link href="/dashboard/clients/live" className="text-sm text-periwinkle-300 hover:text-white">Salon clients & pets →</Link>
        <Link href="/dashboard/settings/live" className="text-sm text-periwinkle-300 hover:text-white">Live catalog & groomers →</Link>
        <Link href="/dashboard/analytics/live" className="text-sm text-periwinkle-300 hover:text-white">Recorded checkout analytics →</Link>
      </div>
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
        {snapshot && <button type="button" onClick={exportCsv} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white"><Download className="h-4 w-4" /> Export visible CSV</button>}
        <span role="status" aria-live="polite" className={`ml-auto text-xs ${online && phase === 'ready' ? 'text-emerald-300' : 'text-amber-300'}`}>
          {!online ? <><WifiOff className="mr-1 inline h-3 w-3" />Offline · {snapshot ? 'last loaded day' : 'no data'}</> : phase === 'checking' ? 'Refreshing…' : phase === 'error' ? snapshot ? 'Refresh failed · last loaded day' : 'Unavailable' : 'Server snapshot'}
        </span>
      </div>
      {snapshot && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
        <span>Source: Supabase visits</span><span>Date: {snapshot.date} UTC</span>
        {bookingOptions?.operating_hours && <span>Hours: {bookingOptions.operating_hours.open}–{bookingOptions.operating_hours.close} {bookingOptions.time_zone ?? 'UTC'}</span>}
        <span>Updated: {new Date(snapshot.as_of).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</span>
        <span>{snapshot.active_count} active · {snapshot.completed_count} completed · {snapshot.cancelled_count} canceled</span>
      </div>}
      {canBook && bookingOptions && <details ref={bookingMenuRef} className="mt-3 rounded-xl border border-white/10 bg-obsidian-800/60 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-periwinkle-200">New appointment</summary>
        <form onSubmit={createReservation} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-xs text-zinc-300">Pet & client
            <select value={bookingPetId} onChange={(event) => setBookingPetId(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white">
              {bookingOptions.pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.pet_name} · {pet.client_name}</option>)}
            </select>
          </label>
          <label className="block text-xs text-zinc-300">Groomer
            <select value={bookingStaffId} onChange={(event) => setBookingStaffId(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white">
              {bookingOptions.groomers.map((groomer) => <option key={groomer.id} value={groomer.id}>{groomer.name}</option>)}
            </select>
          </label>
          <label className="block text-xs text-zinc-300">Service
            <select value={bookingPackageId} onChange={(event) => setBookingPackageId(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white">
              {bookingOptions.services.map((service) => <option key={service.id} value={service.id}>{service.name} ({service.duration_minutes}m)</option>)}
            </select>
          </label>
          {bookingOptions.time_zone && bookingOptions.time_zone !== 'UTC' && <label className="block text-xs text-zinc-300">Salon local date ({bookingOptions.time_zone})
            <input type="date" required value={bookingLocalDate} onChange={(event) => setBookingLocalDate(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
          </label>}
          <label className="block text-xs text-zinc-300">{bookingOptions.time_zone && bookingOptions.time_zone !== 'UTC' ? `Salon local start time (${bookingOptions.time_zone})` : `UTC start time (${day})`}
            <input type="time" required value={bookingTime} onChange={(event) => setBookingTime(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={saving} className="min-h-11 w-full rounded-lg bg-periwinkle-500 px-4 text-sm font-bold text-obsidian-950">{saving ? 'Booking…' : 'Book visit'}</button>
          </div>
        </form>
      </details>}
      <div className="mt-4 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_240px]">
        <aside className="hidden border-r border-white/10 pr-3 lg:block" aria-label="Groomer filters">
          <h2 className="mb-3 text-sm font-bold text-white">Groomers</h2>
          <button type="button" onClick={() => selectStaffFilter('all')} className={`mb-1 min-h-11 w-full rounded-lg px-3 text-left text-sm ${staffFilter === 'all' ? 'bg-periwinkle-500/20 text-white' : 'text-zinc-300'}`}>All groomers</button>
          {staff.map(([id, name]) => <button key={id} type="button" onClick={() => selectStaffFilter(id)} className={`mb-1 min-h-11 w-full rounded-lg px-3 text-left text-sm ${staffFilter === id ? 'bg-periwinkle-500/20 text-white' : 'text-zinc-300'}`}>{name}</button>)}
        </aside>
        <section aria-label="UTC appointment schedule" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">{day} <span className="text-sm font-normal text-zinc-400">UTC</span></h2>
            <details ref={filterMenuRef} className="relative lg:hidden"><summary className="min-h-11 cursor-pointer rounded-lg border border-white/15 px-3 py-3 text-sm text-white">Filters {staffFilter !== 'all' ? '· 1' : ''}</summary><div className="absolute right-0 z-10 mt-1 min-w-48 rounded-xl border border-white/15 bg-obsidian-800 p-2 shadow-xl"><button type="button" onClick={() => selectStaffFilter('all')} className="block min-h-11 w-full rounded-lg px-2 text-left text-sm text-white">All groomers</button>{staff.map(([id, name]) => <button key={id} type="button" onClick={() => selectStaffFilter(id)} className="block min-h-11 w-full rounded-lg px-2 text-left text-sm text-white">{name}</button>)}</div></details>
          </div>
          {!snapshot ? <p className="rounded-xl border border-white/10 p-6 text-sm text-zinc-400">{phase === 'checking' ? 'Loading salon appointments…' : 'No server schedule is available.'}</p> : rows.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-400">No appointments for this UTC day and groomer filter.</p> : <>
            <section className="live-agenda space-y-2" aria-label="Appointment agenda">
              {rows.map((item) => <div key={item.id} className="space-y-2">
                <button type="button" onClick={() => setSelectedId(item.id)} aria-pressed={selectedId === item.id} className={`flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left ${statusClass[item.status]} ${selectedId === item.id ? 'ring-2 ring-periwinkle-400' : ''}`}>
                  <span className="w-24 shrink-0 font-mono text-xs text-zinc-200">{time(item.scheduled_time)}<br />{time(item.reservation_end)}</span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{item.pet_name}</strong><span className="block truncate text-xs text-zinc-300">{item.service_package} · {item.staff_name}</span><span className="block truncate text-xs text-zinc-400">{item.client_name}</span></span>
                  <span className="text-xs font-semibold">{statusLabel[item.status]}</span>
                </button>
                {selectedId === item.id && detail && <div className="lg:hidden">{detail}</div>}
              </div>)}
            </section>
            <section className="live-timeline hidden rounded-xl border border-white/10" aria-label="Appointment timeline">
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${Math.max(960, axisSpan / 60 * 125)}px` }}>
                  <div className="flex border-b border-white/10 bg-obsidian-800/70"><span className="w-32 shrink-0 p-3 text-xs text-zinc-400">Groomer</span><div className="relative h-12 flex-1">{axisTicks.map((tick) => <span key={tick} className="absolute top-3 -translate-x-1/2 font-mono text-[10px] text-zinc-400" style={{ left: `${(tick - axisStart) / axisSpan * 100}%` }}>{String(Math.floor(tick / 60)).padStart(2, '0')}:00</span>)}</div></div>
                  {lanes.map(([id, name]) => {
                    const laneRows = rows.filter((item) => (item.staff_id ?? 'unassigned') === id);
                    const trackEnds: number[] = [];
                    const placed = laneRows.map((item) => {
                      const startMin = minute(item.scheduled_time);
                      const durationMin = Math.max(15, (Date.parse(item.reservation_end) - Date.parse(item.scheduled_time)) / 60000);
                      const endMin = Math.min(1440, startMin + durationMin);
                      let track = trackEnds.findIndex((end) => end <= startMin);
                      if (track === -1) {
                        track = trackEnds.length;
                        trackEnds.push(endMin);
                      } else {
                        trackEnds[track] = endMin;
                      }
                      const leftPct = (startMin - axisStart) / axisSpan * 100;
                      const widthPct = Math.min(100 - leftPct, Math.max(3, (durationMin / axisSpan) * 100));
                      return { item, track, leftPct, widthPct };
                    });
                    const laneHeight = Math.max(96, placed.length ? trackEnds.length * 72 + 24 : 96);
                    return <div key={id} className="flex border-b border-white/10" style={{ minHeight: `${laneHeight}px` }}><div className="w-32 shrink-0 p-3 text-sm font-semibold text-zinc-200">{name}</div><div className="relative flex-1" style={{ minHeight: `${laneHeight}px`, backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: `${100 / (axisSpan / 60)}% 100%` }}>{placed.map(({ item, track, leftPct, widthPct }) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-pressed={selectedId === item.id} title={`${item.pet_name}: ${time(item.scheduled_time)}–${time(item.reservation_end)} UTC`} className={`absolute h-16 overflow-hidden rounded-lg border px-2 text-left text-xs ${statusClass[item.status]} ${selectedId === item.id ? 'ring-2 ring-periwinkle-400' : ''}`} style={{ top: `${12 + track * 72}px`, left: `${leftPct}%`, width: `${widthPct}%` }}><strong className="block truncate text-white">{item.pet_name}</strong><span className="block truncate">{statusLabel[item.status]}</span></button>)}</div></div>;
                  })}
                </div>
              </div>
              {detail && <div className="border-t border-white/10 p-3 lg:hidden">{detail}</div>}
            </section>
          </>}
        </section>
        <aside className="hidden border-l border-white/10 pl-3 lg:block">{detail ?? <p className="text-sm text-zinc-400">Select an appointment for details.</p>}</aside>
      </div>
    </>}
    {message && <p role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{message}</p>}
  </main>;
}
