'use client';

import React, { use, useEffect, useMemo, useState } from 'react';
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
  INITIAL_VISITS,
  getTenantBundleBySlug,
} from '@/lib/mock-tenant-data';
import { BehaviorTag, BusinessConfig, Visit } from '@/types/database';
import { formatCurrency } from '@/lib/pos-math';
import { isStaffSlotAvailable } from '@/lib/booking-availability';
import { BehaviorAuraBadge } from '@/components/BehaviorAuraBadge';
import {
  loadUniversalStore,
  saveUniversalStore,
  subscribeUniversalStore,
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
  const { business, config: bundledConfig, staff } = tenant;
  const [storedConfig, setStoredConfig] = useState<BusinessConfig | null>(null);
  const [scheduledVisits, setScheduledVisits] = useState<Visit[]>(INITIAL_VISITS);
  const config = storedConfig?.business_id === business.id ? storedConfig : bundledConfig;

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
  const [selectedDate, setSelectedDate] = useState<string>('');
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
    clientId: string;
    totalDollars: number;
    loyaltyPointsEstimate: number;
  } | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedDate(`${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`);
  }, []);

  useEffect(() => {
    setStoredConfig(null);
    setSelectedPackageId(bundledConfig.custom_settings.packages[0]?.id ?? '');
    setSecondPackageId(bundledConfig.custom_settings.packages[0]?.id ?? '');
    setSelectedAddonIds(bundledConfig.custom_settings.addons[0] ? [bundledConfig.custom_settings.addons[0].id] : []);
    setSelectedStaffId(groomers[0]?.id ?? '');
    setBookingConfirmation(null);
    setBookingError(null);
  }, [business.id, bundledConfig, groomers]);

  useEffect(() => {
    const applyCatalog = (store: ReturnType<typeof loadUniversalStore>) => {
      setScheduledVisits(store.visits);
      const candidate = store.configs[business.id];
      if (candidate?.business_id === business.id &&
          Array.isArray(candidate.custom_settings?.packages) && candidate.custom_settings.packages.length > 0 &&
          Array.isArray(candidate.custom_settings?.addons)) {
        setStoredConfig(candidate);
      }
    };
    applyCatalog(loadUniversalStore());
    return subscribeUniversalStore(applyCatalog, business.id, undefined, 60_000);
  }, [business.id]);

  useEffect(() => {
    setSelectedPackageId((current) => config.custom_settings.packages.some((item) => item.id === current)
      ? current : config.custom_settings.packages[0]?.id ?? '');
    setSecondPackageId((current) => config.custom_settings.packages.some((item) => item.id === current)
      ? current : config.custom_settings.packages[0]?.id ?? '');
    setSelectedAddonIds((current) => current.filter((id) => config.custom_settings.addons.some((item) => item.id === id)));
  }, [config]);

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

  const slotIsAvailable = (slot: string) => !selectedDate || isStaffSlotAvailable(
    scheduledVisits, business.id, selectedStaffId, `${selectedDate} ${slot}`, combinedDurationMinutes
  );
  const selectedSlotAvailable = slotIsAvailable(selectedSlot);

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
    if (!selectedSlotAvailable) {
      setBookingError('This groomer is busy at the selected time. Choose another slot or groomer.');
      return;
    }
    setBookingError(null);
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
          pet_weight_lbs: Number(petWeight),
          behavior_tags: disclosedTags,
          behavior_notes: coatNotes,
          package_id: selectedPackage.id,
          addon_ids: selectedAddonIds,
          scheduled_time: `${selectedDate} ${selectedSlot}`,
          staff_id: selectedStaffId,
          join_vip_club: joinVipClub,
          ...(includeSecondPet
            ? {
                second_pet_name: secondPetName,
                second_pet_breed: secondPetBreed,
                second_pet_weight_lbs: Number(secondPetWeight),
                second_package_id: secondPackageId,
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok !== true || !data.client || !Array.isArray(data.pets) || !Array.isArray(data.visits) ||
          data.client.business_id !== business.id || !data.pets.length || !data.visits.length ||
          data.pets.some((pet: { business_id: string; client_id: string }) => pet.business_id !== business.id || pet.client_id !== data.client.id) ||
          data.visits.some((visit: { business_id: string; client_id: string }) => visit.business_id !== business.id || visit.client_id !== data.client.id)) {
        throw new Error(data.error || 'Booking could not be saved. Please try again.');
      }
      // A successful demo write supplies the records shown in the command center.
      const store = loadUniversalStore();
      saveUniversalStore({
        clients: [data.client, ...store.clients],
        pets: [...data.pets, ...store.pets],
        visits: [...data.visits, ...store.visits],
      });

      setBookingConfirmation({
        code: data.confirmationCode,
        clientId: data.client.id,
        totalDollars: data.totalDollars,
        loyaltyPointsEstimate:
          Math.floor(data.totalDollars) * config.loyalty_points_per_dollar,
      });
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'Booking could not be saved. Please try again.');
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
                Sample salon profile
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-0.5 text-xs font-bold text-amber-300">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {config.custom_settings.rating} (
                {config.custom_settings.reviewCount} illustrative reviews)
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
              Sample loyalty offer
            </div>
            <div className="mt-0.5 text-base font-bold text-periwinkle-300">
              Earn {config.loyalty_points_per_dollar}x Points Per $1
            </div>
            <div className="mt-0.5 text-[11px] text-emerald-400">
              Demo booking record · no SMS sent
            </div>
          </div>
        </div>
      </div>

      {bookingError && <p role="alert" className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">{bookingError}</p>}
      {bookingConfirmation ? (
        <div className="mt-8 rounded-3xl border border-emerald-500/40 bg-obsidian-800/95 p-8 text-center shadow-emerald-glow">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-obsidian-950">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <span className="mt-4 inline-block rounded-full border border-emerald-500/40 bg-emerald-500/15 px-4 py-1 font-mono text-xs font-bold text-emerald-300">
            CONFIRMATION #{bookingConfirmation.code}
          </span>
          <h2 className="mt-3 text-3xl font-extrabold text-white">
            Demo booking saved for {petName}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-300">
            Saved to the local demo calendar for {business.name}
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
              <div className="text-zinc-400">Potential points after paid visit</div>
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
              href={`/client/${bookingConfirmation.clientId}`}
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
                    SAMPLE COAT PROFILE QUOTE PREVIEW
                  </span>
                  <h2 className="mt-1.5 text-lg font-bold text-white">
                    Not Sure Which Package Fits Your Dog’s Coat?
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Select an illustrative coat profile below to prefill a pet
                    description and package. No photo analysis is performed.
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
                    Sample profile applied: pre-selected{' '}
                    <strong>{selectedPackage.name}</strong> ({petWeight} lbs • ~
                    {combinedDurationMinutes} mins) with a demo price estimate.
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
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedPackageId(pkg.id)}
                      aria-pressed={active}
                      className={`w-full cursor-pointer rounded-2xl border p-4 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-periwinkle-400 ${
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
                    </button>
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
                      Preview a 15% package discount worth {formatCurrency((selectedPackage?.price ?? 0) * 0.15)}.
                      This does not start a subscription or reserve recurring slots.
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
                      ? '✓ Preview discount applied (-15%)'
                      : 'Preview 15% club discount'}
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
                    Sample preferred time slots
                  </label>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    {TIME_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        disabled={!slotIsAvailable(slot)}
                        aria-label={`${slot}${slotIsAvailable(slot) ? '' : ' unavailable'}`}
                        onClick={() => setSelectedSlot(slot)}
                        className={`rounded-lg border py-2 font-mono text-[11px] font-semibold transition ${
                          !slotIsAvailable(slot)
                            ? 'cursor-not-allowed border-white/[0.06] bg-obsidian-900/40 text-zinc-600'
                            : selectedSlot === slot
                            ? 'border-periwinkle-500 bg-periwinkle-500 text-obsidian-950'
                            : 'border-white/[0.08] bg-obsidian-900 text-zinc-300 hover:border-white/[0.2]'
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-400">Demo availability preview from the latest local schedule. The server checks again when you book.</p>
                  {!selectedSlotAvailable && selectedDate && <p role="status" className="mt-2 text-xs text-amber-300">The selected time is now occupied. Choose another slot or groomer.</p>}
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
                    min="1"
                    max="300"
                    required
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
                        min="1"
                        max="300"
                        required
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
                    Contact phone *
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
                    Demo Booking Summary
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
                    <span>Club discount preview (-15%):</span>
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
                      Payment method preview
                    </span>
                    <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                      NO PAYMENT COLLECTED
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
                      <div>Wallet preview</div>
                      <div className="text-[9px] text-emerald-300">
                        No wallet connected
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
                      <div>Card preview</div>
                      <div className="text-[9px] text-periwinkle-300">
                        No card stored
                      </div>
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    No card is collected or charged, and no cancellation hold is placed in this demo.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !selectedDate || !selectedSlotAvailable}
                className="w-full rounded-2xl bg-emerald-500 py-3.5 text-xs font-bold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {isSubmitting
                  ? 'Saving demo booking...'
                  : `Confirm Booking for ${petName} →`}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
