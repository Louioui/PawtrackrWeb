'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { LiveWorkspaceShell } from '@/components/LiveWorkspaceShell';
import { LegacyCompetitor } from '@/lib/live-import-export';

const SAMPLE_CSV_MOEGO = `Client Name,Client Phone,Client Email,Pet Name,Breed,Weight,Notes
Evelyn Sterling-Hayes,555-812-3390,evelyn@sterling.io,Theodore,Standard Poodle,52.4,Prefers low dryer. Pelted behind ears.
Marcus Vance-Lin,555-609-7741,mvance@foundry.vc,Bandit,Shiba Inu Mix,24.1,Sensitive paws. Use warm water only.
Chloe Benitez,555-404-1299,chloe@atelier.co,Mochi,Maltipoo,11.2,Very calm girl, loves facial scrub.`;

const SAMPLE_CSV_DAYSMART = `Customer Name,Mobile Phone,Email Address,Animal Name,Dog Breed,Weight (lbs),Special Instructions
Grant Mercer,555-409-1198,grant@mercer.law,Archie,Bernedoodle,68.0,High coat volume. Extra brushing required.
Dr. Aris Thorne,555-312-8801,thorne@uchicago.edu,Zephyr,Greyhound,71.5,Needs slip lead. Very gentle senior.`;

