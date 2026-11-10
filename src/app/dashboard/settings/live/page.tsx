'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  LiveSalonSettings,
  LiveSettingsAddon,
  LiveSettingsPackage,
  normalizeLiveSalonSettings,
} from '@/lib/live-settings';

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

  const requestId = useRef(0);
  const groomerMenuRef = useRef<HTMLDetailsElement>(null);

  const applySnapshot = useCallback((loaded: LiveSalonSettings) => {
    setSettings(loaded);
    setTaxRate(String(loaded.tax_rate));
    setBufferMins(String(loaded.booking_buffer_mins));
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
          operating_hours: { open: openTime, close: closeTime },
          packages,
          addons,
        }),
      });
      const body: unknown = await response.json();
      if (response.status === 401) { setSignedIn(false); setSettings(null); setMessage('Your session expired. Sign in again.'); return; }
      if (!response.ok) throw new Error((body as { error?: string }).error ?? 'The salon settings could not be saved.');
      setStatusNotice('Salon catalog and operating hours saved to Supabase.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The salon settings could not be saved.');
    } finally {
      setSavingConfig(false);
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

  return <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/dashboard/appointments/live" className="text-sm text-periwinkle-300 hover:text-white">← Live appointments</Link>
        <Link href="/dashboard/clients/live" className="text-sm text-periwinkle-300 hover:text-white">Salon clients & pets</Link>
        <Link href="/dashboard/analytics/live" className="text-sm text-periwinkle-300 hover:text-white">Recorded checkout analytics →</Link>
      </div>
      {signedIn && <button type="button" onClick={signOut} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-zinc-200">Sign out</button>}
    </div>

    <header className="mb-6">
      <p className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">Authenticated salon configuration</p>
      <h1 className="mt-2 text-3xl font-extrabold text-white">Live catalog, hours & groomers</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-400">Configure Supabase operating hours, service packages, booking buffers, and active groomers. Saved changes immediately update live appointment booking and the public salon catalog.</p>
    </header>

    {!isSupabaseConfigured && <p role="alert" className="glass-card p-5 text-amber-300">This view needs a Pawtrackr Supabase connection.</p>}
    {isSupabaseConfigured && !signedIn && phase !== 'checking' && <form onSubmit={signIn} className="glass-card max-w-md space-y-4 p-5 sm:p-6">
      <h2 className="text-lg font-bold text-white">Staff sign-in</h2>
      <p className="text-sm text-zinc-400">Use your provisioned Pawtrackr staff account. Demo PINs do not grant access.</p>
      <label className="block text-sm text-zinc-200">Email<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-white" /></label>
      <label className="block text-sm text-zinc-200">Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-white" /></label>
      <button type="submit" className="min-h-11 rounded-xl bg-periwinkle-500 px-5 font-bold text-obsidian-950">Sign in</button>
    </form>}

    {signedIn && <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm text-zinc-200"><RefreshCw className="h-4 w-4" /> Refresh</button>
          {settings && <Link href={`/portal/live/${settings.slug}`} className="text-xs text-periwinkle-300 hover:text-white">View public catalog ({settings.slug}) →</Link>}
        </div>
        <span role="status" aria-live="polite" className={`text-xs ${online && phase === 'ready' ? 'text-emerald-300' : 'text-amber-300'}`}>
          {!online ? <><WifiOff className="mr-1 inline h-3 w-3" />{settings ? 'Offline · last loaded settings' : 'Offline · no settings'}</> : phase === 'checking' ? 'Refreshing…' : phase === 'error' ? settings ? 'Refresh failed · last loaded settings' : 'Settings unavailable' : 'Server snapshot'}
        </span>
      </div>

      {statusNotice && <p role="status" className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{statusNotice}</p>}

      {!settings ? <p className="glass-card p-5 text-sm text-zinc-400">{phase === 'checking' ? 'Loading salon configuration…' : 'No server settings are available.'}</p> : <div className="space-y-6">
        <section className="glass-card p-5 sm:p-6" aria-labelledby="salon-config-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 id="salon-config-heading" className="text-xl font-bold text-white">{settings.salon_name}</h2>
              <p className="mt-1 text-xs text-zinc-400">Slug: <span className="font-mono text-zinc-200">{settings.slug}</span> · Status: <span className="font-mono text-zinc-200">{settings.subscription_status}</span> · Source: Supabase</p>
            </div>
            <span className="text-xs text-zinc-400">{packages.length} package{packages.length === 1 ? '' : 's'} · {addons.length} add-on{addons.length === 1 ? '' : 's'}</span>
          </div>

          <form onSubmit={saveConfig} className="mt-5 space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-xs text-zinc-300">UTC open time (HH:MM)
                <input type="text" required pattern="[0-2][0-9]:[0-5][0-9]" value={openTime} onChange={(event) => setOpenTime(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
              </label>
              <label className="block text-xs text-zinc-300">UTC close time (HH:MM)
                <input type="text" required pattern="[0-2][0-9]:[0-5][0-9]" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
              </label>
              <label className="block text-xs text-zinc-300">Turnaround buffer (mins)
                <input type="number" required min="0" max="240" step="1" value={bufferMins} onChange={(event) => setBufferMins(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
              </label>
              <label className="block text-xs text-zinc-300">Tax rate (%)
                <input type="number" required min="0" max="30" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
              </label>
            </div>

            <div className="border-t border-white/10 pt-5">
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
              <button type="submit" disabled={savingConfig} className="min-h-11 rounded-xl bg-periwinkle-500 px-5 text-sm font-bold text-obsidian-950">{savingConfig ? 'Saving settings…' : 'Save salon settings'}</button>
            </div>
          </form>
        </section>

        <section className="glass-card p-5 sm:p-6" aria-labelledby="groomer-roster-heading">
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
                <button type="submit" disabled={savingGroomer} className="min-h-11 w-full rounded-lg bg-periwinkle-500 px-4 text-sm font-bold text-obsidian-950">{savingGroomer ? 'Saving…' : 'Save groomer'}</button>
              </div>
            </form>
          </details>

          {settings.groomers.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-400">No groomers are registered for this salon yet.</p> : (
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
      </div>}
    </>}
    {message && <p role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{message}</p>}
  </main>;
}
