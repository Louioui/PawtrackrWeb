'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Command,
  FileText,
  Globe,
  Heart,
  Layers,
  Lock,
  PhoneOff,
  Receipt,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  XCircle,
  Scissors,
  Check,
  ChevronRight,
  Play,
  Smartphone,
  ShieldAlert,
  HelpCircle,
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
type OperationalQuestionKey = 'can_i_book' | 'trust_schedule' | 'see_what_happened';
type DataConfidenceKey = 'live_recent' | 'checking' | 'stale_offline' | 'demo_mode';
type WorkflowModuleKey = 'booking' | 'command_center' | 'pet_profile';

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
    timestampLabel: '10:26 AM PT',
    headline: 'Reception checks Bello in and confirms weight & care notes',
    summary:
      'Front desk logs Bello’s arrival in one tap, updates weight to 28.4 lb, and reviews authorized handling notes before table transfer.',
    automaticAction:
      'Surfaces Bello’s noise-sensitivity care note to authorized staff while keeping internal notes separate from public views.',
    statusBadge: 'Checked in • Suite 2',
  },
  {
    key: 'grooming',
    stepNumber: 4,
    label: 'Grooming',
    audience: 'Salon Team',
    perspective: 'salon_team',
    timestampLabel: '10:35 AM PT',
    headline: 'Stylist works with pet history and coat instructions in view',
    summary:
      'Elena sees Bello’s 5-week coat cadence, dryer preference, and prior trim notes directly from the appointment drawer.',
    automaticAction:
      'Tracks in-service progress on the desktop multi-groomer timeline and mobile portrait agenda simultaneously.',
    statusBadge: 'In service • On schedule',
  },
  {
    key: 'paid',
    stepNumber: 5,
    label: 'Paid',
    audience: 'Staff & Owner',
    perspective: 'owner',
    timestampLabel: '12:02 PM PT',
    headline: 'Cent-exact checkout updates daily revenue and drawer totals',
    summary:
      'Checkout records $115.00 service, $0.00 discount, $9.49 tax, and $12.94 tip for an exact $137.43 total with zero rounding drift.',
    automaticAction:
      'Enforces subtotal − discount + tax + tip = total and prevents duplicate completed checkouts for the same visit.',
    statusBadge: 'Completed • $137.43 recorded',
  },
  {
    key: 'follow_up',
    stepNumber: 6,
    label: 'Follow-up',
    audience: 'Pet Parent & Owner',
    perspective: 'owner',
    timestampLabel: '12:05 PM PT',
    headline: 'Receipt, weight history, and next-visit cadence stay connected',
    summary:
      'Sophia sees Bello’s updated visit summary and 5-week rebooking window, while the owner sees updated utilization and revenue.',
    automaticAction:
      'Preserves the visit record, weight observation, and revenue provenance across the client profile and owner analytics.',
    statusBadge: 'Next groom recommended in 5 weeks',
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
    checks: {
      title: string;
      detail: string;
      passed: boolean;
    }[];
  }
