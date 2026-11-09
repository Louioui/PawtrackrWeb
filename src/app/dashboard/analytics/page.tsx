'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Database,
  DollarSign,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  BUSINESSES,
  TENANT_BESPOKE_ID,
} from '@/lib/mock-tenant-data';
import { formatCurrency } from '@/lib/pos-math';

const BREED_REVENUE_MIX = [
  {
    category: 'Doodles, Poodles & Asian Fusion Trim',
    sharePct: 48,
    avgTicket: 184.5,
    monthlyRev: 18450,
    color: 'from-periwinkle-500 to-periwinkle-300',
  },
  {
    category: 'Double-Coat Deshed & Hydro Detox',
    sharePct: 24,
    avgTicket: 138.0,
    monthlyRev: 9240,
    color: 'from-emerald-500 to-emerald-300',
  },
  {
    category: 'Senior Sanctuary & Comfort Care',
    sharePct: 16,
    avgTicket: 152.0,
    monthlyRev: 6080,
    color: 'from-purple-500 to-purple-300',
  },
  {
    category: 'Sensory Puppy Intro & Breed Tidy',
    sharePct: 12,
    avgTicket: 94.0,
    monthlyRev: 4512,
    color: 'from-amber-500 to-amber-300',
  },
];

const ADDON_PERFORMANCE = [
  {
    name: 'Organic Blueberry Tear-Stain Facial',
    price: 18,
    attachRatePct: 64,
    monthlyRevenue: 2880,
  },
  {
    name: 'Carding & Undercoat De-Shedding Ritual',
    price: 28,
    attachRatePct: 41,
    monthlyRevenue: 2870,
  },
  {
    name: 'Humane Dematting & Coat Rescue (+20m)',
    price: 25,
    attachRatePct: 34,
    monthlyRevenue: 2125,
  },
  {
    name: 'Ultrasonic Emmi-Pet Tartar & Breath Care',
    price: 32,
    attachRatePct: 29,
    monthlyRevenue: 2320,
  },
];

export default function ExecutiveSalonAnalyticsPage() {
  const [activeBusinessId, setActiveBusinessId] =
    useState<string>(TENANT_BESPOKE_ID);

  const business =
    BUSINESSES.find((b) => b.id === activeBusinessId) ?? BUSINESSES[0];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {/* Top Sub-nav */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-periwinkle-500/40"
        >
          <ArrowLeft className="h-4 w-4 text-periwinkle-400" />
          Back to Salon Command Center
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/import"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
          >
            <Database className="h-3.5 w-3.5 text-periwinkle-400" />
            1-Click MoeGo / DaySmart Importer
          </Link>
        </div>
      </div>

      {/* Header */}
      <div className="glass-card p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <BarChart3 className="h-4 w-4" />
              <span>Executive Financial & Retention Intelligence</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white">
              {business.name} — Performance & Upsell Telemetry
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Real-time ticket expansion, spa add-on attachment rates, and
              no-show deposit protection across all devices.
            </p>
          </div>

          <div className="flex gap-1.5 rounded-xl border border-white/[0.08] bg-obsidian-900 p-1.5">
            {BUSINESSES.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBusinessId(b.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  b.id === business.id
                    ? 'bg-periwinkle-500 text-obsidian-950'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Executive Metrics */}
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-white/[0.08] pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="text-xs text-zinc-400">
              30-Day Gross Grooming Volume
            </div>
            <div className="mt-1.5 font-mono text-2xl font-extrabold text-white">
              $38,282.00
            </div>
            <div className="mt-1 text-[11px] font-semibold text-emerald-400">
              +24.8% vs Legacy Software Baseline
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="text-xs text-zinc-400">
              Average Atomic POS Ticket
            </div>
            <div className="mt-1.5 font-mono text-2xl font-extrabold text-periwinkle-300">
              $168.40
            </div>
            <div className="mt-1 text-[11px] text-zinc-400">
              Industry Avg: $92.00 (+83% lift)
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="text-xs text-zinc-400">
              Spa Add-On Attachment Rate
            </div>
            <div className="mt-1.5 font-mono text-2xl font-extrabold text-emerald-400">
              68.4%
            </div>
            <div className="mt-1 text-[11px] text-zinc-300">
              +$10,195/mo in pure spa margin
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4">
            <div className="text-xs text-emerald-300">
              No-Show Deposit Recovery
            </div>
            <div className="mt-1.5 font-mono text-2xl font-extrabold text-white">
              $1,420.00
            </div>
            <div className="mt-1 text-[11px] text-emerald-300">
              0.8% No-Show Rate (Down from 9.4%)
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Grid */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left 7 Cols: Revenue by Breed & Package Mix */}
        <div className="glass-card p-6 lg:col-span-7 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-white">
              Revenue & Ticket Mix by Coat / Breed Category
            </h2>
            <p className="text-xs text-zinc-400">
              Computed from settled atomic POS transactions for {business.name}.
            </p>
          </div>

          <div className="space-y-4">
            {BREED_REVENUE_MIX.map((item) => (
              <div
                key={item.category}
                className="rounded-2xl border border-white/[0.07] bg-obsidian-900/75 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-white">{item.category}</span>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-zinc-400">
                      Avg Ticket:{' '}
                      <strong className="text-periwinkle-300">
                        {formatCurrency(item.avgTicket)}
                      </strong>
                    </span>
                    <span className="font-bold text-emerald-400">
                      {formatCurrency(item.monthlyRev)} ({item.sharePct}%)
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-obsidian-800">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${item.color}`}
                    style={{ width: `${item.sharePct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right 5 Cols: High-Margin Spa Add-On Leaderboard */}
        <div className="glass-card p-6 lg:col-span-5 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-white">
              Self-Booking & POS Add-On Conversion
            </h2>
            <p className="text-xs text-zinc-400">
              Upgrades selected by pet parents on `/portal/{business.slug}` or
              at front-desk intake.
            </p>
          </div>

          <div className="space-y-3">
            {ADDON_PERFORMANCE.map((addon) => (
              <div
                key={addon.name}
                className="rounded-2xl border border-white/[0.07] bg-obsidian-900/75 p-3.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{addon.name}</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatCurrency(addon.monthlyRevenue)}/mo
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Unit Price: {formatCurrency(addon.price)}</span>
                  <span className="font-mono font-semibold text-periwinkle-300">
                    {addon.attachRatePct}% Attachment Rate
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
