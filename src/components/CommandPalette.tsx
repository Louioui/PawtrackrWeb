'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Command,
  Globe,
  Heart,
  KeyRound,
  Search,
  Settings,
  Truck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  CLIENTS,
  INITIAL_VISITS,
  PETS,
  TENANT_BESPOKE_ID,
} from '@/lib/mock-tenant-data';
import {
  buildSalonSearchIndex,
  executeMultiTokenSearch,
} from '@/lib/search-engine';
import { BehaviorAuraBadge } from './BehaviorAuraBadge';

export function CommandPalette({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const index = useMemo(
    () =>
      buildSalonSearchIndex(
        TENANT_BESPOKE_ID,
        PETS,
        CLIENTS,
        INITIAL_VISITS
      ),
    []
  );

  const report = useMemo(
    () => executeMultiTokenSearch(index, query),
    [index, query]
  );

  if (!isOpen) return null;

  const quickRoutes = [
    {
      label: 'Salon Command Center & Atomic POS',
      href: '/dashboard',
      icon: Command,
    },
    {
      label: '2-Way Client SMS & Coat Approval Concierge',
      href: '/dashboard/messages',
      icon: Zap,
    },
    {
      label: 'Retail Inventory, Gift Cards, Shifts & Audit Suite',
      href: '/dashboard/operations',
      icon: Settings,
    },
    {
      label: 'Founder Multi-Location Super-Admin Console',
      href: '/admin',
      icon: Users,
    },
    {
      label: 'Mobile Grooming Van Fleet & ETA OS',
      href: '/dashboard/fleet',
      icon: Truck,
    },
    {
      label: 'Service Catalog & Tax/POS Settings',
      href: '/dashboard/settings',
      icon: Settings,
    },
    {
      label: 'Stylist Commission & Payroll CSV Ledger',
      href: '/dashboard/payroll',
      icon: Users,
    },
    {
      label: 'Automated Coat-Matting Recall & Rabies Guard',
      href: '/dashboard/retention',
      icon: Heart,
    },
    {
      label: '1-Click MoeGo & DaySmart Competitor Importer',
      href: '/dashboard/import',
      icon: Zap,
    },
    {
      label: 'Executive Revenue & Spa Upsell Analytics',
      href: '/dashboard/analytics',
      icon: Command,
    },
    {
      label: 'Live Staff Appointments (Supabase RLS)',
      href: '/dashboard/appointments/live',
      icon: Command,
    },
    {
      label: 'Live Checkout Analytics (Supabase RLS)',
      href: '/dashboard/analytics/live',
      icon: Command,
    },
    {
      label: 'Live Public Salon Directory',
      href: '/portal/live',
      icon: Globe,
    },
    {
      label: 'Public Self-Booking Storefront (Bespoke Studio)',
      href: '/portal/bespoke-grooming',
      icon: Globe,
    },
    {
      label: 'Groomer Station 4-Digit PIN Switcher',
      href: '/login',
      icon: KeyRound,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-4 pt-16 backdrop-blur-md">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-periwinkle-500/40 bg-obsidian-800 shadow-2xl">
        {/* Universal Search Bar */}
        <div className="flex items-center gap-3 border-b border-white/[0.08] bg-obsidian-900 px-5 py-4">
          <Search className="h-5 w-5 text-periwinkle-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Universal Search: dog name, phone digits, breed, behavior aura, or module..."
            className="w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
          />
          <span className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
            {report.elapsedMs} ms
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/[0.1] p-1.5 text-zinc-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-5">
          {/* Matched Pets & Clients */}
          <div>
            <div className="px-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Matched Pet Dossiers & Client Portals ({report.results.length})
            </div>
            <div className="mt-2 space-y-1.5">
              {report.results.slice(0, 4).map(({ record }) => (
                <button
                  key={record.pet.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`/client/${record.client.id}`);
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-obsidian-900/75 p-3 text-left transition hover:border-periwinkle-500/50 hover:bg-obsidian-700"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={record.pet.avatar_url}
                      alt={record.pet.name}
                      className="h-10 w-10 rounded-xl object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {record.pet.name}
                        </span>
                        <span className="text-xs text-zinc-400">
                          ({record.pet.breed})
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400">
                        Parent: {record.client.name} •{' '}
                        <span className="font-mono">{record.client.phone}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {record.pet.behavior_tags.map((tag) => (
                      <BehaviorAuraBadge key={tag} tag={tag} size="xs" />
                    ))}
                    <ArrowRight className="ml-1 h-4 w-4 text-periwinkle-400" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Jump Modules */}
          <div>
            <div className="px-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Universal Workspace Modules (Touch / Ctrl+K / ⌘K)
            </div>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {quickRoutes.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push(item.href);
                    }}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-obsidian-900/60 px-3.5 py-2.5 text-left text-xs font-semibold text-zinc-200 transition hover:border-periwinkle-500/40 hover:text-white"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Icon className="h-4 w-4 shrink-0 text-periwinkle-400" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
