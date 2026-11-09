'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Command,
  Cpu,
  Globe,
  Heart,
  Layers,
  Lock,
  Receipt,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { SAAS_PLANS } from '@/lib/stripe';
import { BehaviorAuraBadge } from '@/components/BehaviorAuraBadge';

export default function LandingPage() {
  const [salonName, setSalonName] = useState('Velvet Coat Sanctuary');
  const [salonSlug, setSalonSlug] = useState('velvet-coat-sanctuary');
  const [ownerEmail, setOwnerEmail] = useState('founder@velvetcoat.live');
  const [selectedPlan, setSelectedPlan] = useState<'solo_van' | 'salon_pro'>(
    'salon_pro'
  );
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionedResult, setProvisionedResult] = useState<{
    name: string;
    slug: string;
    businessId: string;
    monthlyRate: number;
  } | null>(null);

  const handleSalonNameChange = (val: string) => {
    setSalonName(val);
    const autoSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setSalonSlug(autoSlug || 'my-grooming-salon');
  };

  const handleInstantLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProvisioning(true);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salonName,
          slug: salonSlug,
          ownerEmail,
          planId: selectedPlan,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setProvisionedResult({
          name: data.business.name,
          slug: data.business.slug,
          businessId: data.business.id,
          monthlyRate:
            selectedPlan === 'salon_pro'
              ? SAAS_PLANS.salon_pro.monthlyPriceDollars
              : SAAS_PLANS.solo_van.monthlyPriceDollars,
        });
      }
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-b from-obsidian-800/90 via-obsidian-900 to-obsidian-900 p-8 sm:p-12 lg:p-16 shadow-glass">
        <div className="pointer-events-none absolute -top-36 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-periwinkle-500/15 blur-3xl" />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-periwinkle-500/35 bg-periwinkle-500/10 px-4 py-1.5 text-xs font-semibold text-periwinkle-300 shadow-periwinkle-glow">
            <Sparkles className="h-3.5 w-3.5 text-periwinkle-400" />
            <span>
              Enterprise B2B Vertical SaaS • Built to Outperform MoeGo &
              DaySmart Pet
            </span>
          </div>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl leading-[1.08]">
            The Obsidian-Grade Operating System for{' '}
            <span className="bg-gradient-to-r from-periwinkle-300 via-periwinkle-500 to-emerald-400 bg-clip-text text-transparent">
              Elite Pet Grooming Salons.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-zinc-300 leading-relaxed">
            Zero-lag local-first speed meets multi-tenant{' '}
            <span className="text-white font-semibold">
              Supabase PostgreSQL Row-Level Security
            </span>
            . Sub-10ms multi-token search, instant behavior safety auras,
            self-service booking portals, and a 4-step atomic POS checkout that
            balances every drawer down to the exact penny.
          </p>

          {/* 3-Portal Instant Action Buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2.5 rounded-2xl bg-periwinkle-500 px-6 py-4 text-sm font-bold text-obsidian-950 shadow-periwinkle-glow transition hover:bg-periwinkle-400"
            >
              <Command className="h-4 w-4" />
              Open Salon Command Center
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/portal/bespoke-grooming"
              className="inline-flex items-center gap-2.5 rounded-2xl border border-white/[0.12] bg-obsidian-700/80 px-6 py-4 text-sm font-semibold text-white transition hover:border-periwinkle-500/50 hover:bg-obsidian-600"
            >
              <Globe className="h-4 w-4 text-periwinkle-400" />
              Test Public Self-Booking Portal
            </Link>

            <Link
              href="/client/cl-101"
              className="inline-flex items-center gap-2.5 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-6 py-4 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
            >
              <Heart className="h-4 w-4 text-emerald-400" />
              View Pet Parent Loyalty Portal
            </Link>
          </div>

          {/* Live Behavior Aura Preview Strip */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2 border-t border-white/[0.07] pt-6">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Instant Safety Auras:
            </span>
            <BehaviorAuraBadge tag="biter" size="xs" />
            <BehaviorAuraBadge tag="matted" size="xs" />
            <BehaviorAuraBadge tag="senior" size="xs" />
            <BehaviorAuraBadge tag="heart_murmur" size="xs" />
            <BehaviorAuraBadge tag="anxious" size="xs" />
          </div>
        </div>
      </section>

      {/* THREE LOGICAL WORKFLOW PORTALS */}
      <section className="mt-16">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-periwinkle-400">
              3-Pillar Architecture
            </span>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-white">
              Three Frictionless Portals. One Unified Multi-Tenant Cloud.
            </h2>
          </div>
          <span className="font-mono text-xs text-zinc-400">
            Partitioned by <code className="text-emerald-400">business_id</code>{' '}
            UUID + PostgreSQL RLS
          </span>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Portal A */}
          <div className="glass-card-interactive flex flex-col justify-between p-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-lg border border-periwinkle-500/30 bg-periwinkle-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-periwinkle-300">
                  MODULE A • /portal/[salon-slug]
                </span>
                <Globe className="h-5 w-5 text-periwinkle-400" />
              </div>
              <h3 className="mt-4 text-xl font-bold text-white">
                Public Booking & Acquisition Engine
              </h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                Every salon gets a dedicated SSR booking storefront (e.g.,{' '}
                <code className="text-zinc-200">
                  pawtrackr.live/bespoke-grooming
                </code>
                ). Pet parents select salon-custom packages, disclose coat/bite
                flags, and lock in open time slots without phone tag.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Dynamic JSONB service catalog per business_id
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Upfront matted coat & handling disclosure
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Zero-login 30-second mobile self-scheduling
                </li>
              </ul>
            </div>
            <div className="mt-6 flex items-center gap-3 border-t border-white/[0.07] pt-4">
              <Link
                href="/portal/bespoke-grooming"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-periwinkle-300 hover:text-periwinkle-200"
              >
                Explore Bespoke Studio Portal <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <span className="text-zinc-600">•</span>
              <Link
                href="/portal/splash-grooming"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white"
              >
                Splash Mobile Van
              </Link>
            </div>
          </div>

          {/* Portal B */}
          <div className="glass-card-interactive flex flex-col justify-between p-6 border-periwinkle-500/35">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-300">
                  MODULE B • /dashboard
                </span>
                <Command className="h-5 w-5 text-emerald-400" />
              </div>
              <h3 className="mt-4 text-xl font-bold text-white">
                Owner & Staff Command Center
              </h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                Unified appointment & walk-in pipeline equipped with our
                sub-10ms multi-token search engine, instant behavior safety
                auras, and 4-step atomic Decimal POS checkout.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Simultaneous name + phone digits + breed search
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  4-step fixed-point cent POS & drawer reconciliation
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Live tenant switcher proving RLS isolation
                </li>
              </ul>
            </div>
            <div className="mt-6 border-t border-white/[0.07] pt-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300 hover:text-emerald-200"
              >
                Launch Live Salon Command Center{' '}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Portal C */}
          <div className="glass-card-interactive flex flex-col justify-between p-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-lg border border-periwinkle-500/30 bg-periwinkle-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-periwinkle-300">
                  MODULE C • /client/[id]
                </span>
                <Heart className="h-5 w-5 text-periwinkle-400" />
              </div>
              <h3 className="mt-4 text-xl font-bold text-white">
                Client Retention & Report Card Portal
              </h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                Transforms one-time walk-ins into lifetime VIP clients with
                digital grooming report cards, weight history curves, high-res
                before/after galleries, and automatic loyalty rewards.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Interactive Before & After coat transformation gallery
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Historical weight logs & stylist health notes
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Automatic points unlock & 1-tap rebooking
                </li>
              </ul>
            </div>
            <div className="mt-6 border-t border-white/[0.07] pt-4">
              <Link
                href="/client/cl-101"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-periwinkle-300 hover:text-periwinkle-200"
              >
                Inspect Bello’s Retention Portal{' '}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* COMPETITOR BENCHMARK MATRIX */}
      <section className="mt-20">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
            Architectural Benchmark
          </span>
          <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-white">
            Why Grooming Salons Upgrade From Legacy Software to Pawtrackr
          </h2>
        </div>

        <div className="mt-8 overflow-x-auto rounded-3xl border border-white/[0.08] bg-obsidian-800/80 shadow-glass">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] bg-obsidian-900/90 text-zinc-400">
                <th className="py-4 pl-6 pr-4 font-semibold">
                  Core Capability
                </th>
                <th className="px-4 py-4 font-bold text-periwinkle-300">
                  Pawtrackr Web
                </th>
                <th className="px-4 py-4 font-medium text-zinc-400">MoeGo</th>
                <th className="px-4 py-4 font-medium text-zinc-400">
                  DaySmart Pet
                </th>
                <th className="py-4 pl-4 pr-6 font-medium text-zinc-400">
                  PawLoyalty
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-zinc-300">
              <tr>
                <td className="py-4 pl-6 pr-4 font-medium text-white">
                  Client / Pet Search Latency
                </td>
                <td className="px-4 py-4 font-mono font-bold text-emerald-400">
                  &lt; 1.0 ms (Multi-Token In-Memory)
                </td>
                <td className="px-4 py-4 text-zinc-400">350–900 ms REST lag</td>
                <td className="px-4 py-4 text-zinc-400">1.2s+ page reload</td>
                <td className="py-4 pl-4 pr-6 text-zinc-400">1.5s+ query</td>
              </tr>
              <tr>
                <td className="py-4 pl-6 pr-4 font-medium text-white">
                  POS Financial Math Engine
                </td>
                <td className="px-4 py-4 font-semibold text-periwinkle-300">
                  4-Step Atomic Integer-Cent & Basis-Point
                </td>
                <td className="px-4 py-4 text-zinc-400">
                  Multi-screen floating point
                </td>
                <td className="px-4 py-4 text-zinc-400">
                  Legacy batch closeout
                </td>
                <td className="py-4 pl-4 pr-6 text-zinc-400">
                  External terminal sync
                </td>
              </tr>
              <tr>
                <td className="py-4 pl-6 pr-4 font-medium text-white">
                  Behavior & Bite Safety Flags
                </td>
                <td className="px-4 py-4 font-semibold text-emerald-400">
                  Luminous Real-Time Behavior Auras
                </td>
                <td className="px-4 py-4 text-zinc-400">Buried text notes</td>
                <td className="px-4 py-4 text-zinc-400">Static icon codes</td>
                <td className="py-4 pl-4 pr-6 text-zinc-400">Hidden notes</td>
              </tr>
              <tr>
                <td className="py-4 pl-6 pr-4 font-medium text-white">
                  Multi-Tenant Security Standard
                </td>
                <td className="px-4 py-4 font-semibold text-white">
                  PostgreSQL RLS per <code className="text-emerald-300">business_id</code>
                </td>
                <td className="px-4 py-4 text-zinc-400">App-layer filtering</td>
                <td className="px-4 py-4 text-zinc-400">Legacy shared DB</td>
                <td className="py-4 pl-4 pr-6 text-zinc-400">Shared schema</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 60-SECOND SALON LAUNCHER & STRIPE BILLING PLANS */}
      <section id="launch" className="mt-20 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Pricing Tiers (7 columns) */}
        <div className="space-y-6 lg:col-span-7">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-periwinkle-400">
              Stripe Billing & Connect Integrated
            </span>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-white">
              Transparent Enterprise B2B Pricing
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              No hidden per-groomer fees or surprise SMS markups. Launch your
              isolated tenant in 60 seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {(['solo_van', 'salon_pro'] as const).map((key) => {
              const plan = SAAS_PLANS[key];
              const active = selectedPlan === key;
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(key)}
                  className={`cursor-pointer rounded-3xl border p-6 transition-all ${
                    active
                      ? 'border-periwinkle-500 bg-obsidian-700/90 shadow-periwinkle-glow'
                      : 'border-white/[0.08] bg-obsidian-800/60 hover:border-white/[0.18]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
                      {key === 'salon_pro' ? 'Most Popular' : 'Independent / Van'}
                    </span>
                    <span
                      className={`h-4 w-4 rounded-full border ${
                        active
                          ? 'border-periwinkle-400 bg-periwinkle-500'
                          : 'border-zinc-600'
                      }`}
                    />
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-white">
                    {plan.name}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-mono text-4xl font-extrabold text-white">
                      ${plan.monthlyPriceDollars}
                    </span>
                    <span className="text-xs text-zinc-400">/ month</span>
                  </div>
                  <ul className="mt-5 space-y-2.5 text-xs text-zinc-300">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* 60-Second Instant Salon Provisioner (5 columns) */}
        <div className="glass-card p-6 sm:p-8 lg:col-span-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
              60-Second Tenant Provisioner
            </span>
            <Lock className="h-4 w-4 text-zinc-400" />
          </div>

          <h3 className="mt-4 text-xl font-bold text-white">
            Claim Your Public Booking URL
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Generates your isolated <code className="text-periwinkle-300">business_id</code>{' '}
            partition and live self-booking portal immediately.
          </p>

          {provisionedResult ? (
            <div className="mt-6 space-y-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
              <div className="flex items-center gap-2 text-emerald-300">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-sm font-bold">
                  Tenant Partition Provisioned!
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-zinc-300">
                <div>
                  Salon:{' '}
                  <span className="font-semibold text-white">
                    {provisionedResult.name}
                  </span>
                </div>
                <div>
                  Tenant UUID:{' '}
                  <span className="font-mono text-emerald-300">
                    {provisionedResult.businessId}
                  </span>
                </div>
                <div>
                  Public URL:{' '}
                  <span className="font-mono text-periwinkle-300">
                    pawtrackr.live/{provisionedResult.slug}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href={`/portal/${provisionedResult.slug}`}
                  className="w-full rounded-xl bg-periwinkle-500 py-2.5 text-center text-xs font-bold text-obsidian-950 transition hover:bg-periwinkle-400"
                >
                  Open Your Public Booking Page →
                </Link>
                <Link
                  href="/dashboard"
                  className="w-full rounded-xl border border-white/[0.12] bg-obsidian-900 py-2.5 text-center text-xs font-semibold text-white hover:bg-obsidian-700"
                >
                  Enter Owner Command Center
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleInstantLaunch} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  Salon or Mobile Van Name
                </label>
                <input
                  type="text"
                  required
                  value={salonName}
                  onChange={(e) => handleSalonNameChange(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3.5 py-2.5 text-sm text-white focus:border-periwinkle-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  Public Self-Booking Slug
                </label>
                <div className="mt-1.5 flex items-center rounded-xl border border-white/[0.12] bg-obsidian-900 px-3.5 py-2.5 text-xs">
                  <span className="text-zinc-500">pawtrackr.live/</span>
                  <input
                    type="text"
                    required
                    value={salonSlug}
                    onChange={(e) => setSalonSlug(e.target.value)}
                    className="ml-1 w-full bg-transparent font-mono text-periwinkle-300 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  Owner Work Email
                </label>
                <input
                  type="email"
                  required
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3.5 py-2.5 text-sm text-white focus:border-periwinkle-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isProvisioning}
                className="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {isProvisioning
                  ? 'Provisioning Tenant & RLS Policies...'
                  : `Launch Salon (${
                      selectedPlan === 'salon_pro' ? '$149/mo' : '$119/mo'
                    })`}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
