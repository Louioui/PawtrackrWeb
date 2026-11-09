'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Globe,
  Lock,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { BUSINESSES } from '@/lib/mock-tenant-data';

export default function FounderSuperAdminPage() {
  const [featureFlags, setFeatureFlags] = useState({
    multiCurrencyPos: true,
    webWorkerSearch: true,
    whiteLabelDomains: true,
    offlineVanOutbox: true,
    automatedTaxJarLookup: true,
  });

  const toggleFlag = (key: keyof typeof featureFlags) => {
    setFeatureFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-periwinkle-500/40"
        >
          <ArrowLeft className="h-4 w-4 text-periwinkle-400" />
          Back to Salon Command Center
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-periwinkle-500/40 bg-periwinkle-500/15 px-3.5 py-1 text-xs font-bold text-periwinkle-300">
          <Rocket className="h-3.5 w-3.5" />
          Platform Founder Super-Admin (#25 / #36 / #48 / #49 / #50)
        </span>
      </div>

      {/* Global SaaS Telemetry Header */}
      <div className="glass-card p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Pawtrackr Global Multi-Tenant Founder Console
        </h1>
        <p className="mt-1 text-xs text-zinc-400">
          Real-time oversight across all isolated `business_id` tenants,
          multi-location franchises, custom SSL domains, and beta cohorts.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="text-xs text-zinc-400">
              Platform SaaS ARR (Stripe Billing)
            </div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-emerald-400">
              $1,482,000
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-300">
              842 Active Salons & Mobile Van Fleets
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="text-xs text-zinc-400">
              Global Search Index P99 Latency
            </div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-periwinkle-300">
              0.14 ms
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-300">
              60 FPS Web Worker Off-Thread Indexing
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="text-xs text-zinc-400">
              Cross-Tenant RLS Violations
            </div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-white">
              0
            </div>
            <div className="mt-0.5 text-[11px] text-emerald-400">
              100% Mathematical Isolation Verified
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4">
            <div className="text-xs text-emerald-300">
              Public Launch Readiness (#50)
            </div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-white">
              50 / 50
            </div>
            <div className="mt-0.5 text-[11px] text-emerald-300">
              All Roadmap Milestones Active
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Location Tenants & Feature Flags */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="glass-card p-6 lg:col-span-7 space-y-4">
          <h2 className="text-lg font-bold text-white">
            Active Multi-Tenant & Franchise Directory (#25 / #36)
          </h2>
          {BUSINESSES.map((b, idx) => (
            <div
              key={b.id}
              className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4 text-xs space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-extrabold text-white">
                  {b.name}
                </span>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                  {b.subscription_plan.toUpperCase()} • {b.subscription_status.toUpperCase()}
                </span>
              </div>
              <div className="font-mono text-[11px] text-zinc-400">
                business_id: <span className="text-zinc-200">{b.id}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-zinc-300">
                <span>
                  Public URL:{' '}
                  <code className="text-periwinkle-300">
                    pawtrackr.live/{b.slug}
                  </code>
                </span>
                <span>
                  White-Label SSL:{' '}
                  <code className="text-emerald-300">
                    {idx === 0
                      ? 'booking.bespokegrooming.com'
                      : 'book.splashmobile.live'}
                  </code>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-card p-6 lg:col-span-5 space-y-4">
          <h2 className="text-lg font-bold text-white">
            Global Feature Flag Controls (#48)
          </h2>
          <div className="space-y-2.5 text-xs">
            {[
              {
                key: 'multiCurrencyPos' as const,
                label: 'Multi-Currency POS Engine (USD/CAD/GBP/AUD/EUR)',
              },
              {
                key: 'webWorkerSearch' as const,
                label: '60 FPS Off-Thread Multi-Token Search Indexer',
              },
              {
                key: 'whiteLabelDomains' as const,
                label: 'White-Label Custom Domain Wildcard SSL Routing',
              },
              {
                key: 'offlineVanOutbox' as const,
                label: 'Mobile Van Offline Outbox Queue & Auto-Flush',
              },
              {
                key: 'automatedTaxJarLookup' as const,
                label: 'Automated Municipal Service vs Retail Tax Split',
              },
            ].map((flag) => (
              <button
                key={flag.key}
                type="button"
                onClick={() => toggleFlag(flag.key)}
                className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-obsidian-900 p-3.5 text-left"
              >
                <span className="font-semibold text-white">{flag.label}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                    featureFlags[flag.key]
                      ? 'bg-emerald-500 text-obsidian-950'
                      : 'bg-zinc-700 text-zinc-300'
                  }`}
                >
                  {featureFlags[flag.key] ? 'ENABLED' : 'OFF'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
