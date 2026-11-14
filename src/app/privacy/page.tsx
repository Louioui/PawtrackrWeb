import React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  CreditCard,
  Database,
  Lock,
  MessageSquare,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy & Data Security | Pawtrackr Web OS',
  description:
    'Multi-tenant Row-Level Security isolation, GDPR/CCPA pseudonymization, Stripe PCI-DSS tokenization, and TCPA SMS compliance for Pawtrackr pet grooming salons.',
};

const PRIVACY_PILLARS = [
  {
    icon: Database,
    badge: 'SUPABASE RLS ISOLATION',
    title: 'Strict Multi-Tenant Data Isolation',
    body: 'Every salon Studio and mobile grooming fleet operates inside a cryptographically isolated PostgreSQL tenant boundary. Row-Level Security (RLS) policies bind every query to verified JWT claims so client profiles, pet medical charts, and financial ledgers never cross salon accounts.',
  },
  {
    icon: UserCheck,
    badge: 'GDPR & CCPA COMPLIANCE',
    title: 'Right-to-Erasure Pseudonymization',
    body: 'Salon owners can execute immediate GDPR/CCPA client erasure requests. Personally identifiable names, phone numbers, email addresses, residential coordinates, and digital signatures are irreversibly pseudonymized while preserving immutable integer-cent tax totals for statutory audit integrity.',
  },
  {
    icon: CreditCard,
    badge: 'PCI-DSS LEVEL 1',
    title: 'Zero Raw Card Storage & Idempotent Billing',
    body: 'Raw payment card numbers never touch Pawtrackr servers. All card-present and online deposits are tokenized directly by Stripe, protected by cryptographic idempotency keys and HMAC-SHA256 webhook verification to guarantee zero duplicate charges.',
  },
  {
    icon: Camera,
    badge: 'EXIF PRIVACY SHIELD',
    title: 'Automatic Residential Geotag Stripping',
    body: 'Photos uploaded for rabies vaccination verification or before-and-after grooming report cards are stripped of embedded camera EXIF metadata and residential GPS coordinates before storage.',
  },
  {
    icon: MessageSquare,
    badge: 'TWILIO 10DLC & TCPA',
    title: 'Consent-First SMS & Instant STOP Enforcement',
    body: 'Automated appointment confirmations and coat-matting recall reminders are dispatched exclusively to opted-in pet parents. Replying STOP immediately sets a database-enforced opt-out flag across the salon workspace.',
  },
  {
    icon: Lock,
    badge: 'PASSKEY & SESSION SECURITY',
    title: 'Hardware Revocation & Audit Trails',
    body: 'Staff sessions are protected by role-based access control, hardware device revocation registries, and append-only workflow event logs with W3C OpenTelemetry trace correlation.',
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6 lg:px-8 space-y-12">
      <section className="rounded-3xl border border-white/[0.1] bg-gradient-to-b from-obsidian-800/90 via-obsidian-900 to-obsidian-950 p-6 sm:p-12 shadow-2xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-periwinkle-500/35 bg-periwinkle-500/10 px-3.5 py-1 text-xs font-semibold text-periwinkle-300">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Privacy, Security &amp; Regulatory Architecture</span>
          </span>
          <span className="font-mono text-xs text-zinc-300">Effective: November 2026</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          Pawtrackr Privacy Policy &amp; Tenant Data Protection
        </h1>

        <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-3xl">
          Pawtrackr Web is engineered from the database up to protect salon owners, grooming staff, and pet parents. We never sell pet parent contact lists, never commingle multi-tenant records, and enforce strict cryptographic access controls across every API boundary.
        </p>

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.14] bg-obsidian-800/80 px-4 py-2.5 text-xs font-semibold text-white transition hover:border-periwinkle-500/50 hover:bg-obsidian-700"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-periwinkle-300" />
            Return to Pawtrackr Overview
          </Link>
        </div>
      </section>

      <section aria-label="Security and privacy pillars" className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PRIVACY_PILLARS.map((item) => {
          const Icon = item.icon;
          return (
            <article
              key={item.title}
              className="rounded-2xl border border-white/[0.1] bg-obsidian-900 p-6 space-y-3 shadow-lg"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-periwinkle-500/30 bg-periwinkle-500/15 text-periwinkle-300">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-md border border-white/[0.1] bg-obsidian-950 px-2.5 py-1 font-mono text-[10px] font-bold text-periwinkle-300">
                  {item.badge}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white">{item.title}</h2>
              <p className="text-xs text-zinc-300 leading-relaxed">{item.body}</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 space-y-4">
        <h2 className="text-xl font-bold text-white">Data Retention, Portability &amp; Contact</h2>
        <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
          Salon owners retain 100% ownership of their client roster, pet care dossiers, and financial transaction history. Full JSON and CSV tenant archives can be exported at any time by authorized owners and managers, and GDPR/CCPA deletion requests are honored immediately via authenticated tenant administration tools.
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-zinc-300">
          <Link href="/welcome" className="font-semibold text-periwinkle-300 underline hover:text-white">
            Start 14-Day Salon Trial
          </Link>
          <Link href="/login" className="font-semibold text-periwinkle-300 underline hover:text-white">
            Staff Workspace Sign In
          </Link>
          <Link href="/portal/live" className="font-semibold text-periwinkle-300 underline hover:text-white">
            Published Salon Directory
          </Link>
        </div>
      </section>
    </div>
  );
}
