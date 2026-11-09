'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  BUSINESSES,
  BUSINESS_CONFIGS,
  TENANT_BESPOKE_ID,
} from '@/lib/mock-tenant-data';
import { ServiceAddon, ServicePackage } from '@/types/database';
import { formatCurrency } from '@/lib/pos-math';

export default function SalonSettingsCatalogBuilderPage() {
  const [activeBusinessId, setActiveBusinessId] =
    useState<string>(TENANT_BESPOKE_ID);

  const business =
    BUSINESSES.find((b) => b.id === activeBusinessId) ?? BUSINESSES[0];
  const initialConfig = BUSINESS_CONFIGS[business.id];

  const [taxRate, setTaxRate] = useState<string>(
    String(initialConfig.tax_rate)
  );
  const [loyaltyMultiplier, setLoyaltyMultiplier] = useState<string>(
    String(initialConfig.loyalty_points_per_dollar)
  );
  const [packages, setPackages] = useState<ServicePackage[]>(
    initialConfig.custom_settings.packages
  );
  const [addons, setAddons] = useState<ServiceAddon[]>(
    initialConfig.custom_settings.addons
  );

  // New package inputs
  const [newPkgName, setNewPkgName] = useState<string>('');
  const [newPkgPrice, setNewPkgPrice] = useState<string>('145');
  const [newPkgDuration, setNewPkgDuration] = useState<string>('120');
  const [newPkgDesc, setNewPkgDesc] = useState<string>('');

  // New addon inputs
  const [newAddonName, setNewAddonName] = useState<string>('');
  const [newAddonPrice, setNewAddonPrice] = useState<string>('22');

  const [savedBanner, setSavedBanner] = useState<boolean>(false);

  const handleAddPackage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPkgName) return;
    const pkg: ServicePackage = {
      id: `pkg-${Date.now().toString(36)}`,
      name: newPkgName,
      description:
        newPkgDesc ||
        'Custom breed-specific grooming package with ozone bath, velocity fluff dry, and scissor finish.',
      price: parseFloat(newPkgPrice) || 120,
      durationMinutes: parseInt(newPkgDuration, 10) || 90,
      badge: 'Custom Tier',
    };
    setPackages((prev) => [...prev, pkg]);
    setNewPkgName('');
    setNewPkgDesc('');
  };

  const handleAddAddon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddonName) return;
    const addon: ServiceAddon = {
      id: `add-${Date.now().toString(36)}`,
      name: newAddonName,
      price: parseFloat(newAddonPrice) || 20,
      category: 'spa',
    };
    setAddons((prev) => [...prev, addon]);
    setNewAddonName('');
  };

  const handleSaveCatalog = () => {
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3500);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {/* Sub-navigation back to Command Center */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-periwinkle-500/40"
        >
          <ArrowLeft className="h-4 w-4 text-periwinkle-400" />
          Back to Salon Command Center
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/payroll"
            className="rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
          >
            Staff Commission & Payroll Ledger →
          </Link>
          <button
            type="button"
            onClick={handleSaveCatalog}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-obsidian-950 shadow-emerald-glow hover:bg-emerald-400"
          >
            <Save className="h-4 w-4" />
            Save `business_configs` JSONB
          </button>
        </div>
      </div>

      {savedBanner && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-5 py-3 text-xs font-semibold text-emerald-300 shadow-emerald-glow">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Tenant `business_configs` JSONB catalog & basis-point tax rate
            synced for {business.name}!
          </span>
          <span className="font-mono">business_id: {business.id.slice(0, 8)}</span>
        </div>
      )}

      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-periwinkle-400">
              <Settings className="h-4 w-4" />
              <span>Multi-Tenant `business_configs` Studio</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white">
              {business.name} — Service Catalog & POS Config
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Changes made here immediately power your public booking portal (
              <code className="text-periwinkle-300">
                pawtrackr.live/{business.slug}
              </code>
              ) and 4-Step Atomic POS Checkout.
            </p>
          </div>

          <div className="flex gap-1.5 rounded-xl border border-white/[0.08] bg-obsidian-900 p-1.5">
            {BUSINESSES.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setActiveBusinessId(b.id);
                  const cfg = BUSINESS_CONFIGS[b.id];
                  setTaxRate(String(cfg.tax_rate));
                  setLoyaltyMultiplier(String(cfg.loyalty_points_per_dollar));
                  setPackages(cfg.custom_settings.packages);
                  setAddons(cfg.custom_settings.addons);
                }}
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

        {/* Tax Rate, Loyalty & Stripe Connect Hardware Strip */}
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-white/[0.08] pt-5 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <label className="block text-xs font-semibold text-zinc-300">
              Municipal Sales Tax Rate (%)
            </label>
            <input
              type="number"
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 font-mono text-sm text-white"
            />
            <p className="mt-1 font-mono text-[11px] text-emerald-400">
              POS Basis Points:{' '}
              {Math.round((parseFloat(taxRate) || 0) * 100)} bps
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <label className="block text-xs font-semibold text-zinc-300">
              Loyalty Points Earned Per $1 Spent
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={loyaltyMultiplier}
              onChange={(e) => setLoyaltyMultiplier(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 font-mono text-sm text-white"
            />
            <p className="mt-1 text-[11px] text-periwinkle-300">
              Auto-credited on atomic checkout completion
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
              <span className="inline-flex items-center gap-1.5">
                <CreditCard className="h-4 w-4" />
                Stripe Connect Express
              </span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px]">
                CONNECTED
              </span>
            </div>
            <p className="mt-1.5 font-mono text-xs text-white">
              acct_1Q8xPawtrackrLive
            </p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-300">
              <Smartphone className="h-3.5 w-3.5 text-periwinkle-300" />
              Stripe Reader M2 & Tap-to-Pay Paired
            </p>
          </div>
        </div>
      </div>

      {/* PACKAGE & ADDON BUILDERS */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Grooming Packages (7 cols) */}
        <div className="glass-card p-6 lg:col-span-7 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-white">
              Primary Grooming Packages ({packages.length})
            </h2>
            <p className="text-xs text-zinc-400">
              Stored in <code className="text-periwinkle-300">business_configs.custom_settings.packages</code>
            </p>
          </div>

          <div className="space-y-3">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="flex items-start justify-between gap-4 rounded-2xl border border-white/[0.08] bg-obsidian-900/75 p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      {pkg.name}
                    </span>
                    <span className="font-mono text-xs text-periwinkle-300">
                      ({pkg.durationMinutes}m)
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">
                    {pkg.description}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-base font-bold text-emerald-400">
                    {formatCurrency(pkg.price)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPackages((prev) => prev.filter((p) => p.id !== pkg.id))
                    }
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add New Package Form */}
          <form
            onSubmit={handleAddPackage}
            className="space-y-3 rounded-2xl border border-periwinkle-500/30 bg-obsidian-900/90 p-4"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
              + Add Custom Salon Package
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                placeholder="Package Title (e.g. Giant Breed Sanctuary)"
                value={newPkgName}
                onChange={(e) => setNewPkgName(e.target.value)}
                className="rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 text-xs text-white sm:col-span-1"
              />
              <input
                type="number"
                placeholder="Price ($)"
                value={newPkgPrice}
                onChange={(e) => setNewPkgPrice(e.target.value)}
                className="rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 font-mono text-xs text-white"
              />
              <input
                type="number"
                placeholder="Duration (mins)"
                value={newPkgDuration}
                onChange={(e) => setNewPkgDuration(e.target.value)}
                className="rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 font-mono text-xs text-white"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Brief package description..."
                value={newPkgDesc}
                onChange={(e) => setNewPkgDesc(e.target.value)}
                className="flex-1 rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 text-xs text-white"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-periwinkle-500 px-4 py-2 text-xs font-bold text-obsidian-950"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Package
              </button>
            </div>
          </form>
        </div>

        {/* Spa & Safety Add-Ons (5 cols) */}
        <div className="glass-card p-6 lg:col-span-5 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-white">
              Spa Upgrades & Coat Surcharges ({addons.length})
            </h2>
            <p className="text-xs text-zinc-400">
              One-tap toggles inside Step 2 of the Atomic POS Checkout.
            </p>
          </div>

          <div className="space-y-2.5">
            {addons.map((addon) => (
              <div
                key={addon.id}
                className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-obsidian-900/75 p-3 text-xs"
              >
                <div>
                  <div className="font-semibold text-white">{addon.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                    {addon.category.replace('_', ' ')}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-bold text-periwinkle-300">
                    +{formatCurrency(addon.price)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAddons((prev) => prev.filter((a) => a.id !== addon.id))
                    }
                    className="rounded-lg p-1 text-zinc-500 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddAddon}
            className="space-y-2.5 rounded-2xl border border-emerald-500/30 bg-obsidian-900/90 p-4"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              + Add Spa or Safety Add-On
            </div>
            <input
              type="text"
              placeholder="Add-on Name (e.g. CBD Calming Chew)"
              value={newAddonName}
              onChange={(e) => setNewAddonName(e.target.value)}
              className="w-full rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 text-xs text-white"
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Price ($)"
                value={newAddonPrice}
                onChange={(e) => setNewAddonPrice(e.target.value)}
                className="w-28 rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 font-mono text-xs text-white"
              />
              <button
                type="submit"
                className="flex-1 rounded-xl bg-emerald-500 py-2 text-xs font-bold text-obsidian-950"
              >
                + Add Upgrade
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
