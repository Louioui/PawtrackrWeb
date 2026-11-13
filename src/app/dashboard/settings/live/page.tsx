'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Flame,
  Globe,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Truck,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  LiveSalonSettings,
  LiveSettingsAddon,
  LiveSettingsPackage,
  LiveSettingsStation,
  normalizeLiveSalonSettings,
} from '@/lib/live-settings';
import { evaluateSalonReadiness, type SalonStationType } from '@/lib/salon-readiness';
import LiveWorkspaceShell from '@/components/LiveWorkspaceShell';
import ShiftEditor from './ShiftEditor';
import { SubscriptionCard } from '@/components/SubscriptionCard';

export default function LiveSalonSettingsPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [settings, setSettings] = useState<LiveSalonSettings | null>(null);
  const [phase, setPhase] = useState<'checking' | 'ready' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [statusNotice, setStatusNotice] = useState('');
  const [online, setOnline] = useState(true);

  const [taxRate, setTaxRate] = useState('8.25');
  const [bufferMins, setBufferMins] = useState('15');
  const [timeZone, setTimeZone] = useState('UTC');
  const [openTime, setOpenTime] = useState('08:00');
  const [closeTime, setCloseTime] = useState('18:00');
  const [packages, setPackages] = useState<LiveSettingsPackage[]>([]);
  const [addons, setAddons] = useState<LiveSettingsAddon[]>([]);

  const [pkgId, setPkgId] = useState('');
  const [pkgName, setPkgName] = useState('');
  const [pkgPrice, setPkgPrice] = useState('85');
  const [pkgDuration, setPkgDuration] = useState('90');

  const [addonId, setAddonId] = useState('');
  const [addonName, setAddonName] = useState('');
  const [addonPrice, setAddonPrice] = useState('18');

  const [groomerName, setGroomerName] = useState('');
  const [groomerSpecialty, setGroomerSpecialty] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingGroomer, setSavingGroomer] = useState(false);

  // Station Manager States
  const [stationName, setStationName] = useState('');
  const [stationType, setStationType] = useState<SalonStationType>('grooming_table');
  const [stationNotes, setStationNotes] = useState('');
  const [savingStation, setSavingStation] = useState(false);

  // Status & Test Booking States
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [testBookingMessage, setTestBookingMessage] = useState('');
  const [creatingTestBooking, setCreatingTestBooking] = useState(false);

  const requestId = useRef(0);
  const groomerMenuRef = useRef<HTMLDetailsElement>(null);
  const stationMenuRef = useRef<HTMLDetailsElement>(null);

  const applySnapshot = useCallback((loaded: LiveSalonSettings) => {
    setSettings(loaded);
    setTaxRate(String(loaded.tax_rate));
    setBufferMins(String(loaded.booking_buffer_mins));
    setTimeZone(loaded.time_zone);
    setOpenTime(loaded.operating_hours.open);
    setCloseTime(loaded.operating_hours.close);
    setPackages(loaded.packages);
    setAddons(loaded.addons);
  }, []);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    const client = getSupabaseClient();
    if (!client) { setPhase('error'); setMessage('Supabase is not configured.'); return; }
    if (!navigator.onLine) { setOnline(false); return; }
    setOnline(true); setPhase('checking');
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (current !== requestId.current) return;
    if (sessionError || !session) { setSignedIn(false); setSettings(null); setPhase('ready'); return; }
    setSignedIn(true);
    try {
      const response = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const body: unknown = await response.json();
      if (current !== requestId.current) return;
      if (response.status === 401) {
        setSignedIn(false); setSettings(null); setPhase('ready'); setMessage('Your session expired. Sign in again.'); return;
      }
      if (response.status === 403) {
        setSettings(null); setPhase('error'); setMessage('An active staff membership is required.'); return;
      }
      if (!response.ok) throw new Error((body as { error?: string }).error ?? 'Salon settings could not be loaded.');
      applySnapshot(normalizeLiveSalonSettings(body));
      setMessage(''); setPhase('ready');
    } catch (error) {
      if (current !== requestId.current) return;
      setPhase('error'); setMessage(error instanceof Error ? error.message : 'Salon settings could not be loaded.');
    }
  }, [applySnapshot]);

  useEffect(() => {
    void refresh();
    const reconnect = () => { setOnline(true); void refresh(); };
    const disconnect = () => setOnline(false);
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', disconnect);
    return () => {
      requestId.current += 1;
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', disconnect);
    };
  }, [refresh]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setPhase('checking'); setMessage(''); setStatusNotice('');
    const { error } = await client.auth.signInWithPassword({ email, password });
    setPassword('');
    if (error) { setPhase('error'); setMessage('Sign-in failed. Check your credentials and try again.'); return; }
    setSignedIn(true);
    void refresh();
  };

  const signOut = async () => {
    requestId.current += 1;
    await getSupabaseClient()?.auth.signOut();
    setSignedIn(false); setSettings(null); setMessage(''); setStatusNotice(''); setPhase('ready');
  };

  const readinessReport = useMemo(() => {
    if (!settings) return null;
    return evaluateSalonReadiness({
      salonName: settings.salon_name,
      slug: settings.slug,
      timeZone: settings.time_zone,
      operatingModel: settings.operating_model ?? 'salon',
      bookingStatus: settings.booking_status ?? 'draft',
      subscriptionActive: ['active', 'trialing'].includes(settings.subscription_status),
      operatingHours: settings.operating_hours,
      packages: settings.packages,
      staff: settings.groomers.map((g) => ({ id: g.id, role: 'groomer', is_active: g.is_active })),
      weeklyShifts: (settings.weekly_shifts ?? []).map((s) => ({
        staff_id: s.staff_id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        is_active: s.is_active,
      })),
      stations: (settings.stations ?? []).map((st) => ({
        id: st.id,
        name: st.name,
        station_type: st.station_type,
        is_active: st.is_active,
      })),
    });
  }, [settings]);

  const addPackageDraft = () => {
    const cleanName = pkgName.trim();
    const slugId = (pkgId.trim() || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 80);
    const price = Number(pkgPrice);
    const duration = Number(pkgDuration);
    if (!cleanName || !slugId || !Number.isFinite(price) || price < 0 || !Number.isInteger(duration) || duration < 15 || duration > 480) {
      setMessage('Enter a package name, nonnegative price, and duration between 15 and 480 minutes.');
      return;
    }
    if (packages.some((item) => item.id === slugId)) {
      setMessage('A service package with that ID already exists.');
      return;
    }
    setPackages((prev) => [...prev, { id: slugId, name: cleanName, price: Number(price.toFixed(2)), durationMinutes: duration }]);
    setPkgId(''); setPkgName(''); setMessage('');
  };

  const addAddonDraft = () => {
    const cleanName = addonName.trim();
    const slugId = (addonId.trim() || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 80);
    const price = Number(addonPrice);
    if (!cleanName || !slugId || !Number.isFinite(price) || price < 0) {
      setMessage('Enter an add-on name and a nonnegative price.');
      return;
    }
    if (addons.some((item) => item.id === slugId)) {
      setMessage('An add-on with that ID already exists.');
      return;
    }
    setAddons((prev) => [...prev, { id: slugId, name: cleanName, price: Number(price.toFixed(2)) }]);
    setAddonId(''); setAddonName(''); setMessage('');
  };

  const saveConfig = async (event: FormEvent) => {
    event.preventDefault();
    if (savingConfig) return;
    const client = getSupabaseClient();
    if (!client) return;
    setSavingConfig(true); setMessage(''); setStatusNotice('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { setSignedIn(false); setSettings(null); setMessage('Your session expired. Sign in again.'); return; }
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          tax_rate: Number(taxRate),
          booking_buffer_mins: Number(bufferMins),
          time_zone: timeZone,
          operating_hours: { open: openTime, close: closeTime },
          packages,
          addons,
        }),
      });
      const body: unknown = await response.json();
      if (response.status === 401) { setSignedIn(false); setSettings(null); setMessage('Your session expired. Sign in again.'); return; }
      if (!response.ok) throw new Error((body as { error?: string }).error ?? 'The salon settings could not be saved.');
      setStatusNotice('Salon catalog, time zone, and operating hours saved to Supabase.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The salon settings could not be saved.');
    } finally {
      setSavingConfig(false);
    }
  };

  const setBookingStatus = async (nextStatus: 'draft' | 'published' | 'paused') => {
    if (updatingStatus || !settings) return;
    const client = getSupabaseClient();
    if (!client) return;
    setUpdatingStatus(true); setMessage(''); setStatusNotice('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { setSignedIn(false); setSettings(null); setMessage('Your session expired. Sign in again.'); return; }
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          tax_rate: Number(taxRate),
          booking_buffer_mins: Number(bufferMins),
          time_zone: timeZone,
          operating_hours: { open: openTime, close: closeTime },
          packages,
          addons,
          booking_status: nextStatus,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `Booking status could not be changed to ${nextStatus}.`);
      }
      setStatusNotice(
        nextStatus === 'published'
          ? 'Salon published! Public online booking is now live.'
          : nextStatus === 'paused'
          ? 'Public booking paused. Existing appointments remain intact.'
          : 'Salon returned to draft mode.',
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to change booking status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const registerGroomer = async (event: FormEvent) => {
    event.preventDefault();
    if (savingGroomer) return;
    const client = getSupabaseClient();
    if (!client) return;
    setSavingGroomer(true); setMessage(''); setStatusNotice('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { setSignedIn(false); setSettings(null); setMessage('Your session expired. Sign in again.'); return; }
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name: groomerName,
          specialty: groomerSpecialty.trim() || null,
        }),
      });
      const body: unknown = await response.json();
      if (response.status === 401) { setSignedIn(false); setSettings(null); setMessage('Your session expired. Sign in again.'); return; }
      if (!response.ok) throw new Error((body as { error?: string }).error ?? 'The groomer could not be registered.');
      setGroomerName(''); setGroomerSpecialty('');
      groomerMenuRef.current?.removeAttribute('open');
      setStatusNotice('Groomer registered in salon roster.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The groomer could not be registered.');
    } finally {
      setSavingGroomer(false);
    }
  };

  const addStation = async (event: FormEvent) => {
    event.preventDefault();
    if (savingStation || !stationName.trim()) return;
    const client = getSupabaseClient();
    if (!client) return;
    setSavingStation(true); setMessage(''); setStatusNotice('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { setSignedIn(false); setSettings(null); setMessage('Your session expired. Sign in again.'); return; }
      const response = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name: stationName.trim(),
          station_type: stationType,
          notes: stationNotes.trim() || null,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Station could not be added.');
      setStationName(''); setStationNotes('');
      stationMenuRef.current?.removeAttribute('open');
      setStatusNotice('Salon station saved.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The station could not be added.');
    } finally {
      setSavingStation(false);
    }
  };

  const removeStation = async (id: string) => {
    const client = getSupabaseClient();
    if (!client) return;
    setMessage(''); setStatusNotice('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;
      const response = await fetch('/api/stations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Station could not be removed.');
      setStatusNotice('Station removed.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to remove station.');
    }
  };

  const runTestBooking = async () => {
    if (!settings || creatingTestBooking || packages.length === 0) return;
    setCreatingTestBooking(true);
    setTestBookingMessage('');
    try {
      // Pick first package and calculate tomorrow at open time
      const pkg = packages[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const startsAt = `${tomorrow}T${openTime}:00.000Z`;

      const response = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: settings.slug,
          package_id: pkg.id,
          starts_at: startsAt,
          client_name: '[TEST] Verified Owner Walkthrough',
          client_phone: '555-0199',
          client_email: 'owner-test@pawtrackr.com',
          pet_name: 'Pawsley [TEST]',
          breed: 'Standard Poodle',
          is_test_booking: true,
          idempotency_key: crypto.randomUUID(),
        }),
      });

      const body = await response.json() as { booking?: { reference?: string }; error?: string };
      if (!response.ok || !body.booking?.reference) {
        throw new Error(body.error ?? 'Test booking could not be placed.');
      }
      setTestBookingMessage(
        `Test booking placed! Reference: ${body.booking.reference}. View it in Live Appointments with the [TEST] indicator.`,
      );
      await refresh();
    } catch (error) {
      setTestBookingMessage(error instanceof Error ? error.message : 'Test booking failed.');
    } finally {
      setCreatingTestBooking(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
      {signedIn && settings && (
        <LiveWorkspaceShell
          salonName={settings.salon_name}
          slug={settings.slug}
          operatingModel={settings.operating_model}
          bookingStatus={settings.booking_status}
          onSignOut={signOut}
        />
      )}

      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
          Authenticated salon configuration
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-white">Live catalog, hours & groomers</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Configure Supabase operating hours, service packages, booking buffers, active groomers, and station resources.
          Saved changes immediately update live appointment booking and the public salon catalog.
        </p>
      </header>

      {!isSupabaseConfigured && (
        <p role="alert" className="glass-card p-5 text-amber-300">
          This view needs a Pawtrackr Supabase connection.
        </p>
      )}

      {isSupabaseConfigured && !signedIn && phase !== 'checking' && (
        <form onSubmit={signIn} className="glass-card max-w-md space-y-4 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-white">Staff sign-in</h2>
          <p className="text-sm text-zinc-400">Use your provisioned Pawtrackr staff account. Demo PINs do not grant access.</p>
          <label className="block text-sm text-zinc-200">
            Email
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-white"
            />
          </label>
          <label className="block text-sm text-zinc-200">
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-white"
            />
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-periwinkle-500 px-5 font-bold text-obsidian-950">
            Sign in
          </button>
        </form>
      )}

      {signedIn && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm text-zinc-200 hover:text-white"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              {settings && (
                <Link
                  href={`/portal/live/${settings.slug}`}
                  target="_blank"
                  className="text-xs text-periwinkle-300 hover:text-white"
                >
                  View public catalog ({settings.slug}) →
                </Link>
              )}
            </div>
            <span
              role="status"
              aria-live="polite"
              className={`text-xs ${online && phase === 'ready' ? 'text-emerald-300' : 'text-amber-300'}`}
            >
              {!online ? (
                <>
                  <WifiOff className="mr-1 inline h-3 w-3" />
                  {settings ? 'Offline · last loaded settings' : 'Offline · no settings'}
                </>
              ) : phase === 'checking' ? (
                'Refreshing…'
              ) : phase === 'error' ? (
                settings ? 'Refresh failed · last loaded settings' : 'Settings unavailable'
              ) : (
                'Server snapshot'
              )}
            </span>
          </div>

          {statusNotice && (
            <p role="status" className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {statusNotice}
            </p>
          )}

          {!settings ? (
            <p className="glass-card p-5 text-sm text-zinc-400">
              {phase === 'checking' ? 'Loading salon configuration…' : 'No server settings are available.'}
            </p>
          ) : (
            <div className="space-y-6">
              {/* READINESS CHECKLIST & LAUNCH CENTER (WF03, WF32) */}
              {readinessReport && (
                <section className="glass-card p-5 sm:p-6" aria-labelledby="readiness-heading">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 id="readiness-heading" className="text-xl font-bold text-white">
                        Launch & Booking Readiness
                      </h2>
                      <p className="mt-1 text-xs text-zinc-400">
                        Online booking requires 6 operational prerequisites. Once satisfied, the salon owner can publish public booking.
                      </p>
                    </div>

                    {/* Publish / Pause / Resume Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                      {settings.booking_status === 'draft' && (
                        <button
                          type="button"
                          disabled={!readinessReport.canPublish || updatingStatus}
                          onClick={() => void setBookingStatus('published')}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-obsidian-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Play className="h-4 w-4" />
                          {updatingStatus ? 'Publishing…' : 'Publish online booking'}
                        </button>
                      )}

                      {settings.booking_status === 'published' && (
                        <button
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => void setBookingStatus('paused')}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 text-xs font-bold text-amber-200 hover:bg-amber-400/20"
                        >
                          <Pause className="h-4 w-4" />
                          {updatingStatus ? 'Pausing…' : 'Pause public booking'}
                        </button>
                      )}

                      {settings.booking_status === 'paused' && (
                        <button
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => void setBookingStatus('published')}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-obsidian-950 hover:bg-emerald-400"
                        >
                          <Play className="h-4 w-4" />
                          {updatingStatus ? 'Resuming…' : 'Resume public booking'}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={creatingTestBooking || packages.length === 0}
                        onClick={() => void runTestBooking()}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-periwinkle-400/30 bg-periwinkle-400/10 px-3.5 text-xs font-semibold text-periwinkle-200 hover:bg-periwinkle-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Flame className="h-3.5 w-3.5 text-periwinkle-300" />
                        {creatingTestBooking ? 'Booking…' : 'Send test booking'}
                      </button>
                    </div>
                  </div>

                  {testBookingMessage && (
                    <p
                      role="status"
                      className="mt-3 rounded-lg border border-periwinkle-400/40 bg-periwinkle-400/10 p-3 text-xs text-periwinkle-200"
                    >
                      {testBookingMessage}
                    </p>
                  )}

                  {/* 6 Readiness Checks */}
                  <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {readinessReport.checks.map((check) => (
                      <div
                        key={check.id}
                        className={`rounded-xl border p-3.5 text-xs transition-colors ${
                          check.passed
                            ? 'border-emerald-500/20 bg-emerald-500/5 text-zinc-300'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {check.passed ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                          )}
                          <span className="font-semibold text-white">{check.label}</span>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{check.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* SALON STATIONS MANAGER (WF01, WF03, WF31) */}
              <section id="stations-section" className="glass-card p-5 sm:p-6" aria-labelledby="workspaces-heading">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <h2 id="workspaces-heading" className="text-xl font-bold text-white">
                      Salon physical workspaces
                    </h2>
                    <p className="mt-1 text-xs text-zinc-400">
                      Grooming tables, bathing tubs, van bays, and suites. Active shifts and visits reserve a station to prevent double-booking.
                    </p>
                  </div>
                  <span className="text-xs text-zinc-400">
                    {(settings.stations ?? []).length} station{(settings.stations ?? []).length === 1 ? '' : 's'}
                  </span>
                </div>

                <details ref={stationMenuRef} className="mt-4 rounded-xl border border-white/10 bg-obsidian-800/60 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-periwinkle-200">
                    + Add station or van bay
                  </summary>
                  <form onSubmit={addStation} className="mt-3 grid gap-3 sm:grid-cols-4">
                    <label className="block text-xs text-zinc-300">
                      Resource name
                      <input
                        type="text"
                        required
                        value={stationName}
                        onChange={(e) => setStationName(e.target.value)}
                        placeholder="Table 1, Tub Alpha, Van 101"
                        className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white"
                      />
                    </label>
                    <label className="block text-xs text-zinc-300">
                      Equipment category
                      <select
                        aria-label="Equipment category"
                        value={stationType}
                        onChange={(e) => setStationType(e.target.value as SalonStationType)}
                        className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white"
                      >
                        <option value="grooming_table">Grooming Table</option>
                        <option value="bathing_tub">Bathing Tub</option>
                        <option value="drying_station">Drying Area</option>
                        <option value="van_bay">Mobile Van Bay</option>
                        <option value="holding_suite">Holding Suite / Kennel</option>
                      </select>
                    </label>
                    <label className="block text-xs text-zinc-300">
                      Notes (optional)
                      <input
                        type="text"
                        value={stationNotes}
                        onChange={(e) => setStationNotes(e.target.value)}
                        placeholder="Electric lift, hydraulic"
                        className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={savingStation}
                        className="min-h-11 w-full rounded-lg bg-periwinkle-500 px-4 text-sm font-bold text-obsidian-950"
                      >
                        {savingStation ? 'Saving…' : 'Save station'}
                      </button>
                    </div>
                  </form>
                </details>

                {(settings.stations ?? []).length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-400">
                    No stations are registered yet. Add at least one table or van bay to enable appointment booking.
                  </p>
                ) : (
                  <div tabIndex={0} role="region" aria-label="Salon stations table" className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Registered salon stations</caption>
                      <thead>
                        <tr className="border-b border-white/10 text-left text-zinc-400">
                          <th scope="col" className="py-2 pr-4">Station</th>
                          <th scope="col" className="py-2 pr-4">Type</th>
                          <th scope="col" className="py-2 pr-4">Status</th>
                          <th scope="col" className="py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(settings.stations ?? []).map((station) => (
                          <tr key={station.id} className="border-b border-white/10 text-zinc-200">
                            <th scope="row" className="py-3 pr-4 text-left font-semibold text-white">
                              {station.name}
                              {station.notes && (
                                <span className="block font-normal text-xs text-zinc-400">{station.notes}</span>
                              )}
                            </th>
                            <td className="py-3 pr-4 font-mono text-xs">{station.station_type.replace('_', ' ')}</td>
                            <td className="py-3 pr-4 font-mono text-xs">
                              {station.is_active ? (
                                <span className="text-emerald-300">Active</span>
                              ) : (
                                <span className="text-zinc-500">Inactive</span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                onClick={() => void removeStation(station.id)}
                                aria-label={`Remove station ${station.name}`}
                                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/15 px-2.5 text-xs text-zinc-300 hover:text-white"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* CORE SALON CONFIGURATION */}
              <section id="hours-section" className="glass-card p-5 sm:p-6" aria-labelledby="salon-config-heading">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <h2 id="salon-config-heading" className="text-xl font-bold text-white">{settings.salon_name}</h2>
                    <p className="mt-1 text-xs text-zinc-400">
                      Slug: <span className="font-mono text-zinc-200">{settings.slug}</span> · Model: <span className="font-mono text-zinc-200">{settings.operating_model ?? 'salon'}</span> · Status: <span className="font-mono text-zinc-200">{settings.booking_status ?? 'draft'}</span>
                    </p>
                  </div>
                  <span className="text-xs text-zinc-400">{packages.length} package{packages.length === 1 ? '' : 's'} · {addons.length} add-on{addons.length === 1 ? '' : 's'}</span>
                </div>

                <form onSubmit={saveConfig} className="mt-5 space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="block text-xs text-zinc-300">Salon time zone (IANA)
                      <input type="text" required value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="America/Los_Angeles" className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
                    </label>
                    <label className="block text-xs text-zinc-300">Local open time (HH:MM)
                      <input type="text" required pattern="[0-2][0-9]:[0-5][0-9]" value={openTime} onChange={(event) => setOpenTime(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
                    </label>
                    <label className="block text-xs text-zinc-300">Local close time (HH:MM)
                      <input type="text" required pattern="[0-2][0-9]:[0-5][0-9]" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
                    </label>
                    <label className="block text-xs text-zinc-300">Turnaround buffer (mins)
                      <input type="number" required min="0" max="240" step="1" value={bufferMins} onChange={(event) => setBufferMins(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
                    </label>
                    <label className="block text-xs text-zinc-300">Tax rate (%)
                      <input type="number" required min="0" max="30" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
                    </label>
                  </div>

                  <div id="services-section" className="border-t border-white/10 pt-5">
                    <h3 className="text-sm font-bold text-white">Service packages</h3>
                    <div className="mt-3 space-y-2">
                      {packages.length === 0 ? <p className="text-xs text-zinc-400">No service packages configured yet.</p> : packages.map((pkg) => (
                        <div key={pkg.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-obsidian-900/70 px-3 py-2 text-sm">
                          <div>
                            <span className="font-semibold text-white">{pkg.name}</span>
                            <span className="ml-2 font-mono text-xs text-zinc-400">({pkg.id} · {pkg.durationMinutes} min · ${pkg.price.toFixed(2)})</span>
                          </div>
                          <button type="button" onClick={() => setPackages((prev) => prev.filter((item) => item.id !== pkg.id))} aria-label={`Remove package ${pkg.name}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/15 px-2.5 text-xs text-zinc-300 hover:text-white">
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      <label className="block text-xs text-zinc-300">Package name
                        <input type="text" value={pkgName} onChange={(event) => setPkgName(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
                      </label>
                      <label className="block text-xs text-zinc-300">Package ID (optional)
                        <input type="text" value={pkgId} onChange={(event) => setPkgId(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
                      </label>
                      <label className="block text-xs text-zinc-300">Price (USD)
                        <input type="number" min="0" max="10000" step="0.01" value={pkgPrice} onChange={(event) => setPkgPrice(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
                      </label>
                      <label className="block text-xs text-zinc-300">Duration (mins)
                        <input type="number" min="15" max="480" step="5" value={pkgDuration} onChange={(event) => setPkgDuration(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
                      </label>
                      <div className="flex items-end">
                        <button type="button" onClick={addPackageDraft} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-periwinkle-400/40 bg-periwinkle-500/15 px-3 text-xs font-bold text-periwinkle-200">
                          <Plus className="h-3.5 w-3.5" /> Add package
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-5">
                    <h3 className="text-sm font-bold text-white">Spa add-ons</h3>
                    <div className="mt-3 space-y-2">
                      {addons.length === 0 ? <p className="text-xs text-zinc-400">No spa add-ons configured yet.</p> : addons.map((addon) => (
                        <div key={addon.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-obsidian-900/70 px-3 py-2 text-sm">
                          <div>
                            <span className="font-semibold text-white">{addon.name}</span>
                            <span className="ml-2 font-mono text-xs text-zinc-400">({addon.id} · ${addon.price.toFixed(2)})</span>
                          </div>
                          <button type="button" onClick={() => setAddons((prev) => prev.filter((item) => item.id !== addon.id))} aria-label={`Remove add-on ${addon.name}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/15 px-2.5 text-xs text-zinc-300 hover:text-white">
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="block text-xs text-zinc-300">Add-on name
                        <input type="text" value={addonName} onChange={(event) => setAddonName(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
                      </label>
                      <label className="block text-xs text-zinc-300">Add-on ID (optional)
                        <input type="text" value={addonId} onChange={(event) => setAddonId(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
                      </label>
                      <label className="block text-xs text-zinc-300">Add-on price (USD)
                        <input type="number" min="0" max="10000" step="0.01" value={addonPrice} onChange={(event) => setAddonPrice(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
                      </label>
                      <div className="flex items-end">
                        <button type="button" onClick={addAddonDraft} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-periwinkle-400/40 bg-periwinkle-500/15 px-3 text-xs font-bold text-periwinkle-200">
                          <Plus className="h-3.5 w-3.5" /> Add add-on
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <button type="submit" disabled={savingConfig} className="min-h-11 rounded-xl bg-periwinkle-500 px-5 text-sm font-bold text-obsidian-950">
                      {savingConfig ? 'Saving settings…' : 'Save salon settings'}
                    </button>
                  </div>
                </form>
              </section>

              {/* ROSTER MANAGEMENT */}
              <section id="groomers-section" className="glass-card p-5 sm:p-6" aria-labelledby="groomer-roster-heading">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id="groomer-roster-heading" className="text-xl font-bold text-white">Salon groomers</h2>
                  <span className="text-xs text-zinc-400">{settings.groomers.length} groomer{settings.groomers.length === 1 ? '' : 's'}</span>
                </div>

                <details ref={groomerMenuRef} className="mt-4 rounded-xl border border-white/10 bg-obsidian-800/60 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-periwinkle-200">Register groomer</summary>
                  <form onSubmit={registerGroomer} className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block text-xs text-zinc-300">Groomer name
                      <input type="text" required value={groomerName} onChange={(event) => setGroomerName(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
                    </label>
                    <label className="block text-xs text-zinc-300">Specialty (optional)
                      <input type="text" value={groomerSpecialty} onChange={(event) => setGroomerSpecialty(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
                    </label>
                    <div className="flex items-end">
                      <button type="submit" disabled={savingGroomer} className="min-h-11 w-full rounded-lg bg-periwinkle-500 px-4 text-sm font-bold text-obsidian-950">
                        {savingGroomer ? 'Saving…' : 'Save groomer'}
                      </button>
                    </div>
                  </form>
                </details>

                {settings.groomers.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-400">
                    No groomers are registered for this salon yet.
                  </p>
                ) : (
                  <div tabIndex={0} role="region" aria-label="Salon groomer roster table" className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Registered salon groomers</caption>
                      <thead>
                        <tr className="border-b border-white/10 text-left text-zinc-400">
                          <th scope="col" className="py-2 pr-4">Groomer</th>
                          <th scope="col" className="py-2 pr-4">Specialty</th>
                          <th scope="col" className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settings.groomers.map((groomer) => (
                          <tr key={groomer.id} className="border-b border-white/10 text-zinc-200">
                            <th scope="row" className="py-3 pr-4 text-left font-semibold text-white">{groomer.name}</th>
                            <td className="py-3 pr-4">{groomer.specialty ?? 'General grooming'}</td>
                            <td className="py-3 font-mono text-xs">{groomer.is_active ? 'Active' : 'Inactive'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* RECURRING & DATED SHIFTS */}
              <ShiftEditor settings={settings} />

              {/* SALON SUBSCRIPTION BILLING */}
              <SubscriptionCard status={settings.subscription_status} />

              {/* SUBSYSTEM HONESTY BADGES */}
              {readinessReport && (
                <section className="glass-card p-5 text-xs text-zinc-400" aria-label="Subsystem capability status">
                  <div className="flex items-center gap-2 text-zinc-300 font-bold uppercase tracking-wider text-[11px]">
                    <ShieldCheck className="h-4 w-4 text-periwinkle-300" aria-hidden="true" />
                    Subsystem Capability Honesty Badges
                  </div>
                  <ul role="list" className="mt-3 divide-y divide-white/10">
                    {readinessReport.capabilities.map((cap) => (
                      <li key={cap.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div>
                          <p className="text-zinc-200 font-medium">{cap.label}</p>
                          <p className="text-zinc-400 text-[11px]">{cap.summary}</p>
                        </div>
                        <span
                          className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${
                            cap.status === 'ready'
                              ? 'bg-emerald-400/15 text-emerald-300'
                              : cap.status === 'partly_ready'
                              ? 'bg-sky-400/15 text-sky-300'
                              : cap.status === 'not_connected'
                              ? 'bg-zinc-500/20 text-zinc-400'
                              : 'bg-amber-400/15 text-amber-300'
                          }`}
                        >
                          {cap.status.replace('_', ' ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </>
      )}
      {message && <p role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{message}</p>}
    </main>
  );
}
