'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Gift,
  Globe,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import {
  BUSINESSES,
  TENANT_BESPOKE_ID,
} from '@/lib/mock-tenant-data';
import {
  SupportedCurrency,
  calculateMultiStylistSplit,
  convertCurrencyCents,
  formatCents,
  toCents,
} from '@/lib/pos-math';
import {
  appendAuditLogEntry,
  exportFullSalonArchiveJson,
  loadAuditLogs,
} from '@/lib/realtime-store';

interface RetailItem {
  id: string;
  sku: string;
  name: string;
  priceDollars: number;
  stock: number;
  reorderThreshold: number;
  commissionPct: number;
}

interface GiftCardItem {
  id: string;
  code: string;
  type: 'gift_card' | 'prepaid_5_pack';
  clientName: string;
  initialDollars: number;
  remainingDollars: number;
  remainingVisits: number;
}

const INITIAL_INVENTORY: RetailItem[] = [
  {
    id: 'ret-1',
    sku: 'SKU-BLUE-01',
    name: 'Organic Blueberry Tear-Stain Home Cleanser (8oz)',
    priceDollars: 28.0,
    stock: 14,
    reorderThreshold: 5,
    commissionPct: 15,
  },
  {
    id: 'ret-2',
    sku: 'SKU-SLICK-02',
    name: 'Chris Christensen Coral Long-Pin Slicker Brush',
    priceDollars: 68.0,
    stock: 3,
    reorderThreshold: 5,
    commissionPct: 20,
  },
  {
    id: 'ret-3',
    sku: 'SKU-BALM-03',
    name: 'Manuka Honey & Shea Organic Paw Pad Balm',
    priceDollars: 22.0,
    stock: 19,
    reorderThreshold: 6,
    commissionPct: 15,
  },
  {
    id: 'ret-4',
    sku: 'SKU-SILK-04',
    name: 'Silk Keratin Dematting Leave-In Mist',
    priceDollars: 34.0,
    stock: 4,
    reorderThreshold: 5,
    commissionPct: 15,
  },
];

const INITIAL_GIFT_CARDS: GiftCardItem[] = [
  {
    id: 'gc-1',
    code: 'PAW-VIP-8842',
    type: 'prepaid_5_pack',
    clientName: 'Sophia Chen-Alvarez (Bello)',
    initialDollars: 725.0,
    remainingDollars: 435.0,
    remainingVisits: 3,
  },
  {
    id: 'gc-2',
    code: 'GIFT-HOLIDAY-200',
    type: 'gift_card',
    clientName: 'Hannah Lindqvist (Mochi)',
    initialDollars: 200.0,
    remainingDollars: 145.0,
    remainingVisits: 0,
  },
];

