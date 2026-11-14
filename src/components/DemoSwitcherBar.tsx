'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sparkles,
  LayoutDashboard,
  Calendar,
  HeartHandshake,
  Settings,
  UserCircle2,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Store,
} from 'lucide-react';
import {
  loadDemoSession,
  subscribeDemoSession,
  resetUniversalStoreToDefault,
  DemoUserSession,
} from '@/lib/realtime-store';

export function DemoSwitcherBar() {
  const pathname = usePathname();
  const [session, setSession] = useState<DemoUserSession | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    setSession(loadDemoSession());
    const unsub = subscribeDemoSession((next) => {
      setSession(next);
    });
    return unsub;
  }, []);

  const businessId = session?.businessId || '11111111-1111-4111-8111-111111111111';
  const businessSlug = session?.businessSlug || 'bespoke-grooming';
  const clientId = session?.clientId || 'cl-101';

  const handleReset = () => {
    if (typeof window !== 'undefined') {
      const confirmReset = window.confirm(
        'Reset demo workspace? This will restore clean Tuesday seed data, visits, and default salon profiles.'
      );
      if (!confirmReset) return;
      resetUniversalStoreToDefault();
      setResetSuccess(true);
      setTimeout(() => {
        setResetSuccess(false);
        window.location.reload();
      }, 700);
    }
  };

  if (
    pathname === '/' ||
    pathname?.startsWith('/dashboard/analytics') ||
    pathname?.startsWith('/portal/live') ||
    pathname?.startsWith('/admin/sovereign-matrix')
  ) {
    return null;
  }

  if (minimized) {
    return (
      <aside
        aria-label="Demo perspective switcher"
        className="fixed bottom-3 right-4 z-40"
      >
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 rounded-full border border-periwinkle-500/30 bg-obsidian-900/90 px-3.5 py-1.5 text-xs font-medium text-periwinkle-200 shadow-xl backdrop-blur-xl transition hover:border-periwinkle-400 hover:text-white"
          title="Expand Demo Switcher"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Demo Hub</span>
          <ChevronUp className="h-3.5 w-3.5 opacity-70" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Demo perspective switcher"
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[96vw] sm:max-w-4xl w-auto pointer-events-auto"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2.5 rounded-2xl sm:rounded-full border border-white/10 bg-obsidian-900/95 px-3 py-1.5 sm:px-4 sm:py-2 text-xs shadow-2xl backdrop-blur-2xl ring-1 ring-white/5">
        {/* Left: Active Persona / Workspace Indicator */}
        <div className="flex items-center gap-2 pr-2 border-r border-white/10">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {session?.role === 'owner' ? (
              <span className="rounded-full bg-periwinkle-500/20 px-2 py-0.5 font-semibold text-periwinkle-300">
                Salon Owner
              </span>
            ) : session?.role === 'client' ? (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-300">
                Pet Parent
              </span>
            ) : session?.role === 'staff' ? (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-300">
                Station PIN
              </span>
            ) : (
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-medium text-zinc-300">
                Live Demo
              </span>
            )}
          </div>
          <span className="hidden md:inline max-w-[140px] truncate text-zinc-300 font-medium">
            {session?.businessName || 'Bespoke Atelier'}
          </span>
        </div>

        {/* Center: Live Journey Links */}
        <nav aria-label="Demo perspectives" className="flex items-center gap-1 sm:gap-1.5">
          <Link
            href={`/dashboard?business=${encodeURIComponent(businessId)}`}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition ${
              pathname.startsWith('/dashboard') && !pathname.includes('/settings')
                ? 'bg-periwinkle-500 text-obsidian-950 font-semibold shadow-sm'
                : 'text-zinc-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Command Center</span>
            <span className="sm:hidden">Staff</span>
          </Link>

          <Link
            href={`/portal/${encodeURIComponent(businessSlug)}`}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition ${
              pathname.startsWith('/portal')
                ? 'bg-emerald-500 text-obsidian-950 font-semibold shadow-sm'
                : 'text-zinc-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Public Booking</span>
            <span className="sm:hidden">Book</span>
          </Link>

          <Link
            href={`/client/${encodeURIComponent(clientId)}`}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition ${
              pathname.startsWith('/client')
                ? 'bg-amber-400 text-obsidian-950 font-semibold shadow-sm'
                : 'text-zinc-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <HeartHandshake className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pet Passport</span>
            <span className="sm:hidden">Client</span>
          </Link>

          <Link
            href={`/dashboard/settings?business=${encodeURIComponent(businessId)}`}
            className={`hidden lg:flex items-center gap-1 rounded-full px-2 py-1 font-medium transition ${
              pathname.includes('/settings')
                ? 'bg-white/20 text-white font-semibold'
                : 'text-zinc-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Settings</span>
          </Link>
        </nav>

        {/* Right: Switch Role & 1-Click Reset */}
        <div className="flex items-center gap-1 sm:gap-1.5 pl-1.5 border-l border-white/10">
          <Link
            href="/login"
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-zinc-300 hover:border-white/25 hover:bg-white/10 hover:text-white transition"
            title="Switch Persona or Provision New Salon"
          >
            <UserCircle2 className="h-3.5 w-3.5 text-periwinkle-400" />
            <span className="hidden md:inline">Switch Workspace</span>
            <span className="md:hidden">Switch</span>
          </Link>

          <button
            onClick={handleReset}
            disabled={resetSuccess}
            className="flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/20 transition disabled:opacity-50"
            title="Reset All Mock Data to Fresh Tuesday State"
          >
            {resetSuccess ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden sm:inline text-emerald-300">Clean!</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </>
            )}
          </button>

          <button
            onClick={() => setMinimized(true)}
            className="rounded-full p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-300 transition"
            title="Minimize Bar"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
