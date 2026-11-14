'use client';

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  DollarSign,
  Layers,
  Lock,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import {
  BusinessConfig,
  Client,
  PaymentMethod,
  Pet,
  Transaction,
  Visit,
} from '@/types/database';
import {
  calculateAtomicPOSCheckout,
  formatCents,
  formatCurrency,
  toCents,
  validateSplitTenders,
  SplitTenderItem,
} from '@/lib/pos-math';
import { BehaviorAuraBadge } from './BehaviorAuraBadge';
import { parseDemoCheckoutResponse } from '@/lib/demo-checkout-response';

interface AtomicPOSModalProps {
  visit: Visit;
  pet: Pet;
  client: Client;
  config: BusinessConfig;
  onClose: () => void;
  onCompleteTransaction: (tx: Transaction, pointsEarned: number) => void;
}

export function AtomicPOSModal({
  visit,
  pet,
  client,
  config,
  onClose,
  onCompleteTransaction,
}: AtomicPOSModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedPackageId, setSelectedPackageId] = useState<string>(
    visit.package_id
  );
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>(
    visit.addon_ids
  );
  const [safetySurchargeDollars, setSafetySurchargeDollars] = useState<number>(
    pet.behavior_tags.includes('matted') ? 15 : 0
  );
  const [discountDollars, setDiscountDollars] = useState<number>(0);

  const [tipMode, setTipMode] = useState<'percent' | 'custom'>('percent');
  const [tipPercent, setTipPercent] = useState<number>(20);
  const [customTipDollars, setCustomTipDollars] = useState<string>('25.00');

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('apple_pay');
  const [cashTendered, setCashTendered] = useState<string>('200.00');
  const [splitTenders, setSplitTenders] = useState<{
    cash: string;
    card: string;
    giftCard: string;
    accountCredit: string;
  }>({
    cash: '',
    card: '',
    giftCard: '',
    accountCredit: '',
  });
  const [recoveredIntent, setRecoveredIntent] = useState<boolean>(false);
  const [showQrPayPass, setShowQrPayPass] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedTx, setCompletedTx] = useState<Transaction | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Check for prior incomplete checkout intent from storage outbox
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('pawtrackr_pos_checkout_intent');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.visit_id === visit.id) {
          setRecoveredIntent(true);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [visit.id]);

  const selectedPackage = useMemo(() => {
    return (
      config.custom_settings.packages.find((p) => p.id === selectedPackageId) ??
      config.custom_settings.packages[0]
    );
  }, [config.custom_settings.packages, selectedPackageId]);

  const selectedAddons = useMemo(() => {
    return config.custom_settings.addons.filter((a) =>
      selectedAddonIds.includes(a.id)
    );
  }, [config.custom_settings.addons, selectedAddonIds]);

  const breakdown = useMemo(() => {
    return calculateAtomicPOSCheckout({
      basePackageDollars: selectedPackage?.price ?? visit.base_price,
      addonItemsDollars: selectedAddons.map((a) => a.price),
      safetySurchargeDollars,
      discountDollars,
      taxRatePercent: config.tax_rate,
      tipMode,
      tipPercent,
      customTipDollars: parseFloat(customTipDollars) || 0,
      loyaltyPointsPerDollar: config.loyalty_points_per_dollar,
    });
  }, [
    selectedPackage,
    visit.base_price,
    selectedAddons,
    safetySurchargeDollars,
    discountDollars,
    config.tax_rate,
    config.loyalty_points_per_dollar,
    tipMode,
    tipPercent,
    customTipDollars,
  ]);

  const cashChangeCents = useMemo(() => {
    if (paymentMethod !== 'cash') return 0;
    const tenderedCents = toCents(cashTendered);
    return Math.max(0, tenderedCents - breakdown.totalCents);
  }, [paymentMethod, cashTendered, breakdown.totalCents]);

  const splitValidation = useMemo(() => {
    if (paymentMethod !== 'split') {
      return { isValid: true, totalTenderedCents: breakdown.totalCents, varianceCents: 0 };
    }
    const items: SplitTenderItem[] = [
      { method: 'cash', amountCents: toCents(parseFloat(splitTenders.cash) || 0) },
      { method: 'credit_card', amountCents: toCents(parseFloat(splitTenders.card) || 0) },
      { method: 'gift_card', amountCents: toCents(parseFloat(splitTenders.giftCard) || 0) },
      { method: 'account_credit', amountCents: toCents(parseFloat(splitTenders.accountCredit) || 0) },
    ];
    return validateSplitTenders(items, breakdown.totalCents);
  }, [paymentMethod, splitTenders, breakdown.totalCents]);

  const toggleAddon = (id: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleAtomicCommit = async () => {
    if (paymentMethod === 'split' && !splitValidation.isValid) {
      setCheckoutError(
        `Split tenders must match final total (${formatCents(breakdown.totalCents)}) exactly to zero cents.`
      );
      return;
    }
    setCheckoutError(null);
    setIsProcessing(true);

    const idempotencyKey = crypto.randomUUID();
    const checkoutIntent = {
      idempotency_key: idempotencyKey,
      business_id: visit.business_id,
      visit_id: visit.id,
      total_cents: breakdown.totalCents,
      payment_method: paymentMethod,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem('pawtrackr_pos_checkout_intent', JSON.stringify(checkoutIntent));
    } catch {
      // Ignore local storage write errors
    }

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          business_id: visit.business_id,
          visit_id: visit.id,
          base_package_dollars: selectedPackage?.price ?? visit.base_price,
          addon_items_dollars: selectedAddons.map((a) => a.price),
          safety_surcharge_dollars: safetySurchargeDollars,
          discount_dollars: discountDollars,
          tax_rate_percent: config.tax_rate,
          tip_mode: tipMode,
          tip_percent: tipPercent,
          custom_tip_dollars: parseFloat(customTipDollars) || 0,
          payment_method: paymentMethod,
          loyalty_points_per_dollar: config.loyalty_points_per_dollar,
          split_tenders:
            paymentMethod === 'split'
              ? [
                  { method: 'cash', amount_cents: toCents(parseFloat(splitTenders.cash) || 0) },
                  { method: 'credit_card', amount_cents: toCents(parseFloat(splitTenders.card) || 0) },
                  { method: 'gift_card', amount_cents: toCents(parseFloat(splitTenders.giftCard) || 0) },
                  { method: 'account_credit', amount_cents: toCents(parseFloat(splitTenders.accountCredit) || 0) },
                ]
              : undefined,
        }),
      });

      const data = await response.json();
      const tx = parseDemoCheckoutResponse(response.ok, data, {
        businessId: visit.business_id,
        visitId: visit.id,
        totalCents: breakdown.totalCents,
      });

      try {
        localStorage.removeItem('pawtrackr_pos_checkout_intent');
      } catch {
        // Ignore local storage remove errors
      }

      setCompletedTx(tx);
      onCompleteTransaction(tx, breakdown.loyaltyPointsEarned);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Demo checkout could not be recorded.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/[0.12] bg-obsidian-800 shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-obsidian-900/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-emerald-glow">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  4-Step Demo POS Checkout
                </h2>
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  DECIMAL(10,2) ENGINE
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Tenant ID:{' '}
                <span className="font-mono text-zinc-300">
                  {visit.business_id.slice(0, 8)}...
                </span>{' '}
                • Client: <span className="text-white">{client.name}</span> •
                Pet: <span className="text-periwinkle-300">{pet.name}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2 text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 4-Step Progress Bar */}
        <div className="grid grid-cols-4 border-b border-white/[0.07] bg-obsidian-900/50 px-6 py-3 text-xs">
          {[
            { num: 1, title: '1. Base Service' },
            { num: 2, title: '2. Add-Ons & Coat' },
            { num: 3, title: '3. Precision Tip & Tax' },
            { num: 4, title: '4. Atomic Tender' },
          ].map((s) => {
            const isCurrent = step === s.num;
            const isDone = step > s.num || Boolean(completedTx);
            return (
              <button
                key={s.num}
                disabled={Boolean(completedTx)}
                onClick={() => setStep(s.num as 1 | 2 | 3 | 4)}
                className={`flex items-center gap-2 text-left font-medium transition ${
                  isCurrent
                    ? 'text-periwinkle-300'
                    : isDone
                    ? 'text-emerald-400'
                    : 'text-zinc-500'
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    isCurrent
                      ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
                      : isDone
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/[0.05] text-zinc-400'
                  }`}
                >
                  {isDone ? '✓' : s.num}
                </span>
                <span className="truncate">{s.title}</span>
              </button>
            );
          })}
        </div>

        {/* Main Content Grid */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
          {/* Left Interactive Step Panel (7 cols) */}
          <div className=" space-y-5 p-6 lg:col-span-7">
            {recoveredIntent && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>Outbox Intent Restored: Prior offline checkout state recovered.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem('pawtrackr_pos_checkout_intent');
                    } catch {
                      // Ignore
                    }
                    setRecoveredIntent(false);
                  }}
                  className="text-[10px] text-amber-300 underline hover:text-amber-100"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Pet Behavior Aura Banner */}
            <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Active Pet Safety Auras • {pet.name} ({pet.breed})
                  </span>
                  <p className="mt-1 text-xs text-zinc-300">
                    {pet.behavior_notes}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pet.behavior_tags.map((tag) => (
                    <BehaviorAuraBadge key={tag} tag={tag} size="xs" />
                  ))}
                </div>
              </div>
            </div>

            {completedTx ? (
              <div className="space-y-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center shadow-emerald-glow">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-obsidian-950">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 font-mono text-[11px] font-semibold text-emerald-300">
                    {breakdown.verificationHash}
                  </span>
                  <h3 className="mt-3 text-2xl font-bold text-white">
                    Demo Checkout Recorded ({formatCents(breakdown.totalCents)}
                    )
                  </h3>
                  <p className="mt-1 text-sm text-zinc-300">
                    No payment was charged. The demo visit was marked{' '}
                    <span className="font-semibold text-emerald-300">
                      COMPLETED
                    </span>{' '}
                    & +{breakdown.loyaltyPointsEarned} demo loyalty points added
                    to {client.name}.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/[0.08] bg-obsidian-900/80 p-3 text-xs">
                  <div>
                    <div className="text-zinc-400">Demo record</div>
                    <div className="mt-0.5 font-mono text-zinc-200 truncate">
                      {completedTx.id}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-400">New Loyalty Balance</div>
                    <div className="mt-0.5 font-bold text-periwinkle-300">
                      {client.loyalty_points + breakdown.loyaltyPointsEarned}{' '}
                      pts
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-400">Drawer Variance</div>
                    <div className="mt-0.5 font-mono font-bold text-emerald-400">
                      $0.00 (0¢)
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') window.print();
                    }}
                    className="w-full rounded-xl border border-white/[0.14] bg-obsidian-900 py-3 text-xs font-bold text-white transition hover:bg-obsidian-700"
                  >
                    Print 80mm Thermal / PDF Receipt
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-obsidian-950 transition hover:bg-emerald-400"
                  >
                    Return to Command Center
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* STEP 1: SERVICE PACKAGE VERIFICATION */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Step 1: Verify Primary Grooming Package
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Select or adjust the primary breed package completed for{' '}
                        {pet.name} ({pet.weight_lbs} lbs).
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      {config.custom_settings.packages.map((pkg) => {
                        const active = pkg.id === selectedPackageId;
                        return (
                          <button
                            key={pkg.id}
                            type="button"
                            onClick={() => setSelectedPackageId(pkg.id)}
                            className={`flex w-full items-start justify-between rounded-2xl border p-4 text-left transition ${
                              active
                                ? 'border-periwinkle-500 bg-periwinkle-500/15 shadow-periwinkle-glow'
                                : 'border-white/[0.07] bg-obsidian-900/60 hover:border-white/[0.15]'
                            }`}
                          >
                            <div className="pr-4">
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
                              <p className="mt-1 text-xs text-zinc-400">
                                {pkg.description}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-base font-bold text-white">
                                {formatCurrency(pkg.price)}
                              </div>
                              <div className="text-[11px] text-zinc-400">
                                {pkg.durationMinutes} mins
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* STEP 2: ADD-ONS, COAT RESCUE SURCHARGES & LOYALTY DISCOUNT */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Step 2: Spa Add-Ons, Safety Surcharges & Discounts
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Toggle completed spa upgrades or coat dematting fees.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {config.custom_settings.addons.map((addon) => {
                        const checked = selectedAddonIds.includes(addon.id);
                        return (
                          <button
                            key={addon.id}
                            type="button"
                            onClick={() => toggleAddon(addon.id)}
                            className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                              checked
                                ? 'border-periwinkle-500 bg-periwinkle-500/15 text-white'
                                : 'border-white/[0.08] bg-obsidian-900/60 text-zinc-300 hover:border-white/[0.15]'
                            }`}
                          >
                            <div className="pr-2">
                              <div className="text-xs font-semibold">
                                {addon.name}
                              </div>
                              <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                                {addon.category.replace('_', ' ')}
                              </div>
                            </div>
                            <span className="font-mono text-xs font-bold text-periwinkle-300">
                              +{formatCurrency(addon.price)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                          Coat Dematting / Handling Surcharge ($)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={5}
                          value={safetySurchargeDollars}
                          onChange={(e) =>
                            setSafetySurchargeDollars(
                              Math.max(0, parseFloat(e.target.value) || 0)
                            )
                          }
                          className="mt-1.5 w-full rounded-lg border border-white/[0.12] bg-obsidian-900 px-3 py-1.5 font-mono text-sm text-white focus:border-periwinkle-500 focus:outline-none"
                        />
                      </div>

                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                            Loyalty Reward Discount ($)
                          </label>
                          <button
                            type="button"
                            onClick={() => setDiscountDollars(25)}
                            className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/30"
                          >
                            Redeem $25 (500 pts)
                          </button>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step={5}
                          value={discountDollars}
                          onChange={(e) =>
                            setDiscountDollars(
                              Math.max(0, parseFloat(e.target.value) || 0)
                            )
                          }
                          className="mt-1.5 w-full rounded-lg border border-white/[0.12] bg-obsidian-900 px-3 py-1.5 font-mono text-sm text-white focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: PRECISION TIP & TAX CALCULATION */}
                {step === 3 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Step 3: Groomer Gratuity & Basis-Point Tax Verification
                      </h3>
                      <p className="text-xs text-zinc-400">
                        The demo calculates gratuity for the selected stylist. No Stripe transfer is made.
                      </p>
                    </div>

                    <div className="grid grid-cols-4 gap-2.5">
                      {[15, 20, 25].map((pct) => {
                        const active =
                          tipMode === 'percent' && tipPercent === pct;
                        return (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => {
                              setTipMode('percent');
                              setTipPercent(pct);
                            }}
                            className={`rounded-2xl border p-3.5 text-center transition ${
                              active
                                ? 'border-periwinkle-500 bg-periwinkle-500/20 text-white shadow-periwinkle-glow'
                                : 'border-white/[0.08] bg-obsidian-900/60 text-zinc-300 hover:border-white/[0.18]'
                            }`}
                          >
                            <div className="text-base font-bold">{pct}%</div>
                            <div className="mt-0.5 font-mono text-[11px] text-periwinkle-300">
                              {formatCents(
                                Math.round(
                                  (breakdown.taxableSubtotalCents * pct) / 100
                                )
                              )}
                            </div>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => setTipMode('custom')}
                        className={`rounded-2xl border p-3.5 text-center transition ${
                          tipMode === 'custom'
                            ? 'border-periwinkle-500 bg-periwinkle-500/20 text-white shadow-periwinkle-glow'
                            : 'border-white/[0.08] bg-obsidian-900/60 text-zinc-300 hover:border-white/[0.18]'
                        }`}
                      >
                        <div className="text-sm font-bold">Custom</div>
                        <div className="mt-0.5 text-[11px] text-zinc-400">
                          Exact $
                        </div>
                      </button>
                    </div>

                    {tipMode === 'custom' && (
                      <div className="rounded-xl border border-white/[0.1] bg-obsidian-900 p-3">
                        <label className="block text-xs font-medium text-zinc-300">
                          Enter Custom Tip Amount ($ USD)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.50"
                          value={customTipDollars}
                          onChange={(e) => setCustomTipDollars(e.target.value)}
                          className="mt-1.5 w-full rounded-lg border border-white/[0.12] bg-obsidian-800 px-3 py-2 font-mono text-sm text-white"
                        />
                      </div>
                    )}

                    <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4 font-mono text-xs space-y-2">
                      <div className="flex items-center justify-between text-zinc-400">
                        <span>Pre-Tax Service Subtotal (Cents):</span>
                        <span className="text-white">
                          {breakdown.taxableSubtotalCents}¢ (
                          {formatCents(breakdown.taxableSubtotalCents)})
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-400">
                        <span>
                          Municipal Tax ({config.tax_rate}% ={' '}
                          {Math.round(config.tax_rate * 100)} bps):
                        </span>
                        <span className="text-white">
                          {breakdown.taxCents}¢ ({formatCents(breakdown.taxCents)}
                          )
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-400">
                        <span>Groomer Tip (Cents):</span>
                        <span className="text-emerald-300">
                          {breakdown.tipCents}¢ ({formatCents(breakdown.tipCents)}
                          )
                        </span>
                      </div>
                      <div className="border-t border-white/[0.08] pt-2 flex items-center justify-between font-bold text-white">
                        <span>Atomic Checksum Invariant:</span>
                        <span className="text-periwinkle-300">
                          {breakdown.verificationHash}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: ATOMIC TENDER & DRAWER RECONCILIATION */}
                {step === 4 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Step 4: Select Atomic Tender Method
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Choose a tender method for the sample record. This demo does not charge a card or collect cash.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        {
                          id: 'apple_pay' as PaymentMethod,
                          label: 'NFC preview',
                          sub: 'No charge made',
                          icon: Smartphone,
                        },
                        {
                          id: 'card' as PaymentMethod,
                          label: 'Card preview',
                          sub: 'No reader connected',
                          icon: CreditCard,
                        },
                        {
                          id: 'cash' as PaymentMethod,
                          label: 'Cash preview',
                          sub: 'Change calculation',
                          icon: DollarSign,
                        },
                        {
                          id: 'split' as PaymentMethod,
                          label: 'Split preview',
                          sub: 'Zero-variance split',
                          icon: Layers,
                        },
                      ].map((m) => {
                        const Icon = m.icon;
                        const active = paymentMethod === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setPaymentMethod(m.id)}
                            className={`flex flex-col items-center rounded-2xl border p-4 text-center transition ${
                              active
                                ? 'border-emerald-500 bg-emerald-500/15 text-white shadow-emerald-glow'
                                : 'border-white/[0.08] bg-obsidian-900/60 text-zinc-300 hover:border-white/[0.18]'
                            }`}
                          >
                            <Icon
                              className={`h-6 w-6 ${
                                active ? 'text-emerald-400' : 'text-zinc-400'
                              }`}
                            />
                            <span className="mt-2 text-xs font-bold">
                              {m.label}
                            </span>
                            <span className="mt-0.5 text-[10px] text-zinc-400">
                              {m.sub}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {paymentMethod === 'split' && (
                      <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900 p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Multi-Tender Allocations
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-mono font-bold ${
                              splitValidation.isValid
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {splitValidation.isValid
                              ? '✓ Balanced to $0.00 exact'
                              : `Variance: ${formatCents(splitValidation.varianceCents)} remaining`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                          <div>
                            <label className="block text-[11px] text-zinc-400">Cash ($)</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="0.00"
                              value={splitTenders.cash}
                              onChange={(e) =>
                                setSplitTenders((prev) => ({ ...prev, cash: e.target.value }))
                              }
                              className="mt-1 w-full rounded-lg border border-white/[0.12] bg-obsidian-800 px-2.5 py-1.5 font-mono text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-zinc-400">Credit Card ($)</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="0.00"
                              value={splitTenders.card}
                              onChange={(e) =>
                                setSplitTenders((prev) => ({ ...prev, card: e.target.value }))
                              }
                              className="mt-1 w-full rounded-lg border border-white/[0.12] bg-obsidian-800 px-2.5 py-1.5 font-mono text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-zinc-400">Gift Card ($)</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="0.00"
                              value={splitTenders.giftCard}
                              onChange={(e) =>
                                setSplitTenders((prev) => ({ ...prev, giftCard: e.target.value }))
                              }
                              className="mt-1 w-full rounded-lg border border-white/[0.12] bg-obsidian-800 px-2.5 py-1.5 font-mono text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-zinc-400">Acct Credit ($)</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="0.00"
                              value={splitTenders.accountCredit}
                              onChange={(e) =>
                                setSplitTenders((prev) => ({ ...prev, accountCredit: e.target.value }))
                              }
                              className="mt-1 w-full rounded-lg border border-white/[0.12] bg-obsidian-800 px-2.5 py-1.5 font-mono text-xs text-white"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 border-t border-white/[0.06] pt-2">
                          <span>Allocated: {formatCents(splitValidation.totalTenderedCents)}</span>
                          <span>Final Total: {formatCents(breakdown.totalCents)}</span>
                        </div>
                      </div>
                    )}

                    {paymentMethod === 'cash' && (
                      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/[0.08] bg-obsidian-900 p-4">
                        <div>
                          <label className="block text-xs text-zinc-400">
                            Cash Tendered ($)
                          </label>
                          <input
                            type="number"
                            value={cashTendered}
                            onChange={(e) => setCashTendered(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-white/[0.12] bg-obsidian-800 px-3 py-2 font-mono text-sm text-white"
                          />
                        </div>
                        <div className="flex flex-col justify-center rounded-xl bg-emerald-500/10 px-4 py-2 border border-emerald-500/30">
                          <span className="text-[11px] text-emerald-300">
                            Exact Change Due to Client
                          </span>
                          <span className="font-mono text-lg font-bold text-white">
                            {formatCents(cashChangeCents)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Scannable QR Pay-on-Phone Pass for Android & iOS Cameras */}
                    <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-3.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-white">
                            Sample QR Layout
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            Illustrative layout only. It cannot take a payment of {formatCents(breakdown.totalCents)}.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowQrPayPass((prev) => !prev)}
                          className="rounded-xl border border-periwinkle-500/40 bg-periwinkle-500/15 px-3 py-1.5 text-xs font-bold text-periwinkle-200 hover:bg-periwinkle-500/25"
                        >
                          {showQrPayPass ? 'Hide sample' : 'Show sample'}
                        </button>
                      </div>

                      {showQrPayPass && (
                        <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-white/[0.08] bg-obsidian-950 p-4 sm:flex-row">
                          <svg
                            viewBox="0 0 110 110"
                            className="h-24 w-24 shrink-0 rounded-xl bg-white p-2"
                            aria-label="Decorative sample QR layout, not scannable"
                          >
                            <rect x="5" y="5" width="30" height="30" fill="none" stroke="#0B090E" strokeWidth="6" />
                            <rect x="14" y="14" width="12" height="12" fill="#0B090E" />
                            <rect x="75" y="5" width="30" height="30" fill="none" stroke="#0B090E" strokeWidth="6" />
                            <rect x="84" y="14" width="12" height="12" fill="#0B090E" />
                            <rect x="5" y="75" width="30" height="30" fill="none" stroke="#0B090E" strokeWidth="6" />
                            <rect x="14" y="84" width="12" height="12" fill="#0B090E" />
                            <rect x="44" y="12" width="8" height="8" fill="#0B090E" />
                            <rect x="56" y="20" width="8" height="16" fill="#0B090E" />
                            <rect x="44" y="44" width="22" height="22" fill="#4F46E5" />
                            <rect x="51" y="51" width="8" height="8" fill="#FFFFFF" />
                            <rect x="12" y="48" width="20" height="8" fill="#0B090E" />
                            <rect x="74" y="48" width="24" height="8" fill="#0B090E" />
                            <rect x="44" y="74" width="12" height="24" fill="#0B090E" />
                            <rect x="64" y="74" width="16" height="12" fill="#0B090E" />
                            <rect x="86" y="86" width="16" height="16" fill="#0B090E" />
                          </svg>
                          <div className="space-y-1 text-xs">
                            <div className="font-mono text-[11px] font-bold text-emerald-300">
                              Example checkout link layout
                            </div>
                            <p className="text-[11px] text-zinc-300">
                              No payment link or QR code has been generated.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 rounded-xl border border-periwinkle-500/30 bg-periwinkle-500/10 p-3 text-xs text-periwinkle-200">
                      <Sparkles className="h-4 w-4 shrink-0 text-periwinkle-400" />
                      <span>
                        Recording this demo checkout adds{' '}
                        <strong>+{breakdown.loyaltyPointsEarned} pts</strong> to{' '}
                        {client.name} in the local demo profile. Report cards are managed separately.
                      </span>
                    </div>
                  </div>
                )}

                {/* Step Navigation Buttons */}
                <div className="flex items-center justify-between border-t border-white/[0.08] pt-4">
                  <button
                    type="button"
                    disabled={step === 1}
                    onClick={() =>
                      setStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3 | 4)
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-40"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Previous Step
                  </button>

                  {step < 4 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setStep((prev) =>
                          Math.min(4, prev + 1) as 1 | 2 | 3 | 4
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl bg-periwinkle-500 px-5 py-2.5 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow transition hover:bg-periwinkle-400"
                    >
                      Continue to Step {step + 1}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isProcessing || (paymentMethod === 'split' && !splitValidation.isValid)}
                      onClick={handleAtomicCommit}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-xs font-bold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      <Lock className="h-4 w-4" />
                      {isProcessing
                        ? 'Recording demo checkout...'
                        : paymentMethod === 'split' && !splitValidation.isValid
                        ? `Balance Required (${formatCents(splitValidation.varianceCents)})`
                        : `Record demo checkout ${formatCents(
                            breakdown.totalCents
                          )}`}
                    </button>
                  )}
                </div>
                {checkoutError && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">{checkoutError}</p>}
              </>
            )}
          </div>

          {/* Right Live Atomic Ledger Summary (5 cols) */}
          <div className="flex flex-col justify-between border-t border-white/[0.08] bg-obsidian-900/90 p-6 lg:col-span-5 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Live Atomic Receipt Ledger
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Zero-Drift Math
                </span>
              </div>

              <div className="space-y-2.5 rounded-2xl border border-white/[0.07] bg-obsidian-800/90 p-4 text-xs">
                <div className="flex justify-between text-zinc-200">
                  <span className="font-medium">{selectedPackage?.name}</span>
                  <span className="font-mono font-semibold">
                    {formatCents(breakdown.basePackageCents)}
                  </span>
                </div>

                {selectedAddons.map((addon) => (
                  <div
                    key={addon.id}
                    className="flex justify-between text-zinc-400"
                  >
                    <span>+ {addon.name}</span>
                    <span className="font-mono">
                      {formatCurrency(addon.price)}
                    </span>
                  </div>
                ))}

                {breakdown.safetySurchargeCents > 0 && (
                  <div className="flex justify-between text-amber-300">
                    <span>+ Coat / Handling Surcharge</span>
                    <span className="font-mono">
                      {formatCents(breakdown.safetySurchargeCents)}
                    </span>
                  </div>
                )}

                {breakdown.discountCents > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>- Loyalty Reward Redemption</span>
                    <span className="font-mono">
                      -{formatCents(breakdown.discountCents)}
                    </span>
                  </div>
                )}

                <div className="border-t border-white/[0.07] pt-2.5 flex justify-between text-zinc-300">
                  <span>Taxable Service Subtotal</span>
                  <span className="font-mono font-semibold">
                    {formatCents(breakdown.taxableSubtotalCents)}
                  </span>
                </div>

                <div className="flex justify-between text-zinc-400">
                  <span>Sales Tax ({config.tax_rate}%)</span>
                  <span className="font-mono">
                    {formatCents(breakdown.taxCents)}
                  </span>
                </div>

                <div className="flex justify-between text-periwinkle-300">
                  <span>
                    Stylist Gratuity{' '}
                    {breakdown.tipPercent !== null
                      ? `(${breakdown.tipPercent}%)`
                      : '(Custom)'}
                  </span>
                  <span className="font-mono font-semibold">
                    {formatCents(breakdown.tipCents)}
                  </span>
                </div>

                <div className="border-t border-white/[0.1] pt-3 flex items-baseline justify-between">
                  <span className="text-sm font-bold text-white">
                    Atomic Total
                  </span>
                  <span className="font-mono text-2xl font-extrabold text-emerald-400">
                    {formatCents(breakdown.totalCents)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/[0.06] bg-obsidian-800/50 p-3.5 text-[11px] text-zinc-400">
              <div className="font-semibold text-zinc-300">
                PostgreSQL ACID Guarantee
              </div>
              <p className="mt-1 leading-relaxed">
                Commits via <code className="text-periwinkle-300">complete_atomic_pos_checkout()</code>{' '}
                stored procedure scoped strictly to{' '}
                <code className="text-emerald-300">business_id</code>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
