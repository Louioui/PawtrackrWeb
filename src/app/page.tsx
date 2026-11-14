'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Command,
  CreditCard,
  ExternalLink,
  FileText,
  Globe,
  Heart,
  HelpCircle,
  Layers,
  Lock,
  Play,
  Receipt,
  RefreshCw,
  Scale,
  Scissors,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import { SAAS_PLANS } from '@/lib/stripe';

type PerspectiveKey = 'pet_parent' | 'salon_team' | 'owner';
type LifecycleStageKey =
  | 'requested'
  | 'confirmed'
  | 'checked_in'
  | 'grooming'
  | 'paid'
  | 'follow_up';
type AvailabilityScenarioKey = 'valid_slot' | 'blocked_shift';
type DataConfidenceKey = 'live_recent' | 'checking' | 'stale_offline' | 'demo_mode';

interface LifecycleStage {
  key: LifecycleStageKey;
  stepNumber: number;
  label: string;
  audience: string;
  perspective: PerspectiveKey;
  timestampLabel: string;
  headline: string;
  summary: string;
  automaticAction: string;
  statusBadge: string;
}

const LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    key: 'requested',
    stepNumber: 1,
    label: 'Requested',
    audience: 'Pet Parent',
    perspective: 'pet_parent',
    timestampLabel: '10:14 AM PT',
    headline: 'Pet parent selects a service and convenient time slot online',
    summary:
      'Sophia selects Full Coat Sculpt & Spa Bath (90 min • $115.00) for Bello (28.4 lb Mini Goldendoodle) at 10:30 AM America/Los_Angeles.',
    automaticAction:
      'Checks salon operating hours, service duration, 15-minute turnaround buffer, and active groomer shifts before offering the slot.',
    statusBadge: 'Slot verified in salon time zone',
  },
  {
    key: 'confirmed',
    stepNumber: 2,
    label: 'Confirmed',
    audience: 'Shared • Pet Parent & Salon',
    perspective: 'pet_parent',
    timestampLabel: '10:15 AM PT',
    headline: 'Appointment is locked on the schedule without double-booking',
    summary:
      'Bello’s visit is assigned to Elena Rostova for 10:30 AM–12:00 PM PT (+15m buffer) with clear time-zone and pricing details.',
    automaticAction:
      'Database exclusion rules prevent double-booking the groomer lane even if two requests arrive at the same instant.',
    statusBadge: 'Confirmed • Tue 10:30 AM PT',
  },
  {
    key: 'checked_in',
    stepNumber: 3,
    label: 'Checked in',
    audience: 'Salon Team',
    perspective: 'salon_team',
    timestampLabel: '10:28 AM PT',
    headline: 'Front desk intake records weight, coat condition, and care notes',
    summary:
      'Bello is weighed in at 28.4 lb with no active matting; intake notes mark him as dryer-sensitive and verify his current rabies vaccination.',
    automaticAction:
      'Applies the "Dryer / noise sensitive" care badge and updates the station table for groomer awareness.',
    statusBadge: 'Checked in • Table Suite 2',
  },
  {
    key: 'grooming',
    stepNumber: 4,
    label: 'Grooming',
    audience: 'Salon Team',
    perspective: 'salon_team',
    timestampLabel: '11:15 AM PT',
    headline: 'Live floor queue keeps bathers and master stylists synchronized',
    summary:
      'Bello advances from hydro-massage bath to velocity fluff dry with happy-hoodie protection, then to precision scissor styling.',
    automaticAction:
      'Live status moves across groomer stations without requiring staff to yell across a busy bathing room.',
    statusBadge: 'Styling in progress',
  },
  {
    key: 'paid',
    stepNumber: 5,
    label: 'Paid',
    audience: 'Front Desk & Owner',
    perspective: 'owner',
    timestampLabel: '12:05 PM PT',
    headline: 'Cent-exact checkout updates daily revenue and drawer totals',
    summary:
      'Front desk processes Bello’s checkout: $115.00 service + $10.06 tax (8.75%) + $22.37 tip = $147.43 exact total with $0.00 cash variance.',
    automaticAction:
      'Cryptographic idempotency guarantees card payments are never double-charged, and tip pools route accurately to Elena.',
    statusBadge: 'Settled • $147.43 Total',
  },
  {
    key: 'follow_up',
    stepNumber: 6,
    label: 'Follow up',
    audience: 'Pet Parent & Owner',
    perspective: 'pet_parent',
    timestampLabel: '01:30 PM PT',
    headline: 'Digital report card and 6-week re-booking prompt sent automatically',
    summary:
      'Sophia receives Bello’s high-res before/after photos, coat wellness notes, and a 1-tap link to secure her next haircut.',
    automaticAction:
      'Automated retention engine schedules the next visit before the pet leaves the parking lot.',
    statusBadge: 'Report Card Delivered',
  },
];

