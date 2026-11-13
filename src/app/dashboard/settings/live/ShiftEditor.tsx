'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { salonLocalDate } from '@/lib/live-reservations';
import type { LiveSalonSettings, LiveSettingsWeeklyShift } from '@/lib/live-settings';

type Shift = {
  id: string;
  staff_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'time_off' | 'completed';
  assigned_station: string;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export default function ShiftEditor({ settings }: { settings: LiveSalonSettings }) {
  // Dated shift states
  const [date, setDate] = useState(() => salonLocalDate(new Date(), settings.time_zone) ?? new Date().toISOString().slice(0, 10));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [groomerId, setGroomerId] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [status, setStatus] = useState<'scheduled' | 'time_off'>('scheduled');
  const [station, setStation] = useState('Salon');

  // Weekly recurring shift states
  const [weeklyShifts, setWeeklyShifts] = useState<LiveSettingsWeeklyShift[]>(settings.weekly_shifts ?? []);
  const [weeklyDayOfWeek, setWeeklyDayOfWeek] = useState(1);
  const [weeklyGroomerId, setWeeklyGroomerId] = useState('');
  const [weeklyStart, setWeeklyStart] = useState('09:00');
  const [weeklyEnd, setWeeklyEnd] = useState('17:00');
  const [weeklyStationId, setWeeklyStationId] = useState('');

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  const activeStations = (settings.stations ?? []).filter((s) => s.is_active);
  const activeGroomers = settings.groomers.filter((item) => item.is_active);

  useEffect(() => {
    const first = settings.groomers.find((item) => item.is_active);
    if (first && !settings.groomers.some((item) => item.id === groomerId && item.is_active)) {
      setGroomerId(first.id);
    }
    if (first && !settings.groomers.some((item) => item.id === weeklyGroomerId && item.is_active)) {
      setWeeklyGroomerId(first.id);
    }
  }, [groomerId, weeklyGroomerId, settings.groomers]);

  useEffect(() => {
    if (Array.isArray(settings.weekly_shifts)) {
      setWeeklyShifts(settings.weekly_shifts);
    }
  }, [settings.weekly_shifts]);

  const refreshDatedShifts = useCallback(async () => {
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

  const refreshWeeklyShifts = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;
      const response = await fetch('/api/shifts?type=weekly', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const body = await response.json() as { weekly_shifts?: LiveSettingsWeeklyShift[] };
      if (response.ok && Array.isArray(body.weekly_shifts)) {
        setWeeklyShifts(body.weekly_shifts);
      }
    } catch {
      // Ignored
    }
  }, []);

  useEffect(() => {
    void refreshDatedShifts();
    void refreshWeeklyShifts();
    return () => { requestId.current += 1; };
  }, [refreshDatedShifts, refreshWeeklyShifts]);

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

  const addDatedShift = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !groomerId) return;
    setSaving(true); setMessage('');
    try {
      await request('POST', {
        staff_id: groomerId, shift_date: date, start_time: start, end_time: end,
        status, assigned_station: status === 'time_off' ? 'Time off' : station,
      });
      await refreshDatedShifts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Shift could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const removeDatedShift = async (id: string) => {
    if (saving) return;
    setSaving(true); setMessage('');
    try {
      await request('DELETE', { id });
      await refreshDatedShifts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Shift could not be removed.');
    } finally {
      setSaving(false);
    }
  };

  const addWeeklyShift = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !weeklyGroomerId) return;
    setSaving(true); setMessage('');
    try {
      await request('POST', {
        type: 'weekly',
        staff_id: weeklyGroomerId,
        day_of_week: weeklyDayOfWeek,
        start_time: weeklyStart,
        end_time: weeklyEnd,
        station_id: weeklyStationId || null,
      });
      await refreshWeeklyShifts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Weekly shift could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const removeWeeklyShift = async (id: string) => {
    if (saving) return;
    setSaving(true); setMessage('');
    try {
      await request('DELETE', { type: 'weekly', id });
      await refreshWeeklyShifts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Weekly shift could not be removed.');
    } finally {
      setSaving(false);
    }
  };

  const groomerName = new Map(settings.groomers.map((item) => [item.id, item.name]));
  const stationNameMap = new Map((settings.stations ?? []).map((s) => [s.id, s.name]));

  return (
    <section className="glass-card p-5 sm:p-6" aria-labelledby="shift-editor-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="shift-editor-heading" className="text-xl font-bold text-white">Groomer shifts</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Local times in {settings.time_zone}. Time off blocks appointments. When shifts exist for a groomer on a date, bookings must fit a scheduled shift.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void refreshDatedShifts(); void refreshWeeklyShifts(); }}
          className="min-h-11 rounded-lg border border-white/15 px-3 text-sm text-white"
        >
          Refresh shifts
        </button>
      </div>

      <label className="mt-4 block max-w-xs text-xs text-zinc-300">
        Shift date
        <input
          type="date"
          value={date}
          onChange={(event) => { setShifts([]); setDate(event.target.value); }}
          className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white"
        />
      </label>

      <p role="status" className="mt-3 text-xs text-zinc-400">
        {phase === 'loading' ? 'Loading shifts…' : phase === 'error' ? 'Shifts unavailable' : `Source: Supabase staff shifts · ${shifts.length} for ${date}`}
      </p>

      {message && <p role="alert" className="mt-3 rounded-lg border border-amber-500/30 p-3 text-sm text-amber-200">{message}</p>}

      {phase === 'ready' && (
        shifts.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            No shifts recorded for this local date. Salon hours currently govern booking.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {shifts.map((shift) => (
              <li
                key={shift.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200"
              >
                <span>
                  <strong className="text-white">{groomerName.get(shift.staff_id) ?? 'Unknown groomer'}</strong>{' '}
                  ·{' '}
                  {shift.status === 'time_off'
                    ? 'Time off'
                    : shift.status === 'completed'
                    ? 'Completed'
                    : `${shift.start_time}–${shift.end_time}`}{' '}
                  {shift.status === 'scheduled' && `· ${shift.assigned_station}`}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${groomerName.get(shift.staff_id) ?? 'groomer'} shift on ${shift.shift_date}`}
                  disabled={saving}
                  onClick={() => void removeDatedShift(shift.id)}
                  className="min-h-11 rounded-lg border border-white/15 px-3 text-xs text-white"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {settings.groomers.some((item) => item.is_active) && (
        <form onSubmit={addDatedShift} className="mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-xs text-zinc-300">
            Groomer
            <select
              value={groomerId}
              onChange={(event) => setGroomerId(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white"
            >
              {settings.groomers.filter((item) => item.is_active).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-300">
            Type
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'scheduled' | 'time_off')}
              className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white"
            >
              <option value="scheduled">Scheduled</option>
              <option value="time_off">Time off</option>
            </select>
          </label>
          <label className="text-xs text-zinc-300">
            Local start
            <input
              type="time"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Local end
            <input
              type="time"
              required
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Station
            <input
              type="text"
              required
              maxLength={80}
              disabled={status === 'time_off'}
              value={station}
              onChange={(event) => setStation(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving || phase !== 'ready'}
              className="min-h-11 w-full rounded-lg bg-periwinkle-500 px-3 text-sm font-bold text-obsidian-950"
            >
              {saving ? 'Saving…' : 'Add shift'}
            </button>
          </div>
        </form>
      )}

      {/* RECURRING WEEKLY SHIFTS SECTION (WF01, WF03) */}
      <details className="mt-6 rounded-xl border border-white/10 bg-obsidian-800/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-periwinkle-200">
          Recurring weekly shift templates ({weeklyShifts.length})
        </summary>
        <p className="mt-2 text-xs text-zinc-400">
          Recurring shifts repeat weekly to automatically open online booking slots.
        </p>

        {weeklyShifts.length > 0 && (
          <ul className="mt-3 space-y-2">
            {weeklyShifts.map((shift) => (
              <li
                key={shift.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-obsidian-900/60 px-3 py-2 text-sm text-zinc-200"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-periwinkle-400/15 px-2 py-0.5 font-mono text-xs font-bold text-periwinkle-300">
                    {DAY_NAMES[shift.day_of_week] ?? `Day ${shift.day_of_week}`}
                  </span>
                  <strong className="text-white">
                    {groomerName.get(shift.staff_id) ?? 'Unknown groomer'}
                  </strong>
                  <span className="font-mono text-xs text-zinc-400">
                    {shift.start_time}–{shift.end_time}
                  </span>
                  {shift.station_id && (
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-zinc-300">
                      Workspace: {stationNameMap.get(shift.station_id) ?? shift.station_id}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void removeWeeklyShift(shift.id)}
                  aria-label={`Remove weekly shift on ${DAY_NAMES[shift.day_of_week]}`}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/15 px-2.5 text-xs text-zinc-300 hover:text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {activeGroomers.length > 0 && (
          <form onSubmit={addWeeklyShift} className="mt-4 grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="text-xs text-zinc-300">
              Day of week
              <select
                value={weeklyDayOfWeek}
                onChange={(e) => setWeeklyDayOfWeek(Number(e.target.value))}
                className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white"
              >
                {DAY_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>{name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-300">
              Staff member
              <select
                value={weeklyGroomerId}
                onChange={(e) => setWeeklyGroomerId(e.target.value)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white"
              >
                {activeGroomers.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-300">
              Start time
              <input
                type="time"
                required
                value={weeklyStart}
                onChange={(e) => setWeeklyStart(e.target.value)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-300">
              End time
              <input
                type="time"
                required
                value={weeklyEnd}
                onChange={(e) => setWeeklyEnd(e.target.value)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-300">
              Assigned workspace
              <select
                value={weeklyStationId}
                onChange={(e) => setWeeklyStationId(e.target.value)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 text-sm text-white"
              >
                <option value="">No specific workspace</option>
                {activeStations.map((st) => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-periwinkle-500 px-3 text-sm font-bold text-obsidian-950"
              >
                <Plus className="h-4 w-4" />
                {saving ? 'Saving…' : 'Add weekly shift'}
              </button>
            </div>
          </form>
        )}
      </details>
    </section>
  );
}
