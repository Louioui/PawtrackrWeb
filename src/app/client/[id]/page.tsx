'use client';

import React, { use, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Calendar,
  Camera,
  CheckCircle2,
  FileText,
  Gift,
  Heart,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import {
  BUSINESSES,
  CLIENTS,
  INITIAL_VISITS,
  PETS,
} from '@/lib/mock-tenant-data';
import { formatCurrency } from '@/lib/pos-math';
import { BehaviorAuraBadge } from '@/components/BehaviorAuraBadge';
import { AnatomicalCutCard } from '@/components/AnatomicalCutCard';

const REWARD_TIERS = [
  {
    id: 'rw-250',
    pointsRequired: 250,
    title: 'Complimentary Organic Blueberry Facial',
    valueLabel: '$18 Value',
  },
  {
    id: 'rw-500',
    pointsRequired: 500,
    title: '$25 Off Any Full Breed Scissor or Asian Fusion Trim',
    valueLabel: '$25 Credit',
  },
  {
    id: 'rw-1000',
    pointsRequired: 1000,
    title: 'VIP Sanctuary Ozone Hydro-Spa + Ultrasonic Dental Ritual',
    valueLabel: '$95 Value',
  },
];

export default function ClientRetentionPortalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const clientId = resolvedParams.id || 'cl-101';

  const client = useMemo(
    () => CLIENTS.find((c) => c.id === clientId) ?? CLIENTS[0],
    [clientId]
  );

  const business = useMemo(
    () =>
      BUSINESSES.find((b) => b.id === client.business_id) ?? BUSINESSES[0],
    [client.business_id]
  );

  const clientPets = useMemo(
    () => PETS.filter((p) => p.client_id === client.id),
    [client.id]
  );

  const primaryPet = clientPets[0] ?? PETS[0];

  const clientVisits = useMemo(
    () => INITIAL_VISITS.filter((v) => v.client_id === client.id),
    [client.id]
  );

  const [redeemedIds, setRedeemedIds] = useState<string[]>([]);
  const [bonusPointsSpent, setBonusPointsSpent] = useState<number>(0);
  const [photoCompareMode, setPhotoCompareMode] = useState<
    Record<string, 'slider' | 'split' | 'before' | 'after'>
  >({});
  const [sliderPositionMap, setSliderPositionMap] = useState<
    Record<string, number>
  >({});
  const [socialStoryItem, setSocialStoryItem] = useState<
    (typeof PETS)[0]['photo_gallery'][0] | null
  >(null);
  const [expressTipPct, setExpressTipPct] = useState<number>(22);
  const [autoLockNext5Weeks, setAutoLockNext5Weeks] = useState<boolean>(true);
  const [expressPaySettled, setExpressPaySettled] = useState<boolean>(false);

  const expressBaseDollars = 143.0;
  const expressTaxDollars = Number((expressBaseDollars * 0.0863).toFixed(2));
  const expressTipDollars = Number(
    ((expressBaseDollars * expressTipPct) / 100).toFixed(2)
  );
  const expressTotalDollars = Number(
    (expressBaseDollars + expressTaxDollars + expressTipDollars).toFixed(2)
  );

  const livePointsBalance = Math.max(
    0,
    client.loyalty_points -
      bonusPointsSpent +
      (expressPaySettled ? 286 + (autoLockNext5Weeks ? 100 : 0) : 0)
  );
  const progressTo1000 = Math.min(100, Math.round((livePointsBalance / 1000) * 100));

  const handleRedeemReward = (tierId: string, cost: number) => {
    if (redeemedIds.includes(tierId) || livePointsBalance < cost) return;
    setRedeemedIds((prev) => [...prev, tierId]);
    setBonusPointsSpent((prev) => prev + cost);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {/* Top Client Switcher Bar for Demo Inspection */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-obsidian-800/80 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2 text-zinc-300">
          <Heart className="h-4 w-4 text-emerald-400" />
          <span>Client Retention Portal • Isolated to</span>
          <span className="font-semibold text-white">{business.name}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-zinc-400">Switch Pet Parent Profile:</span>
          {CLIENTS.slice(0, 4).map((c) => {
            const pet = PETS.find((p) => p.client_id === c.id);
            const active = c.id === client.id;
            return (
              <Link
                key={c.id}
                href={`/client/${c.id}`}
                className={`rounded-lg px-2.5 py-1 font-medium transition ${
                  active
                    ? 'bg-periwinkle-500 text-obsidian-950 font-bold'
                    : 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.12]'
                }`}
              >
                {c.name.split(' ')[0]} ({pet?.name})
              </Link>
            );
          })}
        </div>
      </div>

      {/* CLIENT & PET HERO BANNER */}
      <div className="glass-card relative overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <img
              src={primaryPet.avatar_url}
              alt={primaryPet.name}
              className="h-24 w-24 rounded-3xl object-cover ring-2 ring-periwinkle-500/50 shadow-periwinkle-glow"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-0.5 text-[11px] font-bold text-emerald-300">
                  VIP SANCTUARY MEMBER
                </span>
                <span className="text-xs text-zinc-400">
                  Parent: <strong className="text-white">{client.name}</strong>
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-extrabold text-white">
                {primaryPet.name}’s Digital Grooming Passport
              </h1>
              <p className="mt-0.5 text-xs text-zinc-300">
                {primaryPet.breed} • {primaryPet.age_years} Years Old • Current
                Weight:{' '}
                <strong className="text-periwinkle-300">
                  {primaryPet.weight_lbs} lbs
                </strong>{' '}
                • Coat: {primaryPet.coat_type}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {primaryPet.behavior_tags.map((tag) => (
                  <BehaviorAuraBadge key={tag} tag={tag} size="xs" />
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <Link
              href={`/portal/${business.slug}`}
              className="inline-flex items-center gap-2 rounded-2xl bg-periwinkle-500 px-5 py-3 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow transition hover:bg-periwinkle-400"
            >
              <Calendar className="h-4 w-4" />
              Rebook {primaryPet.name} at {business.name} →
            </Link>
            <span className="text-[11px] text-zinc-400">
              Lifetime Salon Investment:{' '}
              <strong className="font-mono text-emerald-400">
                {formatCurrency(client.lifetime_spend)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* CURBSIDE EXPRESS SELF-CHECKOUT & 1-TAP 5-WEEK AUTO-REBOOK PASS */}
      <section className="mt-6 rounded-3xl border border-emerald-500/45 bg-obsidian-800/95 p-6 shadow-emerald-glow">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-500 px-3 py-0.5 font-mono text-[10px] font-bold uppercase text-obsidian-950">
                1-TAP CURBSIDE EXPRESS PAY & AUTO-REBOOK
              </span>
              <span className="text-xs text-emerald-300">
                Skip the front-desk line on any Android or iPhone
              </span>
            </div>
            <h2 className="mt-2 text-xl font-extrabold text-white">
              {expressPaySettled
                ? `✓ ${primaryPet.name}’s Visit Settled (${formatCurrency(
                    expressTotalDollars
                  )}) & Next 5-Week Slot Locked!`
                : `Ready for Pickup: Settle ${primaryPet.name}’s Visit & Lock Your 5-Week Slot`}
            </h2>
            <p className="mt-1 text-xs text-zinc-300">
              Service: Signature Teddy Bear & Hand-Scissor ($143.00) + Tax ($
              {expressTaxDollars.toFixed(2)}) • 100% of gratuity goes directly to
              your stylist.
            </p>
          </div>

          {!expressPaySettled ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-1.5 rounded-2xl border border-white/[0.1] bg-obsidian-900 p-1.5 text-xs">
                {[18, 22, 25].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setExpressTipPct(pct)}
                    className={`rounded-xl px-3 py-1.5 font-mono font-bold transition ${
                      expressTipPct === pct
                        ? 'bg-periwinkle-500 text-obsidian-950'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    {pct}% Tip
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setAutoLockNext5Weeks((prev) => !prev)}
                className={`rounded-2xl border px-3.5 py-2.5 text-left text-xs transition ${
                  autoLockNext5Weeks
                    ? 'border-periwinkle-500/50 bg-periwinkle-500/15 text-white'
                    : 'border-white/[0.1] bg-obsidian-900 text-zinc-400'
                }`}
              >
                <div className="font-bold">
                  {autoLockNext5Weeks ? '✓ ' : '+ '}Auto-Rebook 5-Wk Slot
                </div>
                <div className="text-[10px] text-emerald-300">
                  Dec 14 @ 10:30 AM (+100 Bonus Pts)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExpressPaySettled(true)}
                className="rounded-2xl bg-emerald-500 px-5 py-3 text-xs font-extrabold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400"
              >
                1-Tap Pay {formatCurrency(expressTotalDollars)} →
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-xs font-bold text-emerald-300">
              Receipt #EXP-9942 • +{286 + (autoLockNext5Weeks ? 100 : 0)} Loyalty
              Pts Credited!
            </div>
          )}
        </div>
      </section>

      {/* PILLAR 1: LOYALTY POINTS & REWARDS ENGINE */}
      <section className="mt-8 glass-card p-6 sm:p-8 border-periwinkle-500/30">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-periwinkle-400">
              <Award className="h-4 w-4" />
              <span>Pawtrackr Automatic Loyalty Engine</span>
            </div>
            <h2 className="mt-1 text-2xl font-bold text-white">
              {livePointsBalance} Available Loyalty Points
            </h2>
            <p className="text-xs text-zinc-400">
              Points update automatically the instant your groomer settles your
              4-step atomic POS checkout.
            </p>
          </div>

          <div className="w-full md:w-72">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-zinc-300">Progress to VIP Spa Tier</span>
              <span className="font-mono text-emerald-400">
                {livePointsBalance} / 1,000 pts
              </span>
            </div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-obsidian-900 p-0.5 border border-white/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-periwinkle-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${progressTo1000}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {REWARD_TIERS.map((tier) => {
            const isRedeemed = redeemedIds.includes(tier.id);
            const canUnlock = livePointsBalance >= tier.pointsRequired;

            return (
              <div
                key={tier.id}
                className={`flex flex-col justify-between rounded-2xl border p-4 transition ${
                  isRedeemed
                    ? 'border-emerald-500/50 bg-emerald-500/15'
                    : canUnlock
                    ? 'border-periwinkle-500/40 bg-obsidian-900/90'
                    : 'border-white/[0.07] bg-obsidian-900/50 opacity-75'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-periwinkle-300">
                      {tier.pointsRequired} PTS
                    </span>
                    <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      {tier.valueLabel}
                    </span>
                  </div>
                  <h3 className="mt-2.5 text-sm font-bold text-white">
                    {tier.title}
                  </h3>
                </div>

                <div className="mt-4 pt-2">
                  {isRedeemed ? (
                    <div className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/25 py-2 text-xs font-bold text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      Applied to Next Visit!
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canUnlock}
                      onClick={() =>
                        handleRedeemReward(tier.id, tier.pointsRequired)
                      }
                      className={`w-full rounded-xl py-2 text-xs font-bold transition ${
                        canUnlock
                          ? 'bg-periwinkle-500 text-obsidian-950 hover:bg-periwinkle-400 shadow-periwinkle-glow'
                          : 'bg-white/[0.06] text-zinc-500 cursor-not-allowed'
                      }`}
                    >
                      {canUnlock
                        ? `Redeem (${tier.pointsRequired} pts)`
                        : `Need ${
                            tier.pointsRequired - livePointsBalance
                          } more pts`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* PILLAR 2: BEFORE-AND-AFTER CLOUD PHOTO GALLERY */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <Camera className="h-4 w-4" />
              <span>Cloud Before-and-After Photo Gallery</span>
            </div>
            <h2 className="mt-1 text-2xl font-bold text-white">
              {primaryPet.name}’s Coat Transformations
            </h2>
          </div>
          <span className="text-xs text-zinc-400">
            High-Resolution Groomer Captures
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {(primaryPet.photo_gallery.length > 0
            ? primaryPet.photo_gallery
            : PETS[0].photo_gallery
          ).map((item) => {
            const mode = photoCompareMode[item.id] ?? 'slider';
            const sliderPct = sliderPositionMap[item.id] ?? 50;
            return (
              <div
                key={item.id}
                className="glass-card overflow-hidden flex flex-col justify-between"
              >
                <div className="flex items-center justify-between border-b border-white/[0.08] bg-obsidian-900/80 px-5 py-3.5 text-xs">
                  <div>
                    <span className="font-bold text-white">
                      {item.package_name}
                    </span>
                    <span className="ml-2 text-zinc-400">
                      • {item.visit_date} by {item.groomer_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                      Coat Score: {item.coat_condition_score}/10
                    </span>
                    <button
                      type="button"
                      onClick={() => setSocialStoryItem(item)}
                      className="rounded-lg border border-periwinkle-500/40 bg-periwinkle-500/15 px-2.5 py-0.5 text-[10px] font-bold text-periwinkle-200 hover:bg-periwinkle-500/25"
                    >
                      Share Story Card
                    </button>
                  </div>
                </div>

                {/* Before / After Image Display */}
                <div className="p-4">
                  <div className="mb-3 flex gap-1.5 rounded-xl bg-obsidian-900 p-1 text-xs">
                    {(['slider', 'split', 'before', 'after'] as const).map(
                      (m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            setPhotoCompareMode((prev) => ({
                              ...prev,
                              [item.id]: m,
                            }))
                          }
                          className={`flex-1 rounded-lg py-1.5 font-semibold capitalize transition ${
                            mode === m
                              ? 'bg-periwinkle-500 text-obsidian-950'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          {m === 'slider'
                            ? 'Interactive Slider'
                            : m === 'split'
                            ? 'Side-by-Side'
                            : `${m} Photo`}
                        </button>
                      )
                    )}
                  </div>

                  {mode === 'slider' ? (
                    <div className="space-y-2">
                      <div className="relative h-60 w-full overflow-hidden rounded-2xl border border-emerald-500/40 select-none">
                        <img
                          src={item.after_url}
                          alt="After groom"
                          className="h-full w-full object-cover"
                        />
                        <div
                          className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-periwinkle-400"
                          style={{ width: `${sliderPct}%` }}
                        >
                          <img
                            src={item.before_url}
                            alt="Before groom"
                            className="h-full w-full max-w-none object-cover"
                            style={{ width: '520px' }}
                          />
                        </div>
                        <span className="absolute left-3 top-3 rounded-md bg-black/80 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                          Before Intake
                        </span>
                        <span className="absolute right-3 top-3 rounded-md bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold uppercase text-obsidian-950">
                          After Finish
                        </span>
                      </div>
                      <div className="flex items-center gap-3 px-1">
                        <span className="font-mono text-[10px] text-amber-300">
                          BEFORE
                        </span>
                        <input
                          type="range"
                          min={5}
                          max={95}
                          value={sliderPct}
                          onChange={(e) =>
                            setSliderPositionMap((prev) => ({
                              ...prev,
                              [item.id]: Number(e.target.value),
                            }))
                          }
                          className="h-1.5 flex-1 cursor-ew-resize accent-periwinkle-400"
                        />
                        <span className="font-mono text-[10px] text-emerald-300">
                          AFTER
                        </span>
                      </div>
                    </div>
                  ) : mode === 'split' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08]">
                        <img
                          src={item.before_url}
                          alt="Before groom"
                          className="h-52 w-full object-cover"
                        />
                        <span className="absolute left-2.5 top-2.5 rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 backdrop-blur-md">
                          Before Intake
                        </span>
                      </div>
                      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/40">
                        <img
                          src={item.after_url}
                          alt="After groom"
                          className="h-52 w-full object-cover"
                        />
                        <span className="absolute left-2.5 top-2.5 rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-obsidian-950">
                          After Finish
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative overflow-hidden rounded-2xl border border-white/[0.1]">
                      <img
                        src={
                          mode === 'before' ? item.before_url : item.after_url
                        }
                        alt={mode}
                        className="h-64 w-full object-cover"
                      />
                      <span className="absolute left-3 top-3 rounded-md bg-black/80 px-3 py-1 text-xs font-bold uppercase text-white">
                        {mode} Grooming Photo
                      </span>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-obsidian-900/80 p-3 text-xs sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-amber-300">
                        Intake Assessment:
                      </span>
                      <p className="mt-0.5 text-zinc-400">
                        {item.before_caption}
                      </p>
                    </div>
                    <div>
                      <span className="font-semibold text-emerald-300">
                        Stylist Finish Notes:
                      </span>
                      <p className="mt-0.5 text-zinc-300">
                        {item.after_caption}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* PILLAR 3: DIGITAL REPORT CARDS & WEIGHT LOG TIMELINE */}
      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Digital Report Cards (8 cols) */}
        <div className="glass-card p-6 lg:col-span-8">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-periwinkle-400">
            <FileText className="h-4 w-4" />
            <span>Verified Grooming History & Digital Report Cards</span>
          </div>
          <h3 className="mt-1 text-xl font-bold text-white">
            Complete Visit Timeline
          </h3>

          <div className="mt-4 space-y-4">
            {clientVisits.map((visit) => (
              <div
                key={visit.id}
                className="rounded-2xl border border-white/[0.08] bg-obsidian-900/75 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-bold text-white">
                      {visit.package_name}
                    </span>
                    <span className="ml-2 font-mono text-xs text-periwinkle-300">
                      ({visit.scheduled_time.slice(0, 10)} • {visit.time_label})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                      {visit.status}
                    </span>
                    <span className="font-mono text-sm font-bold text-white">
                      {formatCurrency(visit.total_amount)}
                    </span>
                  </div>
                </div>

                <p className="mt-2.5 text-xs text-zinc-300 leading-relaxed">
                  <strong className="text-periwinkle-300">
                    Stylist Report Card:
                  </strong>{' '}
                  {visit.report_card_notes}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-white/[0.06] pt-2.5 text-[11px] text-zinc-400">
                  <span>
                    Weight Logged:{' '}
                    <strong className="text-white">
                      {visit.weight_logged_lbs} lbs
                    </strong>
                  </span>
                  <span>
                    Suite: <strong className="text-white">{visit.bay_or_van}</strong>
                  </span>
                  <span>
                    Rabies Certificate:{' '}
                    <strong className="text-emerald-400">Verified On File</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weight History Log & Health Vitals (4 cols) */}
        <div className="glass-card p-6 lg:col-span-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <Scale className="h-4 w-4" />
            <span>Longitudinal Weight & Coat Log</span>
          </div>
          <h3 className="mt-1 text-xl font-bold text-white">
            Weight Stability Tracker
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Logged on our calibrated digital scale before every hydro-bath.
          </p>

          <div className="mt-4 space-y-2.5">
            {primaryPet.weight_history.map((entry, idx) => (
              <div
                key={entry.date}
                className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-obsidian-900/80 px-3.5 py-2.5 text-xs"
              >
                <span className="font-mono text-zinc-300">{entry.date}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white">
                    {entry.weight_lbs.toFixed(1)} lbs
                  </span>
                  {idx === primaryPet.weight_history.length - 1 && (
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                      Latest
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-periwinkle-500/30 bg-periwinkle-500/10 p-4 text-xs text-zinc-200">
            <div className="font-bold text-periwinkle-300">
              Stylist Coat Care Recommendation
            </div>
            <p className="mt-1 leading-relaxed text-zinc-300">
              Maintain a 4-to-6 week hydro-bath & scissor cadence with daily
              slicker line-brushing behind ears to prevent friction mats.
            </p>
          </div>

          <div className="mt-4">
            <AnatomicalCutCard
              petId={primaryPet.id}
              petName={primaryPet.name}
              editable={false}
            />
          </div>
        </div>
      </section>

      {/* SHAREABLE INSTAGRAM / TIKTOK STORY REPORT CARD MODAL */}
      {socialStoryItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-periwinkle-500/40 bg-gradient-to-b from-obsidian-800 via-obsidian-900 to-obsidian-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-periwinkle-500/20 px-3 py-0.5 font-mono text-[10px] font-bold text-periwinkle-300">
                9:16 SOCIAL STORY CARD
              </span>
              <button
                type="button"
                onClick={() => setSocialStoryItem(null)}
                className="text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-3 rounded-2xl border border-white/[0.1] bg-obsidian-900 p-4 text-center">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                {business.name}
              </div>
              <h3 className="mt-1 text-xl font-extrabold text-white">
                {primaryPet.name}’s Spa Day Glow-Up ✨
              </h3>
              <p className="text-[11px] text-zinc-400">
                Styled by {socialStoryItem.groomer_name} • Coat Score:{' '}
                {socialStoryItem.coat_condition_score}/10
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="relative overflow-hidden rounded-xl">
                  <img
                    src={socialStoryItem.before_url}
                    alt="Before"
                    className="h-36 w-full object-cover"
                  />
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                    BEFORE
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-emerald-500/40">
                  <img
                    src={socialStoryItem.after_url}
                    alt="After"
                    className="h-36 w-full object-cover"
                  />
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-obsidian-950">
                    AFTER
                  </span>
                </div>
              </div>

              <p className="mt-3 text-xs italic text-zinc-200">
                &ldquo;{socialStoryItem.after_caption}&rdquo;
              </p>

              <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-300">
                Book online & get <strong>$20 OFF</strong> your first groom at{' '}
                <span className="font-mono font-bold underline">
                  pawtrackr.live/{business.slug}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSocialStoryItem(null)}
              className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-xs font-bold text-obsidian-950 shadow-emerald-glow"
            >
              Done Previewing Social Story Card
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
