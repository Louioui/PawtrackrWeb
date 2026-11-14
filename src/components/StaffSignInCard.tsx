'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { DEMO_ROLE_LINKS, checkSignInFields, safeStaffDestination, signInFailureMessage } from '@/lib/staff-sign-in';

type Phase = 'checking' | 'signed-out' | 'signing-in' | 'signed-in';

export function StaffSignInCard({ showDemoShortcuts = false }: { showDemoShortcuts?: boolean } = {}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedInAs, setSignedInAs] = useState('');
  const [message, setMessage] = useState('');
  const [destination, setDestination] = useState(safeStaffDestination(null));

  useEffect(() => {
    setDestination(safeStaffDestination(new URLSearchParams(window.location.search).get('next')));
    const client = getSupabaseClient();
    if (!client) { setPhase('signed-out'); return; }
    let active = true;
    void client.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setSignedInAs(session?.user.email ?? '');
      setPhase(session ? 'signed-in' : 'signed-out');
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSignedInAs(session?.user.email ?? '');
      setPhase((current) => current === 'signing-in' ? current : session ? 'signed-in' : 'signed-out');
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (phase === 'signing-in') return; // a second click must not start a second request
    const client = getSupabaseClient();
    if (!client) return;
    const fields = checkSignInFields(email, password);
    if (!fields.ok) { setMessage(fields.message); return; }
    setPhase('signing-in'); setMessage('');
    try {
      const { error } = await client.auth.signInWithPassword({ email: fields.email, password });
      setPassword('');
      if (error) { setPhase('signed-out'); setMessage(signInFailureMessage(error)); return; }
      router.push(destination);
    } catch {
      setPassword(''); setPhase('signed-out');
      setMessage(signInFailureMessage({ status: 503 }));
    }
  };

  const signOut = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
    setSignedInAs(''); setPhase('signed-out'); setMessage('You are signed out on this device.');
  };

  const field = 'mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:border-periwinkle-400 focus:outline-none focus:ring-2 focus:ring-periwinkle-400/40';

  return (
    <section aria-labelledby="staff-sign-in-heading" className="mt-8 rounded-2xl border border-white/10 bg-obsidian-900/70 p-6 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Live salon data
          </p>
          <h2 id="staff-sign-in-heading" className="mt-1 text-xl font-bold text-white">Staff sign-in</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            For salon owners and staff with a Pawtrackr account. You will see only the salon your active staff membership belongs to.
          </p>
        </div>
        <Link href="/signup" className="text-sm font-semibold text-periwinkle-300 underline-offset-4 hover:underline">
          New salon? Create an account
        </Link>
      </div>

      {!isSupabaseConfigured ? (
        <p role="status" className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          Live sign-in is not connected in this environment, so no account can be checked here. The sample workspaces below still work.
        </p>
      ) : phase === 'checking' ? (
        <p role="status" className="mt-5 text-sm text-zinc-400">Checking for an existing session…</p>
      ) : phase === 'signed-in' ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-emerald-200">Signed in{signedInAs ? ` as ${signedInAs}` : ''}.</p>
          <Link href={destination} className="inline-flex min-h-11 items-center rounded-lg bg-periwinkle-500 px-4 text-sm font-semibold text-obsidian-900">
            Open today’s appointments
          </Link>
          <button type="button" onClick={() => void signOut()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-white">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      ) : (
        <form onSubmit={signIn} noValidate className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm text-zinc-300">
            Email
            <input type="email" name="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className={field} />
          </label>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="staff-password-input" className="text-sm text-zinc-300">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-periwinkle-300 underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="staff-password-input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={field}
            />
          </div>
          <button type="submit" disabled={phase === 'signing-in'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-periwinkle-500 px-5 text-sm font-semibold text-obsidian-900 disabled:opacity-60">
            <LockKeyhole className="h-4 w-4" /> {phase === 'signing-in' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
      {message && <p role="alert" className="mt-3 text-sm text-amber-200">{message}</p>}

      {showDemoShortcuts && (
        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Just exploring? Open a sample workspace — no account, sample data only</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {DEMO_ROLE_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="block min-h-11 rounded-lg border border-white/10 px-4 py-2.5 hover:border-periwinkle-400/50">
                  <span className="block text-sm font-semibold text-white">{link.label}</span>
                  <span className="block text-xs text-zinc-400">{link.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
