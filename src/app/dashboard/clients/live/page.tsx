'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, WifiOff } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { LiveClientRoster, normalizeLiveClientRoster } from '@/lib/live-clients';

export default function LiveClientsPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [roster, setRoster] = useState<LiveClientRoster | null>(null);
  const [phase, setPhase] = useState<'checking' | 'ready' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(true);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [petName, setPetName] = useState('');
  const [breed, setBreed] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);
  const intakeMenuRef = useRef<HTMLDetailsElement>(null);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    const client = getSupabaseClient();
    if (!client) { setPhase('error'); setMessage('Supabase is not configured.'); return; }
    if (!navigator.onLine) { setOnline(false); return; }
    setOnline(true); setPhase('checking');
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (current !== requestId.current) return;
    if (sessionError || !session) { setSignedIn(false); setRoster(null); setPhase('ready'); return; }
    setSignedIn(true);
    try {
      const response = await fetch('/api/clients', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const body: unknown = await response.json();
      if (current !== requestId.current) return;
      if (response.status === 401) {
        setSignedIn(false); setRoster(null); setPhase('ready'); setMessage('Your session expired. Sign in again.'); return;
      }
      if (response.status === 403) {
        setRoster(null); setPhase('error'); setMessage('An active staff membership is required.'); return;
      }
      if (!response.ok) throw new Error((body as { error?: string }).error ?? 'Client directory could not be loaded.');
      setRoster(normalizeLiveClientRoster(body));
      setMessage(''); setPhase('ready');
    } catch (error) {
      if (current !== requestId.current) return;
      setPhase('error'); setMessage(error instanceof Error ? error.message : 'Client directory could not be loaded.');
    }
  }, []);

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
    setPhase('checking'); setMessage('');
    const { error } = await client.auth.signInWithPassword({ email, password });
    setPassword('');
    if (error) { setPhase('error'); setMessage('Sign-in failed. Check your credentials and try again.'); return; }
    setSignedIn(true);
    void refresh();
  };

  const signOut = async () => {
    requestId.current += 1;
    await getSupabaseClient()?.auth.signOut();
    setSignedIn(false); setRoster(null); setMessage(''); setPhase('ready');
  };

  const createClientPet = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(true); setMessage('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { setSignedIn(false); setRoster(null); setMessage('Your session expired. Sign in again.'); return; }
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          client_name: clientName,
          client_phone: clientPhone,
          client_email: clientEmail.trim() || null,
          pet_name: petName,
          breed,
          weight_lbs: weightLbs.trim() ? Number(weightLbs) : null,
        }),
      });
      const body: unknown = await response.json();
      if (response.status === 401) { setSignedIn(false); setRoster(null); setMessage('Your session expired. Sign in again.'); return; }
      if (!response.ok) throw new Error((body as { error?: string }).error ?? 'The client and pet could not be saved.');
      setClientName(''); setClientPhone(''); setClientEmail(''); setPetName(''); setBreed(''); setWeightLbs('');
      intakeMenuRef.current?.removeAttribute('open');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The client and pet could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/dashboard/appointments/live" className="text-sm text-periwinkle-300 hover:text-white">← Live appointments</Link>
        <Link href="/dashboard/analytics/live" className="text-sm text-periwinkle-300 hover:text-white">Recorded checkout analytics →</Link>
      </div>
      {signedIn && <button type="button" onClick={signOut} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-zinc-200">Sign out</button>}
    </div>
    <header className="mb-6">
      <p className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">Authenticated staff roster</p>
      <h1 className="mt-2 text-3xl font-extrabold text-white">Salon clients & pets</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-400">Supabase client and pet records for your signed-in salon. New pets registered here are immediately available in live appointment booking.</p>
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
        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm text-zinc-200"><RefreshCw className="h-4 w-4" /> Refresh</button>
        <span role="status" aria-live="polite" className={`text-xs ${online && phase === 'ready' ? 'text-emerald-300' : 'text-amber-300'}`}>
          {!online ? <><WifiOff className="mr-1 inline h-3 w-3" />{roster ? 'Offline · last loaded roster' : 'Offline · no roster'}</> : phase === 'checking' ? 'Refreshing…' : phase === 'error' ? roster ? 'Refresh failed · last loaded roster' : 'Roster unavailable' : 'Server snapshot'}
        </span>
      </div>

      <details ref={intakeMenuRef} className="mb-5 rounded-xl border border-white/10 bg-obsidian-800/60 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-periwinkle-200">Register client & pet</summary>
        <form onSubmit={createClientPet} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs text-zinc-300">Client name
            <input type="text" required value={clientName} onChange={(event) => setClientName(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
          </label>
          <label className="block text-xs text-zinc-300">Client phone
            <input type="tel" required value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
          </label>
          <label className="block text-xs text-zinc-300">Client email (optional)
            <input type="email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
          </label>
          <label className="block text-xs text-zinc-300">Pet name
            <input type="text" required value={petName} onChange={(event) => setPetName(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
          </label>
          <label className="block text-xs text-zinc-300">Breed
            <input type="text" required value={breed} onChange={(event) => setBreed(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white" />
          </label>
          <label className="block text-xs text-zinc-300">Weight in lbs (optional)
            <input type="number" min="0.1" max="300" step="0.01" value={weightLbs} onChange={(event) => setWeightLbs(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 font-mono text-sm text-white" />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-periwinkle-500 px-5 text-sm font-bold text-obsidian-950">{saving ? 'Saving…' : 'Save client & pet'}</button>
          </div>
        </form>
      </details>

      <section className="glass-card p-5 sm:p-6" aria-labelledby="roster-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="roster-heading" className="text-xl font-bold text-white">Active salon pet roster</h2>
          {roster && <span className="text-xs text-zinc-400">{roster.pet_count} pet{roster.pet_count === 1 ? '' : 's'} · {roster.client_count} client{roster.client_count === 1 ? '' : 's'} · Source: Supabase</span>}
        </div>
        {!roster ? <p className="mt-4 text-sm text-zinc-400">{phase === 'checking' ? 'Loading salon roster…' : 'No server roster is available.'}</p>
          : roster.pets.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-400">No pets are registered for this salon yet.</p>
          : <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Registered salon pets and pet parents</caption>
              <thead>
                <tr className="border-b border-white/10 text-left text-zinc-400">
                  <th scope="col" className="py-2 pr-4">Pet</th>
                  <th scope="col" className="py-2 pr-4">Breed</th>
                  <th scope="col" className="py-2 pr-4">Weight</th>
                  <th scope="col" className="py-2 pr-4">Client</th>
                  <th scope="col" className="py-2">Phone</th>
                </tr>
              </thead>
              <tbody>
                {roster.pets.map((item) => <tr key={item.id} className="border-b border-white/10 text-zinc-200">
                  <th scope="row" className="py-3 pr-4 text-left font-semibold text-white">{item.pet_name}</th>
                  <td className="py-3 pr-4">{item.breed}</td>
                  <td className="py-3 pr-4 font-mono">{item.weight_lbs !== null ? `${item.weight_lbs} lbs` : '—'}</td>
                  <td className="py-3 pr-4">{item.client_name}</td>
                  <td className="py-3 font-mono">{item.client_phone}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
      </section>
    </>}
    {message && <p role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{message}</p>}
  </main>;
}