> = {
  valid_slot: {
    label: 'Scenario A: Valid 10:30 AM PT Request',
    slotLabel: 'Tue 10:30 AM – 12:00 PM America/Los_Angeles (+15m buffer)',
    serviceLabel: 'Full Coat Sculpt & Spa Bath • 90 min • $115.00',
    groomerLabel: 'Elena Rostova (Shift: 08:30 AM – 1:30 PM PT)',
    outcomeBadge: 'Slot available • Fits hours, shift, and buffer',
    isAvailable: true,
    explanationTitle: 'Why this booking succeeds',
    explanationBody:
      'The 90-minute service plus the salon’s 15-minute turnaround buffer finishes at 12:15 PM America/Los_Angeles—inside salon operating hours, inside Elena’s scheduled shift, and clear of adjacent appointments.',
    checks: [
      {
        title: 'Salon open',
        detail: 'Operating hours are 08:00 AM – 06:00 PM America/Los_Angeles.',
        passed: true,
      },
      {
        title: 'Groomer scheduled',
        detail: 'Elena Rostova is scheduled 08:30 AM – 01:30 PM PT with no time-off block.',
        passed: true,
      },
      {
        title: 'No overlap',
        detail: '10:30 AM – 12:15 PM PT (including 15m buffer) is clear on Elena’s lane.',
        passed: true,
      },
      {
        title: 'Service fits',
        detail: 'Full 105-minute occupied window completes 75 minutes before shift end.',
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

const OPERATIONAL_QUESTIONS: Record<
  OperationalQuestionKey,
  {
    question: string;
    shortTag: string;
    headline: string;
    explanation: string;
    proofPoints: string[];
    routeHref: string;
    routeLabel: string;
  }
> = {
  can_i_book: {
    question: 'Can I book?',
    shortTag: 'Explainable Availability',
    headline: 'Availability checks hours, shifts, buffers, and overlaps before confirming',
    explanation:
      'Instead of returning a vague “No availability” message, Pawtrackr evaluates the salon’s configured IANA time zone, daily operating hours, groomer shifts, time-off blocks, service duration, and turnaround buffers.',
    proofPoints: [
      'Publishes the salon’s local time zone (e.g., America/Los_Angeles) alongside operating hours.',
      'Rejects nonexistent spring-forward and ambiguous fall-back daylight-saving times.',
      'Enforces overlapping-visit and shift rules in both application validation and PostgreSQL triggers.',
    ],
    routeHref: '/portal/bespoke-grooming',
    routeLabel: 'Preview Pet-Parent Booking',
  },
  trust_schedule: {
    question: 'Can I trust the schedule?',
    shortTag: 'Honest Sync & Freshness',
    headline: 'Stale or offline data is labeled clearly instead of hidden',
    explanation:
      'When a salon tablet or mobile grooming van loses connectivity, Pawtrackr retains the last confirmed schedule in memory and labels its exact age rather than pretending the screen is live.',
    proofPoints: [
      'Desktop multi-groomer timeline and mobile portrait agenda share the same salon-local day bounds.',
      'Clears stale snapshots automatically when switching dates or revoking staff membership.',
      'CSV schedule exports label the source, UTC/local bounds, and snapshot freshness state.',
    ],
    routeHref: '/dashboard/appointments/live',
    routeLabel: 'Open Live Staff Schedule',
  },
  see_what_happened: {
    question: 'Can I see what happened?',
    shortTag: 'Verified Financial Math',
    headline: 'Completed checkouts use exact integer-cent math and explicit settlement states',
    explanation:
      'Business owners need to know whether a number reflects a recorded front-desk checkout, a confirmed Stripe settlement, or a temporarily delayed sync.',
    proofPoints: [
      'Database constraints enforce discount ≤ subtotal and total = subtotal − discount + tax + tip.',
      'Partial unique index prevents duplicate completed transactions for the same appointment.',
      'Analytics separates confirmed settlement, pending payment intents, and recorded-only checkouts.',
    ],
    routeHref: '/dashboard/analytics',
    routeLabel: 'Explore Owner Analytics',
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
  // Interactive Hero State ("One Record, Three Perspectives")
  const [activePerspective, setActivePerspective] =
    useState<PerspectiveKey>('pet_parent');
  const [activeStageKey, setActiveStageKey] =
    useState<LifecycleStageKey>('confirmed');
  const [demoAppointmentCompleted, setDemoAppointmentCompleted] =
    useState<boolean>(false);

  // Availability Intelligence State
  const [availabilityScenario, setAvailabilityScenario] =
    useState<AvailabilityScenarioKey>('valid_slot');

  // Operational Questions & Data Confidence State
  const [selectedQuestion, setSelectedQuestion] =
    useState<OperationalQuestionKey>('can_i_book');
  const [confidenceState, setConfidenceState] =
    useState<DataConfidenceKey>('live_recent');

  // Demo Plan Preview Form State
  const [salonName, setSalonName] = useState('Velvet Coat Sanctuary');
  const [salonSlug, setSalonSlug] = useState('velvet-coat-sanctuary');
  const [ownerEmail, setOwnerEmail] = useState('founder@velvetcoat.live');
  const [selectedPlan, setSelectedPlan] = useState<'solo_van' | 'salon_pro'>(
    'salon_pro'
  );
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [provisionedResult, setProvisionedResult] = useState<{
    name: string;
    slug: string;
    monthlyRate: number;
  } | null>(null);

  const activeStage =
    LIFECYCLE_STAGES.find((s) => s.key === activeStageKey) ??
    LIFECYCLE_STAGES[1];
  const currentAvailability = AVAILABILITY_SCENARIOS[availabilityScenario];
  const currentQuestion = OPERATIONAL_QUESTIONS[selectedQuestion];
  const currentConfidence = DATA_CONFIDENCE_STATES[confidenceState];

  // Derived Owner Metrics in Hero when sample appointment completes
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

  const handleSalonNameChange = (val: string) => {
    setSalonName(val);
    const autoSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setSalonSlug(autoSlug || 'my-grooming-salon');
  };

  const handleInstantLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLaunchError(null);
    setIsProvisioning(true);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salonName,
          slug: salonSlug,
          ownerEmail,
          planId: selectedPlan,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setProvisionedResult({
          name: data.business.name,
          slug: data.business.slug,
          monthlyRate:
            selectedPlan === 'salon_pro'
              ? SAAS_PLANS.salon_pro.monthlyPriceDollars
              : SAAS_PLANS.solo_van.monthlyPriceDollars,
        });
      } else {
        setLaunchError(data.error ?? 'The demo salon preview could not be created.');
      }
    } catch {
      setLaunchError('The demo preview endpoint is unavailable in this environment.');
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 lg:px-8 space-y-16">
      
      {/* =====================================================================
          1. HERO SECTION: CLEAN, MARKETABLE & PURPOSE-DRIVEN
      ===================================================================== */}
      <section
        aria-label="Pawtrackr connected grooming workflow overview"
        className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-b from-obsidian-800/95 via-obsidian-900 to-obsidian-950 p-6 sm:p-10 lg:p-14 shadow-glass"
      >
        <div className="pointer-events-none absolute -top-36 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-periwinkle-500/15 blur-3xl animate-drift" />
        <div className="pointer-events-none absolute -right-20 top-40 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl animate-drift [animation-duration:18s]" />

        <div className="relative z-10 text-center max-w-3xl mx-auto space-y-6">
          <div className="animate-rise-in inline-flex items-center gap-2 rounded-full border border-periwinkle-500/35 bg-periwinkle-500/10 px-4 py-1.5 text-xs font-semibold text-periwinkle-300">
            <Sparkles className="h-3.5 w-3.5 text-periwinkle-400" />
            <span>Interactive product preview • Simulated salon workflow</span>
          </div>

          <h1 className="animate-rise-in [animation-delay:120ms] text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.12]">
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

          {/* Action CTAs */}
          <div className="animate-rise-in [animation-delay:240ms] pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-2xl bg-periwinkle-500 px-7 py-4 text-base font-bold text-obsidian-950 shadow-periwinkle-glow transition hover:bg-periwinkle-400"
            >
              <Command className="h-5 w-5" />
              Open Interactive Demo Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="#live-modules"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.14] bg-obsidian-800/80 px-6 py-4 text-base font-semibold text-white transition hover:border-periwinkle-500/50 hover:bg-obsidian-700"
            >
              <Layers className="h-5 w-5 text-periwinkle-400" />
              Explore Live Modules
            </Link>
          </div>
        </div>

        {/* 3-Perspective Segmented Showcase */}
        <div className="mt-12 pt-8 border-t border-white/[0.08] max-w-4xl mx-auto">
          <div className="text-center mb-6">
            <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
              Interactive Guided Preview
            </span>
            <h2 className="text-lg font-bold text-white mt-1">
              One Connected Record across Three Perspectives
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Click a role below to experience how Pawtrackr keeps pet parents, groomers, and business owners in sync.
            </p>

            <div
              role="tablist"
              aria-label="Choose product perspective"
              className="inline-flex mt-4 rounded-xl border border-white/[0.1] bg-obsidian-900 p-1"
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
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900/90 p-6 shadow-xl">
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
                  <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/80 p-4">
                    <div className="text-xs text-zinc-400">Selected Service</div>
                    <div className="mt-1 text-base font-bold text-white">Full Coat Sculpt & Spa Bath</div>
                    <div className="mt-1 text-xs text-emerald-400 font-semibold">$115.00 • 90 min</div>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/80 p-4">
                    <div className="text-xs text-zinc-400">Salon Time Zone & Window</div>
                    <div className="mt-1 text-base font-bold text-white">Tue 10:30 AM – 12:00 PM</div>
                    <div className="mt-1 text-xs text-periwinkle-300 font-mono">America/Los_Angeles</div>
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-periwinkle-500/20 bg-periwinkle-500/10 text-xs text-zinc-200">
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
                  <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/80 p-4">
                    <div className="text-xs text-zinc-400">Assigned Stylist & Lane</div>
                    <div className="mt-1 text-base font-bold text-white">Elena Rostova • Suite 2</div>
                    <div className="mt-1 text-xs text-periwinkle-300">+15m turnaround buffer reserved until 12:15 PM</div>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/80 p-4">
                    <div className="text-xs text-zinc-400">Handling & Care Note</div>
                    <div className="mt-1 text-base font-bold text-amber-300">Dryer / noise sensitive</div>
                    <div className="mt-1 text-xs text-zinc-300">Use happy-hoodie during velocity drying</div>
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-xs text-zinc-200">
                  <p className="font-semibold text-emerald-300">Groomer & Table Clarity:</p>
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
                  <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/80 p-4">
                    <div className="text-xs text-zinc-400">Completed Visits</div>
                    <div className="mt-1 text-2xl font-extrabold text-white">{completedCount} visits</div>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/80 p-4">
                    <div className="text-xs text-zinc-400">Confirmed Day Revenue</div>
                    <div className="mt-1 text-2xl font-extrabold text-emerald-400">${confirmedRevenueDollars}</div>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/80 p-4">
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
                <div className="p-3 rounded-xl border border-periwinkle-500/20 bg-periwinkle-500/10 text-xs text-zinc-200">
                  <p className="font-semibold text-periwinkle-300">Real-Time Revenue Assurance:</p>
                  <p className="mt-0.5 text-zinc-300">
                    When front desk completes Bello’s checkout (+$137.43), the owner dashboard updates immediately with cent-exact integer balance tracking.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================================
          2. DIRECT INTERACTIVE LIVE DEMO MODULES (CLEAN & DIRECT)
      ===================================================================== */}
      <section id="live-modules" className="space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            Dedicated Product Modules
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            Explore Pawtrackr Live Features
          </h2>
          <p className="text-sm text-zinc-400 mt-2">
            Click any interactive card below to enter that specific live workflow directly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Module 1: Staff Schedule */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-periwinkle-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-periwinkle-500/15 border border-periwinkle-500/30 flex items-center justify-center text-periwinkle-400 group-hover:scale-110 transition">
                <Calendar className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Live Staff Schedule</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Multi-groomer desktop timeline and mobile agenda. Eliminates double-booking with smart turnaround buffers.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Multi-groomer lane stacking</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Automatic time buffers</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Real-time status sync</li>
              </ul>
            </div>
            <Link
              href="/dashboard/appointments/live"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-periwinkle-500/15 border border-periwinkle-500/30 py-2.5 px-4 text-xs font-bold text-periwinkle-300 hover:bg-periwinkle-500 hover:text-obsidian-950 transition"
            >
              Open Staff Schedule <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Module 2: Pet Parent Booking */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-emerald-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition">
                <Globe className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Pet Parent Booking</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Clean online booking portal. Pet parents select services and local time slots with instant slot validation.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> 24/7 self-serve booking</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Salon local time zone</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Self-reschedule portal</li>
              </ul>
            </div>
            <Link
              href="/portal/bespoke-grooming"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 py-2.5 px-4 text-xs font-bold text-emerald-300 hover:bg-emerald-500 hover:text-obsidian-950 transition"
            >
              Try Pet Booking Portal <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Module 3: Rabies & Medical Vault */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-amber-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Rabies & Medical Vault</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Secure vaccine storage, rabies verification badges, pet weight history, and table handling alerts.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Rabies certificate intake</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Expiry date compliance</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Special handling care notes</li>
              </ul>
            </div>
            <Link
              href="/dashboard/clients/live"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 py-2.5 px-4 text-xs font-bold text-amber-300 hover:bg-amber-500 hover:text-obsidian-950 transition"
            >
              View Pet Medical Roster <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Module 4: POS & Checkout */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-periwinkle-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-xl bg-periwinkle-500/15 border border-periwinkle-500/30 flex items-center justify-center text-periwinkle-400 group-hover:scale-110 transition">
                <Receipt className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-white">POS Register & Receipts</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Fast checkout register for salon desks and mobile vans. Exact cent-math billing, tips, and digital receipts.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Cent-exact checkout math</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Split payment support</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Digital report card photos</li>
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
          3. AVAILABILITY INTELLIGENCE DEMONSTRATION (INTERACTIVE RULE INSPECTOR)
      ===================================================================== */}
      <section
        role="region"
        aria-label="Availability intelligence demonstration"
        className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 space-y-6"
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
              <div className="text-zinc-400">Groomer & Shift: <span className="text-white">{currentAvailability.groomerLabel}</span></div>
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
          4. LIFECYCLE STAGE TIMELINE (1 THROUGH 6)
      ===================================================================== */}
      <section className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            End-to-End Workflow
          </span>
          <h2 className="text-2xl font-bold text-white mt-1">
            6 Stages from Booking to Re-Booking
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
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
                aria-label={`Step ${stage.stepNumber} ${stage.label}`}
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
          aria-label={`Step ${activeStage.stepNumber} ${activeStage.label}`}
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
          5. DATA CONFIDENCE & SYSTEM INTEGRITY MONITOR
      ===================================================================== */}
      <section className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
              Data Confidence & Sync
            </span>
            <h2 className="text-xl font-bold text-white mt-0.5">
              Honest Connectivity & Snapshot Freshness
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
          6. PRICING & INSTANT DEMO PROVISIONING
      ===================================================================== */}
      <section className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-10 space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            Simple, Transparent Plans
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            Built for Growing Grooming Salons
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            No hidden fees, no per-pet surcharges. Everything you need to operate safely.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Solo Van Plan */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-950 p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">Mobile & Solo Stylist</span>
              <h3 className="text-xl font-bold text-white">Solo Van & Studio</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">$49</span>
                <span className="text-xs text-zinc-400">/ month</span>
              </div>
              <ul className="text-xs text-zinc-300 space-y-2 pt-2">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Single groomer & van schedule</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> 24/7 Pet Parent Online Booking</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Rabies Certificate Vault & Weight Logs</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> POS Register & Split Payments</li>
              </ul>
            </div>
            <Link
              href="/signup"
              className="w-full inline-flex items-center justify-center rounded-xl border border-white/[0.15] bg-obsidian-800 py-3 text-xs font-bold text-white hover:bg-obsidian-700 transition"
            >
              Start 14-Day Free Trial
            </Link>
          </div>

          {/* Salon Pro Plan */}
          <div className="rounded-2xl border border-periwinkle-500/50 bg-obsidian-950 p-6 flex flex-col justify-between space-y-6 relative shadow-periwinkle-glow">
            <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-periwinkle-500 text-[10px] font-extrabold uppercase text-obsidian-950">
              Most Popular
            </div>
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">Multi-Groomer Salon</span>
              <h3 className="text-xl font-bold text-white">Salon Pro</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">$99</span>
                <span className="text-xs text-zinc-400">/ month</span>
              </div>
              <ul className="text-xs text-zinc-300 space-y-2 pt-2">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Unlimited groomers & lane stacking</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Multi-station floor operations queue</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Commission payroll & period lock</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Fleet dispatch & van route optimization</li>
              </ul>
            </div>
            <Link
              href="/signup"
              className="w-full inline-flex items-center justify-center rounded-xl bg-periwinkle-500 py-3 text-xs font-bold text-obsidian-950 hover:bg-periwinkle-400 transition"
            >
              Start 14-Day Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          7. FOOTER: CLEAN NAVIGATION
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
          <Link href="/portal/live" className="hover:text-white transition">Salon Directory</Link>
        </div>
      </footer>
    </div>
  );
}
