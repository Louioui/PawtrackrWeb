'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Command,
  CreditCard,
  Database,
  ExternalLink,
  FileText,
  Globe,
  Heart,
  HelpCircle,
  Layers,
  Lock,
  MessageSquare,
  Mic,
  Pause,
  Play,
  Receipt,
  RefreshCw,
  Scale,
  ScanBarcode,
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

const PRODUCT_PREVIEW_SLIDES = [
  {
    id: 'slide-schedule',
    badge: 'SLIDE 01 • MULTI-GROOMER SCHEDULE & GIST EXCLUSION',
    title: 'Collision-Proof Salon Schedule & Turnaround Buffers',
    subtitle:
      'PostgreSQL btree_gist tstzrange constraints lock groomer lanes, hydraulic tubs, and 15-minute sanitation buffers simultaneously.',
    metrics: [
      { label: 'Suite 01 • Elena R.', value: '10:30 AM – 12:00 PM (+15m)', accent: 'text-emerald-300' },
      { label: 'Suite 02 • Marcus V.', value: '10:00 AM – 11:30 AM (+15m)', accent: 'text-periwinkle-300' },
      { label: 'Double-Booking Risk', value: '0.00% (DB Enforced)', accent: 'text-emerald-300' },
    ],
    rows: [
      { left: 'Bello • Mini Goldendoodle (28.4 lb)', right: 'Rabies Verified • Dryer Sensitive' },
      { left: 'Barnaby • Standard Poodle (54.0 lb)', right: 'Full Scissor Teddy Cut • $185.00' },
      { left: 'Koda • Siberian Husky (49.2 lb)', right: 'Undercoat De-Shedding • $155.00' },
    ],
  },
  {
    id: 'slide-pos',
    badge: 'SLIDE 02 • INTEGER-CENT POS & HID BARCODE REGISTER',
    title: '$0.00 Cash Variance Checkout & Split Tenders',
    subtitle:
      'Fixed-point integer-cent math, cryptographic Stripe idempotency, and <45ms Bluetooth/USB HID barcode retail scanning.',
    metrics: [
      { label: 'Grooming + Retail SKU', value: '$115.00 + $24.00 Oat Wash', accent: 'text-white' },
      { label: 'Split Tender Balance', value: '$60.00 Cash • $108.56 Card', accent: 'text-periwinkle-300' },
      { label: 'Drawer Variance', value: '$0.00 Exact Cent Lock', accent: 'text-emerald-300' },
    ],
    rows: [
      { left: 'UPC-A Scanned: Botanical Oatmeal Shampoo', right: 'Atomic Stock Deducted (14 → 13)' },
      { left: 'Idempotency Nonce (payment_intent.succeeded)', right: 'Duplicate Replay Neutralized' },
      { left: 'Stylist Tip Pool Allocation', right: 'Zero-Cent Remainder Drift' },
    ],
  },
  {
    id: 'slide-offline-van',
    badge: 'SLIDE 03 • OFFLINE-FIRST MOBILE VAN PWA & 3-WAY MERGE',
    title: 'Unbreakable Curbside Fleet Operations Without Cell Signal',
    subtitle:
      'Local IndexedDB outboxes persist route progressions and checkouts offline with SHA-256 OCC version hashes and automatic 3-way merge.',
    metrics: [
      { label: 'Sprinter Inverter / Fresh H2O', value: '94% Pure Sine • 55 Gal', accent: 'text-emerald-300' },
      { label: 'IndexedDB Vault Status', value: 'Synced (sha256:4f810aa7)', accent: 'text-periwinkle-300' },
      { label: 'Conflict Resolution', value: '3-Way OCC Clean Merge', accent: 'text-emerald-300' },
    ],
    rows: [
      { left: 'Stop 01 • 910 Montana Ave (Rocco)', right: 'Completed • Curbside Receipt Sent' },
      { left: 'Stop 02 • 1420 17th St (Barnaby)', right: 'Hydro-Bath Active • Cabin 71°F' },
      { left: 'Stop 03 • 2204 Ocean Park Blvd (Bella)', right: 'Automated 18-Min Traffic ETA SMS' },
    ],
  },
  {
    id: 'slide-crm-payroll',
    badge: 'SLIDE 04 • WHISPER AI INTAKE, COAT RECALL & TIERED PAYROLL',
    title: 'Autonomous Growth Engine & Progressive Stylist Commissions',
    subtitle:
      'Whisper AI converts missed calls into coat-aware bookings while marginal commission brackets reward top stylists automatically.',
    metrics: [
      { label: 'Doodle Coat Recall Cadence', value: 'Every 6 Weeks (10DLC SMS)', accent: 'text-amber-300' },
      { label: 'Whisper AI Prompt Shield', value: 'Injection Neutralized', accent: 'text-emerald-300' },
      { label: 'Marginal Commission Tiers', value: '40% → 45% → 50% Split', accent: 'text-periwinkle-300' },
    ],
    rows: [
      { left: 'Missed Voicemail → Structured Goldendoodle Quote', right: '1-Tap Confirmation Dispatched' },
      { left: 'Post-Groom 5-Star Sentiment Router', right: '4–5★ Public • ≤3★ Private Manager' },
      { left: 'Locked Bi-Weekly Payroll Export (WF08)', right: 'Gusto & QuickBooks CSV Ready' },
    ],
  },
] as const;

