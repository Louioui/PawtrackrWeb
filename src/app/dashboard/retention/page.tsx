'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Heart,
  MessageSquare,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { BehaviorAuraBadge } from '@/components/BehaviorAuraBadge';
import { BehaviorTag } from '@/types/database';
import { formatCurrency } from '@/lib/pos-math';

interface CoatRecallCandidate {
  id: string;
  petName: string;
  breed: string;
  coatType: string;
  clientName: string;
  phone: string;
  weeksSinceLastGroom: number;
  recommendedCadenceWeeks: number;
  mattingRiskLevel: 'critical' | 'elevated' | 'on_track';
  rabiesExpiresDate: string;
  rabiesStatus: 'valid' | 'expiring_soon';
  lastPackagePrice: number;
  behaviorTags: BehaviorTag[];
  recallSent: boolean;
}

const INITIAL_RECALL_LIST: CoatRecallCandidate[] = [
  {
    id: 'rec-1',
    petName: 'Winston',
    breed: 'Cavapoo',
    coatType: 'Wavy Silk-Wool Blend',
    clientName: 'Liam O’Connor',
    phone: '(415) 773-5521',
    weeksSinceLastGroom: 6.5,
    recommendedCadenceWeeks: 5,
    mattingRiskLevel: 'critical',
    rabiesExpiresDate: '2027-08-14',
    rabiesStatus: 'valid',
    lastPackagePrice: 160.0,
    behaviorTags: ['matted'],
    recallSent: false,
  },
  {
    id: 'rec-2',
    petName: 'Duchess',
    breed: 'Bernedoodle (Standard)',
    coatType: 'Heavy Tri-Color Wavy Fleece',
    clientName: 'Amara Patel',
    phone: '(415) 309-7788',
    weeksSinceLastGroom: 5.8,
    recommendedCadenceWeeks: 5,
    mattingRiskLevel: 'elevated',
    rabiesExpiresDate: '2026-11-28',
    rabiesStatus: 'expiring_soon',
    lastPackagePrice: 199.0,
    behaviorTags: ['cage_reactive', 'extra_care'],
    recallSent: false,
  },
  {
    id: 'rec-3',
    petName: 'Mochi',
    breed: 'Toy Poodle (Apricot)',
    coatType: 'Fine Silky Curl',
    clientName: 'Hannah Lindqvist',
    phone: '(650) 419-3302',
    weeksSinceLastGroom: 4.5,
    recommendedCadenceWeeks: 4,
    mattingRiskLevel: 'elevated',
    rabiesExpiresDate: '2027-04-02',
    rabiesStatus: 'valid',
    lastPackagePrice: 169.0,
    behaviorTags: ['senior', 'heart_murmur'],
    recallSent: false,
  },
  {
    id: 'rec-4',
    petName: 'Bello',
    breed: 'F1b Mini Goldendoodle',
    coatType: 'Curly Fleece (High Density)',
    clientName: 'Sophia Chen-Alvarez',
    phone: '(415) 890-4829',
    weeksSinceLastGroom: 1.0,
    recommendedCadenceWeeks: 5,
    mattingRiskLevel: 'on_track',
    rabiesExpiresDate: '2027-09-19',
    rabiesStatus: 'valid',
    lastPackagePrice: 198.0,
    behaviorTags: ['matted', 'extra_care'],
    recallSent: true,
  },
];

