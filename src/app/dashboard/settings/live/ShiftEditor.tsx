'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { salonLocalDate } from '@/lib/live-reservations';
import type { LiveSalonSettings } from '@/lib/live-settings';

type Shift = {
  id: string;
  staff_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'time_off' | 'completed';
  assigned_station: string;
};

export default function ShiftEditor({ settings }: { settings: LiveSalonSettings }) {
  const [date, setDate] = useState(() => salonLocalDate(new Date(), settings.time_zone) ?? new Date().toISOString().slice(0, 10));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [groomerId, setGroomerId] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [status, setStatus] = useState<'scheduled' | 'time_off'>('scheduled');
  const [station, setStation] = useState('Salon');
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    const client = getSupabaseClient();
    if (!client) { setPhase('error'); setMessage('Supabase is not configured.'); return; }
    if (!navigator.onLine) { setPhase('error'); setMessage('Reconnect to load current shifts.'); return; }
    setPhase('loading');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Your session expired. Sign in again.');
      const response = await fetch(`/api/shifts?date=${date}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
      });
      const body = await response.json() as { error?: string; shifts?: Shift[]; business_id?: string; date?: string };
      if (current !== requestId.current) return;
      if (!response.ok) throw new Error(body.error ?? 'Shifts could not be loaded.');
      if (body.business_id !== settings.business_id || body.date !== date || !Array.isArray(body.shifts)) throw new Error('Invalid shift snapshot.');
      setShifts(body.shifts); setMessage(''); setPhase('ready');
    } catch (error) {
      if (current !== requestId.current) return;
      setPhase('error'); setMessage(error instanceof Error ? error.message : 'Shifts could not be loaded.');
    }
  }, [date, settings.business_id]);

  useEffect(() => { void refresh(); return () => { requestId.current += 1; }; }, [refresh]);
  useEffect(() => {
    const first = settings.groomers.find((item) => item.is_active);
    if (first && !settings.groomers.some((item) => item.id === groomerId && item.is_active)) setGroomerId(first.id);
  }, [groomerId, settings.groomers]);

  const request = async (method: 'POST' | 'DELETE', body: unknown) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase is not configured.');
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('Your session expired. Sign in again.');
    const response = await fetch('/api/shifts', {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'Shift update failed.');
  };

  const addShift = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !groomerId) return;
    setSaving(true); setMessage('');
    try {
      await request('POST', { staff_id: groomerId, shift_date: date, start_time: start, end_time: end,
        status, assigned_station: status === 'time_off' ? 'Time off' : station });
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Shift could not be saved.'); }
    finally { setSaving(false); }
  };

  const removeShift = async (id: string) => {
    if (saving) return;
    setSaving(true); setMessage('');
    try { await request('DELETE', { id }); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Shift could not be removed.'); }
    finally { setSaving(false); }
  };

  const groomerName = new Map(settings.groomers.map((item) => [item.id, item.name]));
  return <section className="glass-card p-5 sm:p-6" aria-labelledby="shift-editor-heading">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div><h2 id="shift-editor-heading" className="text-xl font-bold text-white">Groomer shifts</h2>
        <p className="mt-1 text-xs text-zinc-400">Local times in {settings.time_zone}. Time off blocks appointments. When shifts exist for a groomer on a date, bookings must fit a scheduled shift.</p></div>
      <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-lg border border-white/15 px-3 text-sm text-white">Refresh shifts</button>
    </div>
    <label className="mt-4 block max-w-xs text-xs text-zinc-300">Shift date
      <input type="date" value={date} onChange={(event) => { setShifts([]); setDate(event.target.value); }} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
    </label>
    <p role="status" className="mt-3 text-xs text-zinc-400">{phase === 'loading' ? 'Loading shifts…' : phase === 'error' ? 'Shifts unavailable' : `Source: Supabase staff shifts · ${shifts.length} for ${date}`}</p>
    {message && <p role="alert" className="mt-3 rounded-lg border border-amber-500/30 p-3 text-sm text-amber-200">{message}</p>}
    {phase === 'ready' && (shifts.length === 0 ? <p className="mt-3 text-sm text-zinc-400">No shifts recorded for this local date. Salon hours currently govern booking.</p>
      : <ul className="mt-3 space-y-2">{shifts.map((shift) => <li key={shift.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200">
        <span><strong className="text-white">{groomerName.get(shift.staff_id) ?? 'Unknown groomer'}</strong> · {shift.status === 'time_off' ? 'Time off' : shift.status === 'completed' ? 'Completed' : `${shift.start_time}–${shift.end_time}`} {shift.status === 'scheduled' && `· ${shift.assigned_station}`}</span>
        <button type="button" aria-label={`Remove ${groomerName.get(shift.staff_id) ?? 'groomer'} shift on ${shift.shift_date}`} disabled={saving} onClick={() => void removeShift(shift.id)} className="min-h-11 rounded-lg border border-white/15 px-3 text-xs text-white">Remove</button>
      </li>)}</ul>)}
    {settings.groomers.some((item) => item.is_active) && <form onSubmit={addShift} className="mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-6">
      <label className="text-xs text-zinc-300">Groomer<select value={groomerId} onChange={(event) => setGroomerId(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white">{settings.groomers.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs text-zinc-300">Type<select value={status} onChange={(event) => setStatus(event.target.value as 'scheduled' | 'time_off')} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white"><option value="scheduled">Scheduled</option><option value="time_off">Time off</option></select></label>
      <label className="text-xs text-zinc-300">Local start<input type="time" required value={start} onChange={(event) => setStart(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white" /></label>
      <label className="text-xs text-zinc-300">Local end<input type="time" required value={end} onChange={(event) => setEnd(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white" /></label>
      <label className="text-xs text-zinc-300">Station<input type="text" required maxLength={80} disabled={status === 'time_off'} value={station} onChange={(event) => setStation(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white" /></label>
      <div className="flex items-end"><button type="submit" disabled={saving || phase !== 'ready'} className="min-h-11 w-full rounded-lg bg-periwinkle-500 px-3 text-sm font-bold text-obsidian-950">{saving ? 'Saving…' : 'Add shift'}</button></div>
    </form>}
  </section>;
}
