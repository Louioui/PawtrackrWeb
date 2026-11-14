'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Layers,
  Lock,
  Mail,
  MapPin,
  Rocket,
  Scissors,
  ShieldCheck,
  Sparkles,
  Truck,
  User,
  Zap,
} from 'lucide-react';
import { suggestSalonSlug, validateSalonProvisioning } from '@/lib/onboarding';
import { OperatingModel } from '@/lib/workflow-context';
import { getSupabaseClient } from '@/lib/supabase/client';

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Australia/Sydney',
  'UTC',
];

export default function WelcomeOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Credential & Salon Identity
  const [ownerName, setOwnerName] = useState('');
  const [salonName, setSalonName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [timeZone, setTimeZone] = useState('America/Los_Angeles');

  // Step 2: Live Slug Selector
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  // Step 3: Operating Model & Activation
  const [operatingModel, setOperatingModel] = useState<OperatingModel>('salon');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionSuccess, setProvisionSuccess] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  // Reset local cache utility
  const resetFreshStart = async () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch { /* ignore */ }
    }
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut().catch(() => {});
    }
    setOwnerName('');
    setSalonName('');
    setEmail('');
    setPassword('');
    setSlug('');
    setStep(1);
    setProvisionError('Local cache and sessions cleared. Clean slate initialized.');
  };

  // Auto-detect timezone
  useEffect(() => {
    try {
      const detected = new Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimeZone(detected);
    } catch {
      // Keep default
    }
  }, []);

  // Update suggested slug when salonName changes if not manually edited
  useEffect(() => {
    if (!slugEdited && salonName) {
      setSlug(suggestSalonSlug(salonName));
    }
  }, [salonName, slugEdited]);

  // Validation
  const validationResult = useMemo(() => {
    return validateSalonProvisioning({
      salon_name: salonName,
      slug,
      time_zone: timeZone,
      owner_name: ownerName,
    });
  }, [salonName, slug, timeZone, ownerName]);

  const handleNextToStep2 = (e: FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim() || !salonName.trim() || !email.trim() || !password) {
      setProvisionError('Please fill out all identity fields.');
      return;
    }
    if (password.length < 10) {
      setProvisionError('Password must be at least 10 characters.');
      return;
    }
    setProvisionError(null);
    setStep(2);
  };

  const handleNextToStep3 = (e: FormEvent) => {
    e.preventDefault();
    if (!validationResult.ok) {
      setProvisionError(validationResult.error);
      return;
    }
    setProvisionError(null);
    setStep(3);
  };

  const handleCompleteProvisioning = async () => {
    if (!validationResult.ok) {
      setProvisionError(validationResult.error);
      return;
    }

    setIsProvisioning(true);
    setProvisionError(null);

    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        // Sign up with real email
        const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/signup` : undefined;
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
        });

        if (authError && !authError.message.includes('already registered')) {
          // Attempt sign in if already registered
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInErr) {
            throw new Error(signInErr.message);
          }
        }

        const session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          // Email confirmation is required by Supabase
          setAwaitingConfirmation(true);
          setIsProvisioning(false);
          return;
        }

        const resp = await fetch('/api/onboarding', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            salon_name: salonName,
            slug,
            time_zone: timeZone,
            owner_name: ownerName,
          }),
        });
        const result = await resp.json();
        if (!resp.ok && resp.status !== 409) {
          throw new Error(result.error || 'Provisioning failed.');
        }

        setProvisionSuccess(true);
        setTimeout(() => {
          router.push(`/dashboard/appointments/live`);
        }, 1200);
      }
    } catch (err: any) {
      setProvisionError(err?.message || 'Provisioning failed. Please check your connection and credentials.');
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-950 px-4 py-12 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-periwinkle-500/30 bg-periwinkle-500/10 px-4 py-1.5 text-xs font-bold text-periwinkle-300">
            <Sparkles className="h-3.5 w-3.5" />
            Pawtrackr Atomic Salon Provisioning Wizard
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Launch Your High-Velocity Salon OS
          </h1>
          <p className="text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
            Provision your isolated multi-tenant database, custom subdomain, and real-time operations calendar in under 60 seconds.
          </p>
        </div>

        {/* Step Progress Bar */}
        <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
          <div className="flex items-center justify-between text-xs font-semibold">
            <button
              type="button"
              onClick={() => !awaitingConfirmation && setStep(1)}
              className={`flex items-center gap-2 transition ${
                step >= 1 ? 'text-periwinkle-300' : 'text-zinc-500'
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-periwinkle-500/20 text-[11px] font-bold border border-periwinkle-500/40">
                1
              </span>
              <span>Identity &amp; Credentials</span>
            </button>

            <div className={`h-0.5 flex-1 mx-4 rounded ${step >= 2 ? 'bg-periwinkle-500/50' : 'bg-white/10'}`} />

            <button
              type="button"
              onClick={() => !awaitingConfirmation && step >= 2 && setStep(2)}
              className={`flex items-center gap-2 transition ${
                step >= 2 ? 'text-periwinkle-300' : 'text-zinc-500'
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-periwinkle-500/20 text-[11px] font-bold border border-periwinkle-500/40">
                2
              </span>
              <span>Subdomain &amp; Web Address</span>
            </button>

            <div className={`h-0.5 flex-1 mx-4 rounded ${step >= 3 ? 'bg-periwinkle-500/50' : 'bg-white/10'}`} />

            <button
              type="button"
              onClick={() => !awaitingConfirmation && step >= 3 && setStep(3)}
              className={`flex items-center gap-2 transition ${
                step >= 3 ? 'text-periwinkle-300' : 'text-zinc-500'
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-periwinkle-500/20 text-[11px] font-bold border border-periwinkle-500/40">
                3
              </span>
              <span>Model &amp; Activation</span>
            </button>
          </div>
        </div>

        {/* Wizard Form Card */}
        <div className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-10 shadow-2xl space-y-6">
          {provisionError && (
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
              {provisionError}
            </div>
          )}

          {awaitingConfirmation ? (
            <div className="space-y-6 text-center py-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-periwinkle-500/30 bg-periwinkle-500/15 text-periwinkle-300">
                <Mail className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Check your email inbox</h2>
                <p className="text-sm text-zinc-300 max-w-md mx-auto">
                  We sent a confirmation link to <span className="font-semibold text-white">{email.trim()}</span>.
                  Click the link in the email to activate your account, then click below to launch your live salon.
                </p>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-periwinkle-400 px-6 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-300 transition"
                >
                  I confirmed my email &rarr; Complete Setup
                </Link>
                <button
                  type="button"
                  onClick={() => setAwaitingConfirmation(false)}
                  className="min-h-11 rounded-xl border border-white/15 px-4 text-xs font-medium text-zinc-300 hover:text-white"
                >
                  Edit details or try again
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* STEP 1: IDENTITY & CREDENTIALS */}
              {step === 1 && (
                <form onSubmit={handleNextToStep2} className="space-y-5">
                  <div className="border-b border-white/[0.08] pb-4">
                    <h2 className="text-xl font-bold text-white">Step 1: Salon Identity &amp; Master Account</h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      Establish executive ownership and configure your salon&apos;s authoritative local time zone.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        Salon / Business Name
                      </label>
                      <input
                        type="text"
                        required
                        value={salonName}
                        onChange={(e) => setSalonName(e.target.value)}
                        placeholder="e.g. Pawtrackr Grooming Studio"
                        className="w-full rounded-xl border border-white/[0.12] bg-obsidian-950 px-3.5 py-2.5 text-xs text-white focus:border-periwinkle-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        Owner / Executive Name
                      </label>
                      <input
                        type="text"
                        required
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        placeholder="e.g. Your Full Name"
                        className="w-full rounded-xl border border-white/[0.12] bg-obsidian-950 px-3.5 py-2.5 text-xs text-white focus:border-periwinkle-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        Work Email (Master Sign-In)
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. you@yourdomain.com"
                        className="w-full rounded-xl border border-white/[0.12] bg-obsidian-950 px-3.5 py-2.5 text-xs text-white focus:border-periwinkle-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        Master Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={10}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 10 characters"
                        className="w-full rounded-xl border border-white/[0.12] bg-obsidian-950 px-3.5 py-2.5 text-xs text-white focus:border-periwinkle-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Authoritative Salon Time Zone
                    </label>
                    <select
                      value={timeZone}
                      onChange={(e) => setTimeZone(e.target.value)}
                      className="w-full rounded-xl border border-white/[0.12] bg-obsidian-950 px-3.5 py-2.5 text-xs text-white focus:border-periwinkle-500 focus:outline-none"
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-zinc-400 mt-1 block">
                      All availability slots and customer booking emails resolve strictly to this local time zone.
                    </span>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-xl bg-periwinkle-500 px-6 py-2.5 text-xs font-bold text-obsidian-950 hover:bg-periwinkle-400 transition"
                    >
                      Continue to Subdomain Setup &rarr;
                    </button>
                  </div>
                </form>
              )}

          {/* STEP 2: SUBDOMAIN SELECTOR */}
          {step === 2 && (
            <form onSubmit={handleNextToStep3} className="space-y-5">
              <div className="border-b border-white/[0.08] pb-4">
                <h2 className="text-xl font-bold text-white">Step 2: Subdomain & Client Booking URL</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Choose your branded booking address. Pet parents will use this dedicated link for 24/7 self-service appointments.
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold text-zinc-300">
                  Public Booking Address Slug
                </label>
                <div className="flex rounded-xl border border-white/[0.12] bg-obsidian-950 overflow-hidden focus-within:border-periwinkle-500">
                  <span className="inline-flex items-center px-3.5 bg-obsidian-900 border-r border-white/[0.1] text-xs font-mono text-zinc-400">
                    pawtrackr.live/
                  </span>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      setSlugEdited(true);
                    }}
                    placeholder="my-salon-slug"
                    className="flex-1 bg-transparent px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {validationResult.ok ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                      <CheckCircle2 className="h-4 w-4" /> Available and verified: <code className="text-periwinkle-300">https://{slug}.pawtrackr.live</code>
                    </span>
                  ) : (
                    <span className="text-amber-400">
                      {validationResult.error}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-white/[0.08] bg-obsidian-950 space-y-2 text-xs">
                <div className="font-semibold text-periwinkle-300 flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Custom Domain SSL Capability Included
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  You can also bind your custom domain (e.g., <code className="text-zinc-200">book.yourdomain.com</code>) at zero additional fee after initial provisioning.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-xl border border-white/[0.1] px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  &larr; Back
                </button>
                <button
                  type="submit"
                  disabled={!validationResult.ok}
                  className="inline-flex items-center gap-2 rounded-xl bg-periwinkle-500 px-6 py-2.5 text-xs font-bold text-obsidian-950 hover:bg-periwinkle-400 transition disabled:opacity-50"
                >
                  Configure Operating Model &rarr;
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: OPERATING MODEL & ACTIVATION */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="border-b border-white/[0.08] pb-4">
                <h2 className="text-xl font-bold text-white">Step 3: Operating Model & Readiness Gate</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Select your primary service architecture to automatically seed stations, van bays, and shift structures.
                </p>
              </div>

              {/* Operating Model Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    id: 'salon' as const,
                    title: 'Brick & Mortar Salon',
                    icon: Building2,
                    description: 'Physical salon with grooming tables, hydro tubs, and drying stations.',
                  },
                  {
                    id: 'mobile_van' as const,
                    title: 'Mobile Van Fleet',
                    icon: Truck,
                    description: 'Van routes, travel time buffers, GPS stop dispatching, and generator logs.',
                  },
                  {
                    id: 'hybrid' as const,
                    title: 'Hybrid Salon & Fleet',
                    icon: Zap,
                    description: 'Central salon location combined with dispatched mobile grooming vans.',
                  },
                ].map((model) => {
                  const selected = operatingModel === model.id;
                  const Icon = model.icon;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setOperatingModel(model.id)}
                      className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between space-y-3 ${
                        selected
                          ? 'border-periwinkle-400 bg-periwinkle-500/15 shadow-md'
                          : 'border-white/[0.08] bg-obsidian-950 hover:border-white/[0.2]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`p-2 rounded-xl border ${selected ? 'bg-periwinkle-500/20 border-periwinkle-500/40 text-periwinkle-300' : 'bg-obsidian-900 border-white/[0.08] text-zinc-400'}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        {selected && (
                          <span className="h-2 w-2 rounded-full bg-periwinkle-400 shadow-glow" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{model.title}</div>
                        <div className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{model.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Readiness Checklist Preview */}
              <div className="rounded-2xl border border-white/[0.08] bg-obsidian-950 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">Pre-Flight Readiness Checklist</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                    Automatic Seed Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-obsidian-900 border border-white/[0.05]">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-zinc-300">Operating hours (Mon-Sat 8am-6pm)</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-obsidian-900 border border-white/[0.05]">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-zinc-300">Primary packages & VIP club add-ons</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-obsidian-900 border border-white/[0.05]">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-zinc-300">Staff roster & 50.00% commission rule</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-obsidian-900 border border-white/[0.05]">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-zinc-300">Rabies certificate & medical intake vault</span>
                  </div>
                </div>
              </div>

              {/* Final Provisioning CTA */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-xl border border-white/[0.1] px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  &larr; Back
                </button>
                <button
                  type="button"
                  onClick={handleCompleteProvisioning}
                  disabled={isProvisioning || provisionSuccess}
                  className="inline-flex items-center gap-2 rounded-xl bg-periwinkle-500 px-6 py-3 text-xs font-bold text-obsidian-950 hover:bg-periwinkle-400 transition shadow-periwinkle-glow disabled:opacity-50"
                >
                  <Rocket className="h-4 w-4" />
                  {isProvisioning ? 'Provisioning Atomic Database...' : provisionSuccess ? 'Provisioned! Redirecting...' : 'Provision Salon & Launch Command Center'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>

        <div className="mt-8 text-center text-xs text-zinc-500">
          Need to reset browser state?{' '}
          <button
            type="button"
            onClick={resetFreshStart}
            className="text-periwinkle-300 hover:text-white underline transition"
          >
            Clear local cache
          </button>
        </div>
      </div>
    </div>
  );
}
