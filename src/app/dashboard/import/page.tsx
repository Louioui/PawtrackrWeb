'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  Upload,
  Zap,
} from 'lucide-react';
import {
  BUSINESSES,
  TENANT_BESPOKE_ID,
} from '@/lib/mock-tenant-data';
import { BehaviorTag, Client, Pet, Visit } from '@/types/database';
import { BehaviorAuraBadge } from '@/components/BehaviorAuraBadge';
import {
  loadUniversalStore,
  saveUniversalStore,
} from '@/lib/realtime-store';

type LegacyCompetitor = 'MoeGo' | 'DaySmart Pet' | 'PawLoyalty' | 'Square';

interface LegacyImportRow {
  externalId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  petName: string;
  breed: string;
  weightLbs: number;
  ageYears: number;
  legacyNotes: string;
  lifetimeSpend: number;
}

const SAMPLE_COMPETITOR_EXPORT: Record<LegacyCompetitor, LegacyImportRow[]> = {
  MoeGo: [
    {
      externalId: 'MG-9921',
      clientName: 'Evelyn Sterling-Hayes',
      clientPhone: '(415) 812-3390',
      clientEmail: 'evelyn.hayes@sterling.io',
      petName: 'Theodore',
      breed: 'Standard Poodle',
      weightLbs: 52.4,
      ageYears: 4,
      legacyNotes:
        'Pelted behind ears and under harness. Very sweet boy, prefers low dryer.',
      lifetimeSpend: 1420.0,
    },
    {
      externalId: 'MG-9922',
      clientName: 'Marcus Vance-Lin',
      clientPhone: '(415) 609-7741',
      clientEmail: 'mvance@foundry.vc',
      petName: 'Bandit',
      breed: 'Shiba Inu Mix',
      weightLbs: 24.0,
      ageYears: 5,
      legacyNotes:
        'CAUTION: Snaps at nail clippers! Must use basket muzzle for front dewclaws. Dryer anxious.',
      lifetimeSpend: 890.0,
    },
    {
      externalId: 'MG-9923',
      clientName: 'Clara & Jonas Berg',
      clientPhone: '(650) 331-8820',
      clientEmail: 'clara.berg@stanford.edu',
      petName: 'Pippa',
      breed: 'Cavalier King Charles Spaniel',
      weightLbs: 15.2,
      ageYears: 11,
      legacyNotes:
        '11yo senior girl with mild Grade II heart murmur. Use belly sling and gentle warm rinse.',
      lifetimeSpend: 2150.0,
    },
  ],
  'DaySmart Pet': [
    {
      externalId: 'DS-4401',
      clientName: 'Lucas & Maya Chen',
      clientPhone: '(415) 902-6612',
      clientEmail: 'lucas.chen@hey.com',
      petName: 'Archie',
      breed: 'F1 Mini Bernedoodle',
      weightLbs: 31.8,
      ageYears: 2,
      legacyNotes:
        'Heavy matted coat on legs from beach sand. Cage reactive if near barking dogs.',
      lifetimeSpend: 1180.0,
    },
  ],
  PawLoyalty: [
    {
      externalId: 'PL-7710',
      clientName: 'Nadia Rostova',
      clientPhone: '(415) 449-0182',
      clientEmail: 'nadia@rostovadesign.com',
      petName: 'Bijou',
      breed: 'Bichon Frise',
      weightLbs: 13.5,
      ageYears: 13,
      legacyNotes:
        '13yo senior sanctuary dog. Extra care needed around hind legs.',
      lifetimeSpend: 3120.0,
    },
  ],
  Square: [
    {
      externalId: 'SQ-1102',
      clientName: 'Owen Gallagher',
      clientPhone: '(415) 712-9901',
      clientEmail: 'owen@gallagher.co',
      petName: 'Buster',
      breed: 'Wheaten Terrier',
      weightLbs: 36.0,
      ageYears: 3,
      legacyNotes: 'Matted beard and anxious around high-velocity dryer.',
      lifetimeSpend: 740.0,
    },
  ],
};

/**
 * Automatically scans unstructured legacy notes from MoeGo / DaySmart
 * and maps them into structured Pawtrackr Behavior Auras.
 */
