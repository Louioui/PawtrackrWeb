'use client';

import React, { use, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Globe,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  UserCheck,
} from 'lucide-react';
import {
  BUSINESSES,
  getTenantBundleBySlug,
} from '@/lib/mock-tenant-data';
import { BehaviorTag } from '@/types/database';
import { formatCurrency } from '@/lib/pos-math';
import { BehaviorAuraBadge } from '@/components/BehaviorAuraBadge';
import {
  loadUniversalStore,
  saveUniversalStore,
} from '@/lib/realtime-store';

const TIME_SLOTS = [
  '09:00 AM',
  '10:30 AM',
  '12:00 PM',
  '01:30 PM',
  '03:00 PM',
  '04:30 PM',
];

export default function SalonBookingPortalPage({
  params,
}: {
  params: Promise<{ 'salon-slug': string }>;
}) {
  const resolvedParams = use(params);
  const salonSlug = resolvedParams['salon-slug'] || 'bespoke-grooming';

  const tenant = useMemo(() => getTenantBundleBySlug(salonSlug), [salonSlug]);
  const { business, config, staff } = tenant;

  const groomers = useMemo(
    () => staff.filter((s) => s.role !== 'front_desk'),
    [staff]
  );

  // Self-Booking State
  const [selectedPackageId, setSelectedPackageId] = useState<string>(
    config.custom_settings.packages[0]?.id ?? ''
  );
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([
    config.custom_settings.addons[0]?.id ?? '',
  ]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    groomers[0]?.id ?? ''
  );
  const [selectedDate, setSelectedDate] = useState<string>('2026-11-08');
  const [selectedSlot, setSelectedSlot] = useState<string>('10:30 AM');

  // Pet & Parent Details
  const [petName, setPetName] = useState<string>('Bello');
  const [petBreed, setPetBreed] = useState<string>('F1b Mini Goldendoodle');
  const [petWeight, setPetWeight] = useState<string>('24.6');
  const [includeSecondPet, setIncludeSecondPet] = useState<boolean>(false);
  const [secondPetName, setSecondPetName] = useState<string>('Milo');
  const [secondPetBreed, setSecondPetBreed] = useState<string>('Toy Cavapoo');
  const [secondPetWeight, setSecondPetWeight] = useState<string>('16.2');
  const [secondPackageId, setSecondPackageId] = useState<string>(
    config.custom_settings.packages[0]?.id ?? ''
  );
  const [parentName, setParentName] = useState<string>('Sophia Chen-Alvarez');
  const [parentPhone, setParentPhone] = useState<string>('(415) 890-4829');
  const [parentEmail, setParentEmail] = useState<string>(
    'sophia.alvarez@icloud.com'
  );
  const [disclosedTags, setDisclosedTags] = useState<BehaviorTag[]>([
    'matted',
    'extra_care',
  ]);
  const [coatNotes, setCoatNotes] = useState<string>(
    'Slight tangles behind ears from rain coat; loves warm blueberry facial.'
  );

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [bookingConfirmation, setBookingConfirmation] = useState<{
    code: string;
    totalDollars: number;
    loyaltyPointsEstimate: number;
  } | null>(null);

  const selectedPackage = useMemo(
    () =>
      config.custom_settings.packages.find((p) => p.id === selectedPackageId) ??
      config.custom_settings.packages[0],
    [config.custom_settings.packages, selectedPackageId]
  );

  const secondSelectedPackage = useMemo(
    () =>
      config.custom_settings.packages.find((p) => p.id === secondPackageId) ??
      config.custom_settings.packages[0],
    [config.custom_settings.packages, secondPackageId]
  );

  const selectedAddons = useMemo(
    () =>
      config.custom_settings.addons.filter((a) =>
        selectedAddonIds.includes(a.id)
      ),
    [config.custom_settings.addons, selectedAddonIds]
  );

  const [joinVipClub, setJoinVipClub] = useState<boolean>(false);
  const [aiQuotePreset, setAiQuotePreset] = useState<string | null>(null);
  const [vaultedPaymentType, setVaultedPaymentType] = useState<
    'digital_wallet' | 'card_on_file'
  >('digital_wallet');

  const handleApplyAiPhotoPreset = (presetId: 'doodle' | 'double' | 'senior') => {
    setAiQuotePreset(presetId);
    if (presetId === 'doodle') {
      setPetName('Bello');
      setPetBreed('F1b Mini Goldendoodle (High-Density Curl)');
      setPetWeight('28.4');
      setDisclosedTags(['matted', 'extra_care']);
      if (config.custom_settings.packages[0]) {
        setSelectedPackageId(config.custom_settings.packages[0].id);
      }
    } else if (presetId === 'double') {
      setPetName('Atlas');
      setPetBreed('Golden Retriever (Heavy Double Undercoat)');
      setPetWeight('58.0');
      setDisclosedTags(['extra_care']);
      if (config.custom_settings.packages[1]) {
        setSelectedPackageId(config.custom_settings.packages[1].id);
      }
    } else {
      setPetName('Louie');
      setPetBreed('French Bulldog (Brachycephalic Smooth Coat)');
      setPetWeight('22.5');
      setDisclosedTags(['senior', 'anxious']);
      if (config.custom_settings.packages[2]) {
        setSelectedPackageId(config.custom_settings.packages[2].id);
      }
    }
  };

  const combinedDurationMinutes = useMemo(() => {
    return (
      (selectedPackage?.durationMinutes ?? 90) +
      (includeSecondPet ? secondSelectedPackage?.durationMinutes ?? 75 : 0)
    );
  }, [selectedPackage, includeSecondPet, secondSelectedPackage]);

  const vipClubSavingsDollars = useMemo(() => {
    if (!joinVipClub) return 0;
    return Number(((selectedPackage?.price ?? 0) * 0.15).toFixed(2));
  }, [joinVipClub, selectedPackage]);

  const estimatedSubtotal = useMemo(() => {
    const pkgPrice = selectedPackage?.price ?? 0;
    const secondPkgPrice = includeSecondPet
      ? secondSelectedPackage?.price ?? 0
      : 0;
    const addonsSum = selectedAddons.reduce((acc, a) => acc + a.price, 0);
    const activeMultiPetDiscount = includeSecondPet ? 10 : 0;
    return Number(
      Math.max(
        0,
        pkgPrice +
          secondPkgPrice +
          addonsSum -
          activeMultiPetDiscount -
          vipClubSavingsDollars
      ).toFixed(2)
    );
  }, [
    selectedPackage,
    includeSecondPet,
    secondSelectedPackage,
    selectedAddons,
    vipClubSavingsDollars,
  ]);

  const toggleAddon = (id: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleBehaviorTag = (tag: BehaviorTag) => {
    setDisclosedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          client_name: parentName,
          client_phone: parentPhone,
          client_email: parentEmail,
          pet_name: petName,
          pet_breed: petBreed,
          pet_weight_lbs: parseFloat(petWeight) || 22,
          behavior_tags: disclosedTags,
          behavior_notes: coatNotes,
          package_id: selectedPackage.id,
          package_name: selectedPackage.name,
          addon_ids: selectedAddonIds,
          total_amount: estimatedSubtotal,
          scheduled_time: `${selectedDate} ${selectedSlot}`,
          staff_id: selectedStaffId,
          duration_minutes: combinedDurationMinutes,
          ...(includeSecondPet
            ? {
                second_pet_name: secondPetName,
                second_pet_breed: secondPetBreed,
                second_pet_weight_lbs: parseFloat(secondPetWeight) || 16,
              }
            : {}),
        }),
      });
      const data = await res.json();
      // Sync new online booking immediately to Universal Store so Command Center updates live across tabs/devices
      const store = loadUniversalStore();
      const newOnlineVisit = {
        id: data.visit?.id ?? `vis-${Date.now().toString(36)}`,
        business_id: business.id,
        client_id: 'cl-101',
        pet_id: 'pet-101',
        staff_id: selectedStaffId,
        status: 'booked' as const,
        booking_source: 'online' as const,
        package_id: selectedPackage.id,
        package_name: includeSecondPet
          ? `${selectedPackage.name} (+ 2nd Dog: ${secondPetName})`
          : selectedPackage.name,
        base_price: selectedPackage.price,
        addon_ids: selectedAddonIds,
        total_amount: estimatedSubtotal,
        scheduled_time: `${selectedDate}T10:30:00`,
        time_label: selectedSlot,
        duration_minutes: combinedDurationMinutes,
        bay_or_van: includeSecondPet
          ? 'Multi-Pet Household Suite'
          : 'Online Self-Booked Slot',
        report_card_notes: includeSecondPet
          ? `${coatNotes} [Multi-Pet Household: ${petName} & ${secondPetName}]`
          : coatNotes,
        weight_logged_lbs: parseFloat(petWeight) || 24.6,
        created_at: new Date().toISOString(),
      };
      saveUniversalStore({
        visits: [newOnlineVisit, ...store.visits],
      });

      setBookingConfirmation({
        code: data.confirmationCode ?? 'PT-892XL',
        totalDollars: estimatedSubtotal,
        loyaltyPointsEstimate:
          Math.floor(estimatedSubtotal) * config.loyalty_points_per_dollar,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {/* Salon Switcher Bar for Testing Multi-Tenancy */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-obsidian-800/80 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2 text-zinc-300">
          <Globe className="h-4 w-4 text-periwinkle-400" />
          <span>Public Self-Booking URL:</span>
          <code className="rounded bg-periwinkle-500/15 px-2 py-0.5 font-mono text-periwinkle-300">
            pawtrackr.live/{salonSlug}
          </code>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Preview another salon tenant:</span>
          {BUSINESSES.map((b) => (
            <Link
              key={b.id}
              href={`/portal/${b.slug}`}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                b.slug === business.slug
                  ? 'bg-periwinkle-500 text-obsidian-950 font-bold'
                  : 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]'
              }`}
            >
              {b.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Salon Storefront Hero Header */}
      <div className="glass-card relative overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified Pawtrackr Sanctuary
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-0.5 text-xs font-bold text-amber-300">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {config.custom_settings.rating} (
                {config.custom_settings.reviewCount}Verified Reviews)
              </span>
            </div>

            <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-white">
              {business.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-300">
              {config.custom_settings.tagline}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-periwinkle-400" />
                {config.custom_settings.address}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-emerald-400" />
                Hours: {config.custom_settings.operating_hours.open} –{' '}
                {config.custom_settings.operating_hours.close}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-periwinkle-500/30 bg-obsidian-900/90 p-4 text-right">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400">
              Loyalty Program Active
            </div>
            <div className="mt-0.5 text-base font-bold text-periwinkle-300">
              Earn {config.loyalty_points_per_dollar}x Points Per $1
            </div>
            <div className="mt-0.5 text-[11px] text-emerald-400">
              Zero Phone Tag • Instant SMS Confirmation
            </div>
          </div>
        </div>
      </div>

      {bookingConfirmation ? (
        <div className="mt-8 rounded-3xl border border-emerald-500/40 bg-obsidian-800/95 p-8 text-center shadow-emerald-glow">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-obsidian-950">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <span className="mt-4 inline-block rounded-full border border-emerald-500/40 bg-emerald-500/15 px-4 py-1 font-mono text-xs font-bold text-emerald-300">
            CONFIRMATION #{bookingConfirmation.code}
          </span>
          <h2 className="mt-3 text-3xl font-extrabold text-white">
            {petName} is Booked at {business.name}!
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-300">
            Synced directly to {business.name}&apos;s Unified Command Calendar
            for{' '}
            <strong className="text-white">
              {selectedDate} at {selectedSlot}
            </strong>
            . {petName}&apos;s Behavior Auras have been pre-loaded for your
            stylist.
          </p>

          <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-3 rounded-2xl border border-white/[0.08] bg-obsidian-900 p-4 sm:grid-cols-3 text-xs">
            <div>
              <div className="text-zinc-400">Selected Package</div>
              <div className="mt-1 font-bold text-white">
                {selectedPackage.name}
              </div>
            </div>
            <div>
              <div className="text-zinc-400">Estimated Service Total</div>
              <div className="mt-1 font-mono text-base font-bold text-emerald-400">
                {formatCurrency(bookingConfirmation.totalDollars)}
              </div>
            </div>
            <div>
              <div className="text-zinc-400">Loyalty Points Upon Visit</div>
              <div className="mt-1 font-bold text-periwinkle-300">
                +{bookingConfirmation.loyaltyPointsEstimate} pts
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl bg-periwinkle-500 px-5 py-3 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400"
            >
              View Booking in Salon Command Center →
            </Link>
            <Link
              href="/client/cl-101"
              className="rounded-xl border border-white/[0.12] bg-obsidian-900 px-5 py-3 text-xs font-semibold text-white hover:bg-obsidian-700"
            >
              Open Pet Parent Portal & Report Cards
            </Link>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleConfirmBooking}
          className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12"
        >
          {/* Left 8 Columns: Package, Add-ons, Stylist & Time Slot, Pet Info */}
          <div className="space-y-6 lg:col-span-8">
            {/* AI Coat & Breed Photo Quote Estimator */}
            <div className="glass-card border-periwinkle-500/40 p-6 shadow-periwinkle-glow">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="rounded-full bg-periwinkle-500/20 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-periwinkle-300">
                    SNAP-A-PHOTO AI COAT & PRICE ESTIMATOR
                  </span>
                  <h2 className="mt-1.5 text-lg font-bold text-white">
                    Not Sure Which Package Fits Your Dog’s Coat?
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Select a coat photo profile below (or upload a photo from
                    your phone/PC) to auto-detect curl density, realistic groom
                    duration, and transparent pricing.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    id: 'doodle' as const,
                    title: 'Curly Doodle / Poodle Fleece',
                    sub: 'High Tangle Risk • ~105m • Hand-Scissor',
                    img: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=400&q=80',
                  },
                  {
                    id: 'double' as const,
                    title: 'Heavy Double Undercoat',
                    sub: 'Golden / Husky • ~90m • Deshed Blowout',
                    img: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=400&q=80',
                  },
                  {
                    id: 'senior' as const,
                    title: 'Short Coat / Senior Comfort',
                    sub: 'Frenchie / Senior • ~60m • Low-Stress Hydro',
                    img: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=400&q=80',
                  },
                ].map((preset) => {
                  const active = aiQuotePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyAiPhotoPreset(preset.id)}
                      className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                        active
                          ? 'border-emerald-500 bg-emerald-500/15 shadow-emerald-glow'
                          : 'border-white/[0.08] bg-obsidian-900/80 hover:border-white/[0.18]'
                      }`}
                    >
                      <img
                        src={preset.img}
                        alt={preset.title}
                        className="h-12 w-12 shrink-0 rounded-xl object-cover"
                      />
                      <div>
                        <div className="text-xs font-bold text-white">
                          {preset.title}
                        </div>
                        <div className="mt-0.5 text-[10px] text-zinc-400">
                          {preset.sub}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {aiQuotePreset && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-200">
                  <span>
                    ✓ AI Coat Analysis Applied: Pre-selected{' '}
                    <strong>{selectedPackage.name}</strong> ({petWeight} lbs • ~
                    {combinedDurationMinutes} mins) with transparent pricing
                    locked in.
                  </span>
                </div>
              )}
            </div>

            {/* Step 1: Package Selection */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-bold text-white">
                1. Choose Your Custom Grooming Package
              </h2>
              <p className="text-xs text-zinc-400">
                Tailored specifically by {business.name}.
              </p>

              <div className="mt-4 space-y-3">
                {config.custom_settings.packages.map((pkg) => {
                  const active = pkg.id === selectedPackage.id;
                  return (
                    <div
                      key={pkg.id}
                      onClick={() => setSelectedPackageId(pkg.id)}
                      className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                        active
                          ? 'border-periwinkle-500 bg-periwinkle-500/15 shadow-periwinkle-glow'
                          : 'border-white/[0.08] bg-obsidian-900/70 hover:border-white/[0.18]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">
                              {pkg.name}
                            </span>
                            {pkg.badge && (
                              <span className="rounded-md bg-periwinkle-500/20 px-2 py-0.5 text-[10px] font-semibold text-periwinkle-300">
                                {pkg.badge}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                            {pkg.description}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-lg font-extrabold text-white">
                            {formatCurrency(pkg.price)}
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            ~{pkg.durationMinutes} mins
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* VIP 4-Week Recurring Membership Option */}
              <div className="mt-5 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        VIP 4-Week Coat Sanctuary Membership
                      </span>
                      <span className="rounded-md bg-emerald-500 px-2 py-0.5 font-mono text-[10px] font-bold text-obsidian-950">
                        SAVE 15% TODAY
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-300">
                      Lock in your recurring 4-week slot, waive dematting fees,
                      and save {formatCurrency((selectedPackage?.price ?? 0) * 0.15)} on
                      today’s groom. Cancel anytime.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setJoinVipClub((prev) => !prev)}
                    className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                      joinVipClub
                        ? 'bg-emerald-500 text-obsidian-950 shadow-emerald-glow'
                        : 'border border-emerald-500/40 bg-obsidian-900 text-emerald-300 hover:bg-emerald-500/20'
                    }`}
                  >
                    {joinVipClub
                      ? '✓ VIP 4-Week Club Active (-15%)'
                      : '+ Join 4-Week VIP Club'}
                  </button>
                </div>
              </div>

              {/* Spa Upgrades / Add-ons */}
              <div className="mt-6 border-t border-white/[0.08] pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
                  Optional Spa & Coat Rescue Add-Ons
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {config.custom_settings.addons.map((addon) => {
                    const checked = selectedAddonIds.includes(addon.id);
                    return (
                      <button
                        key={addon.id}
                        type="button"
                        onClick={() => toggleAddon(addon.id)}
                        className={`flex items-center justify-between rounded-xl border p-3 text-left text-xs transition ${
                          checked
                            ? 'border-emerald-500/60 bg-emerald-500/15 text-white'
                            : 'border-white/[0.08] bg-obsidian-900/60 text-zinc-300 hover:border-white/[0.15]'
                        }`}
                      >
                        <span className="font-medium pr-2">{addon.name}</span>
                        <span className="font-mono font-bold text-emerald-300">
                          +{formatCurrency(addon.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Step 2: Stylist & Open Time Slot */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-bold text-white">
                2. Select Groomer & Open Time Slot
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {groomers.map((g) => {
                  const active = g.id === selectedStaffId;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedStaffId(g.id)}
                      className={`rounded-2xl border p-3.5 text-left transition ${
                        active
                          ? 'border-periwinkle-500 bg-periwinkle-500/15 text-white'
                          : 'border-white/[0.08] bg-obsidian-900/60 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-periwinkle-400" />
                        <span className="text-xs font-bold">{g.name}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-400">
                        {g.specialty}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    Preferred Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    Real-Time Open Slots
                  </label>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    {TIME_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`rounded-lg border py-2 font-mono text-[11px] font-semibold transition ${
                          selectedSlot === slot
                            ? 'border-periwinkle-500 bg-periwinkle-500 text-obsidian-950'
                            : 'border-white/[0.08] bg-obsidian-900 text-zinc-300 hover:border-white/[0.2]'
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Pet Profile & Upfront Safety/Coat Aura Disclosure */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-bold text-white">
                3. Pet Profile & Safety Aura Disclosure
              </h2>
              <p className="text-xs text-zinc-400">
                Sharing coat tangles or handling sensitivities upfront ensures
                we allocate extra gentle care time.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-zinc-300">
                    Pet Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={petName}
                    onChange={(e) => setPetName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-300">Breed *</label>
                  <input
                    type="text"
                    required
                    value={petBreed}
                    onChange={(e) => setPetBreed(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-300">
                    Weight (lbs)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={petWeight}
                    onChange={(e) => setPetWeight(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* Multi-Pet Household Toggle & Second Dog Card (Roadmap #10) */}
              <div className="mt-4 rounded-2xl border border-periwinkle-500/30 bg-obsidian-900/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        Multi-Pet Household Booking
                      </span>
                      <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                        SAVE $10 BUNDLE
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Book a 2nd dog in the same household and automatically
                      calculate combined stylist duration.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncludeSecondPet((prev) => !prev)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                      includeSecondPet
                        ? 'bg-emerald-500 text-obsidian-950'
                        : 'border border-periwinkle-500/40 bg-periwinkle-500/15 text-periwinkle-200 hover:bg-periwinkle-500/25'
                    }`}
                  >
                    {includeSecondPet
                      ? '✓ 2nd Dog Added'
                      : '+ Add 2nd Household Dog'}
                  </button>
                </div>

                {includeSecondPet && (
                  <div className="mt-3.5 grid grid-cols-1 gap-3 border-t border-white/[0.08] pt-3.5 sm:grid-cols-4">
                    <div>
                      <label className="block text-[11px] text-zinc-300">
                        2nd Dog Name
                      </label>
                      <input
                        type="text"
                        value={secondPetName}
                        onChange={(e) => setSecondPetName(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-300">
                        2nd Dog Breed
                      </label>
                      <input
                        type="text"
                        value={secondPetBreed}
                        onChange={(e) => setSecondPetBreed(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-300">
                        Weight (lbs)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={secondPetWeight}
                        onChange={(e) => setSecondPetWeight(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-300">
                        2nd Dog Package
                      </label>
                      <select
                        value={secondPackageId}
                        onChange={(e) => setSecondPackageId(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-800 px-2.5 py-2 text-xs text-white"
                      >
                        {config.custom_settings.packages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({formatCurrency(p.price)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="block text-xs text-zinc-300">
                  Select Any Applicable Coat or Handling Flags:
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      'matted',
                      'anxious',
                      'senior',
                      'biter',
                      'heart_murmur',
                      'extra_care',
                    ] as BehaviorTag[]
                  ).map((tag) => {
                    const active = disclosedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleBehaviorTag(tag)}
                        className={`rounded-full p-0.5 transition ${
                          active
                            ? 'ring-2 ring-periwinkle-400'
                            : 'opacity-45 hover:opacity-80'
                        }`}
                      >
                        <BehaviorAuraBadge tag={tag} size="xs" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-zinc-300">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-300">
                    Mobile SMS Phone *
                  </label>
                  <input
                    type="text"
                    required
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-300">Email *</label>
                  <input
                    type="email"
                    required
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right 4 Columns: Sticky Instant Booking Summary */}
          <div className="lg:col-span-4">
            <div className="glass-card sticky top-24 p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-periwinkle-400">
                    Instant Self-Booking Summary
                  </span>
                  <h3 className="text-base font-bold text-white">
                    {petName} ({petBreed})
                  </h3>
                </div>
                <Sparkles className="h-5 w-5 text-periwinkle-400" />
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-zinc-300">
                  <span>Date & Time Slot:</span>
                  <span className="font-mono font-bold text-white">
                    {selectedDate} @ {selectedSlot}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-300">
                  <span>Primary Package:</span>
                  <span className="font-semibold text-white">
                    {selectedPackage.name}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Package Base Price:</span>
                  <span className="font-mono text-white">
                    {formatCurrency(selectedPackage.price)}
                  </span>
                </div>

                {includeSecondPet && (
                  <>
                    <div className="flex justify-between text-periwinkle-300">
                      <span>2nd Dog ({secondPetName}):</span>
                      <span className="font-mono">
                        +{formatCurrency(secondSelectedPackage.price)}
                      </span>
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>Multi-Pet Household Bundle:</span>
                      <span className="font-mono">
                        -{formatCurrency(10)}
                      </span>
                    </div>
                  </>
                )}

                {joinVipClub && (
                  <div className="flex justify-between text-emerald-400">
                    <span>VIP 4-Week Membership (-15%):</span>
                    <span className="font-mono">
                      -{formatCurrency(vipClubSavingsDollars)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-zinc-400">
                  <span>Allocated Stylist Duration:</span>
                  <span className="font-mono text-zinc-200">
                    ~{combinedDurationMinutes} mins
                  </span>
                </div>

                {selectedAddons.map((addon) => (
                  <div
                    key={addon.id}
                    className="flex justify-between text-zinc-400"
                  >
                    <span>+ {addon.name}</span>
                    <span className="font-mono text-emerald-300">
                      {formatCurrency(addon.price)}
                    </span>
                  </div>
                ))}

                <div className="border-t border-white/[0.08] pt-3 flex items-baseline justify-between">
                  <span className="text-sm font-bold text-white">
                    Estimated Visit Total
                  </span>
                  <span className="font-mono text-2xl font-extrabold text-emerald-400">
                    {formatCurrency(estimatedSubtotal)}
                  </span>
                </div>

                {/* Card-on-File No-Show Protection Hold ($0 Charged Today) */}
                <div className="rounded-2xl border border-periwinkle-500/35 bg-obsidian-900/90 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white">
                      No-Show Protection Hold
                    </span>
                    <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                      $0.00 CHARGED TODAY
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVaultedPaymentType('digital_wallet')}
                      className={`rounded-xl border px-2.5 py-2 text-left text-[11px] font-semibold transition ${
                        vaultedPaymentType === 'digital_wallet'
                          ? 'border-emerald-500 bg-emerald-500/15 text-white'
                          : 'border-white/[0.08] bg-obsidian-800 text-zinc-400'
                      }`}
                    >
                      <div>Google / Apple Pay</div>
                      <div className="text-[9px] text-emerald-300">
                        1-Tap Token Vault
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVaultedPaymentType('card_on_file')}
                      className={`rounded-xl border px-2.5 py-2 text-left text-[11px] font-semibold transition ${
                        vaultedPaymentType === 'card_on_file'
                          ? 'border-emerald-500 bg-emerald-500/15 text-white'
                          : 'border-white/[0.08] bg-obsidian-800 text-zinc-400'
                      }`}
                    >
                      <div>Visa •••• 4829</div>
                      <div className="text-[9px] text-periwinkle-300">
                        Saved Stripe Vault
                      </div>
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    Protects your groomer’s table time with a $35 hold only if
                    cancelled within 24 hrs (split 50/50 with your stylist).
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-2xl bg-emerald-500 py-3.5 text-xs font-bold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {isSubmitting
                  ? 'Syncing to Salon Calendar...'
                  : `Confirm Booking for ${petName} →`}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