export default function LiveDataPortabilityPage() {
  const [activeTab, setActiveTab] = useState<'import' | 'history' | 'export' | 'copy'>('import');
  const [sourceSoftware, setSourceSoftware] = useState<LegacyCompetitor>('moego');
  const [rawCsv, setRawCsv] = useState(SAMPLE_CSV_MOEGO);
  const [dryRunResult, setDryRunResult] = useState<Record<string, unknown> | null>(null);
  const [validating, setValidating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applySuccessMsg, setApplySuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Past Import Jobs
  const [importJobs, setImportJobs] = useState<Array<Record<string, unknown>>>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [rollingBackJobId, setRollingBackJobId] = useState<string | null>(null);

  // Config Copy
  const [copyForm, setCopyForm] = useState({
    targetBusinessId: '',
    dryRun: true,
  });
  const [copyResult, setCopyResult] = useState<Record<string, unknown> | null>(null);
  const [copying, setCopying] = useState(false);

  const fetchJobs = async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch('/api/import/jobs');
      if (res.ok) {
        const data = await res.json();
        setImportJobs(Array.isArray(data.jobs) ? data.jobs : []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchJobs();
    }
  }, [activeTab]);

  const handleDryRun = async () => {
    setValidating(true);
    setErrorMsg(null);
    setDryRunResult(null);
    setApplySuccessMsg(null);

    try {
      const res = await fetch('/api/import/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: sourceSoftware,
          raw_csv: rawCsv,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Dry run validation failed');
      } else {
        setDryRunResult(data);
      }
    } catch {
      setErrorMsg('Network error validating CSV');
    } finally {
      setValidating(false);
    }
  };

  const handleApplyImport = async () => {
    if (!dryRunResult || !Array.isArray(dryRunResult.previewRows)) return;
    setApplying(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/import/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: sourceSoftware,
          file_name: `${sourceSoftware}_export.csv`,
          rows: dryRunResult.previewRows,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to apply import');
      } else {
        setApplySuccessMsg(
          `Successfully imported ${data.clients_created || 0} clients and ${data.pets_created || 0} pets with [LEGACY IMPORT: ${sourceSoftware.toUpperCase()}] provenance!`
        );
        setDryRunResult(null);
        fetchJobs();
      }
    } catch {
      setErrorMsg('Network error applying import');
    } finally {
      setApplying(false);
    }
  };

  const handleRollback = async (jobId: string) => {
    if (!confirm('Are you sure you want to rollback this import? All clients and pets created in this batch will be permanently deleted.')) {
      return;
    }

    setRollingBackJobId(jobId);
    try {
      const res = await fetch('/api/import/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`Rollback failed: ${data.error || 'Error'}`);
      } else {
        alert(`Rollback completed: Purged ${data.pets_deleted || 0} pets and ${data.clients_deleted || 0} clients.`);
        fetchJobs();
      }
    } catch {
      alert('Network error executing rollback');
    } finally {
      setRollingBackJobId(null);
    }
  };

  const handleCopyConfig = async (dryRun: boolean) => {
    setCopying(true);
    setErrorMsg(null);
    setCopyResult(null);

    try {
      // In this workspace, source is current tenant session
      // We pass the sibling salon UUID provided by user
      const res = await fetch('/api/config/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_business_id: '00000000-0000-0000-0000-000000000000', // Server resolves or validates
          target_business_id: copyForm.targetBusinessId,
          dry_run: dryRun,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Config copy failed');
      } else {
        setCopyResult(data);
      }
    } catch {
      setErrorMsg('Network error copying configuration');
    } finally {
      setCopying(false);
    }
  };

  return (
    <LiveWorkspaceShell salonName="Data Portability & Import">
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-between rounded-xl bg-gradient-to-br from-[#8B95FF]/20 to-purple-500/20 border border-[#8B95FF]/30 p-2 text-[#8B95FF]">
                <Database className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Enterprise Data Portability & Competitor Import
                  <span className="inline-flex items-center rounded-full bg-[#8B95FF]/10 px-2.5 py-0.5 text-xs font-semibold text-[#8B95FF] border border-[#8B95FF]/20">
                    WF30 • WF33 • WF34
                  </span>
                </h1>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Dry-run schema validation, duplicate detection, atomic 1-click rollback, and formula-escaped tenant archives.
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center rounded-xl bg-[#13111A] p-1 border border-white/10 text-xs">
            <button
              onClick={() => setActiveTab('import')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                activeTab === 'import' ? 'bg-[#8B95FF] text-black font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              CSV Import
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                activeTab === 'history' ? 'bg-[#8B95FF] text-black font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Rollback Ledger
            </button>
            <button
              onClick={() => setActiveTab('export')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                activeTab === 'export' ? 'bg-[#8B95FF] text-black font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Tenant Archive
            </button>
            <button
              onClick={() => setActiveTab('copy')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                activeTab === 'copy' ? 'bg-[#8B95FF] text-black font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Copy Catalog
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {applySuccessMsg && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{applySuccessMsg}</span>
          </div>
        )}

        {/* Tab 1: Competitor CSV Import */}
        {activeTab === 'import' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#13111A]/80 p-5 shadow-2xl backdrop-blur-xl space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Upload className="h-4 w-4 text-[#8B95FF]" />
                Step 1: Choose Competitor Format & Raw Data
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(['moego', 'daysmart', 'pawloyalty', 'square', 'generic_csv'] as LegacyCompetitor[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setSourceSoftware(c);
                      if (c === 'moego') setRawCsv(SAMPLE_CSV_MOEGO);
                      else if (c === 'daysmart') setRawCsv(SAMPLE_CSV_DAYSMART);
                      setDryRunResult(null);
                    }}
                    className={`rounded-xl border p-2.5 text-center text-xs transition ${
                      sourceSoftware === c
                        ? 'border-[#8B95FF] bg-[#8B95FF]/10 text-white font-semibold'
                        : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                    }`}
                  >
                    {c === 'moego'
                      ? 'MoeGo'
                      : c === 'daysmart'
                      ? 'DaySmart Pet'
                      : c === 'pawloyalty'
                      ? 'PawLoyalty'
                      : c === 'square'
                      ? 'Square'
                      : 'Generic CSV'}
                  </button>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    CSV Content ({rawCsv.split('\n').filter((l) => l.trim()).length} lines)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRawCsv(SAMPLE_CSV_MOEGO)}
                      className="text-[11px] text-[#8B95FF] hover:underline"
                    >
                      Sample MoeGo
                    </button>
                    <span className="text-zinc-600">•</span>
                    <button
                      onClick={() => setRawCsv(SAMPLE_CSV_DAYSMART)}
                      className="text-[11px] text-[#8B95FF] hover:underline"
                    >
                      Sample DaySmart
                    </button>
                  </div>
                </div>
                <textarea
                  rows={6}
                  value={rawCsv}
                  onChange={(e) => {
                    setRawCsv(e.target.value);
                    setDryRunResult(null);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-zinc-200 focus:border-[#8B95FF] focus:outline-none"
                  placeholder="Paste raw competitor CSV here..."
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleDryRun}
                  disabled={validating || !rawCsv.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#8B95FF] px-4 py-2 text-xs font-semibold text-black hover:bg-[#9FA8FF] disabled:opacity-50 transition"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {validating ? 'Validating Dry Run...' : 'Run Dry-Run Validation'}
                </button>
              </div>
            </div>

            {/* Dry Run Preview Card */}
            {dryRunResult && (
              <div className="rounded-2xl border border-white/10 bg-[#13111A]/80 p-5 shadow-2xl backdrop-blur-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-400" />
                      Dry-Run Validation Metrics
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Verify candidate records and duplicate detection before applying to live tenant database.
                    </p>
                  </div>

                  <button
                    onClick={handleApplyImport}
                    disabled={applying || Number(dryRunResult.validRowsCount) === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition shadow-lg shadow-emerald-600/20"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {applying ? 'Applying Records...' : `Commit Import (${dryRunResult.validRowsCount} Pets)`}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <span className="text-xs text-zinc-400">Total Rows</span>
                    <p className="text-xl font-bold text-white mt-1">{String(dryRunResult.totalRows)}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <span className="text-xs text-emerald-400">Valid Intake</span>
                    <p className="text-xl font-bold text-emerald-300 mt-1">{String(dryRunResult.validRowsCount)}</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <span className="text-xs text-amber-400">Duplicates Detected</span>
                    <p className="text-xl font-bold text-amber-300 mt-1">{String(dryRunResult.duplicateCount)}</p>
                  </div>
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                    <span className="text-xs text-rose-400">Syntax Errors</span>
                    <p className="text-xl font-bold text-rose-300 mt-1">{String(dryRunResult.errorCount)}</p>
                  </div>
                </div>

                {/* Candidate Rows Preview */}
                {Array.isArray(dryRunResult.previewRows) && dryRunResult.previewRows.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-zinc-300">Parsed Candidates Preview:</span>
                    <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-black/40 overflow-hidden text-xs">
                      {dryRunResult.previewRows.map((r: Record<string, unknown>, idx: number) => (
                        <div key={idx} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="font-semibold text-white">{String(r.clientName)}</span>
                            <span className="text-zinc-400"> • {String(r.clientPhone)}</span>
                            <div className="text-[11px] text-[#8B95FF] mt-0.5">
                              Pet: {String(r.petName)} ({String(r.breed || 'Mixed')}, {String(r.weightLbs)} lbs)
                            </div>
                          </div>
                          {Boolean(r.legacyNotes) && (
                            <span className="text-[11px] font-mono text-zinc-400 bg-white/5 p-1.5 rounded max-w-sm truncate border border-white/5">
                              {String(r.legacyNotes)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Rollback Ledger */}
        {activeTab === 'history' && (
          <div className="rounded-2xl border border-white/10 bg-[#13111A]/80 p-5 shadow-2xl backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <History className="h-4 w-4 text-[#8B95FF]" />
                  Import Audit History & 1-Click Rollback (WF33)
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Every batch tracks created record IDs. Rollback purges created entities without mutating existing records.
                </p>
              </div>

              <button
                onClick={fetchJobs}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#181524] px-3 py-1.5 text-xs text-zinc-300 hover:bg-[#201C30]"
              >
                <RefreshCw className={`h-3 w-3 ${loadingJobs ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>

            {loadingJobs ? (
              <div className="py-12 text-center text-xs text-zinc-500">Loading import ledger...</div>
            ) : importJobs.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-xl">
                No past imports found for this salon tenant.
              </div>
            ) : (
              <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-black/20 overflow-hidden text-xs">
                {importJobs.map((job) => {
                  const isRolledBack = job.status === 'rolled_back';
                  const jobId = String(job.id);

                  return (
                    <div key={jobId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{String(job.file_name)}</span>
                          <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-[#8B95FF] border border-white/10">
                            {String(job.source_software)}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                              isRolledBack
                                ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            }`}
                          >
                            {String(job.status).replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">
                          {String(job.valid_rows)} pets imported • {new Date(String(job.created_at)).toLocaleString()}
                        </p>
                      </div>

                      {!isRolledBack && (
                        <button
                          onClick={() => handleRollback(jobId)}
                          disabled={rollingBackJobId === jobId}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50"
                        >
                          <RotateCcw className={`h-3 w-3 ${rollingBackJobId === jobId ? 'animate-spin' : ''}`} />
                          Rollback Batch
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Tenant Archive & Scoped Exports */}
        {activeTab === 'export' && (
          <div className="rounded-2xl border border-white/10 bg-[#13111A]/80 p-5 shadow-2xl backdrop-blur-xl space-y-4">
            <div className="border-b border-white/10 pb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Download className="h-4 w-4 text-[#8B95FF]" />
                Tenant Data Archive & Scoped Exports (WF34)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Complies with GDPR/CCPA data portability. All CSV exports enforce formula-injection defense (PW075).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <FileText className="h-4 w-4 text-[#8B95FF]" /> Full JSON Archive
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Complete encrypted schema bundle including staff roster, clients, pets, appointments, and ledger.
                  </p>
                </div>
                <a
                  href="/api/export/tenant?format=json"
                  download
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#8B95FF] px-3 py-2 text-xs font-semibold text-black hover:bg-[#9FA8FF] transition"
                >
                  <Download className="h-3.5 w-3.5" /> Download JSON (.json)
                </a>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Clients & Pets CSV
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Client contact roster with verified phone, email, pet breed, and legacy notes. Formula sanitized.
                  </p>
                </div>
                <a
                  href="/api/export/tenant?format=csv&scope=clients"
                  download
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#181524] px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-[#201C30] transition"
                >
                  <Download className="h-3.5 w-3.5" /> Download CSV (.csv)
                </a>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <FileSpreadsheet className="h-4 w-4 text-cyan-400" /> Appointments History CSV
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    Historical visits with service packages, integer-cent totals, and curbside fulfillment timestamps.
                  </p>
                </div>
                <a
                  href="/api/export/tenant?format=csv&scope=visits"
                  download
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#181524] px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-[#201C30] transition"
                >
                  <Download className="h-3.5 w-3.5" /> Download CSV (.csv)
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Configuration Copying */}
        {activeTab === 'copy' && (
          <div className="rounded-2xl border border-white/10 bg-[#13111A]/80 p-5 shadow-2xl backdrop-blur-xl space-y-4">
            <div className="border-b border-white/10 pb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#8B95FF]" />
                Multi-Salon / Mobile Van Configuration Copying (WF30)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Copies service catalog, addon items, and station templates to a sibling location. Enforces zero-leakage invariant: clients and visits are never copied (PW072).
              </p>
            </div>

            <div className="max-w-xl space-y-4 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">
                  Target Sibling Salon UUID (Must share owner identity)
                </label>
                <input
                  type="text"
                  value={copyForm.targetBusinessId}
                  onChange={(e) => setCopyForm({ ...copyForm, targetBusinessId: e.target.value })}
                  placeholder="e.g. 22222222-2222-4222-8222-222222222222"
                  className="w-full rounded-xl border border-white/10 bg-black/40 p-2.5 font-mono text-xs text-white focus:border-[#8B95FF] focus:outline-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleCopyConfig(true)}
                  disabled={copying || !copyForm.targetBusinessId.trim()}
                  className="rounded-xl border border-white/10 bg-[#181524] px-4 py-2 font-semibold text-zinc-200 hover:bg-[#201C30] disabled:opacity-50 transition"
                >
                  Preview Conflict Dry-Run
                </button>
                <button
                  onClick={() => handleCopyConfig(false)}
                  disabled={copying || !copyForm.targetBusinessId.trim()}
                  className="rounded-xl bg-[#8B95FF] px-4 py-2 font-semibold text-black hover:bg-[#9FA8FF] disabled:opacity-50 transition"
                >
                  Apply Configuration Copy
                </button>
              </div>

              {copyResult && (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2 text-xs">
                  <p className="font-semibold text-white">
                    {copyResult.dry_run ? 'Dry-Run Conflict Preview' : 'Configuration Applied Successfully!'}
                  </p>
                  <pre className="font-mono text-[11px] text-zinc-300 overflow-x-auto">
                    {JSON.stringify(copyResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </LiveWorkspaceShell>
  );
}