function inferBehaviorAurasFromLegacyNotes(
  notes: string,
  ageYears: number
): BehaviorTag[] {
  const lower = notes.toLowerCase();
  const tags: Set<BehaviorTag> = new Set();

  if (
    lower.includes('snap') ||
    lower.includes('bite') ||
    lower.includes('muzzle') ||
    lower.includes('aggressive')
  ) {
    tags.add('biter');
  }
  if (
    lower.includes('mat') ||
    lower.includes('pelt') ||
    lower.includes('tangle')
  ) {
    tags.add('matted');
  }
  if (lower.includes('senior') || ageYears >= 10) {
    tags.add('senior');
  }
  if (lower.includes('murmur') || lower.includes('heart')) {
    tags.add('heart_murmur');
  }
  if (
    lower.includes('anxious') ||
    lower.includes('nervous') ||
    lower.includes('dryer')
  ) {
    tags.add('anxious');
  }
  if (lower.includes('cage')) {
    tags.add('cage_reactive');
  }
  if (tags.size === 0 || lower.includes('extra care')) {
    tags.add('extra_care');
  }

  return Array.from(tags);
}

/**
 * Parses an uploaded CSV or JSON export from MoeGo, DaySmart Pet, PawLoyalty, or Square.
 */
function parseUploadedLegacyFile(rawText: string): LegacyImportRow[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // JSON format support
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => ({
          externalId: String(item.externalId || item.id || `IMP-${idx + 1}`),
          clientName: String(item.clientName || item.client_name || 'Imported Client'),
          clientPhone: String(item.clientPhone || item.phone || '(415) 555-0100'),
          clientEmail: String(item.clientEmail || item.email || 'client@pawtrackr.live'),
          petName: String(item.petName || item.pet_name || 'Imported Dog'),
          breed: String(item.breed || 'Mixed Breed'),
          weightLbs: Number(item.weightLbs || item.weight || 25),
          ageYears: Number(item.ageYears || item.age || 3),
          legacyNotes: String(item.legacyNotes || item.notes || ''),
          lifetimeSpend: Number(item.lifetimeSpend || 250),
        }));
      }
    } catch {
      // Fall back to CSV parser below
    }
  }

  // CSV format: clientName,clientPhone,clientEmail,petName,breed,weightLbs,ageYears,legacyNotes
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const dataLines =
    lines[0]?.toLowerCase().includes('client') ||
    lines[0]?.toLowerCase().includes('pet')
      ? lines.slice(1)
      : lines;

  return dataLines.map((line, idx) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    return {
      externalId: `CSV-${idx + 101}`,
      clientName: cols[0] || `Client #${idx + 1}`,
      clientPhone: cols[1] || '(415) 555-0199',
      clientEmail: cols[2] || `client${idx + 1}@pawtrackr.live`,
      petName: cols[3] || `Pet #${idx + 1}`,
      breed: cols[4] || 'Mixed Breed',
      weightLbs: parseFloat(cols[5]) || 24.0,
      ageYears: parseInt(cols[6], 10) || 4,
      legacyNotes: cols[7] || 'Imported from CSV file.',
      lifetimeSpend: parseFloat(cols[8]) || 300.0,
    };
  });
}

