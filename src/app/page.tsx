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
    headline: 'Pet parent selects a compatible service and local time slot',
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
    headline: 'Appointment is locked on the schedule without overlap',
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
    headline: 'Reception checks Bello in and confirms weight & care context',
    summary:
      'Front desk logs Bello’s arrival in one action, updates weight to 28.4 lb, and reviews authorized handling notes before table transfer.',
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
    label: 'Valid in-shift request (10:30 AM PT)',
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
    label: 'Why was 12:00 PM blocked?',
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

const WORKFLOW_MODULES: Record<
  WorkflowModuleKey,
  {
    key: WorkflowModuleKey;
    audienceBadge: string;
    title: string;
    subtitle: string;
    description: string;
    highlights: string[];
    primaryHref: string;
    primaryLabel: string;
    secondaryHref: string;
    secondaryLabel: string;
    previewTitle: string;
    previewRoleLabel: string;
    previewSummary: string;
    previewMetrics: { label: string; value: string }[];
  }
> = {
  booking: {
    key: 'booking',
    audienceBadge: 'Pet Parent Experience',
    title: 'Pet Parent Booking & Salon Catalog',
    subtitle: 'Clear services, local time zones, and compatible appointment slots',
    description:
      'Pet parents see published services, transparent starting or fixed prices, and the salon’s local time zone without navigating internal staff terminology or creating unnecessary accounts up front.',
    highlights: [
      'Shows salon operating hours with explicit local time zone (e.g., America/Los_Angeles)',
      'Collects essential pet details and care notes at the right step',
      'Explains clearly when a slot is unavailable instead of a generic error',
    ],
    primaryHref: '/portal/bespoke-grooming',
    primaryLabel: 'Preview Sample Booking Page',
    secondaryHref: '/portal/live',
    secondaryLabel: 'View Published Salon Directory',
    previewTitle: 'What the pet parent sees during booking',
    previewRoleLabel: 'Customer-facing booking flow (Simulated preview)',
    previewSummary:
      'Sophia chooses Bespoke Grooming Studio, sees hours in America/Los_Angeles, selects Full Coat Sculpt & Spa Bath ($115.00 • 90 min), and picks 10:30 AM Tuesday for Bello.',
    previewMetrics: [
      { label: 'Selected Service', value: 'Full Coat Sculpt & Spa Bath ($115.00)' },
      { label: 'Salon Time Zone', value: '08:00–18:00 America/Los_Angeles' },
      { label: 'Booking Status', value: 'Confirmed • Tue 10:30 AM PT' },
    ],
  },
  command_center: {
    key: 'command_center',
    audienceBadge: 'Salon Team Workflow',
    title: 'Salon Command Center & Schedule',
    subtitle: 'Fast daily execution for receptionists, bathers, and groomers',
    description:
      'Search clients, pets, phone numbers, and records from one command center. Manage the day on a multi-groomer desktop timeline or mobile agenda, and complete checkout with accurate totals designed to prevent rounding errors.',
    highlights: [
      'Search clients, pets, phone digits, and breeds from one command bar',
      'One-click check-in, weight update, and status progression',
      'Accurate integer-cent checkout totals for service, discount, tax, and tip',
    ],
    primaryHref: '/dashboard',
    primaryLabel: 'Open Interactive Demo Dashboard',
    secondaryHref: '/dashboard/appointments/live',
    secondaryLabel: 'View Live Staff Calendar',
    previewTitle: 'What the grooming team sees at check-in',
    previewRoleLabel: 'Staff schedule & intake view (Simulated preview)',
    previewSummary:
      'Elena’s 10:30 AM slot shows Bello (28.4 lb), a 15-minute turnaround buffer after the 90-minute groom, and an authorized care note before Bello reaches the table.',
    previewMetrics: [
      { label: 'Assigned Stylist', value: 'Elena Rostova • Lane 1' },
      { label: 'Occupied Window', value: '10:30 AM – 12:15 PM PT (incl. 15m buffer)' },
      { label: 'Next Staff Action', value: 'Check in Bello & verify 28.4 lb weight' },
    ],
  },
  pet_profile: {
    key: 'pet_profile',
    audienceBadge: 'Connected Care Context',
    title: 'Connected Pet Profile & Care History',
    subtitle: 'Pet records that travel with the appointment from booking to follow-up',
    description:
      'Weight observations, coat notes, handling preferences, and completed visit summaries stay attached to the pet record so returning families do not re-enter details and staff are never surprised.',
    highlights: [
      'Dated pet weight history with exact values and accessible table view',
      'Authorized staff care notes separated from customer-facing summaries',
      'Clear visit history and next recommended grooming window',
    ],
    primaryHref: '/client/cl-101',
    primaryLabel: 'Preview Bello’s Sample Profile',
    secondaryHref: '/dashboard/clients/live',
    secondaryLabel: 'View Live Staff Client Roster',
    previewTitle: 'How pet context follows Bello across visits',
    previewRoleLabel: 'Connected pet record (Sample pet profile)',
    previewSummary:
      'Bello’s profile links historical weight logs (27.8 lb → 28.1 lb → 28.4 lb), acoustic dryer notes for staff, and a customer-friendly care summary after checkout.',
    previewMetrics: [
      { label: 'Recorded Weight Trend', value: '28.4 lb (Steady across 3 visits)' },
      { label: 'Authorized Care Note', value: 'Dryer / noise sensitive — happy-hoodie' },
      { label: 'Recommended Cadence', value: 'Every 5 weeks (Curly coat maintenance)' },
    ],
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

  // Connected Workflow Module & Care Note Preview State
  const [selectedModule, setSelectedModule] =
    useState<WorkflowModuleKey>('command_center');
  const [careNoteExpanded, setCareNoteExpanded] = useState<boolean>(true);

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
  const currentModule = WORKFLOW_MODULES[selectedModule];

  // Derived Owner Metrics in Hero when sample appointment completes
  const completedCount = demoAppointmentCompleted ? 4 : 3;
  const confirmedRevenueDollars = demoAppointmentCompleted ? '565.93' : '428.50';
  const pendingCheckoutsCount = demoAppointmentCompleted ? 0 : 1;

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
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
      {/* =====================================================================
          HERO SECTION: ONE RECORD, THREE EXPERIENCES
      ===================================================================== */}
      <section
        aria-label="Pawtrackr connected grooming workflow overview"
        className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-b from-obsidian-800/95 via-obsidian-900 to-obsidian-900 p-6 sm:p-10 lg:p-14 shadow-glass"
      >
        <div className="pointer-events-none absolute -top-36 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-periwinkle-500/12 blur-3xl animate-drift" />
        <div className="pointer-events-none absolute -right-20 top-40 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl animate-drift [animation-duration:18s]" />

        <div className="relative z-10 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Positioning & Clear Action Hierarchy */}
          <div className="lg:col-span-6">
            <div className="animate-rise-in inline-flex flex-wrap items-center gap-2 rounded-full border border-periwinkle-500/35 bg-periwinkle-500/10 px-3.5 py-1.5 text-xs font-semibold text-periwinkle-300">
              <Sparkles className="h-3.5 w-3.5 text-periwinkle-400" />
              <span>Interactive product preview • Simulated salon workflow</span>
            </div>

            <h1 className="animate-rise-in [animation-delay:120ms] mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-5xl leading-[1.12]">
              The Trusted Operating System for{' '}
              <span className="bg-gradient-to-r from-periwinkle-300 via-periwinkle-400 to-emerald-400 bg-clip-text text-transparent">
                Modern Pet-Care Businesses.
              </span>
            </h1>

            <p className="mt-4 text-base sm:text-lg text-zinc-200 leading-relaxed">
              Modern scheduling, pet records, checkout, and business intelligence
              for grooming teams. Pawtrackr connects the pet parent, the salon
              floor, and the business owner through one clear, explainable
              workflow.
            </p>

            {/* Primary & Secondary Calls to Action */}
            <div className="animate-rise-in [animation-delay:240ms] mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-periwinkle-500 px-6 py-3.5 text-sm font-bold text-obsidian-950 shadow-periwinkle-glow transition motion-reduce:transition-none hover:bg-periwinkle-400"
              >
                <Command className="h-4 w-4" />
                Open Interactive Demo
                <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href="/portal/bespoke-grooming"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.14] bg-obsidian-700/85 px-5 py-3.5 text-sm font-semibold text-white transition motion-reduce:transition-none hover:border-periwinkle-500/50 hover:bg-obsidian-600"
              >
                <Globe className="h-4 w-4 text-periwinkle-400" />
                Preview Pet-Parent Booking
              </Link>

              <Link
                href="/dashboard/appointments/live"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-5 py-3.5 text-sm font-semibold text-emerald-300 transition motion-reduce:transition-none hover:bg-emerald-500/20"
              >
                <Calendar className="h-4 w-4 text-emerald-400" />
                Live Staff Schedule
              </Link>
            </div>

            {/* Connected Signal Path Summary */}
            <div className="mt-8 rounded-2xl border border-white/[0.08] bg-obsidian-800/80 p-4">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-300">
                <span>One connected workflow: booking, care, checkout, insight</span>
                <span className="rounded-md border border-white/[0.1] bg-obsidian-900 px-2 py-0.5 font-mono text-[11px] text-periwinkle-300">
                  Sample record: Bello
                </span>
              </div>
              <div
                aria-label="Connected platform signal path"
                className="mt-3 grid grid-cols-3 gap-2 text-xs"
              >
                <button
                  type="button"
                  onClick={() => handlePerspectiveSelect('pet_parent')}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition motion-reduce:transition-none ${
                    activePerspective === 'pet_parent'
                      ? 'border-periwinkle-400 bg-periwinkle-500/20 text-white'
                      : 'border-white/[0.07] bg-obsidian-900/70 text-zinc-300 hover:border-white/[0.18]'
                  }`}
                >
                  <span className="font-semibold">1. Pet Parent</span>
                  <span className="hidden sm:inline text-[11px] text-periwinkle-300">
                    Book & trust
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePerspectiveSelect('salon_team')}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition motion-reduce:transition-none ${
                    activePerspective === 'salon_team'
                      ? 'border-emerald-400 bg-emerald-500/20 text-white'
                      : 'border-white/[0.07] bg-obsidian-900/70 text-zinc-300 hover:border-white/[0.18]'
                  }`}
                >
                  <span className="font-semibold">2. Salon Team</span>
                  <span className="hidden sm:inline text-[11px] text-emerald-300">
                    Prep & groom
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePerspectiveSelect('owner')}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition motion-reduce:transition-none ${
                    activePerspective === 'owner'
                      ? 'border-periwinkle-400 bg-periwinkle-500/20 text-white'
                      : 'border-white/[0.07] bg-obsidian-900/70 text-zinc-300 hover:border-white/[0.18]'
                  }`}
                >
                  <span className="font-semibold">3. Owner</span>
                  <span className="hidden sm:inline text-[11px] text-periwinkle-300">
                    Verify revenue
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Living Command Center Preview */}
          <div className="lg:col-span-6">
            <div className="rounded-3xl border border-white/[0.12] bg-obsidian-800/95 p-5 sm:p-6 shadow-2xl">
              {/* Preview Header & Perspective Switcher */}
              <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-periwinkle-300">
                    Interactive Product Preview
                  </span>
                  <h2 className="text-base font-bold text-white">
                    Same Appointment, Three Perspectives
                  </h2>
                </div>

                {/* Accessible 3-Perspective Segmented Control */}
                <div
                  role="tablist"
                  aria-label="Choose product perspective"
                  className="inline-flex rounded-xl border border-white/[0.1] bg-obsidian-900 p-1"
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
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition motion-reduce:transition-none ${
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

              {/* Shared Appointment Context Strip */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-obsidian-900/90 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="font-bold text-white">Bello</span>
                  <span className="text-zinc-300">• Mini Goldendoodle (28.4 lb)</span>
                </div>
                <div className="font-mono text-[11px] text-periwinkle-300">
                  Tue 10:30 AM – 12:00 PM America/Los_Angeles
                </div>
              </div>

              {/* Perspective Panel 1: Pet Parent */}
              {activePerspective === 'pet_parent' && (
                <div
                  role="tabpanel"
                  id="perspective-panel-pet_parent"
                  aria-labelledby="perspective-tab-pet_parent"
                  className="mt-4 space-y-4 transition-opacity duration-200 motion-reduce:transition-none"
                >
                  <div className="rounded-2xl border border-periwinkle-500/30 bg-obsidian-900/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-periwinkle-300">
                        Bespoke Grooming Studio • Public Booking
                      </span>
                      <span className="rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                        {demoAppointmentCompleted
                          ? 'Completed • Receipt Ready'
                          : 'Confirmed Appointment'}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/90 p-3">
                        <div className="text-[11px] text-zinc-300">Selected Service</div>
                        <div className="mt-0.5 text-sm font-bold text-white">
                          Full Coat Sculpt &amp; Spa Bath
                        </div>
                        <div className="mt-1 text-xs text-zinc-300">
                          90 minutes • Fixed package price:{' '}
                          <span className="font-mono font-bold text-emerald-300">
                            $115.00
                          </span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/90 p-3">
                        <div className="text-[11px] text-zinc-300">
                          Salon Time Zone &amp; Window
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-white">
                          Tue 10:30 AM – 12:00 PM
                        </div>
                        <div className="mt-1 font-mono text-xs text-periwinkle-300">
                          America/Los_Angeles (08:00–18:00)
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-white/[0.07] bg-obsidian-800/60 p-3 text-xs text-zinc-200">
                      <div className="font-semibold text-white">
                        What the pet parent knows without calling:
                      </div>
                      <p className="mt-1 text-zinc-300">
                        Sophia sees the exact local time zone, service duration,
                        quoted package price ($115.00 before tax/tip), and that
                        Bello’s dryer sensitivity note is on file for the stylist.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                    <span className="text-zinc-300">
                      Next step: See how the salon team receives this booking.
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePerspectiveSelect('salon_team')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-periwinkle-500/40 bg-periwinkle-500/15 px-3 py-1.5 font-bold text-periwinkle-300 hover:bg-periwinkle-500/25"
                    >
                      Switch to Salon Team View
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Perspective Panel 2: Salon Team */}
              {activePerspective === 'salon_team' && (
                <div
                  role="tabpanel"
                  id="perspective-panel-salon_team"
                  aria-labelledby="perspective-tab-salon_team"
                  className="mt-4 space-y-4 transition-opacity duration-200 motion-reduce:transition-none"
                >
                  <div className="rounded-2xl border border-emerald-500/30 bg-obsidian-900/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-emerald-300">
                        Staff Schedule • Lane 1: Elena Rostova
                      </span>
                      <span className="rounded-full border border-periwinkle-500/35 bg-periwinkle-500/15 px-2.5 py-0.5 text-[11px] font-bold text-periwinkle-300">
                        {demoAppointmentCompleted
                          ? 'Status: Completed & Checked Out'
                          : 'Status: Checked In • Ready for Groom'}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/90 p-3">
                        <div className="text-[11px] text-zinc-300">
                          Schedule Block &amp; Buffer
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-white">
                          10:30 AM – 12:00 PM PT
                        </div>
                        <div className="mt-1 text-xs text-emerald-300">
                          +15m turnaround buffer reserved until 12:15 PM
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/90 p-3">
                        <div className="text-[11px] text-zinc-300">
                          Pet Intake &amp; Weight History
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-white">
                          28.4 lb recorded at check-in
                        </div>
                        <div className="mt-1 text-xs text-zinc-300">
                          Previous: 28.1 lb (Oct 4) • Coat: Curly F1b
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-cyan-200">
                          Authorized Staff Care Note (Visible before check-in)
                        </span>
                        <span className="font-mono text-[11px] text-cyan-300">
                          Staff-only context
                        </span>
                      </div>
                      <p className="mt-1 text-zinc-200">
                        Dryer / noise sensitive: use acoustic happy-hoodie and
                        low-velocity warm air. Owner approved 1/2-inch plush teddy
                        trim.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setDemoAppointmentCompleted((prev) => !prev);
                        setActiveStageKey(
                          !demoAppointmentCompleted ? 'paid' : 'checked_in'
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 font-bold text-obsidian-950 transition hover:bg-emerald-400"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {demoAppointmentCompleted
                        ? 'Reset Sample Checkout ($137.43)'
                        : 'Simulate Checkout ($137.43) & Update Analytics'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePerspectiveSelect('owner')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.14] bg-obsidian-900 px-3 py-2 font-semibold text-zinc-200 hover:text-white"
                    >
                      See Owner Impact
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Perspective Panel 3: Business Owner */}
              {activePerspective === 'owner' && (
                <div
                  role="tabpanel"
                  id="perspective-panel-owner"
                  aria-labelledby="perspective-tab-owner"
                  className="mt-4 space-y-4 transition-opacity duration-200 motion-reduce:transition-none"
                >
                  <div className="rounded-2xl border border-periwinkle-500/30 bg-obsidian-900/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-periwinkle-300">
                        Owner Operational Summary • Today (America/Los_Angeles)
                      </span>
                      <span
                        role="status"
                        className="rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300"
                      >
                        Source: Simulated preview • 0¢ variance
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/90 p-3">
                        <div className="text-[11px] text-zinc-300">
                          Completed Visits
                        </div>
                        <div className="mt-1 font-mono text-xl font-extrabold text-white">
                          {completedCount} visits
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-300">
                          {pendingCheckoutsCount} in service • 0 conflicts
                        </div>
                      </div>

                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                        <div className="text-[11px] text-emerald-200">
                          Confirmed Revenue
                        </div>
                        <div className="mt-1 font-mono text-xl font-extrabold text-emerald-300">
                          ${confirmedRevenueDollars}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-200">
                          {demoAppointmentCompleted
                            ? 'Includes Bello’s $137.43 checkout'
                            : 'Click below to complete Bello’s checkout'}
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/[0.07] bg-obsidian-800/90 p-3">
                        <div className="text-[11px] text-zinc-300">
                          Retention &amp; Capacity
                        </div>
                        <div className="mt-1 text-sm font-bold text-white">
                          1 curly coat due
                        </div>
                        <div className="mt-0.5 text-[11px] text-periwinkle-300">
                          1 afternoon slot open (2:00 PM)
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-white/[0.07] bg-obsidian-800/70 p-3 text-xs text-zinc-200">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">
                          Explainable Checkout Breakdown (Bello):
                        </span>
                        <span className="font-mono text-[11px] text-emerald-300">
                          $115.00 + $9.49 tax + $12.94 tip = $137.43
                        </span>
                      </div>
                      <p className="mt-1 text-zinc-300">
                        Every number on the owner dashboard traces back to specific
                        visits, with recorded checkouts separated from payment
                        settlement.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setDemoAppointmentCompleted((prev) => !prev)
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-1.5 font-bold text-emerald-300 hover:bg-emerald-500/25"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {demoAppointmentCompleted
                        ? 'Show Before Bello’s Checkout ($428.50)'
                        : 'Simulate Bello’s Completed Checkout (+$137.43)'}
                    </button>

                    <Link
                      href="/dashboard/analytics"
                      className="inline-flex items-center gap-1.5 font-bold text-periwinkle-300 hover:text-periwinkle-200"
                    >
                      Open Full Analytics Demo
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 2: ONE APPOINTMENT, FULLY CONNECTED (6-STAGE LIFECYCLE)
      ===================================================================== */}
      <section
        aria-label="One appointment lifecycle from request to follow-up"
        className="reveal-on-scroll mt-16rounded-3xl border border-white/[0.08] bg-obsidian-800/75 p-6 sm:p-8 shadow-glass"
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-periwinkle-300">
              End-to-End Operational Loop
            </span>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-white">
              One Appointment, Fully Connected
            </h2>
            <p className="mt-1 text-sm text-zinc-300">
              Select any stage below to see who acts, what Pawtrackr validates
              automatically, and how the same record updates across the salon.
            </p>
          </div>
          <span className="font-mono text-xs text-zinc-300">
            Interactive lifecycle • Sample record
          </span>
        </div>

        {/* 6-Stage Responsive Timeline (Grid on desktop, vertical list on mobile) */}
        <div
          role="tablist"
          aria-label="Appointment lifecycle stages"
          className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6"
        >
          {LIFECYCLE_STAGES.map((stage) => {
            const isSelected = stage.key === activeStage.key;
            return (
              <button
                key={stage.key}
                role="tab"
                id={`stage-tab-${stage.key}`}
                aria-selected={isSelected}
                aria-controls="lifecycle-stage-detail"
                type="button"
                onClick={() => handleLifecycleStageSelect(stage)}
                className={`flex flex-col justify-between rounded-2xl border p-3.5 text-left transition motion-reduce:transition-none ${
                  isSelected
                    ? 'border-periwinkle-400 bg-periwinkle-500/20 shadow-periwinkle-glow'
                    : 'border-white/[0.08] bg-obsidian-900/75 hover:border-white/[0.18]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-periwinkle-300">
                    Step {stage.stepNumber}
                  </span>
                  <span className="text-[11px] font-medium text-zinc-300">
                    {stage.timestampLabel}
                  </span>
                </div>
                <div className="mt-2 text-sm font-bold text-white">
                  {stage.label}
                </div>
                <div className="mt-1 text-[11px] text-zinc-300">
                  {stage.audience}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Stage Details */}
        <div
          id="lifecycle-stage-detail"
          role="tabpanel"
          aria-labelledby={`stage-tab-${activeStage.key}`}
          className="mt-5 grid grid-cols-1 gap-4 rounded-2xl border border-white/[0.08] bg-obsidian-900/90 p-5 lg:grid-cols-12 lg:items-center"
        >
          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-periwinkle-500/35 bg-periwinkle-500/15 px-2.5 py-0.5 text-xs font-bold text-periwinkle-300">
                Stage {activeStage.stepNumber}: {activeStage.label}
              </span>
              <span className="text-xs font-semibold text-zinc-300">
                Primary view: {activeStage.audience}
              </span>
            </div>
            <h3 className="mt-2 text-lg font-bold text-white">
              {activeStage.headline}
            </h3>
            <p className="mt-1.5 text-sm text-zinc-200 leading-relaxed">
              {activeStage.summary}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 lg:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                What happens automatically
              </span>
              <span className="font-mono text-[11px] font-semibold text-white">
                {activeStage.statusBadge}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-zinc-200 leading-relaxed">
              {activeStage.automaticAction}
            </p>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 3: AVAILABILITY INTELLIGENCE DEMONSTRATION
      ===================================================================== */}
      <section
        aria-label="Availability intelligence demonstration"
        className="reveal-on-scroll mt-16grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center"
      >
        <div className="lg:col-span-5 space-y-4">
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
            Explainable Scheduling Rules
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Availability That Explains Why a Time Fits—or Why It Is Blocked
          </h2>
          <p className="text-sm sm:text-base text-zinc-200 leading-relaxed">
            When a time slot cannot be booked, ”Unavailable” is not enough for a
            receptionist or a pet parent. Pawtrackr checks salon operating hours,
            IANA time zones, staff shifts, time-off blocks, service duration,
            turnaround buffers, and existing visits—and explains the exact rule
            that matched.
          </p>

          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={() => setAvailabilityScenario('valid_slot')}
              className={`w-full rounded-2xl border p-4 text-left transition motion-reduce:transition-none ${
                availabilityScenario === 'valid_slot'
                  ? 'border-emerald-400 bg-emerald-500/15 shadow-emerald-glow'
                  : 'border-white/[0.08] bg-obsidian-800/75 hover:border-white/[0.18]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">
                  Scenario A: Request 10:30 AM PT with Elena
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                  Passes all 4 checks
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-300">
                90m service + 15m buffer ends at 12:15 PM PT inside Elena’s
                08:30 AM–1:30 PM shift.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setAvailabilityScenario('blocked_shift')}
              className={`w-full rounded-2xl border p-4 text-left transition motion-reduce:transition-none ${
                availabilityScenario === 'blocked_shift'
                  ? 'border-amber-400 bg-amber-500/15'
                  : 'border-white/[0.08] bg-obsidian-800/75 hover:border-white/[0.18]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">
                  Scenario B: Why was 12:00 PM PT blocked?
                </span>
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-200">
                  Shift boundary rule
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-300">
                See how Pawtrackr explains a shift-end conflict instead of
                silently failing or overbooking the groomer.
              </p>
            </button>
          </div>
        </div>

        {/* Right Column: Live Rule Inspector Card */}
        <div className="lg:col-span-7">
          <div className="rounded-3xl border border-white/[0.1] bg-obsidian-800/90 p-6 shadow-glass">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                  Simulated Availability Check
                </span>
                <h3 className="text-base font-bold text-white">
                  {currentAvailability.slotLabel}
                </h3>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                  currentAvailability.isAvailable
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-amber-500/45 bg-amber-500/15 text-amber-200'
                }`}
              >
                {currentAvailability.isAvailable ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                )}
                {currentAvailability.outcomeBadge}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {currentAvailability.checks.map((check) => (
                <div
                  key={check.title}
                  className={`rounded-2xl border p-3.5 ${
                    check.passed
                      ? 'border-white/[0.08] bg-obsidian-900/80'
                      : 'border-amber-500/45 bg-amber-500/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {check.passed ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-amber-300" />
                    )}
                    <span className="text-xs font-bold text-white">
                      {check.title}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-300 leading-relaxed">
                    {check.detail}
                  </p>
                </div>
              ))}
            </div>

            <div
              className={`mt-4 rounded-2xl border p-4 ${
                currentAvailability.isAvailable
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-amber-500/40 bg-amber-500/10'
              }`}
            >
              <div className="text-xs font-bold text-white">
                {currentAvailability.explanationTitle}
              </div>
              <p className="mt-1 text-xs sm:text-sm text-zinc-200 leading-relaxed">
                {currentAvailability.explanationBody}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 4: THREE CONNECTED WORKFLOWS & CONTROLLED CARE CONTEXT
      ===================================================================== */}
      <section
        aria-label="Three connected grooming workflows and pet care context"
        className="reveal-on-scroll mt-16"
      >
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-periwinkle-300">
              Three Connected Surfaces
            </span>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-white">
              Built for Pet Parents, Grooming Teams, and Salon Owners
            </h2>
          </div>
          <span className="text-xs text-zinc-300">
            Select a workflow below to inspect its connected preview
          </span>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {(Object.values(WORKFLOW_MODULES) as typeof WORKFLOW_MODULES[WorkflowModuleKey][]).map(
            (mod) => {
              const isSelected = selectedModule === mod.key;
              return (
                <div
                  key={mod.key}
                  onClick={() => setSelectedModule(mod.key)}
                  className={`flex flex-col justify-between rounded-3xl border p-6 transition motion-reduce:transition-none cursor-pointer ${
                    isSelected
                      ? 'border-periwinkle-400 bg-obsidian-700/95 shadow-periwinkle-glow'
                      : 'border-white/[0.08] bg-obsidian-800/70 hover:border-white/[0.18]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-lg border border-periwinkle-500/30 bg-periwinkle-500/15 px-2.5 py-1 text-xs font-semibold text-periwinkle-300">
                        {mod.audienceBadge}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedModule(mod.key);
                        }}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                          isSelected
                            ? 'bg-periwinkle-500 text-obsidian-950'
                            : 'bg-white/[0.06] text-zinc-200 hover:text-white'
                        }`}
                      >
                        {isSelected ? 'Selected Preview' : 'Preview Workflow'}
                      </button>
                    </div>

                    <h3 className="mt-4 text-xl font-bold text-white">
                      {mod.title}
                    </h3>
                    <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
                      {mod.description}
                    </p>

                    <ul className="mt-4 space-y-2 text-xs text-zinc-200">
                      {mod.highlights.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-4 text-xs">
                    <Link
                      href={mod.primaryHref}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 font-bold text-periwinkle-300 hover:text-periwinkle-200"
                    >
                      {mod.primaryLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <span className="text-zinc-500">•</span>
                    <Link
                      href={mod.secondaryHref}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-zinc-300 hover:text-white"
                    >
                      {mod.secondaryLabel}
                    </Link>
                  </div>
                </div>
              );
            }
          )}
        </div>

        {/* Synchronized Module Preview & Respectful Care-Context Demonstration */}
        <div className="mt-6 grid grid-cols-1 gap-6 rounded-3xl border border-white/[0.09] bg-obsidian-800/85 p-6 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
                {currentModule.previewRoleLabel}
              </span>
              <span className="font-mono text-xs text-zinc-300">
                Connected to Bello’s sample appointment
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white">
              {currentModule.previewTitle}
            </h3>
            <p className="text-sm text-zinc-200 leading-relaxed">
              {currentModule.previewSummary}
            </p>
            <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
              {currentModule.previewMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-white/[0.07] bg-obsidian-900/85 p-3"
                >
                  <div className="text-[11px] text-zinc-300">{metric.label}</div>
                  <div className="mt-1 text-xs font-bold text-white">
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Controlled Care Note Preview (Replaces decorative alert badge strip) */}
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/90 p-5 lg:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">
                  Care note available before check-in
                </span>
              </div>
              <span className="rounded-md border border-white/[0.1] bg-obsidian-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
                Sample Pet Record
              </span>
            </div>

            <p className="mt-2 text-xs text-zinc-300 leading-relaxed">
              Sensitive handling notes should inform staff without becoming
              noisy visual clutter or exposing internal shorthand on public
              screens.
            </p>

            <button
              type="button"
              aria-expanded={careNoteExpanded}
              onClick={() => setCareNoteExpanded((prev) => !prev)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-periwinkle-500/35 bg-periwinkle-500/15 px-3 py-1.5 text-xs font-bold text-periwinkle-300 hover:bg-periwinkle-500/25"
            >
              {careNoteExpanded
                ? 'Hide Authorized Staff Care Context'
                : 'Inspect Authorized Staff Care Context'}
            </button>

            {careNoteExpanded && (
              <div className="mt-3 rounded-xl border border-white/[0.07] bg-obsidian-800/90 p-3.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">
                    Bello • Handling &amp; Comfort Note
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-300">
                    Authorized staff only
                  </span>
                </div>
                <p className="text-zinc-200">
                  Pawtrackr keeps important care information—such as acoustic
                  dryer hood use, orthopedic support for senior dogs, or coat
                  matting consent—visible to authorized staff before check-in
                  without overwhelming the schedule view.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 5: WHY PAWTRACKR FEELS DIFFERENT (OPERATIONAL QUESTIONS & DATA CONFIDENCE)
      ===================================================================== */}
      <section
        aria-label="Operational trust questions and data confidence inspector"
        className="reveal-on-scroll mt-16grid grid-cols-1 gap-8 lg:grid-cols-12"
      >
        {/* Left 7 Columns: Three Interactive Operational Questions */}
        <div className="rounded-3xl border border-white/[0.08] bg-obsidian-800/80 p-6 sm:p-8 shadow-glass lg:col-span-7">
          <span className="text-xs font-bold uppercase tracking-widest text-periwinkle-300">
            Why Pawtrackr Feels Different
          </span>
          <h2 className="mt-1 text-2xl font-bold text-white">
            Three Questions Every Salon Needs Answered
          </h2>
          <p className="mt-1 text-sm text-zinc-300">
            Select an operational question to inspect how Pawtrackr handles
            availability, synchronization state, and checkout math.
          </p>

          <div
            role="tablist"
            aria-label="Operational questions"
            className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3"
          >
            {(Object.keys(OPERATIONAL_QUESTIONS) as OperationalQuestionKey[]).map(
              (key) => {
                const item = OPERATIONAL_QUESTIONS[key];
                const selected = selectedQuestion === key;
                return (
                  <button
                    key={key}
                    role="tab"
                    id={`question-tab-${key}`}
                    aria-selected={selected}
                    aria-controls="operational-question-panel"
                    type="button"
                    onClick={() => setSelectedQuestion(key)}
                    className={`rounded-2xl border p-3.5 text-left transition motion-reduce:transition-none ${
                      selected
                        ? 'border-periwinkle-400 bg-periwinkle-500/20 text-white'
                        : 'border-white/[0.08] bg-obsidian-900/75 text-zinc-300 hover:border-white/[0.18]'
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-periwinkle-300">
                      {item.shortTag}
                    </div>
                    <div className="mt-1 text-sm font-bold text-white">
                      {item.question}
                    </div>
                  </button>
                );
              }
            )}
          </div>

          <div
            id="operational-question-panel"
            role="tabpanel"
            aria-labelledby={`question-tab-${selectedQuestion}`}
            className="mt-5 rounded-2xl border border-white/[0.08] bg-obsidian-900/90 p-5"
          >
            <h3 className="text-base sm:text-lg font-bold text-white">
              {currentQuestion.headline}
            </h3>
            <p className="mt-2 text-sm text-zinc-200 leading-relaxed">
              {currentQuestion.explanation}
            </p>
            <ul className="mt-4 space-y-2 text-xs text-zinc-200">
              {currentQuestion.proofPoints.map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-2">
              <Link
                href={currentQuestion.routeHref}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-periwinkle-300 hover:text-periwinkle-200"
              >
                {currentQuestion.routeLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Interactive Data Confidence & Freshness Inspector */}
        <div className="rounded-3xl border border-white/[0.08] bg-obsidian-800/80 p-6 sm:p-8 shadow-glass lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                Data Confidence Signal
              </span>
              <span className="rounded-md border border-white/[0.1] bg-obsidian-900 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                Simulated state preview
              </span>
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold text-white">
              Honest System Status—Never Silent Uncertainty
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-zinc-300">
              Preview how Pawtrackr explains live, refreshing, offline, and demo
              states in plain human language.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {(
                [
                  { key: 'live_recent', label: 'Updated recently' },
                  { key: 'checking', label: 'Checking live' },
                  { key: 'stale_offline', label: 'Offline / Stale' },
                  { key: 'demo_mode', label: 'Demo mode' },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setConfidenceState(item.key)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition motion-reduce:transition-none ${
                    confidenceState === item.key
                      ? 'border-emerald-400 bg-emerald-500/20 text-white'
                      : 'border-white/[0.08] bg-obsidian-900/75 text-zinc-300 hover:border-white/[0.18]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div
              role="status"
              aria-live="polite"
              className="mt-4 rounded-2xl border border-white/[0.09] bg-obsidian-900/95 p-4"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.14] bg-obsidian-800 px-3 py-1 text-xs font-bold text-white">
                {confidenceState === 'stale_offline' ? (
                  <WifiOff className="h-3.5 w-3.5 text-amber-300" />
                ) : (
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <span>{currentConfidence.badgeLabel}</span>
              </div>

              <h3 className="mt-3 text-sm font-bold text-white">
                {currentConfidence.staffHeadline}
              </h3>
              <p className="mt-1 text-xs text-zinc-200 leading-relaxed">
                {currentConfidence.staffMessage}
              </p>
              <p className="mt-2.5 border-t border-white/[0.07] pt-2.5 text-[11px] text-zinc-300">
                <span className="font-semibold text-white">Why this matters: </span>
                {currentConfidence.whyItMatters}
              </p>
            </div>
          </div>

          <div className="mt-5 border-t border-white/[0.07] pt-4 text-xs text-zinc-300">
            Tenant-aware Supabase Row-Level Security isolates each salon’s
            clients, pets, shifts, visits, and transactions.
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 6: BEFORE PAWTRACKR VS. WITH PAWTRACKR & PLATFORM MATURITY
      ===================================================================== */}
      <section
        aria-label="Operational consolidation and platform roadmap"
        className="reveal-on-scroll mt-16space-y-8"
      >
        {/* Fragmented Tools vs. Connected Loop */}
        <div className="rounded-3xl border border-white/[0.08] bg-obsidian-800/75 p-6 sm:p-8 shadow-glass">
          <div className="text-center max-w-3xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-widest text-periwinkle-300">
              Operational Consolidation
            </span>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-white">
              From Fragmented Daily Tools to One Connected Operating Surface
            </h2>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Fragmented Salon Day
              </div>
              <h3 className="mt-1 text-base font-bold text-white">
                Disconnected tools create repeated typing and schedule mistakes
              </h3>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {[
                  'Phone calls & text threads',
                  'Paper intake & behavior notes',
                  'Standalone calendar blocks',
                  'Separate calculator & card terminal',
                  'Manual end-of-week spreadsheets',
                ].map((frag) => (
                  <span
                    key={frag}
                    className="rounded-xl border border-white/[0.08] bg-obsidian-800 px-3 py-2 text-zinc-200"
                  >
                    {frag}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                With Pawtrackr
              </div>
              <h3 className="mt-1 text-base font-bold text-white">
                One continuous record from booking request to owner analytics
              </h3>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                {[
                  '1. Time-zone & shift-checked booking',
                  '2. Pet weight & care context',
                  '3. Multi-groomer schedule',
                  '4. Cent-exact checkout',
                  '5. Source-labeled analytics',
                ].map((step) => (
                  <span
                    key={step}
                    className="rounded-xl border border-emerald-500/35 bg-obsidian-900/90 px-3 py-2 font-semibold text-white"
                  >
                    {step}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Now / Next / Later Transparency Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-emerald-500/30 bg-obsidian-800/80 p-6">
            <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">
              Available in Prototype &amp; Verified Live Routes
            </span>
            <h3 className="mt-3 text-lg font-bold text-white">
              What You Can Inspect Today
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-zinc-200">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  Interactive demo command center, POS math, and pet profiles
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  Authenticated staff live appointments, shifts, client/pet
                  intake, weight history, settings, and recorded-checkout analytics
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  Published salon catalog with local time zones and PostgreSQL
                  visit/transaction invariants
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-3xl border border-periwinkle-500/30 bg-obsidian-800/80 p-6">
            <span className="inline-flex rounded-full border border-periwinkle-500/40 bg-periwinkle-500/15 px-3 py-1 text-xs font-bold text-periwinkle-300">
              Next Production Milestone
            </span>
            <h3 className="mt-3 text-lg font-bold text-white">
              Completing the Commercial Salon Loop
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-zinc-200">
              <li className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-periwinkle-300" />
                <span>
                  Hosted rollout of self-serve salon provisioning, public online
                  booking, and Stripe payment settlement
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-periwinkle-300" />
                <span>
                  Staff role invitations, pet-parent accounts, and customer
                  reschedule/cancellation flows
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-periwinkle-300" />
                <span>
                  Authenticated private photo/waiver delivery and distributed rate
                  limiting
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-obsidian-800/80 p-6">
            <span className="inline-flex rounded-full border border-white/[0.15] bg-white/[0.06] px-3 py-1 text-xs font-bold text-zinc-200">
              Future Platform Capability
            </span>
            <h3 className="mt-3 text-lg font-bold text-white">
              Long-Term Expansion Roadmap
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-zinc-300">
              <li className="flex items-start gap-2">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
                <span>
                  Automated SMS reminders, two-way messaging, and vaccination
                  expiration alerts
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
                <span>
                  Mobile grooming route optimization, service-area rules, and
                  durable offline write queues
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
                <span>
                  Memberships, packages, payroll exports, and multi-location
                  administration
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 7: GUIDED EXPLORATION & DEMO PLAN PREVIEW
      ===================================================================== */}
      <section
        id="launch"
        aria-label="Explore Pawtrackr workspaces and demo plan preview"
        className="reveal-on-scroll mt-16grid grid-cols-1 gap-8 lg:grid-cols-12"
      >
        {/* Left 7 Columns: Guided Role Entry Points & Proposed Plans */}
        <div className="space-y-6 lg:col-span-7">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-periwinkle-300">
              Start Exploring Immediately
            </span>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-white">
              Choose a Perspective or Preview Proposed Salon Plans
            </h2>
            <p className="mt-2 text-sm text-zinc-300">
              Jump directly into the interactive demo workspace by role, or sign
              in to the authenticated staff routes.
            </p>
          </div>

          {/* 3 Guided Workspace Entry Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              href="/dashboard/analytics"
              className="rounded-2xl border border-white/[0.09] bg-obsidian-800/85 p-4 transition hover:border-periwinkle-400"
            >
              <div className="text-xs font-bold text-periwinkle-300">
                1. Salon Owner
              </div>
              <div className="mt-1 text-sm font-bold text-white">
                Revenue &amp; Pacing
              </div>
              <p className="mt-1 text-xs text-zinc-300">
                Inspect completed checkouts, weekly targets, and CSV exports.
              </p>
            </Link>

            <Link
              href="/dashboard"
              className="rounded-2xl border border-white/[0.09] bg-obsidian-800/85 p-4 transition hover:border-emerald-400"
            >
              <div className="text-xs font-bold text-emerald-300">
                2. Staff Member
              </div>
              <div className="mt-1 text-sm font-bold text-white">
                Command Center
              </div>
              <p className="mt-1 text-xs text-zinc-300">
                Search pets, check in visits, and run a 4-step cent-exact checkout.
              </p>
            </Link>

            <Link
              href="/portal/bespoke-grooming"
              className="rounded-2xl border border-white/[0.09] bg-obsidian-800/85 p-4 transition hover:border-periwinkle-400"
            >
              <div className="text-xs font-bold text-periwinkle-300">
                3. Pet Parent
              </div>
              <div className="mt-1 text-sm font-bold text-white">
                Public Booking
              </div>
              <p className="mt-1 text-xs text-zinc-300">
                Select services, check slot availability, and view Bello’s profile.
              </p>
            </Link>
          </div>

          {/* Proposed Subscription Plan Preview Cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {(['solo_van', 'salon_pro'] as const).map((key) => {
              const plan = SAAS_PLANS[key];
              const active = selectedPlan === key;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlan(key)}
                  className={`rounded-3xl border p-6 text-left transition motion-reduce:transition-none ${
                    active
                      ? 'border-periwinkle-400 bg-obsidian-700/90 shadow-periwinkle-glow'
                      : 'border-white/[0.08] bg-obsidian-800/60 hover:border-white/[0.18]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
                      {key === 'salon_pro'
                        ? 'Multi-Stylist Salon'
                        : 'Independent / Mobile'}
                    </span>
                    <span className="rounded-full border border-white/[0.15] px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                      Plan preview
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-white">
                    {plan.name}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-mono text-3xl font-extrabold text-white">
                      ${plan.monthlyPriceDollars}
                    </span>
                    <span className="text-xs text-zinc-300">
                      / month (proposed)
                    </span>
                  </div>
                  <ul className="mt-4 space-y-2 text-xs text-zinc-200">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 5 Columns: Clearly Labeled Demo Provisioning Preview */}
        <div className="glass-card p-6 sm:p-8 lg:col-span-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200">
              Demo Onboarding Preview • No Card Charged
            </span>
            <Lock className="h-4 w-4 text-zinc-300" />
          </div>

          <h3 className="mt-4 text-xl font-bold text-white">
            Preview Your Salon Booking URL
          </h3>
          <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
            Test how a salon name and booking slug are formatted in the demo
            workspace. Looking for the authenticated salon setup flow?{' '}
            <Link
              href="/signup"
              className="font-bold text-periwinkle-300 underline hover:text-periwinkle-200"
            >
              Open Salon Sign-Up
            </Link>
            .
          </p>

          {provisionedResult ? (
            <div className="mt-6 space-y-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
              <div className="flex items-center gap-2 text-emerald-300">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-sm font-bold">
                  Demo plan preview ready
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-zinc-200">
                <div>
                  Salon:{' '}
                  <span className="font-semibold text-white">
                    {provisionedResult.name}
                  </span>
                </div>
                <div>
                  Proposed monthly rate: ${provisionedResult.monthlyRate}
                </div>
                <div>
                  Example booking slug:{' '}
                  <span className="font-mono text-periwinkle-300">
                    {provisionedResult.slug}
                  </span>
                </div>
                <p className="text-zinc-300">
                  No subscription, live tenant, or billing charge has been
                  created.
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href="/portal/bespoke-grooming"
                  className="w-full rounded-xl bg-periwinkle-500 py-2.5 text-center text-xs font-bold text-obsidian-950 transition hover:bg-periwinkle-400"
                >
                  Preview a Sample Booking Page →
                </Link>
                <Link
                  href="/dashboard"
                  className="w-full rounded-xl border border-white/[0.14] bg-obsidian-900 py-2.5 text-center text-xs font-semibold text-white hover:bg-obsidian-700"
                >
                  Preview Owner Dashboard
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleInstantLaunch} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="demo-salon-name"
                  className="block text-xs font-medium text-zinc-200"
                >
                  Salon or Mobile Grooming Business Name
                </label>
                <input
                  id="demo-salon-name"
                  type="text"
                  required
                  value={salonName}
                  onChange={(e) => handleSalonNameChange(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-sm text-white focus:border-periwinkle-400 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="demo-salon-slug"
                  className="block text-xs font-medium text-zinc-200"
                >
                  Public Booking URL Slug (Preview)
                </label>
                <div className="mt-1.5 flex items-center rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs">
                  <span className="text-zinc-300">pawtrackr.live/</span>
                  <input
                    id="demo-salon-slug"
                    type="text"
                    required
                    value={salonSlug}
                    onChange={(e) => setSalonSlug(e.target.value)}
                    className="ml-1 w-full bg-transparent font-mono text-periwinkle-300 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="demo-owner-email"
                  className="block text-xs font-medium text-zinc-200"
                >
                  Owner Work Email
                </label>
                <input
                  id="demo-owner-email"
                  type="email"
                  required
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-sm text-white focus:border-periwinkle-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isProvisioning}
                className="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {isProvisioning
                  ? 'Preparing demo preview...'
                  : `Preview Demo Configuration ($${
                      selectedPlan === 'salon_pro'
                        ? SAAS_PLANS.salon_pro.monthlyPriceDollars
                        : SAAS_PLANS.solo_van.monthlyPriceDollars
                    }/mo plan)`}
              </button>
              {launchError && (
                <p role="alert" className="text-xs text-amber-200">
                  {launchError}
                </p>
              )}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