const AVAILABILITY_SCENARIOS: Record<
  AvailabilityScenarioKey,
  {
    label: string;
    slotLabel: string;
    serviceLabel: string;
    groomerLabel: string;
    outcomeBadge: string;
    isAvailable: boolean;
    explanationTitle: string;
    explanationBody: string;
    checks: { title: string; detail: string; passed: boolean }[];
  }
> = {
  valid_slot: {
    label: 'Scenario A: Valid 10:30 AM PT Request',
    slotLabel: 'Tue 10:30 AM – 12:00 PM America/Los_Angeles (+15m buffer)',
    serviceLabel: 'Full Coat Sculpt & Spa Bath • 90 min • $115.00',
    groomerLabel: 'Elena Rostova (Shift: 08:30 AM – 4:30 PM PT)',
    outcomeBadge: 'Slot available • Fits hours, shift, and buffer',
    isAvailable: true,
    explanationTitle: 'Safe slot confirmed without collision',
    explanationBody:
      'This booking fits within Elena Rostova’s shift, respects the salon’s 15-minute turnaround buffer, and does not overlap with any existing appointment.',
    checks: [
      {
        title: 'Salon open',
        detail: 'Salon remains open until 06:00 PM America/Los_Angeles.',
        passed: true,
      },
      {
        title: 'Service is offered',
        detail: 'Full Coat Sculpt & Spa Bath is active in the published catalog.',
        passed: true,
      },
      {
        title: 'No existing visit overlap',
        detail: 'Elena’s lane is clear from 10:30 AM through 12:15 PM.',
        passed: true,
      },
      {
        title: 'Groomer shift boundary',
        detail: 'Service + 15m buffer ends at 12:15 PM PT, well before shift ends at 4:30 PM.',
        passed: true,
      },
    ],
  },
  blocked_shift: {
    label: 'Scenario B: Why was 12:00 PM PT blocked?',
    slotLabel: 'Tue 12:00 PM – 01:30 PM America/Los_Angeles (+15m buffer)',
    serviceLabel: 'Full Coat Sculpt & Spa Bath • 90 min • $115.00',
    groomerLabel: 'Elena Rostova (Shift: 08:30 AM – 1:30 PM PT)',
    outcomeBadge: 'Booking blocked • Exceeds groomer shift with buffer',
    isAvailable: false,
    explanationTitle: 'Human-readable rejection reason',
    explanationBody:
      'This time is unavailable because Elena Rostova’s scheduled shift ends at 1:30 PM America/Los_Angeles, and a 90-minute service plus the 15-minute turnaround buffer requires until 1:45 PM.',
    checks: [
      {
        title: 'Salon open',
        detail: 'Salon remains open until 06:00 PM America/Los_Angeles.',
        passed: true,
      },
      {
        title: 'Service is offered',
        detail: 'Full Coat Sculpt & Spa Bath is active in the published catalog.',
        passed: true,
      },
      {
        title: 'No existing visit overlap',
        detail: 'No other appointment occupies 12:00 PM on Elena’s lane.',
        passed: true,
      },
      {
        title: 'Groomer shift boundary',
        detail: 'Service + 15m buffer ends at 1:45 PM PT, 15 minutes after shift ends at 1:30 PM.',
        passed: false,
      },
    ],
  },
};

const DATA_CONFIDENCE_STATES: Record<
  DataConfidenceKey,
  {
    badgeLabel: string;
    tone: 'emerald' | 'periwinkle' | 'amber' | 'zinc';
    staffHeadline: string;
    staffMessage: string;
    whyItMatters: string;
  }
> = {
  live_recent: {
    badgeLabel: 'Updated just now • Live tenant data',
    tone: 'emerald',
    staffHeadline: 'Connected to active salon records',
    staffMessage:
      'Schedule and completed checkout totals reflect verified tenant records as of 12:05 PM America/Los_Angeles.',
    whyItMatters:
      'Gives receptionists and owners confidence that groomer lanes and checkout status are current before making schedule decisions.',
  },
  checking: {
    badgeLabel: 'Checking live data…',
    tone: 'periwinkle',
    staffHeadline: 'Refreshing schedule in the background',
    staffMessage:
      'Keeping your current schedule visible while checking for new bookings or status updates.',
    whyItMatters:
      'Prevents jarring screen flashes while staff are speaking with a pet parent at the front desk.',
  },
  stale_offline: {
    badgeLabel: 'Offline • Showing snapshot from 3m ago',
    tone: 'amber',
    staffHeadline: 'Live updates are temporarily unavailable',
    staffMessage:
      'Showing your last confirmed schedule from 3 minutes ago; reconnecting automatically when the network returns.',
    whyItMatters:
      'Never fabricates a false save or hides a connection drop during a busy grooming day.',
  },
  demo_mode: {
    badgeLabel: 'Interactive demo • Sample salon data',
    tone: 'zinc',
    staffHeadline: 'Isolated product preview workspace',
    staffMessage:
      'Actions in the demo workspace use illustrative sample records so you can explore workflows safely without charging cards or altering live salons.',
    whyItMatters:
      'Keeps product exploration transparent so visitors and investors always know whether they are viewing sample or live records.',
  },
};