export default function RetentionAndVaccineGuardPage() {
  const [candidates, setCandidates] =
    useState<CoatRecallCandidate[]>(INITIAL_RECALL_LIST);
  const [campaignBanner, setCampaignBanner] = useState<string | null>(null);
  const [enrolledClubIds, setEnrolledClubIds] = useState<string[]>(['rec-4']);
  const [activeClubMembersCount, setActiveClubMembersCount] =
    useState<number>(34);
  const [monthlyRecurringRevenue, setMonthlyRecurringRevenue] =
    useState<number>(4890);

  const recoverableRevenue = candidates
    .filter((c) => !c.recallSent)
    .reduce((acc, c) => acc + c.lastPackagePrice, 0);

  const handleEnrollInMembership = (item: CoatRecallCandidate, monthlyRate = 139) => {
    if (enrolledClubIds.includes(item.id)) return;
    setEnrolledClubIds((prev) => [...prev, item.id]);
    setActiveClubMembersCount((n) => n + 1);
    setMonthlyRecurringRevenue((m) => m + monthlyRate);
    setCampaignBanner(
      `VIP Recurring Membership Activated: ${item.clientName} (${item.petName}) enrolled in the 4-Week Coat Sanctuary Auto-Pay Club ($${monthlyRate}/mo). Salon MRR increased to ${formatCurrency(
        monthlyRecurringRevenue + monthlyRate
      )}/mo!`
    );
    setTimeout(() => setCampaignBanner(null), 6000);
  };

  const handleSendSingleRecall = (item: CoatRecallCandidate) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, recallSent: true } : c))
    );
    setCampaignBanner(
      `Coat-Matting Prevention SMS sent to ${item.clientName} (${item.phone}): "Hi ${item.clientName.split(' ')[0]}! ${item.petName} is at ${item.weeksSinceLastGroom} weeks since his last groom. Book this week to prevent ear/collar tangles & claim +100 Bonus Loyalty Points: pawtrackr.live/portal/bespoke-grooming"`
    );
    setTimeout(() => setCampaignBanner(null), 6000);
  };

  const handleBatchLaunchCampaign = () => {
    setCandidates((prev) => prev.map((c) => ({ ...c, recallSent: true })));
    setCampaignBanner(
      `Batch Recall Dispatched to all overdue Doodle/Poodle parents! Projected recovered salon revenue: ${formatCurrency(recoverableRevenue)}.`
    );
    setTimeout(() => setCampaignBanner(null), 6000);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {/* Sub-navigation */}
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
            href="/dashboard/fleet"
            className="rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
          >
            Mobile Van Fleet OS →
          </Link>
          <button
            type="button"
            onClick={handleBatchLaunchCampaign}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-obsidian-950 shadow-emerald-glow hover:bg-emerald-400"
          >
            <Send className="h-3.5 w-3.5" />
            Send All Overdue Coat Recalls (+100 Pts Offer)
          </button>
        </div>
      </div>

      {campaignBanner && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-500/45 bg-emerald-500/15 px-5 py-3.5 text-xs font-medium text-emerald-200 shadow-emerald-glow">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            {campaignBanner}
          </span>
          <button
            type="button"
            onClick={() => setCampaignBanner(null)}
            className="ml-4 font-bold text-emerald-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <Heart className="h-4 w-4" />
              <span>Automated Coat Matting Prevention & Rabies Guard</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white">
              Client Retention & Coat Cadence Recall Engine
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Automatically identifies high-density curly/fleece coats exceeding
              their 5-week window—preventing painful pelting while filling open
              calendar slots.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-right">
            <div className="text-[11px] uppercase tracking-wider text-emerald-300">
              Recoverable Recall Revenue
            </div>
            <div className="mt-0.5 font-mono text-2xl font-extrabold text-white">
              {formatCurrency(recoverableRevenue)}
            </div>
            <div className="text-[11px] text-zinc-300">
              From {candidates.filter((c) => !c.recallSent).length} overdue VIP
              pets
            </div>
          </div>
        </div>
      </div>

      {/* VIP RECURRING GROOMING MEMBERSHIPS & AUTO-PAY MRR ENGINE */}
      <div className="mt-6 glass-card border-periwinkle-500/35 p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-periwinkle-400">
              <Sparkles className="h-4 w-4" />
              <span>Predictable Monthly Recurring Salon Revenue (MRR)</span>
            </div>
            <h2 className="mt-1 text-xl font-extrabold text-white">
              VIP Recurring Grooming Memberships & Auto-Pay Subscriptions
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Locks curly-coated breeds into automatic 4-week recurring calendar
              slots billed on the 1st of every month via Stripe Billing.
            </p>
          </div>

          <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/35 bg-obsidian-900/90 px-5 py-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Active Club Members
              </div>
              <div className="font-mono text-2xl font-extrabold text-white">
                {activeClubMembersCount} Dogs
              </div>
            </div>
            <div className="h-8 w-px bg-white/[0.1]" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Guaranteed Salon MRR
              </div>
              <div className="font-mono text-2xl font-extrabold text-emerald-400">
                {formatCurrency(monthlyRecurringRevenue)}/mo
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              title: '4-Week Doodle Sanctuary Club',
              price: '$139/mo',
              perks:
                '1 Full Hand-Scissor Groom every 4 weeks + Free Blueberry Facial + Zero Demat Fees',
              badge: 'MOST POPULAR',
            },
            {
              title: 'Bi-Weekly Hydro-Bath & Brush Pass',
              price: '$189/mo',
              perks:
                'Full Scissor Groom + Mid-Month Ozone Hydro-Bath & Line Brush (100% Mat-Free Guarantee)',
              badge: 'HIGHEST RETENTION',
            },
            {
              title: 'Senior Comfort & Gentle Care Club',
              price: '$89/mo',
              perks:
                'Monthly Low-Stress Sanctuary Bath, Dremel Paw Pad Care & Priority Quiet-Hour Slots',
              badge: 'SENIOR SAFE',
            },
          ].map((plan) => (
            <div
              key={plan.title}
              className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-periwinkle-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-periwinkle-300">
                  {plan.badge}
                </span>
                <span className="font-mono text-lg font-extrabold text-emerald-400">
                  {plan.price}
                </span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-white">
                {plan.title}
              </h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                {plan.perks}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Candidate List */}
      <div className="mt-8 space-y-3">
        {candidates.map((item) => {
          const isCritical = item.mattingRiskLevel === 'critical';
          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-5 transition ${
                isCritical
                  ? 'border-amber-500/45 bg-obsidian-800/95'
                  : 'border-white/[0.08] bg-obsidian-800/80'
              }`}
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        item.mattingRiskLevel === 'critical'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : item.mattingRiskLevel === 'elevated'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {item.weeksSinceLastGroom} Wks Since Groom (Target:{' '}
                      {item.recommendedCadenceWeeks} Wks)
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        item.rabiesStatus === 'expiring_soon'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      <ShieldCheck className="h-3 w-3" />
                      Rabies Exp: {item.rabiesExpiresDate}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <h3 className="text-lg font-extrabold text-white">
                      {item.petName}
                    </h3>
                    <span className="text-xs text-zinc-400">
                      {item.breed} • Coat: {item.coatType}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-300">
                    Pet Parent:{' '}
                    <strong className="text-white">{item.clientName}</strong> •{' '}
                    <span className="font-mono text-zinc-400">
                      {item.phone}
                    </span>
                  </div>

                  <div className="pt-1 flex flex-wrap gap-1.5">
                    {item.behaviorTags.map((tag) => (
                      <BehaviorAuraBadge key={tag} tag={tag} size="xs" />
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3 lg:flex-col lg:items-end lg:border-t-0 lg:pt-0">
                  <div className="text-left lg:text-right">
                    <div className="text-xs text-zinc-400">
                      Typical Visit Value
                    </div>
                    <div className="font-mono text-lg font-extrabold text-white">
                      {formatCurrency(item.lastPackagePrice)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEnrollInMembership(item, 139)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${
                        enrolledClubIds.includes(item.id)
                          ? 'border border-periwinkle-500/40 bg-periwinkle-500/15 text-periwinkle-300'
                          : 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {enrolledClubIds.includes(item.id)
                        ? 'VIP Auto-Pay Member ($139/mo) ✓'
                        : '+ Enroll in $139/mo Club'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSendSingleRecall(item)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                        item.recallSent
                          ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400'
                      }`}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {item.recallSent
                        ? 'Recall SMS Dispatched ✓'
                        : 'Text 6-Week Recall (+100 Pts)'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
