'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Globe,
  MapPin,
  ShieldCheck,
  Star,
  PlusCircle,
  Sparkles,
} from 'lucide-react';
import { BUSINESSES, BUSINESS_CONFIGS } from '@/lib/mock-tenant-data';
import {
  loadUniversalStore,
  subscribeUniversalStore,
  getStoreBusinesses,
} from '@/lib/realtime-store';
import { Business, BusinessConfig } from '@/types/database';

export default function PortalDirectoryPage() {
  const [businesses, setBusinesses] = useState<Business[]>(BUSINESSES);
  const [configs, setConfigs] = useState<Record<string, BusinessConfig>>(BUSINESS_CONFIGS);

  useEffect(() => {
    const syncFromStore = () => {
      const store = loadUniversalStore();
      setConfigs(store.configs);
      setBusinesses(getStoreBusinesses(store.configs));
    };
    syncFromStore();
    return subscribeUniversalStore(syncFromStore);
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Notice Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-obsidian-800/70 px-4 py-3 text-sm">
        <span className="text-zinc-300">
          These salons are illustrative demo profiles.
        </span>
        <Link
          href="/portal/live"
          className="font-semibold text-periwinkle-300 hover:text-white transition"
        >
          View live salon directory →
        </Link>
      </div>

      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-periwinkle-500/35 bg-periwinkle-500/10 px-3.5 py-1 text-xs font-semibold text-periwinkle-300">
          <Globe className="h-3.5 w-3.5" />
          Multi-Tenant Self-Booking Directory
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-white">
          Select Your Grooming Salon or Mobile Studio
        </h1>
        <p className="mt-2 text-sm text-zinc-400 max-w-2xl mx-auto">
          Choose a verified studio below to book an appointment with real-time slot verification, custom breed packages, and instant confirmation.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {businesses.map((biz) => {
          const cfg = configs[biz.id] ?? BUSINESS_CONFIGS[biz.id] ?? BUSINESS_CONFIGS[BUSINESSES[0].id];
          const packages = cfg?.custom_settings?.packages || [];
          const rating = cfg?.custom_settings?.rating || 5.0;
          const reviewCount = cfg?.custom_settings?.reviewCount || 16;
          const tagline = cfg?.custom_settings?.tagline || 'Modern Coat Styling & Low-Stress Care';
          const address = cfg?.custom_settings?.address || biz.city_state;

          return (
            <Link
              key={biz.id}
              href={`/portal/${biz.slug}`}
              className="glass-card-interactive flex flex-col justify-between p-6 transition duration-200 hover:border-periwinkle-500/40"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-periwinkle-300">
                    pawtrackr.live/{biz.slug}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {rating} ({reviewCount})
                  </span>
                </div>

                <h2 className="mt-3 text-2xl font-bold text-white">
                  {biz.name}
                </h2>
                <p className="mt-1 text-xs text-zinc-300">
                  {tagline}
                </p>

                <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-400">
                  <MapPin className="h-3.5 w-3.5 text-periwinkle-400" />
                  <span>{address}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {packages.slice(0, 3).map((pkg) => (
                    <span
                      key={pkg.id}
                      className="rounded-lg border border-white/[0.08] bg-obsidian-900/80 px-2.5 py-1 text-[11px] text-zinc-300"
                    >
                      {pkg.name} (${pkg.price})
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-4 text-xs font-bold text-emerald-400">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Instant Online Booking Open
                </span>
                <span className="inline-flex items-center gap-1 text-periwinkle-300">
                  Book Appointment <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          );
        })}

        {/* Provision New Salon Card */}
        <Link
          href="/login?tab=owner"
          className="group flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/20 bg-obsidian-900/40 p-8 text-center transition duration-200 hover:border-periwinkle-400 hover:bg-obsidian-800/40"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-periwinkle-500/10 text-periwinkle-300 group-hover:scale-110 transition duration-200">
            <PlusCircle className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-white">
            Provision Your Own Demo Salon
          </h3>
          <p className="mt-1 text-xs text-zinc-400 max-w-xs">
            Set up your studio name, booking slug, service packages, and staff roster in 60 seconds.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-periwinkle-300 group-hover:text-periwinkle-200">
            Launch Onboarding Wizard →
          </span>
        </Link>
      </div>
    </div>
  );
}
