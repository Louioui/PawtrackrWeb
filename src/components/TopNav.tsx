'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  Command,
  Globe,
  Heart,
  KeyRound,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { CommandPalette } from './CommandPalette';

export function TopNav() {
  const pathname = usePathname();
  const isLiveAnalytics = pathname === '/dashboard/analytics/live';
  const isLiveAppointments = pathname === '/dashboard/appointments/live';
  const isLiveCatalog = pathname?.startsWith('/portal/live') ?? false;
  const isSourceBacked = isLiveAnalytics || isLiveAppointments || isLiveCatalog;
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [offlineVanSim, setOfflineVanSim] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Ignore registration error in dev mode if any
      });
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems = [
    {
      href: '/',
      label: 'SaaS Platform',
      sub: 'B2B Acquisition',
      icon: Sparkles,
      active: pathname === '/',
    },
    {
      href: '/dashboard',
      label: 'Command Center',
      sub: 'Owner & Staff POS',
      icon: Command,
      active:
        pathname === '/dashboard' ||
        pathname?.startsWith('/dashboard/settings') ||
        pathname?.startsWith('/dashboard/payroll') ||
        pathname?.startsWith('/dashboard/retention'),
    },
    {
      href: '/dashboard/fleet',
      label: 'Mobile Fleet OS',
      sub: 'Van Route & ETA',
      icon: Truck,
      active: pathname?.startsWith('/dashboard/fleet'),
    },
    {
      href: '/portal/bespoke-grooming',
      label: 'Self-Booking Portal',
      sub: 'pawtrackr.live/salon',
      icon: Globe,
      active: pathname?.startsWith('/portal'),
    },
    {
      href: '/client/cl-101',
      label: 'Client Portal',
      sub: 'Report Cards & Loyalty',
      icon: Heart,
      active: pathname?.startsWith('/client'),
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-obsidian-900/85 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand Identity */}
          <Link href="/" className="group flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-periwinkle-500/40 bg-gradient-to-br from-periwinkle-500/25 via-obsidian-700 to-emerald-500/20 shadow-periwinkle-glow transition-transform group-hover:scale-105">
              <Calendar className="h-5 w-5 text-periwinkle-400" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-obsidian-900" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white">
                  Pawtrackr
                </span>
                <span className="hidden rounded-md border border-periwinkle-500/30 bg-periwinkle-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-periwinkle-300 sm:inline">
                  Universal Web OS
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {isLiveAnalytics ? 'Authenticated staff analytics' : isLiveAppointments ? 'Authenticated staff appointments' : isLiveCatalog ? 'Published salon catalog' : 'Pet grooming workspace • Demo preview'}
              </p>
            </div>
          </Link>

          {/* Portal Switcher */}
          <nav className="hidden xl:flex items-center gap-1 rounded-2xl border border-white/[0.07] bg-obsidian-800/90 p-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-all ${
                    item.active
                      ? 'border border-periwinkle-500/40 bg-periwinkle-500/15 text-white shadow-periwinkle-glow'
                      : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      item.active ? 'text-periwinkle-400' : 'text-zinc-400'
                    }`}
                  />
                  <div className="leading-none">
                    <div className="text-xs font-semibold">{item.label}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-400">
                      {item.sub}
                    </div>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Universal Quick-Search Button (Touch + Ctrl+K / ⌘K) & Station PIN */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-periwinkle-500/50 hover:text-white"
            >
              <Search className="h-3.5 w-3.5 text-periwinkle-400" />
              <span className="sr-only sm:not-sr-only">Quick Jump</span>
              <kbd className="hidden md:inline rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-periwinkle-300">
                Ctrl+K / ⌘K
              </kbd>
            </button>

            {!isSourceBacked && <button
              type="button"
              title="Preview the offline status badge; this does not disconnect the browser"
              onClick={() => setOfflineVanSim((prev) => !prev)}
              className={`hidden lg:flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                offlineVanSim
                  ? 'border-amber-500/45 bg-amber-500/15 text-amber-300'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              {offlineVanSim ? (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                  <span>Offline badge preview</span>
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Demo snapshot</span>
                </>
              )}
            </button>}

            {!isSourceBacked && <Link
              href="/login"
              aria-label="Station PIN"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-periwinkle-500/40 hover:text-white"
            >
              <KeyRound className="h-3.5 w-3.5 text-periwinkle-400" />
              <span className="hidden sm:inline">Station PIN</span>
            </Link>}
          </div>
        </div>

        {/* Mobile / Tablet Portal Switcher Bar */}
        <div className="flex xl:hidden overflow-x-auto border-t border-white/[0.06] bg-obsidian-800/80 px-3 py-2 gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  item.active
                    ? 'bg-periwinkle-500/20 text-periwinkle-300 border border-periwinkle-500/40'
                    : 'text-zinc-400 bg-white/[0.03]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </header>

      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
      />
    </>
  );
}