export default function LandingPage() {
  // Interactive Demonstration State
  const [activePerspective, setActivePerspective] =
    useState<PerspectiveKey>('pet_parent');
  const [activeStageKey, setActiveStageKey] =
    useState<LifecycleStageKey>('confirmed');
  const [demoAppointmentCompleted, setDemoAppointmentCompleted] =
    useState<boolean>(false);

  // Static Product Preview Carousel State
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);

  // Animation & Tour Auto-Play State
  const [isTourAutoPlaying, setIsTourAutoPlaying] = useState<boolean>(false);
  const [isWorkflowAutoPlaying, setIsWorkflowAutoPlaying] = useState<boolean>(false);

  // Availability Intelligence State
  const [availabilityScenario, setAvailabilityScenario] =
    useState<AvailabilityScenarioKey>('valid_slot');
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const activeStage =
    LIFECYCLE_STAGES.find((s) => s.key === activeStageKey) ??
    LIFECYCLE_STAGES[1];
  const currentAvailability = AVAILABILITY_SCENARIOS[availabilityScenario];

  // Derived Owner Metrics in Demo
  const completedCount = demoAppointmentCompleted ? 4 : 3;
  const confirmedRevenueDollars = demoAppointmentCompleted ? '565.93' : '428.50';

  // Auto-Play Perspective Tour Timer
  useEffect(() => {
    if (!isTourAutoPlaying) return;
    const perspectives: PerspectiveKey[] = ['pet_parent', 'salon_team', 'owner'];
    const timer = setInterval(() => {
      setActivePerspective((current) => {
        const nextIdx = (perspectives.indexOf(current) + 1) % perspectives.length;
        const nextPerspective = perspectives[nextIdx];
        if (nextPerspective === 'pet_parent') {
          setActiveStageKey('confirmed');
          setDemoAppointmentCompleted(false);
        } else if (nextPerspective === 'salon_team') {
          setActiveStageKey('checked_in');
        } else {
          setActiveStageKey('paid');
          setDemoAppointmentCompleted(true);
        }
        return nextPerspective;
      });
    }, 4200);
    return () => clearInterval(timer);
  }, [isTourAutoPlaying]);

  // Auto-Play 6-Stage Workflow Timer
  useEffect(() => {
    if (!isWorkflowAutoPlaying) return;
    const stageKeys: LifecycleStageKey[] = [
      'requested',
      'confirmed',
      'checked_in',
      'grooming',
      'paid',
      'follow_up',
    ];
    const timer = setInterval(() => {
      setActiveStageKey((current) => {
        const nextIdx = (stageKeys.indexOf(current) + 1) % stageKeys.length;
        const nextStageKey = stageKeys[nextIdx];
        const nextStage = LIFECYCLE_STAGES.find((s) => s.key === nextStageKey);
        if (nextStage) {
          setActivePerspective(nextStage.perspective);
          if (nextStageKey === 'paid' || nextStageKey === 'follow_up') {
            setDemoAppointmentCompleted(true);
          } else if (nextStageKey === 'requested' || nextStageKey === 'confirmed') {
            setDemoAppointmentCompleted(false);
          }
        }
        return nextStageKey;
      });
    }, 3600);
    return () => clearInterval(timer);
  }, [isWorkflowAutoPlaying]);

  const handlePerspectiveSelect = (perspective: PerspectiveKey) => {
    setIsTourAutoPlaying(false);
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
    setIsWorkflowAutoPlaying(false);
    setActiveStageKey(stage.key);
    setActivePerspective(stage.perspective);
    if (stage.key === 'paid' || stage.key === 'follow_up') {
      setDemoAppointmentCompleted(true);
    } else if (stage.key === 'requested' || stage.key === 'confirmed') {
      setDemoAppointmentCompleted(false);
    }
  };

  const handleScenarioChange = (scenario: AvailabilityScenarioKey) => {
    setIsScanning(true);
    setAvailabilityScenario(scenario);
    setTimeout(() => setIsScanning(false), 500);
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
              href="/welcome"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-2xl bg-periwinkle-500 px-8 py-4 text-base font-bold text-obsidian-950 shadow-periwinkle-glow transition hover:bg-periwinkle-400"
            >
              <Sparkles className="h-5 w-5" />
              Start 14-Day Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/portal/live"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.14] bg-obsidian-800/80 px-7 py-4 text-base font-semibold text-white transition hover:border-periwinkle-500/50 hover:bg-obsidian-700"
            >
              <Calendar className="h-5 w-5 text-periwinkle-400" />
              Book as Pet Parent
            </Link>

            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-4 text-base font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
            >
              <Lock className="h-4 w-4 text-zinc-400" />
              Staff Sign In
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
          2. BENTO-GRID ENTERPRISE ARCHITECTURE & COMMERCIAL SHOWCASE
      ===================================================================== */}
      <section
        id="bento-architecture"
        aria-label="Enterprise architecture bento showcase"
        className="space-y-8 scroll-mt-24 animate-rise-in"
      >
        <div className="text-center max-w-3xl mx-auto space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            Bulletproof Systems Engineering
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Engineered to Outclass Legacy Grooming Software
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Every layer of Pawtrackr Web enforces strict mathematical, cryptographic, and operational invariants—from fixed-point integer-cent ledgers to database-level double-booking immunity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Bento 1 (7 Cols): Integer-Cent POS & Cryptographic Idempotency */}
          <div className="md:col-span-7 rounded-3xl border border-white/[0.1] bg-gradient-to-br from-obsidian-800/90 via-obsidian-900 to-obsidian-950 p-6 sm:p-8 flex flex-col justify-between shadow-xl">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 rounded-xl border border-periwinkle-500/35 bg-periwinkle-500/15 px-3 py-1.5 text-xs font-bold text-periwinkle-300">
                  <Receipt className="h-4 w-4" />
                  <span>FIXED-POINT INTEGER-CENT ENGINE</span>
                </div>
                <span className="font-mono text-xs font-semibold text-emerald-300">
                  $0.00 Drawer Variance
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white">
                Zero Floating-Point Drift &amp; Replay-Proof Checkout
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Base packages, matted-coat surcharges, municipal taxes, stylist tip pools, and split cash-plus-card tenders execute strictly in integer cents. Cryptographic idempotency keys neutralize replayed Stripe webhooks before they ever touch your ledger.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl border border-white/[0.08] bg-obsidian-950/90 p-4 font-mono text-xs">
              <div>
                <span className="text-zinc-400 block text-[11px]">Service + Tax + Tip</span>
                <span className="text-white font-bold text-sm">14,743¢ ($147.43)</span>
              </div>
              <div>
                <span className="text-zinc-400 block text-[11px]">Split Cash / Card</span>
                <span className="text-periwinkle-300 font-bold text-sm">5,000¢ + 9,743¢</span>
              </div>
              <div>
                <span className="text-zinc-400 block text-[11px]">Reconciliation Delta</span>
                <span className="text-emerald-300 font-bold text-sm">0¢ Verified</span>
              </div>
            </div>
          </div>

          {/* Bento 2 (5 Cols): PostgreSQL btree_gist Exclusion */}
          <div className="md:col-span-5 rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 flex flex-col justify-between shadow-xl">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300">
                <Database className="h-4 w-4" />
                <span>POSTGRESQL BTREE_GIST</span>
              </div>
              <h3 className="text-xl font-bold text-white">
                Mathematically Impossible Double-Bookings
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Database-level <span className="font-mono text-periwinkle-300">tstzrange</span> exclusion constraints protect groomer shifts, hydraulic tables, bathing tubs, and mobile van routes—even under sub-millisecond concurrent requests.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3.5 text-xs text-zinc-200 space-y-1">
              <div className="flex items-center justify-between font-mono">
                <span className="text-emerald-300 font-bold">EXCLUDE USING gist</span>
                <span className="text-zinc-300">[10:30, 12:15)</span>
              </div>
              <p className="text-[11px] text-zinc-300">
                Includes automatic 15-minute table sanitization &amp; drying buffer.
              </p>
            </div>
          </div>

          {/* Bento 3 (4 Cols): Offline-First Mobile Van PWA */}
          <div className="md:col-span-4 rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between shadow-xl">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-periwinkle-500/35 bg-periwinkle-500/15 px-3 py-1.5 text-xs font-bold text-periwinkle-300">
                <Truck className="h-4 w-4" />
                <span>OFFLINE-FIRST VAN PWA</span>
              </div>
              <h3 className="text-lg font-bold text-white">
                IndexedDB Outbox &amp; 3-Way OCC Merge
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Groom in subterranean garages or rural dead zones without losing a single tap. Local IndexedDB outboxes hash mutations with SHA-256 OCC versions and reconcile cleanly on reconnect.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-3 font-mono text-[11px] text-emerald-300">
              <span>Vault: pawtrackr_offline_vault</span>
              <span>3-Way Merge</span>
            </div>
          </div>

          {/* Bento 4 (4 Cols): Coat-Aware Twilio SMS Recall */}
          <div className="md:col-span-4 rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between shadow-xl">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-300">
                <MessageSquare className="h-4 w-4" />
                <span>TWILIO 10DLC CRM</span>
              </div>
              <h3 className="text-lg font-bold text-white">
                Coat-Aware SMS Recall &amp; Two-Way Inbox
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Automated 6-week Doodle matting prevention texts, two-way client messaging, TCPA STOP enforcement, and 5-star Google review sentiment routing.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-3 font-mono text-[11px] text-periwinkle-300">
              <span>Doodles: 6w • Double: 8w</span>
              <span>4–5★ Public</span>
            </div>
          </div>

          {/* Bento 5 (4 Cols): Autonomous Whisper AI Voice Receptionist */}
          <div className="md:col-span-4 rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between shadow-xl">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300">
                <Mic className="h-4 w-4" />
                <span>WHISPER AI CONCIERGE</span>
              </div>
              <h3 className="text-lg font-bold text-white">
                Autonomous AI Voice Receptionist
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Turns missed calls while dryers are roaring into structured breed-aware appointment quotes—hardened against adversarial prompt injection.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-3 font-mono text-[11px] text-emerald-300">
              <span>Prompt-Shield Armed</span>
              <span>24/7 Intake</span>
            </div>
          </div>

          {/* Bento 6 (12 Cols): HID Barcode Retail, Progressive Payroll & RLS Isolation */}
          <div className="md:col-span-12 rounded-3xl border border-white/[0.1] bg-obsidian-900/95 p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center shadow-xl">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-periwinkle-300 uppercase tracking-wider">
                <ScanBarcode className="h-4 w-4" />
                <span>HID Barcode Retail &amp; Tiered Payroll</span>
              </div>
              <h3 className="text-lg font-bold text-white">
                Sub-45ms Retail Scanning &amp; Marginal Stylist Commissions
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Bluetooth/USB HID barcode scanners deduct retail inventory atomically with non-negative stock constraints, while progressive commission brackets (40% / 45% / 50%) export cleanly to Gusto and QuickBooks.
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-obsidian-950 p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">JWT-Bound Supabase RLS</span>
                <span className="font-mono text-emerald-300">Zero Cross-Tenant Bleed</span>
              </div>
              <p className="text-[11px] text-zinc-300">
                Row-Level Security, hardware passkey revocation registries, and GDPR pseudonymization protect every franchise unit.
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-obsidian-950 p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">OpenTelemetry &amp; Canary Health</span>
                <span className="font-mono text-periwinkle-300">W3C traceparent</span>
              </div>
              <p className="text-[11px] text-zinc-300">
                Continuous synthetic canary probes, circuit breakers, and distributed request tracing keep salon operations resilient.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          2B. HIGH-FIDELITY STATIC PRODUCT PREVIEW CAROUSEL (ZERO LIVE SANDBOX)
      ===================================================================== */}
      <section
        id="product-previews"
        role="region"
        aria-roledescription="carousel"
        aria-label="Pawtrackr static product preview carousel"
        className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-10 space-y-6 shadow-2xl scroll-mt-24"
      >
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
              High-Fidelity Product Previews
            </span>
            <h2 className="text-2xl font-bold text-white">
              Crystal-Clear Salon Workflows Before You Sign Up
            </h2>
            <p className="text-xs text-zinc-300 max-w-2xl">
              Inspect verified interface snapshots across scheduling, POS checkout, mobile van telemetry, and AI retention—purpose-built for commercial clarity without noisy sandbox clutter.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous product preview slide"
              onClick={() =>
                setActiveSlideIndex(
                  (prev) => (prev - 1 + PRODUCT_PREVIEW_SLIDES.length) % PRODUCT_PREVIEW_SLIDES.length
                )
              }
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.14] bg-obsidian-950 text-zinc-200 transition hover:border-periwinkle-400 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-xs text-zinc-300 px-2">
              {activeSlideIndex + 1} / {PRODUCT_PREVIEW_SLIDES.length}
            </span>
            <button
              type="button"
              aria-label="Next product preview slide"
              onClick={() =>
                setActiveSlideIndex((prev) => (prev + 1) % PRODUCT_PREVIEW_SLIDES.length)
              }
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.14] bg-obsidian-950 text-zinc-200 transition hover:border-periwinkle-400 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Slide Selector Pills */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {PRODUCT_PREVIEW_SLIDES.map((slide, idx) => {
            const isCurrent = idx === activeSlideIndex;
            return (
              <button
                key={slide.id}
                type="button"
                aria-pressed={isCurrent}
                onClick={() => setActiveSlideIndex(idx)}
                className={`rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold transition ${
                  isCurrent
                    ? 'border-periwinkle-400 bg-periwinkle-500/20 text-white shadow-sm'
                    : 'border-white/[0.08] bg-obsidian-950 text-zinc-300 hover:border-white/20 hover:text-white'
                }`}
              >
                <span className="block font-mono text-[10px] text-periwinkle-300">
                  0{idx + 1}
                </span>
                <span className="line-clamp-1">{slide.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Static Slide Canvas */}
        {(() => {
          const slide = PRODUCT_PREVIEW_SLIDES[activeSlideIndex];
          return (
            <div
              key={slide.id}
              aria-live="polite"
              className="rounded-2xl border border-white/[0.1] bg-obsidian-950 p-5 sm:p-7 space-y-5 animate-rise-in"
            >
              <div className="space-y-1.5">
                <span className="inline-block rounded-md border border-periwinkle-500/30 bg-periwinkle-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-periwinkle-300">
                  {slide.badge}
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-white">{slide.title}</h3>
                <p className="text-xs sm:text-sm text-zinc-300">{slide.subtitle}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {slide.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl border border-white/[0.08] bg-obsidian-900/90 p-3.5"
                  >
                    <span className="text-[11px] text-zinc-400 block">{m.label}</span>
                    <span className={`mt-1 block font-mono text-sm font-bold ${m.accent}`}>
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {slide.rows.map((row) => (
                  <div
                    key={row.left}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-xl border border-white/[0.07] bg-obsidian-900/60 px-4 py-2.5 text-xs"
                  >
                    <span className="font-semibold text-white">{row.left}</span>
                    <span className="font-mono text-emerald-300">{row.right}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </section>

      {/* =====================================================================
          2C. FUSED PLATFORM WORKFLOW PILLARS
      ===================================================================== */}
      <section id="features" className="space-y-8 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            End-to-End Salon Operating System
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            How Pawtrackr Solves Your Daily Headaches
          </h2>
          <p className="text-sm text-zinc-400">
            Designed to replace clunky legacy software with one synchronized platform across online booking, salon schedules, pet safety records, and cent-exact checkout:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: 24/7 Smart Online Booking */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-emerald-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-11 w-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition">
                <Globe className="h-5 w-5" />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                1. Stop Playing Phone Tag
              </div>
              <h3 className="text-lg font-bold text-white">24/7 Online Booking</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Pet parents book instantly from any phone. Our engine validates operating hours, groomer shifts, and 15-minute turnaround buffers automatically.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1.5 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Zero double-booking guarantee</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Salon local time zone display</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Digital waivers &amp; photo uploads</li>
              </ul>
            </div>
            <Link
              href="/portal/live"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 py-2.5 px-4 text-xs font-bold text-emerald-300 hover:bg-emerald-500 hover:text-obsidian-950 transition"
            >
              Browse Published Salons <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Card 2: Multi-Groomer Command Center */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-periwinkle-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-11 w-11 rounded-2xl bg-periwinkle-500/15 border border-periwinkle-500/30 flex items-center justify-center text-periwinkle-400 group-hover:scale-110 transition">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-periwinkle-300">
                2. Run Calm, Organized Days
              </div>
              <h3 className="text-lg font-bold text-white">Live Staff Schedule</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Multi-groomer vertical calendar with live WebSocket synchronization (&lt;100ms), turnaround buffers, and Smart Triage for sudden sick calls.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1.5 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Multi-groomer lane stacking</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Automatic turnaround buffers</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> 1-tap Smart Triage sick reassignment</li>
              </ul>
            </div>
            <a
              href="#product-previews"
              onClick={() => setActiveSlideIndex(0)}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-periwinkle-500/15 border border-periwinkle-500/30 py-2.5 px-4 text-xs font-bold text-periwinkle-300 hover:bg-periwinkle-500 hover:text-obsidian-950 transition"
            >
              Preview Schedule Suite <ChevronRight className="h-4 w-4" />
            </a>
          </div>

          {/* Card 3: Rabies & Medical Care Vault */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-amber-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-11 w-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                3. Protect Pets &amp; Comply
              </div>
              <h3 className="text-lg font-bold text-white">Rabies &amp; Care Vault</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Secure vaccine certificate storage, compliance badges, pet weight history charts, and special handling behavior tags.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1.5 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Vet rabies certificate upload</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Automated expiry compliance check</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Anxious &amp; senior behavior auras</li>
              </ul>
            </div>
            <Link
              href="/welcome"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 py-2.5 px-4 text-xs font-bold text-amber-300 hover:bg-amber-500 hover:text-obsidian-950 transition"
            >
              Provision Salon Vault <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Card 4: Atomic POS Register & $0 Variance Checkout */}
          <div className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 flex flex-col justify-between hover:border-periwinkle-500/50 transition group shadow-lg">
            <div className="space-y-3">
              <div className="h-11 w-11 rounded-2xl bg-periwinkle-500/15 border border-periwinkle-500/30 flex items-center justify-center text-periwinkle-400 group-hover:scale-110 transition">
                <Receipt className="h-5 w-5" />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-periwinkle-300">
                4. Zero-Variance Accounting
              </div>
              <h3 className="text-lg font-bold text-white">Atomic POS &amp; Register</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Fast register for salon desks and mobile vans. Exact integer-cent billing, split tenders, card tips, and digital report cards.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1.5 pt-2">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Fixed-point integer-cent math</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Split card &amp; cash payments</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Automatic groomer tip pools</li>
              </ul>
            </div>
            <a
              href="#product-previews"
              onClick={() => setActiveSlideIndex(1)}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-periwinkle-500/15 border border-periwinkle-500/30 py-2.5 px-4 text-xs font-bold text-periwinkle-300 hover:bg-periwinkle-500 hover:text-obsidian-950 transition"
            >
              Preview POS Register <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. INTERACTIVE PRODUCT TOUR: ONE RECORD, THREE PERSPECTIVES (WITH LIVE DEMO)
      ===================================================================== */}
      <section id="demo-tour" className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-10 space-y-6 shadow-xl scroll-mt-24">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
                Interactive Product Tour
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live WebSocket Active
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white">
              See How One Appointment Syncs Everywhere
            </h2>
            <p className="text-xs text-zinc-400 max-w-xl">
              Watch an appointment flow from customer self-booking directly to the groomer’s station and the owner’s register in under 100 milliseconds.
            </p>
          </div>

          {/* Perspective Selector & Live Tour Simulation Toggle */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsTourAutoPlaying((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition shadow-sm ${
                isTourAutoPlaying
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-emerald-500/20'
                  : 'border-periwinkle-500/40 bg-periwinkle-500/10 text-periwinkle-300 hover:bg-periwinkle-500/20'
              }`}
            >
              {isTourAutoPlaying ? (
                <>
                  <Pause className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Pause Live Tour</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 text-periwinkle-400" />
                  <span>Auto-Play Live Tour</span>
                </>
              )}
            </button>

            <div
              role="tablist"
              aria-label="Choose product perspective"
              className="inline-flex rounded-xl border border-white/[0.1] bg-obsidian-950 p-1"
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
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
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
        </div>

        {/* Live Simulation Progress Banner */}
        <div className="rounded-2xl border border-white/[0.08] bg-obsidian-950 p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-300">Live Simulation Status:</span>
              <span className="rounded-full bg-periwinkle-500/15 border border-periwinkle-500/30 px-2 py-0.5 text-[11px] font-bold text-periwinkle-300">
                {activePerspective === 'pet_parent'
                  ? 'Phase 1 of 3 • Online Booking Dispatched (0.0s)'
                  : activePerspective === 'salon_team'
                  ? 'Phase 2 of 3 • Live WebSocket Push (<100ms)'
                  : 'Phase 3 of 3 • Cent-Exact Settlement (Real-Time)'}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400">
              {isTourAutoPlaying ? 'Auto-advancing through perspective lifecycle…' : 'Interactive manual inspection mode'}
            </div>
          </div>

          <div className="h-1.5 w-full rounded-full bg-obsidian-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-periwinkle-400 via-emerald-400 to-periwinkle-400 transition-all duration-700 ease-out"
              style={{
                width:
                  activePerspective === 'pet_parent'
                    ? '33%'
                    : activePerspective === 'salon_team'
                    ? '66%'
                    : '100%',
              }}
            />
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
          4. AVAILABILITY INTELLIGENCE (SAFE BOOKINGS VS. BLOCKED SLOTS)
      ===================================================================== */}
      <section
        id="availability"
        role="region"
        aria-label="Availability intelligence demonstration"
        className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 space-y-6 shadow-xl scroll-mt-24"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
                Smart Availability Engine
              </span>
              <span className="rounded-full bg-periwinkle-500/15 border border-periwinkle-500/30 px-2 py-0.5 text-[10px] font-bold text-periwinkle-300">
                Zero Double-Booking Guarantee
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">
              Why Slots Are Bookable vs. Blocked
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleScenarioChange('valid_slot')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                availabilityScenario === 'valid_slot'
                  ? 'bg-emerald-500 text-obsidian-950 shadow-sm'
                  : 'bg-obsidian-800 text-zinc-300 hover:text-white'
              }`}
            >
              Scenario A: Valid 10:30 AM PT Request
            </button>
            <button
              type="button"
              onClick={() => handleScenarioChange('blocked_shift')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                availabilityScenario === 'blocked_shift'
                  ? 'bg-amber-500 text-obsidian-950 shadow-sm'
                  : 'bg-obsidian-800 text-zinc-300 hover:text-white'
              }`}
            >
              Scenario B: Why was 12:00 PM PT blocked?
            </button>
          </div>
        </div>

        {/* Live Slot Scanner Visual Feedback */}
        <div className="rounded-2xl border border-white/[0.07] bg-obsidian-950 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${isScanning ? 'bg-periwinkle-400 animate-ping' : 'bg-emerald-400'}`} />
            <span className="font-semibold text-zinc-200">
              {isScanning ? 'Executing database slot conflict scanner…' : 'Conflict Scan Completed:'}
            </span>
            <span className="font-mono text-zinc-400 text-[11px]">
              {currentAvailability.checks.filter(c => c.passed).length} of {currentAvailability.checks.length} constraints verified
            </span>
          </div>
          <span className="text-[11px] text-periwinkle-300 font-mono">
            {availabilityScenario === 'valid_slot' ? 'Status: Approved for Online Booking' : 'Status: Rejected to Prevent Shift Overrun'}
          </span>
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
                className="flex items-start gap-2.5 p-2.5 rounded-xl border border-white/[0.06] bg-obsidian-800/60 text-xs transition hover:bg-obsidian-800"
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
          5. LIFECYCLE STAGES (STEP 1 THROUGH 6 WITH ANIMATED WALKTHROUGH)
      ===================================================================== */}
      <section id="workflow" className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 space-y-6 shadow-xl scroll-mt-24">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
              End-to-End Workflow
            </span>
            <h2 className="text-2xl font-bold text-white">
              6 Stages from Booking to Re-Booking
            </h2>
            <p className="text-xs text-zinc-400 max-w-xl">
              Click any stage tab or enable auto-play to see how Pawtrackr automates notifications, care notes, and revenue tracking.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsWorkflowAutoPlaying((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition shadow-sm ${
              isWorkflowAutoPlaying
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-emerald-500/20'
                : 'border-periwinkle-500/40 bg-periwinkle-500/10 text-periwinkle-300 hover:bg-periwinkle-500/20'
            }`}
          >
            {isWorkflowAutoPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5 text-emerald-400" />
                <span>Pause Workflow</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-periwinkle-400" />
                <span>Auto-Play Lifecycle</span>
              </>
            )}
          </button>
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
                    ? 'border-periwinkle-400 bg-periwinkle-500/20 text-white shadow-md ring-1 ring-periwinkle-400/50'
                    : 'border-white/[0.07] bg-obsidian-950 text-zinc-400 hover:border-white/[0.15] hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-periwinkle-300">Step {stage.stepNumber}</span>
                  {selected && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
                </div>
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
          6. TRANSPARENT PRICING PLANS
      ===================================================================== */}
      <section id="pricing" className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-10 space-y-8 shadow-xl scroll-mt-24">
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
          7. FREQUENTLY ASKED QUESTIONS (FAQ)
      ===================================================================== */}
      <section id="faq" className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-10 space-y-6 shadow-xl scroll-mt-24">
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
          8. FINAL CALL TO ACTION (START FREE TRIAL)
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
            Join grooming salons and mobile van fleets upgrading to Pawtrackr. Provision your isolated salon workspace in 2 minutes with zero setup fees.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/welcome"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-periwinkle-500 px-7 py-3.5 text-sm font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400 transition"
            >
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.15] bg-obsidian-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-obsidian-800 transition"
            >
              <Lock className="h-4 w-4 text-periwinkle-400" />
              Staff Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          9. FOOTER: CLEAN BRANDING & DIRECT LINKS
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
