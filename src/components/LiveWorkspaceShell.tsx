'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  CalendarDays,
  Clock,
  CreditCard,
  Database,
  DollarSign,
  ExternalLink,
  Globe,
  LineChart,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
  Truck,
  Users,
} from 'lucide-react';
import type { LiveStaffRole, OperatingModel, SalonBookingStatus } from '@/lib/workflow-context';

export type LiveWorkspaceShellProps = {
  salonName?: string;
  slug?: string;
  role?: LiveStaffRole | string | null;
  operatingModel?: OperatingModel | string | null;
  bookingStatus?: SalonBookingStatus | string | null;
  onSignOut?: () => void | Promise<void>;
  children?: React.ReactNode;
  headerActions?: React.ReactNode;
};

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  front_desk: 'Front Desk',
  senior_groomer: 'Senior Groomer',
  groomer: 'Groomer',
  bather: 'Bather',
};

const modelLabels: Record<string, { label: string; icon: typeof Truck }> = {
  salon: { label: 'Salon Studio', icon: Settings },
  mobile_van: { label: 'Mobile Van', icon: Truck },
  hybrid: { label: 'Hybrid Fleet', icon: Truck },
};

const statusBadges: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  draft: {
    label: 'Draft · Booking Private',
    dotClass: 'bg-amber-400',
    badgeClass: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  },
  published: {
    label: 'Published · Booking Live',
    dotClass: 'bg-emerald-400',
    badgeClass: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  },
  paused: {
    label: 'Paused · Booking Offline',
    dotClass: 'bg-zinc-400',
    badgeClass: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
  },
};

export function LiveWorkspaceShell({
  salonName,
  slug,
  role = 'owner',
  operatingModel = 'salon',
  bookingStatus = 'draft',
  onSignOut,
  children,
  headerActions,
}: LiveWorkspaceShellProps) {
  const pathname = usePathname();

  const modelInfo = modelLabels[operatingModel ?? 'salon'] ?? modelLabels.salon;
  const statusInfo = statusBadges[bookingStatus ?? 'draft'] ?? statusBadges.draft;
  const roleLabel = roleLabels[role ?? 'owner'] ?? (role ?? 'Staff');

  const navLinks = [
    {
      href: '/dashboard/operations/live',
      label: 'Live Operations',
      icon: Activity,
      active: pathname === '/dashboard/operations/live',
    },
    {
      href: '/dashboard/pos/live',
      label: 'POS Register',
      icon: CreditCard,
      active: pathname === '/dashboard/pos/live',
    },
    {
      href: '/dashboard/messages/live',
      label: 'Two-Way SMS',
      icon: MessageSquare,
      active: pathname === '/dashboard/messages/live',
    },
    {
      href: '/dashboard/payroll/live',
      label: 'Staff Payroll',
      icon: DollarSign,
      active: pathname === '/dashboard/payroll/live',
    },
    {
      href: '/dashboard/waitlist/live',
      label: 'Smart Waitlist',
      icon: Clock,
      active: pathname === '/dashboard/waitlist/live',
    },
    {
      href: '/dashboard/fleet/live',
      label: 'Mobile Fleet',
      icon: Truck,
      active: pathname === '/dashboard/fleet/live',
    },
    {
      href: '/dashboard/import/live',
      label: 'Data Portability',
      icon: Database,
      active: pathname === '/dashboard/import/live',
    },
    {
      href: '/dashboard/appointments/live',
      label: 'Appointments',
      icon: CalendarDays,
      active: pathname === '/dashboard/appointments/live',
    },
    {
      href: '/dashboard/clients/live',
      label: 'Clients & Pets',
      icon: Users,
      active: pathname === '/dashboard/clients/live',
    },
    {
      href: '/dashboard/settings/live',
      label: 'Catalog & Roster',
      icon: Settings,
      active: pathname === '/dashboard/settings/live',
    },
    {
      href: '/dashboard/analytics/live',
      label: 'Recorded Analytics',
      icon: LineChart,
      active: pathname === '/dashboard/analytics/live',
    },
  ];

  return (
    <div className="mb-8 border-b border-white/10 pb-4">
      {/* Top Bar: Tenant name, Operating Model, Booking Status, Role, Sign Out */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-extrabold text-white text-base tracking-tight">
            {salonName || 'Pawtrackr Live Salon'}
          </span>
          {slug && (
            <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-zinc-300">
              /{slug}
            </span>
          )}

          {/* Operating Model Pill */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-obsidian-900/80 px-2.5 py-0.5 text-xs text-zinc-300">
            <modelInfo.icon className="h-3 w-3 text-periwinkle-300" aria-hidden="true" />
            {modelInfo.label}
          </span>

          {/* Booking Status Badge */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusInfo.badgeClass}`}
            role="status"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dotClass}`} />
            {statusInfo.label}
          </span>

          {/* Role Pill */}
          <span className="inline-flex items-center gap-1 rounded-full border border-periwinkle-400/30 bg-periwinkle-400/10 px-2.5 py-0.5 text-xs font-semibold text-periwinkle-200">
            <Shield className="h-3 w-3" aria-hidden="true" />
            {roleLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {headerActions}
          {slug && (
            <Link
              href={`/portal/live/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-obsidian-900/60 px-3 text-xs text-periwinkle-300 hover:border-periwinkle-300/40 hover:text-white"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              Public portal
              <ExternalLink className="h-3 w-3 text-zinc-400" aria-hidden="true" />
            </Link>
          )}
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs text-zinc-300 hover:border-white/30 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav aria-label="Live salon workspace tabs" className="mt-2 flex flex-wrap gap-1">
        {navLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-xs font-semibold transition-colors ${
              item.active
                ? 'bg-periwinkle-400 text-obsidian-950 font-bold'
                : 'text-zinc-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </Link>
        ))}
      </nav>

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export default LiveWorkspaceShell;
