'use client';

import React from 'react';
import Link from 'next/link';
import {
  Building2,
  CalendarCheck2,
  Globe,
  Heart,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { StaffSignInCard } from '@/components/StaffSignInCard';

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-periwinkle-500/35 bg-periwinkle-500/10 px-3.5 py-1 text-xs font-semibold text-periwinkle-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Pawtrackr Live Salon Portal
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Staff & Salon Sign-In
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">
          Sign in to access your live salon schedule, floor operations queue, client health records, and POS register.
        </p>
      </div>

      {/* Real Supabase Auth Sign-In */}
      <div className="mt-8">
        <StaffSignInCard />
      </div>

      {/* Helpful Direction Cards for Owners and Pet Parents */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {/* Salon Owner Onboarding Card */}
        <div className="rounded-2xl border border-white/10 bg-obsidian-900/60 p-6 backdrop-blur">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-periwinkle-400/30 bg-periwinkle-400/10 text-periwinkle-300">
            <Building2 className="h-5 w-5" />
          </div>
          <h2 className="mt-3 text-base font-bold text-white">
            Opening a new salon or mobile van?
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Provision your own isolated multi-tenant database with time-zone aware scheduling, staff commission tracking, and live customer self-booking.
          </p>
          <Link
            href="/signup"
            className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-periwinkle-500/15 px-4 text-xs font-semibold text-periwinkle-200 transition hover:bg-periwinkle-500/25"
          >
            <Sparkles className="h-3.5 w-3.5" /> Create salon account &rarr;
          </Link>
        </div>

        {/* Pet Parent Self-Service Card */}
        <div className="rounded-2xl border border-white/10 bg-obsidian-900/60 p-6 backdrop-blur">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
            <CalendarCheck2 className="h-5 w-5" />
          </div>
          <h2 className="mt-3 text-base font-bold text-white">
            Are you a pet parent?
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Book an appointment online with verified groomers, check your pet’s post-groom report card and photos, or reschedule your visit.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/portal/live"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
            >
              <Globe className="h-3.5 w-3.5" /> Book online
            </Link>
            <Link
              href="/portal/live"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3.5 text-xs font-medium text-zinc-300 transition hover:border-white/30 hover:text-white"
            >
              <Heart className="h-3.5 w-3.5" /> Manage booking
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