export default function CompetitorMigrationImporterPage() {
  const [selectedCompetitor, setSelectedCompetitor] =
    useState<LegacyCompetitor>('MoeGo');
  const [activeBusinessId] = useState<string>(TENANT_BESPOKE_ID);
  const [uploadedRows, setUploadedRows] = useState<LegacyImportRow[] | null>(
    null
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const activeBusiness =
    BUSINESSES.find((b) => b.id === activeBusinessId) ?? BUSINESSES[0];

  const previewRows = useMemo(() => {
    const baseRows =
      uploadedRows && uploadedRows.length > 0
        ? uploadedRows
        : SAMPLE_COMPETITOR_EXPORT[selectedCompetitor] ??
          SAMPLE_COMPETITOR_EXPORT.MoeGo;
    return baseRows.map((row) => ({
      ...row,
      inferredTags: inferBehaviorAurasFromLegacyNotes(
        row.legacyNotes,
        row.ageYears
      ),
    }));
  }, [selectedCompetitor, uploadedRows]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseUploadedLegacyFile(String(reader.result || ''));
      if (parsed.length > 0) {
        setUploadedRows(parsed);
        setImportedCount(null);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteMigration = () => {
    const store = loadUniversalStore();
    const newClients: Client[] = [];
    const newPets: Pet[] = [];
    const newVisits: Visit[] = [];

    previewRows.forEach((row, idx) => {
      const clientId = `cl-mig-${Date.now().toString(36)}-${idx}`;
      const petId = `pet-mig-${Date.now().toString(36)}-${idx}`;
      const visitId = `vis-mig-${Date.now().toString(36)}-${idx}`;

      newClients.push({
        id: clientId,
        business_id: activeBusiness.id,
        name: row.clientName,
        phone: row.clientPhone,
        email: row.clientEmail,
        address: activeBusiness.city_state,
        loyalty_points: Math.round(row.lifetimeSpend * 0.5),
        lifetime_spend: row.lifetimeSpend,
        created_at: new Date().toISOString(),
      });

      newPets.push({
        id: petId,
        business_id: activeBusiness.id,
        client_id: clientId,
        name: row.petName,
        species: 'Canine',
        breed: row.breed,
        weight_lbs: row.weightLbs,
        age_years: row.ageYears,
        coat_type: 'Migrated Coat Profile',
        rabies_verified: true,
        behavior_notes: `[Migrated from ${selectedCompetitor} #${row.externalId}] ${row.legacyNotes}`,
        behavior_tags: row.inferredTags,
        avatar_url:
          'https://images.unsplash.com/photo-1591769225440-811ad7d6eab3?auto=format&fit=crop&w=600&q=80',
        weight_history: [{ date: '2026-11-07', weight_lbs: row.weightLbs }],
        photo_gallery: [],
      });

      newVisits.push({
        id: visitId,
        business_id: activeBusiness.id,
        client_id: clientId,
        pet_id: petId,
        staff_id: 'st-101',
        status: 'booked',
        booking_source: 'online',
        package_id: 'pkg-couture-scissor',
        package_name: 'Full Couture Breed Scissoring',
        base_price: 135.0,
        addon_ids: [],
        total_amount: 135.0,
        scheduled_time: '2026-11-07T14:30:00-08:00',
        time_label: '02:30 PM (Migrated)',
        duration_minutes: 120,
        bay_or_van: 'Migrated VIP Slot',
        report_card_notes: row.legacyNotes,
        weight_logged_lbs: row.weightLbs,
        created_at: new Date().toISOString(),
      });
    });

    saveUniversalStore({
      clients: [...newClients, ...store.clients],
      pets: [...newPets, ...store.pets],
      visits: [...newVisits, ...store.visits],
    });

    setImportedCount(previewRows.length);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {/* Top Sub-nav */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-periwinkle-500/40"
        >
          <ArrowLeft className="h-4 w-4 text-periwinkle-400" />
          Back to Salon Command Center
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/import/live"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
          >
            <Database className="h-3.5 w-3.5 text-emerald-400" />
            Launch Live Data Portability Console →
          </Link>
          <Link
            href="/dashboard/analytics"
            className="rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
          >
            Executive Revenue Analytics →
          </Link>
        </div>
      </div>

      {/* Live Portability & Migration Engine Banner */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-obsidian-900 to-obsidian-900 p-4 shadow-glass">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <Database className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              Data Portability & Zero-Downtime Migration Engine
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                WF30 • WF33 • WF34
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Validated competitor CSV imports with audit rollback, full multi-tenant export archives, and multi-location catalog cloning.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/import/live"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-obsidian-950 shadow-emerald-glow hover:bg-emerald-400 transition-colors shrink-0"
        >
          <span>Open Live Portability Console</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Header */}
      <div className="glass-card p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-periwinkle-400">
              <Database className="h-4 w-4" />
              <span>Zero-Downtime Legacy Competitor Importer</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white">
              1-Click Migration from MoeGo, DaySmart Pet & PawLoyalty
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Automatically converts legacy plain-text grooming notes into
              luminous <strong className="text-white">Behavior Auras</strong>{' '}
              and partitions every record under your isolated{' '}
              <code className="text-emerald-300">business_id</code>.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/[0.08] bg-obsidian-900 p-1.5">
            {(
              [
                'MoeGo',
                'DaySmart Pet',
                'PawLoyalty',
                'Square',
              ] as LegacyCompetitor[]
            ).map((comp) => (
              <button
                key={comp}
                type="button"
                onClick={() => {
                  setSelectedCompetitor(comp);
                  setUploadedRows(null);
                  setUploadedFileName(null);
                  setImportedCount(null);
                }}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  selectedCompetitor === comp
                    ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                From {comp}
              </button>
            ))}
          </div>
        </div>

        {/* File Dropzone / Instant Sample Selector */}
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-white/[0.08] pt-6 sm:grid-cols-2">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-periwinkle-500/40 bg-obsidian-900/70 p-6 text-center transition hover:border-periwinkle-400 hover:bg-obsidian-900">
            <Upload className="h-6 w-6 text-periwinkle-400" />
            <span className="mt-2 text-xs font-bold text-white">
              {uploadedFileName
                ? `Loaded File: ${uploadedFileName}`
                : `Upload ${selectedCompetitor} CSV / JSON Export File`}
            </span>
            <span className="mt-0.5 text-[11px] text-zinc-400">
              Standard browser file picker — works on any desktop, tablet, or
              phone
            </span>
            <input
              type="file"
              accept=".csv,.json,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-5">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-300">
                  Auto-Aura NLP Scanner Active
                </span>
                <span className="font-mono text-[11px] text-zinc-400">
                  Target: {activeBusiness.name}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-zinc-300 leading-relaxed">
                Scans legacy notes for keywords (
                <code className="text-rose-300">&ldquo;snaps&rdquo;</code>,{' '}
                <code className="text-rose-300">&ldquo;muzzle&rdquo;</code>,{' '}
                <code className="text-amber-300">&ldquo;pelted&rdquo;</code>,{' '}
                <code className="text-pink-300">&ldquo;murmur&rdquo;</code>) and
                assigns safety flags automatically.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExecuteMigration}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400"
            >
              <Zap className="h-4 w-4" />
              Import {previewRows.length} {selectedCompetitor} Records into
              Live Search Index
            </button>
          </div>
        </div>
      </div>

      {importedCount !== null && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-500/45 bg-emerald-500/15 px-6 py-4 text-xs text-emerald-200 shadow-emerald-glow">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span>
              Successfully migrated <strong>{importedCount}</strong> client &
              pet profiles from <strong>{selectedCompetitor}</strong> into{' '}
              <strong>{activeBusiness.name}</strong>! Try searching{' '}
              <code className="text-white">&ldquo;Theodore&rdquo;</code> or{' '}
              <code className="text-white">&ldquo;Bandit&rdquo;</code> in the
              Command Center.
            </span>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 font-bold text-obsidian-950"
          >
            Open Command Center <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Preview Table of Mapped Records */}
      <div className="mt-8 space-y-3">
        <h2 className="text-lg font-bold text-white">
          Live Migration Preview ({selectedCompetitor} Schema → Pawtrackr RLS
          Schema)
        </h2>

        {previewRows.map((row) => (
          <div
            key={row.externalId}
            className="glass-card p-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center"
          >
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-periwinkle-300">
                  {row.externalId}
                </span>
                <span className="text-base font-extrabold text-white">
                  {row.petName} ({row.breed})
                </span>
                <span className="text-xs text-zinc-400">
                  • {row.weightLbs} lbs • {row.ageYears} yrs
                </span>
              </div>

              <div className="text-xs text-zinc-300">
                Parent: <strong className="text-white">{row.clientName}</strong>{' '}
                • <span className="font-mono">{row.clientPhone}</span> •{' '}
                <span>{row.clientEmail}</span>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-obsidian-900/75 px-3 py-2 text-xs text-zinc-300">
                <span className="font-semibold text-zinc-400">
                  Raw {selectedCompetitor} Note:
                </span>{' '}
                &ldquo;{row.legacyNotes}&rdquo;
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 lg:items-end shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Auto-Generated Pawtrackr Auras
              </span>
              <div className="flex flex-wrap gap-1.5">
                {row.inferredTags.map((tag) => (
                  <BehaviorAuraBadge key={tag} tag={tag} size="xs" />
                ))}
              </div>
              <span className="font-mono text-xs text-zinc-400">
                Migrated LTV: ${row.lifetimeSpend.toFixed(2)} (
                {Math.round(row.lifetimeSpend * 0.5)} Loyalty Pts)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
