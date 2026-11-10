'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, Globe, LineChart, Settings, Users } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { suggestSalonSlug, validateSalonProvisioning } from '@/lib/onboarding';

type Membership =
  | { member: false; email_confirmed: boolean }
  | { member: true; active: false }
  | { member: true; active: true; staff: { name: string; role: string }; salon: { name: string; slug: string; subscription_status: string } };

const field = 'mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-sm text-white';
const primary = 'min-h-11 w-full rounded-lg bg-periwinkle-400 px-4 text-sm font-bold text-obsidian-950 hover:bg-periwinkle-300 disabled:cursor-not-allowed disabled:opacity-50';

const commonZones = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver', 'Europe/London',
  'Australia/Sydney', 'UTC',
];

export default function SalonSignUpPage() {
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<'checking' | 'signed_out' | 'confirm_email' | 'ready'>('checking');
  const [membership, setMembership] = useState<Membership | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [salonName, setSalonName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [timeZone, setTimeZone] = useState('America/New_York');
  const requestId = useRef(0);

  const zones = useMemo(() => (commonZones.includes(timeZone) ? commonZones : [timeZone, ...commonZones]), [timeZone]);

  useEffect(() => {
    try {
      const detected = new Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimeZone(detected);
    } catch { /* Keep the default zone. */ }
  }, []);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    const client = getSupabaseClient();
    if (!client) { setPhase('signed_out'); setMessage('Salon sign-up is not configured on this deployment.'); return; }
    const { data: { session } } = await client.auth.getSession();
    if (current !== requestId.current) return;
    if (!session) { setMembership(null); setPhase('signed_out'); return; }
    try {
      const response = await fetch('/api/onboarding', {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
      });
      const body = await response.json() as Membership & { error?: string };
      if (current !== requestId.current) return;
      if (response.status === 401) { await client.auth.signOut(); setMembership(null); setPhase('signed_out'); return; }
      if (!response.ok) throw new Error(body.error ?? 'Your account could not be checked.');
      setMembership(body); setPhase('ready'); setMessage('');
    } catch (error) {
      if (current !== requestId.current) return;
      setPhase('ready'); setMembership(null);
      setMessage(error instanceof Error ? error.message : 'Your account could not be checked.');
    }
  }, []);

  useEffect(() => { void refresh(); return () => { requestId.current += 1; }; }, [refresh]);

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client || busy) return;
    setBusy(true); setMessage('');
    try {
      if (mode === 'create') {
        if (password.length < 10) { setMessage('Use a password of at least 10 characters.'); return; }
        const { data, error } = await client.auth.signUp({ email: email.trim(), password });
        if (error) { setMessage('The account could not be created. Check the email address, or sign in if you already have an account.'); return; }
        if (!data.session) { setPhase('confirm_email'); return; }
      } else {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { setMessage('Sign-in failed. Check your email and password.'); return; }
      }
      await refresh();
    } finally {
      setPassword(''); setBusy(false);
    }
  };

  const signOut = async () => {
    requestId.current += 1;
    await getSupabaseClient()?.auth.signOut();
    setMembership(null); setMessage(''); setPhase('signed_out');
  };

  const createSalon = async (event: FormEvent) => {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client || busy) return;
    const checked = validateSalonProvisioning({ salon_name: salonName, slug, time_zone: timeZone, owner_name: ownerName });
    if (!checked.ok) { setMessage(checked.error); return; }
    setBusy(true); setMessage('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { setPhase('signed_out'); setMessage('Your session expired. Sign in again.'); return; }
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(checked.draft),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) { setMessage(body.error ?? 'The salon could not be created. Nothing was saved.'); return; }
      await refresh();
    } catch {
      setMessage('The salon could not be created because the connection failed. Nothing was confirmed; check before trying again.');
    } finally {
      setBusy(false);
    }
  };

  const salon = membership?.member && membership.active ? membership.salon : null;

  return <main className="mx-auto max-w-xl px-4 pb-20 pt-10 sm:px-6">
    <p className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">Pawtrackr for salons</p>
    <h1 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">{salon ? 'Your salon is ready' : 'Set up your salon'}</h1>
    {!salon && <p className="mt-3 text-sm text-zinc-400">Create an account, name your salon, and you can add services, groomers, and take bookings today. New salons start on a free trial; no card is collected here.</p>}

    {message && <p role="alert" className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</p>}

    {phase === 'checking' && <p className="glass-card mt-8 p-6 text-sm text-zinc-400" aria-live="polite">Checking your account…</p>}

    {phase === 'confirm_email' && <section className="glass-card mt-8 p-6" aria-labelledby="confirm-heading">
      <h2 id="confirm-heading" className="text-xl font-bold text-white">Check your email</h2>
      <p className="mt-2 text-sm text-zinc-300">We sent a confirmation link to <span className="font-semibold text-white">{email.trim()}</span>. Open it, then come back and sign in to finish setting up your salon.</p>
      <button type="button" onClick={() => { setMode('signin'); setPhase('signed_out'); }} className={`${primary} mt-5`}>I confirmed my email</button>
    </section>}

    {phase === 'signed_out' && <section className="glass-card mt-8 p-6" aria-labelledby="account-heading">
      <div role="tablist" aria-label="Account" className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-obsidian-900 p-1">
        {(['create', 'signin'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => { setMode(value); setMessage(''); }}
          className={`min-h-11 rounded-md text-sm font-semibold ${mode === value ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}>{value === 'create' ? 'Create account' : 'Sign in'}</button>)}
      </div>
      <h2 id="account-heading" className="sr-only">{mode === 'create' ? 'Create your account' : 'Sign in'}</h2>
      <form onSubmit={authenticate} className="space-y-4">
        <label className="block text-xs text-zinc-300">Work email
          <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={field} />
        </label>
        <label className="block text-xs text-zinc-300">Password{mode === 'create' && ' (at least 10 characters)'}
          <input type="password" required minLength={mode === 'create' ? 10 : undefined} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} className={field} />
        </label>
        <button type="submit" disabled={busy} className={primary}>{busy ? 'Working…' : mode === 'create' ? 'Create account' : 'Sign in'}</button>
      </form>
    </section>}

    {phase === 'ready' && membership && !membership.member && <section className="glass-card mt-8 p-6" aria-labelledby="salon-heading">
      <h2 id="salon-heading" className="text-xl font-bold text-white">Name your salon</h2>
      {!membership.email_confirmed && <p className="mt-2 text-sm text-amber-200">Confirm your email address first; the link is in your inbox.</p>}
      <form onSubmit={createSalon} className="mt-4 space-y-4">
        <label className="block text-xs text-zinc-300">Salon name
          <input required maxLength={120} value={salonName} onChange={(event) => { setSalonName(event.target.value); if (!slugEdited) setSlug(suggestSalonSlug(event.target.value)); }} className={field} placeholder="Splash Grooming Studio" />
        </label>
        <label className="block text-xs text-zinc-300">Booking page address
          <span className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-white/15 bg-obsidian-900">
            <span className="flex items-center whitespace-nowrap px-3 text-xs text-zinc-500">/portal/live/</span>
            <input required maxLength={60} value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value.toLowerCase()); }} className="min-h-11 w-full min-w-0 bg-transparent pr-3 font-mono text-sm text-white outline-none" aria-describedby="slug-help" />
          </span>
          <span id="slug-help" className="mt-1 block text-xs text-zinc-500">Lowercase letters, numbers, and hyphens. Pet parents will book here.</span>
        </label>
        <label className="block text-xs text-zinc-300">Your name
          <input required maxLength={120} autoComplete="name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} className={field} />
        </label>
        <label className="block text-xs text-zinc-300">Salon time zone
          <select value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className={field}>
            {zones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy || !membership.email_confirmed} className={primary}>{busy ? 'Creating your salon…' : 'Create salon'}</button>
      </form>
      <button type="button" onClick={signOut} className="mt-4 text-sm text-periwinkle-300 hover:text-white">Sign out</button>
    </section>}

    {phase === 'ready' && membership?.member && !membership.active && <section className="glass-card mt-8 p-6">
      <h2 className="text-xl font-bold text-white">Your access is turned off</h2>
      <p className="mt-2 text-sm text-zinc-300">This account belongs to a salon, but its staff access has been deactivated. Ask the salon owner to restore it.</p>
      <button type="button" onClick={signOut} className="mt-4 text-sm text-periwinkle-300 hover:text-white">Sign out</button>
    </section>}

    {salon && membership?.member && membership.active && <section className="mt-8" aria-labelledby="next-heading">
      <div className="glass-card flex items-start gap-3 p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-white">{salon.name}</p>
          <p className="mt-1 text-sm text-zinc-400">Signed in as {membership.staff.name} · {membership.staff.role} · {salon.subscription_status === 'trialing' ? 'free trial' : salon.subscription_status}</p>
        </div>
      </div>
      <h2 id="next-heading" className="mt-7 text-sm font-bold uppercase tracking-wider text-zinc-400">Finish setting up</h2>
      <ol className="mt-3 space-y-3">
        {[
          { href: '/dashboard/settings/live', icon: Settings, title: 'Add services, hours, and groomers', detail: 'Online booking opens once you have at least one service and one groomer.' },
          { href: `/portal/live/${salon.slug}`, icon: Globe, title: 'Open your public booking page', detail: 'Share this link with pet parents.' },
          { href: '/dashboard/appointments/live', icon: CalendarDays, title: 'See today’s appointments', detail: 'Book walk-ins and move visits through the day.' },
          { href: '/dashboard/clients/live', icon: Users, title: 'Add clients and pets', detail: 'Register pet parents and log weights.' },
          { href: '/dashboard/analytics/live', icon: LineChart, title: 'Record checkouts and see revenue', detail: 'Recorded and settled totals are shown separately.' },
        ].map((step) => <li key={step.href}>
          <Link href={step.href} className="glass-card flex items-center gap-4 p-4 hover:border-periwinkle-300/40">
            <step.icon className="h-5 w-5 shrink-0 text-periwinkle-300" aria-hidden="true" />
            <span className="min-w-0"><span className="block font-semibold text-white">{step.title}</span><span className="block text-sm text-zinc-400">{step.detail}</span></span>
          </Link>
        </li>)}
      </ol>
      <button type="button" onClick={signOut} className="mt-6 text-sm text-periwinkle-300 hover:text-white">Sign out</button>
    </section>}
  </main>;
}