export default function EnterpriseOperationsSuitePage() {
  const [activeTab, setActiveTab] = useState<
    'inventory' | 'gift_cards' | 'shifts' | 'reviews_intake' | 'audit_billing'
  >('inventory');
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');
  const [inventory, setInventory] = useState<RetailItem[]>(INITIAL_INVENTORY);
  const [giftCards, setGiftCards] =
    useState<GiftCardItem[]>(INITIAL_GIFT_CARDS);
  const [auditLogs, setAuditLogs] = useState(() => loadAuditLogs());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Gift card generator inputs
  const [newGcClient, setNewGcClient] = useState('Amara Patel (Duchess)');
  const [newGcAmount, setNewGcAmount] = useState('250');

  // Live Salon Floorplan & Brachycephalic Dryer Safety Timer State
  const [dryerMinutesLeft, setDryerMinutesLeft] = useState<number>(11);
  const [dryerSafetyAlertActive, setDryerSafetyAlertActive] =
    useState<boolean>(false);

  const business = BUSINESSES[0];

  const formatInSelectedCurrency = (usdDollars: number) => {
    const convertedCents = convertCurrencyCents(toCents(usdDollars), currency);
    return formatCents(convertedCents, currency);
  };

  // Multi-Stylist Tip Split Demo (#4, #43)
  const multiStylistSplit = useMemo(() => {
    return calculateMultiStylistSplit(4500, [
      { staffId: 'st-101', name: 'Elena Vance (Master Scissor)', sharePercent: 65 },
      { staffId: 'st-102', name: 'Julian Kwon (Hydro Bath & Prep)', sharePercent: 35 },
    ]);
  }, []);

  const handleSellRetailItem = (item: RetailItem) => {
    setInventory((prev) =>
      prev.map((r) =>
        r.id === item.id ? { ...r, stock: Math.max(0, r.stock - 1) } : r
      )
    );
    const updatedLogs = appendAuditLogEntry({
      businessId: TENANT_BESPOKE_ID,
      actorName: 'Maya Lin',
      actorRole: 'front_desk',
      actionType: 'POS_SETTLED',
      targetEntity: `${item.sku} (${item.name})`,
      detail: `Deducted 1 unit via POS checkout (+${item.commissionPct}% stylist retail commission)`,
    });
    setAuditLogs(updatedLogs);
    setToastMessage(
      `Sold 1x ${item.name} (${formatInSelectedCurrency(
        item.priceDollars
      )}). Stock auto-deducted & audit log recorded.`
    );
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleIssueGiftCard = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newGcAmount) || 200;
    const code = `PAW-GC-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;
    const nextCard: GiftCardItem = {
      id: `gc-${Date.now().toString(36)}`,
      code,
      type: 'gift_card',
      clientName: newGcClient,
      initialDollars: amt,
      remainingDollars: amt,
      remainingVisits: 0,
    };
    setGiftCards((prev) => [nextCard, ...prev]);
    const updatedLogs = appendAuditLogEntry({
      businessId: TENANT_BESPOKE_ID,
      actorName: 'Elena Vance',
      actorRole: 'owner',
      actionType: 'GIFT_CARD_ISSUED',
      targetEntity: code,
      detail: `Issued $${amt.toFixed(2)} digital gift card for ${newGcClient}`,
    });
    setAuditLogs(updatedLogs);
    setToastMessage(`Issued Digital Gift Card ${code} for ${newGcClient}!`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {/* Sub-nav */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-periwinkle-500/40"
        >
          <ArrowLeft className="h-4 w-4 text-periwinkle-400" />
          Back to Salon Command Center
        </Link>

        {/* International Multi-Currency Switcher (#4, #42) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-obsidian-800 px-3 py-1.5 text-xs">
            <Globe className="h-3.5 w-3.5 text-periwinkle-400" />
            <span className="text-zinc-400">Currency (#42):</span>
            {(
              ['USD', 'CAD', 'GBP', 'AUD', 'EUR'] as SupportedCurrency[]
            ).map((curr) => (
              <button
                key={curr}
                type="button"
                onClick={() => setCurrency(curr)}
                className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-bold transition ${
                  currency === curr
                    ? 'bg-periwinkle-500 text-obsidian-950'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>

          <Link
            href="/admin"
            className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
          >
            Founder Super-Admin (#48) →
          </Link>
        </div>
      </div>

      {toastMessage && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-500/45 bg-emerald-500/15 px-5 py-3.5 text-xs font-medium text-emerald-200 shadow-emerald-glow">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            {toastMessage}
          </span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="font-bold text-emerald-300"
          >
            OK
          </button>
        </div>
      )}

      {/* LIVE SALON FLOORPLAN, SUITE OCCUPANCY & DRYER SAFETY TIMER MAP */}
      <div className="mb-6 glass-card border-periwinkle-500/35 p-6 shadow-periwinkle-glow">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <Sparkles className="h-4 w-4" />
              <span>
                Live Salon Floorplan, Suite Map & Brachycephalic Dryer Safety
              </span>
            </div>
            <h2 className="mt-1 text-xl font-extrabold text-white">
              Real-Time Hydro-Tub, Table & Luxury Suite Occupancy Map
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Prevents placing <code className="text-rose-300">CAGE REACTIVE</code>{' '}
              dogs next to anxious pets and enforces 15-minute ambient dryer
              cutoffs for French Bulldogs, Pugs & Seniors.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDryerMinutesLeft(15);
                setDryerSafetyAlertActive(false);
                setToastMessage(
                  'Dryer Suite #3 Reset: Fresh 15-minute cool-air cycle started for Rocco (French Bulldog).'
                );
              }}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
            >
              ↺ Reset 15m Dryer Timer
            </button>
            <button
              type="button"
              onClick={() => {
                setDryerMinutesLeft(1);
                setDryerSafetyAlertActive(true);
                setToastMessage(
                  'SAFETY CUTOFF TRIGGERED: Suite #3 Brachycephalic Dryer Timer reached 1m! Auto-shutoff engaged for Rocco.'
                );
              }}
              className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/25"
            >
              ⚠️ Simulate Dryer Safety Cutoff Alert
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              zone: 'Hydro-Bath Sanctuary #1',
              dog: 'Bello (Mini Goldendoodle)',
              stylist: 'Julian Kwon',
              badge: 'OZONE HYDRO ACTIVE',
              badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
              note: 'Warm blueberry facial soaking (8 mins elapsed)',
            },
            {
              zone: 'Hydraulic Styling Table #1',
              dog: 'Zephyr (Standard Poodle)',
              stylist: 'Elena Vance',
              badge: 'HAND-SCISSORING',
              badgeColor:
                'bg-periwinkle-500/20 text-periwinkle-300 border-periwinkle-500/40',
              note: '3/4" stainless comb body + Asian fusion ears',
            },
            {
              zone: 'Drying Suite #3 (Brachycephalic)',
              dog: 'Rocco (French Bulldog)',
              stylist: 'Sora Takahashi',
              badge: dryerSafetyAlertActive
                ? '⚠️ 1m LEFT • AUTO-SHUTOFF'
                : `⏱️ ${dryerMinutesLeft}m DRYER TIMER`,
              badgeColor: dryerSafetyAlertActive
                ? 'bg-rose-500 text-obsidian-950 font-extrabold animate-pulse'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40',
              note: ' Zero-heat ambient air only • 68.5°F sensor verified',
            },
            {
              zone: 'Quiet Cardiac Suite #2',
              dog: 'Mochi (12yo Toy Poodle)',
              stylist: 'Sora Takahashi',
              badge: 'HEART MURMUR SAFE ZONE',
              badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
              note: 'Acoustic-damped glass suite • Low-stress handling',
            },
            {
              zone: 'Isolated Corner Suite #4',
              dog: 'Kobe (Shiba Inu)',
              stylist: 'Elena Vance',
              badge: '🛡️ CAGE REACTIVE BUFFER',
              badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
              note: 'Adjacent Suite #5 automatically locked empty for visual privacy',
            },
            {
              zone: 'Buffer Suite #5 (Auto-Locked)',
              dog: 'Empty Safety Buffer Zone',
              stylist: 'AI Adjacency Guard',
              badge: 'LOCKED FOR KOBE PRIVACY',
              badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
              note: 'Prevents fence-fighting or barking stress next to Suite #4',
            },
          ].map((station) => (
            <div
              key={station.zone}
              className="rounded-2xl border border-white/[0.08] bg-obsidian-900/85 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-bold text-zinc-400">
                  {station.zone}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold ${station.badgeColor}`}
                >
                  {station.badge}
                </span>
              </div>
              <div className="mt-2 text-sm font-extrabold text-white">
                {station.dog}
              </div>
              <div className="mt-0.5 text-xs text-periwinkle-300">
                Assigned: {station.stylist}
              </div>
              <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-zinc-400">
                {station.note}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Header & 5-Module Tab Bar */}
      <div className="glass-card p-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Enterprise Salon Operations, Inventory, Shifts & Audit Suite
        </h1>
        <p className="mt-1 text-xs text-zinc-400">
          Unified control over Retail SKUs (#30), Gift Cards & Package Credits
          (#31), Staff Shifts (#29), 5-Star Review Routing (#27), and Security
          Audit Logs (#38).
        </p>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.08] pt-4">
          {[
            {
              id: 'inventory' as const,
              label: '1. Retail Inventory & SKUs (#30)',
              icon: Package,
            },
            {
              id: 'gift_cards' as const,
              label: '2. Gift Cards & Prepaid Packs (#31)',
              icon: Gift,
            },
            {
              id: 'shifts' as const,
              label: '3. Staff Shifts & Tip Splits (#29/#43)',
              icon: Users,
            },
            {
              id: 'reviews_intake' as const,
              label: '4. Reviews, Intake & Templates (#27/#28/#41)',
              icon: Star,
            },
            {
              id: 'audit_billing' as const,
              label: '5. Audit Logs, Billing & Backup (#35/#37/#38)',
              icon: ShieldCheck,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  active
                    ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
                    : 'border border-white/[0.08] bg-obsidian-900 text-zinc-300 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: RETAIL INVENTORY & AUTO-DEDUCT POS SKUS (#30) */}
      {activeTab === 'inventory' && (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {inventory.map((item) => {
            const lowStock = item.stock <= item.reorderThreshold;
            return (
              <div
                key={item.id}
                className={`glass-card p-5 flex flex-col justify-between ${
                  lowStock ? 'border-amber-500/45' : ''
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-periwinkle-300">
                      {item.sku}
                    </span>
                    {lowStock ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
                        <AlertTriangle className="h-3 w-3" />
                        LOW STOCK ({item.stock} left)
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                        In Stock: {item.stock} units
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-base font-bold text-white">
                    {item.name}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400">
                    Stylist Retail Commission: {item.commissionPct}% • Reorder
                    Threshold: {item.reorderThreshold} units
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3">
                  <span className="font-mono text-lg font-extrabold text-white">
                    {formatInSelectedCurrency(item.priceDollars)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSellRetailItem(item)}
                    className="rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-obsidian-950 hover:bg-emerald-400"
                  >
                    + Ring Up at POS (Deduct Stock)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: DIGITAL GIFT CARDS & PREPAID PACKAGES (#31) */}
      {activeTab === 'gift_cards' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            {giftCards.map((gc) => (
              <div
                key={gc.id}
                className="glass-card p-5 flex items-center justify-between"
              >
                <div>
                  <span className="rounded-md bg-periwinkle-500/20 px-2.5 py-1 font-mono text-xs font-bold text-periwinkle-300">
                    {gc.code}
                  </span>
                  <h3 className="mt-2 text-base font-bold text-white">
                    {gc.clientName}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Initial Value: {formatInSelectedCurrency(gc.initialDollars)}{' '}
                    {gc.remainingVisits > 0 &&
                      `• ${gc.remainingVisits} Prepaid Visits Remaining`}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-zinc-400">
                    Remaining Balance
                  </div>
                  <div className="font-mono text-xl font-extrabold text-emerald-400">
                    {formatInSelectedCurrency(gc.remainingDollars)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleIssueGiftCard}
            className="glass-card p-6 space-y-4 lg:col-span-5"
          >
            <h3 className="text-base font-bold text-white">
              Issue Digital Gift Card or Package Credit
            </h3>
            <div>
              <label className="block text-xs text-zinc-300">
                Recipient Client / Pet
              </label>
              <input
                type="text"
                value={newGcClient}
                onChange={(e) => setNewGcClient(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-300">
                Credit Amount ({currency})
              </label>
              <input
                type="number"
                value={newGcAmount}
                onChange={(e) => setNewGcAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 font-mono text-xs text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-periwinkle-500 py-3 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow"
            >
              Generate Instant Gift Card Code
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: STAFF SHIFT SCHEDULER & MULTI-STYLIST TIP SPLITS (#29, #43) */}
      {activeTab === 'shifts' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="glass-card p-6 lg:col-span-7 space-y-4">
            <h3 className="text-lg font-bold text-white">
              Weekly Grooming Station & Shift Load Balancer (#29)
            </h3>
            {[
              {
                name: 'Elena Vance (Owner)',
                station: 'Styling Table #1',
                shift: '08:00 AM – 05:00 PM',
                dogsBooked: '5 / 6 Dogs',
                status: 'Active On Floor',
              },
              {
                name: 'Julian Kwon (Senior Stylist)',
                station: 'Hydro Tub #2 & Table #2',
                shift: '08:30 AM – 05:30 PM',
                dogsBooked: '5 / 6 Dogs',
                status: 'Active On Floor',
              },
              {
                name: 'Sora Takahashi (Senior Sanctuary)',
                station: 'Quiet Suite #3',
                shift: '09:00 AM – 04:30 PM',
                dogsBooked: '4 / 4 Senior Dogs',
                status: 'Active On Floor',
              },
            ].map((s) => (
              <div
                key={s.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4 text-xs"
              >
                <div>
                  <div className="font-bold text-white">{s.name}</div>
                  <div className="text-zinc-400">
                    {s.station} • {s.shift}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-periwinkle-300">
                    {s.dogsBooked}
                  </span>
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                    {s.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-card p-6 lg:col-span-5 space-y-4">
            <h3 className="text-lg font-bold text-white">
              Collaborative Multi-Stylist Tip Split (#4 / #43)
            </h3>
            <p className="text-xs text-zinc-400">
              Largest-remainder penny allocation guarantees 0¢ lost when
              splitting a $45.00 gratuity between Bather and Master Stylist:
            </p>
            <div className="space-y-2.5">
              {multiStylistSplit.map((row) => (
                <div
                  key={row.staffId}
                  className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-obsidian-900 p-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-white">{row.name}</div>
                    <div className="text-zinc-400">
                      Split Share: {row.sharePercent}%
                    </div>
                  </div>
                  <span className="font-mono text-sm font-extrabold text-emerald-400">
                    {formatInSelectedCurrency(row.allocatedDollars)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: REVIEWS, CUSTOM INTAKE FORMS & SMS TEMPLATES (#27, #28, #41) */}
      {activeTab === 'reviews_intake' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">
              Automated 5-Star Google Review Routing (#27)
            </h3>
            <p className="text-xs text-zinc-400">
              4–5 star ratings route automatically to your public Google
              Business Profile; 1–3 star feedback routes privately to the owner
              inbox.
            </p>
            <div className="space-y-2.5 text-xs">
              <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5">
                <div className="flex justify-between font-bold text-emerald-300">
                  <span>★★★★★ Sophia Chen-Alvarez (Bello)</span>
                  <span>Routed to Google Maps ✓</span>
                </div>
                <p className="mt-1 text-zinc-200">
                  &ldquo;Elena’s Asian fusion teddy trim is unmatched in SF.
                  Loved the instant digital report card!&rdquo;
                </p>
              </div>
              <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5">
                <div className="flex justify-between font-bold text-emerald-300">
                  <span>★★★★★ Hannah Lindqvist (Mochi)</span>
                  <span>Routed to Google Maps ✓</span>
                </div>
                <p className="mt-1 text-zinc-200">
                  &ldquo;The only salon I trust with my 12yo senior toy poodle
                  with a heart murmur.&rdquo;
                </p>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">
              Custom Intake Questions & Notification Templates (#28 / #41)
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="rounded-xl border border-white/[0.08] bg-obsidian-900 p-3">
                <div className="font-bold text-periwinkle-300">
                  Intake Question #1 (Auto-Triggers `heart_murmur` Aura)
                </div>
                <p className="mt-1 text-zinc-300">
                  &ldquo;Has a veterinarian ever diagnosed your pet with a heart
                  murmur, collapsing trachea, or seizure history?&rdquo;
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-obsidian-900 p-3">
                <div className="font-bold text-emerald-300">
                  Ready-for-Pickup SMS Template (#41)
                </div>
                <p className="mt-1 font-mono text-zinc-300">
                  &ldquo;Hi {'{{client_name}}'}! {'{{pet_name}}'} is fluffed &
                  ready at {'{{salon_name}}'}. View Before/After photos & pay:{' '}
                  {'{{portal_link}}'}&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: IMMUTABLE AUDIT LOGS, BILLING & SELF-SERVICE BACKUP (#35, #37, #38) */}
      {activeTab === 'audit_billing' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="glass-card p-6 lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                Immutable Security & Price Override Audit Log (#38)
              </h3>
              <span className="font-mono text-xs text-emerald-400">
                RLS Protected
              </span>
            </div>
            <div className="space-y-2.5">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-white/[0.08] bg-obsidian-900/80 p-3.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-periwinkle-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-periwinkle-300">
                      {log.actionType}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-400">
                      {log.createdAt}
                    </span>
                  </div>
                  <div className="mt-1.5 font-bold text-white">
                    {log.actorName} ({log.actorRole}) → {log.targetEntity}
                  </div>
                  <p className="mt-0.5 text-zinc-400">{log.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6 lg:col-span-5 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-white">
                Self-Service Archive Backup & SaaS Billing (#35 / #37)
              </h3>
              <p className="mt-1 text-xs text-zinc-400">
                Download your complete multi-tenant salon archive or manage your
                Stripe Billing subscription plan.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-xs space-y-1.5">
              <div className="flex justify-between font-bold text-white">
                <span>Active SaaS Plan:</span>
                <span className="text-emerald-300">
                  Multi-Staff Salon Suite ($149/mo)
                </span>
              </div>
              <div className="flex justify-between text-zinc-300">
                <span>White-Label Custom Domain (#36):</span>
                <span className="font-mono text-periwinkle-300">
                  booking.bespokegrooming.com (SSL Active)
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                exportFullSalonArchiveJson(business.id, business.slug);
                setAuditLogs(loadAuditLogs());
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-xs font-bold text-obsidian-950 shadow-emerald-glow hover:bg-emerald-400"
            >
              <Download className="h-4 w-4" />
              Download Complete Salon Archive (JSON Backup)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