export default function LandingPage() {
  // Interactive Demonstration State
  const [activePerspective, setActivePerspective] =
    useState<PerspectiveKey>('pet_parent');
  const [activeStageKey, setActiveStageKey] =
    useState<LifecycleStageKey>('confirmed');
  const [demoAppointmentCompleted, setDemoAppointmentCompleted] =
    useState<boolean>(false);

  // Availability Intelligence State
  const [availabilityScenario, setAvailabilityScenario] =
    useState<AvailabilityScenarioKey>('valid_slot');

  // Network Confidence State
  const [confidenceState, setConfidenceState] =
    useState<DataConfidenceKey>('live_recent');

  const activeStage =
    LIFECYCLE_STAGES.find((s) => s.key === activeStageKey) ??
    LIFECYCLE_STAGES[1];
  const currentAvailability = AVAILABILITY_SCENARIOS[availabilityScenario];
  const currentConfidence = DATA_CONFIDENCE_STATES[confidenceState];

  // Derived Owner Metrics in Demo
  const completedCount = demoAppointmentCompleted ? 4 : 3;
  const confirmedRevenueDollars = demoAppointmentCompleted ? '565.93' : '428.50';

  const handlePerspectiveSelect = (perspective: PerspectiveKey) => {
    setActivePerspective(perspective);
    if (perspective === 'pet_parent') {
      setActiveStageKey('confirmed');
    } else if (perspective === 'salon_team') {
      setActiveStageKey(demoAppointmentCompleted ? 'paid' : 'checked_in');
    } else {
      setActiveStageKey(demoAppointmentCompleted ? 'follow_up' : 'paid');
    }
  };

  const handleLifecycleStageSelect = (stage: LifecycleStage) => {
    setActiveStageKey(stage.key);
    setActivePerspective(stage.perspective);
    if (stage.key === 'paid' || stage.key === 'follow_up') {
      setDemoAppointmentCompleted(true);
    } else if (stage.key === 'requested' || stage.key === 'confirmed') {
      setDemoAppointmentCompleted(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 space-y-20">
      
      {/* =====================================================================
          1. HERO SECTION: PURE B2B SAAS LANDING PAGE (CLEAN & POWERFUL)
      ===================================================================== */}
      <section
        aria-label="Pawtrackr connected grooming workflow overview"
        className="relative overflow-hidden rounded-3xl border border-white/[0.1] bg-gradient-to-b from-obsidian-800/90 via-obsidian-900 to-obsidian-950 p-6 sm:p-12 lg:p-16 shadow-2xl"
      >
        <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-periwinkle-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-44 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10 text-center max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-periwinkle-500/35 bg-periwinkle-500/10 px-4 py-1.5 text-xs font-semibold text-periwinkle-300">
            <Sparkles className="h-3.5 w-3.5 text-periwinkle-400" />
            <span>Interactive product preview • Simulated salon workflow</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.12]">
            The Trusted Operating System for{' '}
            <span className="bg-gradient-to-r from-periwinkle-300 via-periwinkle-400 to-emerald-400 bg-clip-text text-transparent">
              Modern Pet-Care Businesses.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-zinc-300 leading-relaxed font-normal">
            Effortlessly run your pet grooming salon or mobile van in one simple, beautiful platform.
            From 24/7 online booking and rabies vaccine verification to real-time staff schedules and 
            cent-exact checkout—everything stays organized, safe, and transparent.
          </p>

          {/* Primary Action CTAs */}
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-2xl bg-periwinkle-500 px-8 py-4 text-base font-bold text-obsidian-950 shadow-periwinkle-glow transition hover:bg-periwinkle-400"
            >
              <Command className="h-5 w-5" />
              Launch Interactive Demo
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/welcome"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.14] bg-obsidian-800/80 px-7 py-4 text-base font-semibold text-white transition hover:border-periwinkle-500/50 hover:bg-obsidian-700"
            >
              <Sparkles className="h-5 w-5 text-periwinkle-400" />
              Start 14-Day Free Trial
            </Link>
          </div>

          {/* Quick Trust Badges */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400 border-t border-white/[0.08]">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Zero Double-Bookings
            </span>
            <span className="flex items-center gap-1.5 text-zinc-300">
              <ShieldCheck className="h-4 w-4 text-periwinkle-400" />
              Rabies Certificate Vault
            </span>
            <span className="flex items-center gap-1.5 text-zinc-300">
              <Receipt className="h-4 w-4 text-emerald-400" />
              $0.00 POS Drawer Variance
            </span>
            <span className="flex items-center gap-1.5 text-zinc-300">
              <Smartphone className="h-4 w-4 text-periwinkle-400" />
              iPad &amp; Mobile Ready
            </span>
          </div>
        </div>
      </section>

      {/* =====================================================================
          2. PURPOSE & VALUE: WHAT IS PAWTRACKR & HOW IT HELPS
      ===================================================================== */}
      <section className="space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            Purpose-Built for Groomers
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            How Pawtrackr Solves Your Daily Headaches
          </h2>
          <p className="text-sm text-zinc-400">
            Designed to replace clunky legacy software with one fast, intuitive, Apple-grade system.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Pillar 1 */}
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/90 p-6 space-y-4 shadow-lg hover:border-periwinkle-500/30 transition">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-periwinkle-500/15 border border-periwinkle-500/30 text-periwinkle-300">
              <Globe className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white">1. Stop Playing Phone Tag</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Pet parents can book appointments 24/7 from their phone. Our smart calendar checks groomer shifts, service durations, and 15-minute turnaround buffers automatically so you never get double-booked.
            </p>
            <div className="pt-2 text-xs font-semibold text-periwinkle-300">
              Self-Serve Online Booking →
            </div>
          </div>

          {/* Pillar 2 */}
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/90 p-6 space-y-4 shadow-lg hover:border-emerald-500/30 transition">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              <Calendar className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white">2. Run Calm, Organized Days</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Groomers and bathers see a live, color-coded board showing exactly which pets are bathing, drying, or styling. Handling alerts like &quot;dryer sensitive&quot; or &quot;senior&quot; keep pets safe on every table.
            </p>
            <div className="pt-2 text-xs font-semibold text-emerald-300">
              Multi-Groomer Staff Board →
            </div>
          </div>

          {/* Pillar 3 */}
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/90 p-6 space-y-4 shadow-lg hover:border-amber-500/30 transition">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <Receipt className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white">3. Fast Checkout with $0 Variance</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Ring up services, matted coat add-ons, retail, and tips in seconds. Exact integer-cent accounting ensures your cash drawer and daily credit card deposits match to the penny every single evening.
            </p>
            <div className="pt-2 text-xs font-semibold text-amber-300">
              Point of Sale &amp; Receipts →
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. SEPARATED FOCUSED WORKFLOWS (CLICK DIRECTLY TO THAT EXPERIENCE)
      ===================================================================== */}
      <section className="space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            Dedicated Product Portals
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Choose What You Want to Explore
          </h2>
          <p className="text-sm text-zinc-400">
            Click any portal below to enter that specific live workflow directly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Staff Schedule */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-periwinkle-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-periwinkle-500/15 border border-periwinkle-500/30 flex items-center justify-center text-periwinkle-400 group-hover:scale-110 transition">
                <Calendar className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Live Staff Schedule</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Multi-groomer vertical calendar with live WebSocket sync (&lt;100ms), turnaround buffers, and Smart Triage for absent staff.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1.5 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Multi-groomer lane stacking</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Turnaround time buffers</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Keyboard shortcuts (Cmd+N, Cmd+Shift+B)</li>
              </ul>
            </div>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-periwinkle-500/15 border border-periwinkle-500/30 py-2.5 px-4 text-xs font-bold text-periwinkle-300 hover:bg-periwinkle-500 hover:text-obsidian-950 transition"
            >
              Open Salon Schedule <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Card 2: Pet Parent Booking */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-emerald-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition">
                <Globe className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Pet Parent Booking</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Clean, mobile-optimized online booking portal. Clients select services, review prices, and pick local time slots with instant confirmation.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1.5 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> 24/7 mobile self-booking</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Salon local time zone</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Self-reschedule &amp; cancel</li>
              </ul>
            </div>
            <Link
              href="/portal/bespoke-grooming"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 py-2.5 px-4 text-xs font-bold text-emerald-300 hover:bg-emerald-500 hover:text-obsidian-950 transition"
            >
              Open Client Booking Portal <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Card 3: Rabies & Medical Vault */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-amber-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Rabies &amp; Care Vault</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Secure vaccine certificate storage, compliance badges, pet weight history charts, and special handling behavior tags.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1.5 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Rabies certificate upload</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Expiry date compliance check</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Anxious &amp; senior care tags</li>
              </ul>
            </div>
            <Link
              href="/dashboard/clients/live"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 py-2.5 px-4 text-xs font-bold text-amber-300 hover:bg-amber-500 hover:text-obsidian-950 transition"
            >
              Open Medical Vault <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Card 4: POS & Checkout */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-periwinkle-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-periwinkle-500/15 border border-periwinkle-500/30 flex items-center justify-center text-periwinkle-400 group-hover:scale-110 transition">
                <Receipt className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Atomic POS &amp; Receipts</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Fast register for salon desks and mobile vans. Exact integer-cent billing, split tenders, card tips, and digital report cards.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1.5 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Integer-cent fixed-point math</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Split card &amp; cash payments</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Photo report card text alerts</li>
              </ul>
            </div>
            <Link
              href="/dashboard/pos/live"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-periwinkle-500/15 border border-periwinkle-500/30 py-2.5 px-4 text-xs font-bold text-periwinkle-300 hover:bg-periwinkle-500 hover:text-obsidian-950 transition"
            >
              Open POS Register <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          4. INTERACTIVE DEMONSTRATION: ONE RECORD, THREE PERSPECTIVES
      ===================================================================== */}
      <section className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-10 space-y-6 shadow-xl">
        <div className="text-center max-w-2xl mx-auto space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            Interactive Product Tour
          </span>
          <h2 className="text-2xl font-bold text-white">
            See How One Appointment Syncs Everywhere
          </h2>
          <p className="text-xs text-zinc-400">
            Click below to see the exact same appointment from the Pet Parent, Groomer, and Salon Owner viewpoint.
          </p>

          <div
            role="tablist"
            aria-label="Choose product perspective"
            className="inline-flex mt-4 rounded-xl border border-white/[0.1] bg-obsidian-950 p-1"
          >
            {(
              [
                { key: 'pet_parent', label: 'Pet Parent' },
                { key: 'salon_team', label: 'Salon Team' },
                { key: 'owner', label: 'Owner' },
              ] as const
            ).map((tab) => {
              const selected = activePerspective === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  id={`perspective-tab-${tab.key}`}
                  aria-selected={selected}
                  aria-controls={`perspective-panel-${tab.key}`}
                  type="button"
                  onClick={() => handlePerspectiveSelect(tab.key)}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                    selected
                      ? 'bg-periwinkle-500 text-obsidian-950 shadow-sm'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Perspective Panel Display */}
        <div className="rounded-2xl border border-white/[0.1] bg-obsidian-950 p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-white text-sm">Bello</span>
              <span className="text-zinc-300">• Mini Goldendoodle (28.4 lb)</span>
            </div>
            <div className="font-mono text-xs text-periwinkle-300">
              Tue 10:30 AM – 12:00 PM America/Los_Angeles
            </div>
          </div>

          {/* Pet Parent Tab Panel */}
          {activePerspective === 'pet_parent' && (
            <div
              role="tabpanel"
              id="perspective-panel-pet_parent"
              aria-labelledby="perspective-tab-pet_parent"
              className="mt-4 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/[0.07] bg-obsidian-900/80 p-4">
                  <div className="text-xs text-zinc-400">Selected Service</div>
                  <div className="mt-1 text-base font-bold text-white">Full Coat Sculpt &amp; Spa Bath</div>
                  <div className="mt-1 text-xs text-emerald-400 font-semibold">$115.00 • 90 min</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-obsidian-900/80 p-4">
                  <div className="text-xs text-zinc-400">Salon Time Zone &amp; Window</div>
                  <div className="mt-1 text-base font-bold text-white">Tue 10:30 AM – 12:00 PM</div>
                  <div className="mt-1 text-xs text-periwinkle-300 font-mono">America/Los_Angeles</div>
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-periwinkle-500/20 bg-periwinkle-500/10 text-xs text-zinc-200">
                <p className="font-semibold text-periwinkle-300">Clear Customer Experience:</p>
                <p className="mt-0.5 text-zinc-300">
                  Sophia chooses the service, selects an open slot verified in her local salon time zone, and receives instant confirmation without playing phone tag.
                </p>
              </div>
            </div>
          )}

          {/* Salon Team Tab Panel */}
          {activePerspective === 'salon_team' && (
            <div
              role="tabpanel"
              id="perspective-panel-salon_team"
              aria-labelledby="perspective-tab-salon_team"
              className="mt-4 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/[0.07] bg-obsidian-900/80 p-4">
                  <div className="text-xs text-zinc-400">Assigned Stylist &amp; Lane</div>
                  <div className="mt-1 text-base font-bold text-white">Elena Rostova • Suite 2</div>
                  <div className="mt-1 text-xs text-periwinkle-300">+15m turnaround buffer reserved until 12:15 PM</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-obsidian-900/80 p-4">
                  <div className="text-xs text-zinc-400">Handling &amp; Care Note</div>
                  <div className="mt-1 text-base font-bold text-amber-300">Dryer / noise sensitive</div>
                  <div className="mt-1 text-xs text-zinc-300">Use happy-hoodie during velocity drying</div>
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-xs text-zinc-200">
                <p className="font-semibold text-emerald-300">Groomer &amp; Table Clarity:</p>
                <p className="mt-0.5 text-zinc-300">
                  Elena sees Bello’s weight, coat notes, and turnaround buffer directly on her schedule lane, keeping bathers and groomers perfectly aligned.
                </p>
              </div>
            </div>
          )}

          {/* Owner Tab Panel */}
          {activePerspective === 'owner' && (
            <div
              role="tabpanel"
              id="perspective-panel-owner"
              aria-labelledby="perspective-tab-owner"
              className="mt-4 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-white/[0.07] bg-obsidian-900/80 p-4">
                  <div className="text-xs text-zinc-400">Completed Visits</div>
                  <div className="mt-1 text-2xl font-extrabold text-white">{completedCount} visits</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-obsidian-900/80 p-4">
                  <div className="text-xs text-zinc-400">Confirmed Day Revenue</div>
                  <div className="mt-1 text-2xl font-extrabold text-emerald-400">${confirmedRevenueDollars}</div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-obsidian-900/80 p-4">
                  <div className="text-xs text-zinc-400">Interactive Action</div>
                  <button
                    type="button"
                    onClick={() => {
                      setDemoAppointmentCompleted(!demoAppointmentCompleted);
                      setActiveStageKey(demoAppointmentCompleted ? 'confirmed' : 'paid');
                    }}
                    className="mt-2 text-xs font-bold rounded-lg bg-periwinkle-500 px-3 py-1.5 text-obsidian-950 hover:bg-periwinkle-400 transition"
                  >
                    {demoAppointmentCompleted ? 'Reset Demo Checkout' : 'Simulate Bello’s Completed Checkout'}
                  </button>
                </div>
              </div>
              <div className="p-3.5 rounded-xl border border-periwinkle-500/20 bg-periwinkle-500/10 text-xs text-zinc-200">
                <p className="font-semibold text-periwinkle-300">Real-Time Revenue Assurance:</p>
                <p className="mt-0.5 text-zinc-300">
                  When front desk completes Bello’s checkout (+$137.43), the owner dashboard updates immediately with cent-exact integer balance tracking.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =====================================================================
          5. AVAILABILITY INTELLIGENCE (SAFE BOOKINGS VS. BLOCKED SLOTS)
      ===================================================================== */}
      <section
        role="region"
        aria-label="Availability intelligence demonstration"
        className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 space-y-6 shadow-xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
              Smart Availability Engine
            </span>
            <h2 className="text-xl font-bold text-white mt-0.5">
              Why Slots Are Bookable vs. Blocked
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAvailabilityScenario('valid_slot')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                availabilityScenario === 'valid_slot'
                  ? 'bg-emerald-500 text-obsidian-950'
                  : 'bg-obsidian-800 text-zinc-300 hover:text-white'
              }`}
            >
              Scenario A: Valid 10:30 AM PT Request
            </button>
            <button
              type="button"
              onClick={() => setAvailabilityScenario('blocked_shift')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                availabilityScenario === 'blocked_shift'
                  ? 'bg-amber-500 text-obsidian-950'
                  : 'bg-obsidian-800 text-zinc-300 hover:text-white'
              }`}
            >
              Scenario B: Why was 12:00 PM PT blocked?
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                currentAvailability.isAvailable
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              {currentAvailability.outcomeBadge}
            </span>
            <h3 className="text-base font-bold text-white">{currentAvailability.explanationTitle}</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">{currentAvailability.explanationBody}</p>

            <div className="p-3 rounded-xl border border-white/[0.07] bg-obsidian-950 space-y-1 text-xs">
              <div className="text-zinc-400">Selected Slot: <span className="text-white font-mono">{currentAvailability.slotLabel}</span></div>
              <div className="text-zinc-400">Groomer &amp; Shift: <span className="text-white">{currentAvailability.groomerLabel}</span></div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Automated Verification Checks:</div>
            {currentAvailability.checks.map((check, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 p-2.5 rounded-xl border border-white/[0.06] bg-obsidian-800/60 text-xs"
              >
                {check.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-white">{check.title}</div>
                  <div className="text-zinc-400 text-[11px]">{check.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================================
          6. LIFECYCLE STAGES (STEP 1 THROUGH 6)
      ===================================================================== */}
      <section className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="text-center max-w-2xl mx-auto space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            End-to-End Workflow
          </span>
          <h2 className="text-2xl font-bold text-white">
            6 Stages from Booking to Re-Booking
          </h2>
          <p className="text-xs text-zinc-400">
            Click any stage tab to see how Pawtrackr automates notifications, care notes, and revenue tracking.
          </p>
        </div>

        {/* Stage Tabs */}
        <div
          role="tablist"
          aria-label="Lifecycle stages"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"
        >
          {LIFECYCLE_STAGES.map((stage) => {
            const selected = activeStageKey === stage.key;
            return (
              <button
                key={stage.key}
                role="tab"
                id={`stage-tab-${stage.key}`}
                aria-selected={selected}
                aria-controls={`stage-panel-${stage.key}`}
                type="button"
                onClick={() => handleLifecycleStageSelect(stage)}
                className={`p-3 rounded-xl border text-left transition ${
                  selected
                    ? 'border-periwinkle-400 bg-periwinkle-500/20 text-white shadow-md'
                    : 'border-white/[0.07] bg-obsidian-950 text-zinc-400 hover:border-white/[0.15] hover:text-zinc-200'
                }`}
              >
                <div className="text-[10px] font-mono uppercase text-periwinkle-300">Step {stage.stepNumber}</div>
                <div className="text-xs font-bold text-white mt-0.5">{stage.label}</div>
              </button>
            );
          })}
        </div>

        {/* Selected Stage Detail Panel */}
        <div
          role="tabpanel"
          id={`stage-panel-${activeStage.key}`}
          aria-labelledby={`stage-tab-${activeStage.key}`}
          className="p-5 rounded-2xl border border-white/[0.08] bg-obsidian-950 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3 text-xs">
            <span className="font-bold text-white text-sm">{activeStage.headline}</span>
            <span className="px-2.5 py-1 rounded-full bg-periwinkle-500/15 border border-periwinkle-500/30 font-semibold text-periwinkle-300 text-xs">
              {activeStage.statusBadge}
            </span>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed">{activeStage.summary}</p>

          <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-xs text-zinc-200">
            <span className="font-semibold text-emerald-300">System Automation: </span>
            <span className="text-zinc-300">{activeStage.automaticAction}</span>
          </div>
        </div>
      </section>

      {/* =====================================================================
          7. DATA CONFIDENCE & NETWORK INTEGRITY
      ===================================================================== */}
      <section className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
              Data Confidence &amp; Sync
            </span>
            <h2 className="text-xl font-bold text-white mt-0.5">
              Honest Connectivity &amp; Snapshot Freshness
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'live_recent', label: 'Live recent' },
                { key: 'checking', label: 'Checking' },
                { key: 'stale_offline', label: 'Offline / Stale' },
                { key: 'demo_mode', label: 'Demo mode' },
              ] as const
            ).map((btn) => (
              <button
                key={btn.key}
                type="button"
                onClick={() => setConfidenceState(btn.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  confidenceState === btn.key
                    ? 'bg-periwinkle-500 text-obsidian-950'
                    : 'bg-obsidian-800 text-zinc-300 hover:text-white'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-3">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-periwinkle-500/20 text-periwinkle-300 border border-periwinkle-500/40">
              {currentConfidence.badgeLabel}
            </span>
            <h3 className="text-base font-bold text-white">{currentConfidence.staffHeadline}</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">{currentConfidence.staffMessage}</p>
          </div>

          <div className="p-4 rounded-2xl border border-white/[0.08] bg-obsidian-950 space-y-2 text-xs">
            <div className="font-semibold text-emerald-400">Why Pawtrackr handles network status this way:</div>
            <p className="text-zinc-300 leading-relaxed">{currentConfidence.whyItMatters}</p>
          </div>
        </div>
      </section>

      {/* =====================================================================
          8. TRANSPARENT PRICING PLANS
      ===================================================================== */}
      <section className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-10 space-y-8 shadow-xl">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            Simple, Transparent Plans
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Built for Growing Grooming Salons
          </h2>
          <p className="text-xs text-zinc-400">
            No hidden fees, no per-pet booking taxes. Flat monthly subscription with a 14-day free trial.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Solo Van Plan */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-950 p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">Mobile &amp; Solo Stylist</span>
              <h3 className="text-xl font-bold text-white">Solo Van &amp; Studio</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">$119</span>
                <span className="text-xs text-zinc-400">/ month</span>
              </div>
              <ul className="text-xs text-zinc-300 space-y-2.5 pt-2">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Single groomer &amp; van schedule</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> 24/7 Pet Parent Online Booking</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Rabies Certificate Vault &amp; Weight Logs</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> POS Register &amp; Split Payments</li>
              </ul>
            </div>
            <Link
              href="/welcome"
              className="w-full inline-flex items-center justify-center rounded-xl border border-white/[0.15] bg-obsidian-800 py-3 text-xs font-bold text-white hover:bg-obsidian-700 transition"
            >
              Start 14-Day Free Trial
            </Link>
          </div>

          {/* Salon Pro Plan */}
          <div className="rounded-2xl border border-periwinkle-500/50 bg-obsidian-950 p-6 sm:p-8 flex flex-col justify-between space-y-6 relative shadow-periwinkle-glow">
            <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-periwinkle-500 text-[10px] font-extrabold uppercase text-obsidian-950">
              Most Popular
            </div>
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">Multi-Groomer Salon</span>
              <h3 className="text-xl font-bold text-white">Salon Pro</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">$149</span>
                <span className="text-xs text-zinc-400">/ month</span>
              </div>
              <ul className="text-xs text-zinc-300 space-y-2.5 pt-2">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Unlimited groomers &amp; lane stacking</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Multi-station floor operations queue</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Commission payroll &amp; period lock</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Smart Triage automated reassignments</li>
              </ul>
            </div>
            <Link
              href="/welcome"
              className="w-full inline-flex items-center justify-center rounded-xl bg-periwinkle-500 py-3 text-xs font-bold text-obsidian-950 hover:bg-periwinkle-400 transition"
            >
              Start 14-Day Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          9. FREQUENTLY ASKED QUESTIONS (FAQ)
      ===================================================================== */}
      <section className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-10 space-y-6 shadow-xl">
        <div className="text-center max-w-2xl mx-auto space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            Got Questions?
          </span>
          <h2 className="text-2xl font-bold text-white">
            Frequently Asked Questions
          </h2>
          <p className="text-xs text-zinc-400">
            Everything you need to know about switching your salon to Pawtrackr.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto pt-2">
          <div className="p-4 rounded-2xl border border-white/[0.08] bg-obsidian-950 space-y-1.5">
            <h3 className="text-sm font-bold text-white">Can I import my clients from MoeGo or Gingr?</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Yes! Pawtrackr provides automated CSV imports with dry-run validation. You can transfer clients, pets, phone numbers, and care notes in under 5 minutes without losing data.
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-white/[0.08] bg-obsidian-950 space-y-1.5">
            <h3 className="text-sm font-bold text-white">Does it work on iPads and mobile phones?</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Yes. Pawtrackr is fully responsive and touch-optimized. Station groomers love using iPads and phones for clock-ins, intake photo snapping, and checking off grooming stages.
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-white/[0.08] bg-obsidian-950 space-y-1.5">
            <h3 className="text-sm font-bold text-white">How does rabies vaccine verification work?</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Pet parents can snap and upload their vet rabies certificates during online booking. Staff see an automated expiry compliance badge right on the intake screen.
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-white/[0.08] bg-obsidian-950 space-y-1.5">
            <h3 className="text-sm font-bold text-white">Are there any hidden transaction fees?</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Never. Unlike other platforms that charge extra per booking or per text message, Pawtrackr offers a flat monthly fee with no unexpected surprises.
            </p>
          </div>
        </div>
      </section>

      {/* =====================================================================
          10. FINAL CALL TO ACTION (START FREE TRIAL OR LAUNCH DEMO)
      ===================================================================== */}
      <section className="relative overflow-hidden rounded-3xl border border-periwinkle-500/40 bg-gradient-to-r from-obsidian-900 via-obsidian-800 to-obsidian-900 p-8 sm:p-12 text-center shadow-periwinkle-glow">
        <div className="relative z-10 max-w-2xl mx-auto space-y-4">
          <span className="inline-block rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1 text-xs font-bold text-emerald-300">
            Zero Risk • 14-Day Free Trial
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
            Ready to Give Your Groomers Peace of Mind?
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Join grooming salons and mobile van fleets upgrading to Pawtrackr. Start your free trial in 2 minutes, or test drive the live interactive demo right now.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/welcome"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-periwinkle-500 px-7 py-3.5 text-sm font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400 transition"
            >
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.15] bg-obsidian-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-obsidian-800 transition"
            >
              <Command className="h-4 w-4 text-periwinkle-400" />
              Launch Interactive Demo
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          11. FOOTER: CLEAN BRANDING & DIRECT LINKS
      ===================================================================== */}
      <footer className="pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <Scissors className="h-4 w-4 text-periwinkle-400" />
          <span className="font-bold text-white">Pawtrackr</span>
          <span>© 2026 Pawtrackr SaaS. All rights reserved.</span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
          <Link href="/login" className="hover:text-white transition">Staff Sign In</Link>
          <Link href="/welcome" className="hover:text-white transition">Salon Setup Wizard</Link>
          <Link href="/portal/live" className="hover:text-white transition">Salon Directory</Link>
        </div>
      </footer>
    </div>
  );
}
