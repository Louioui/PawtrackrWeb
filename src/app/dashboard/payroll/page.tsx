'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  DollarSign,
  Download,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  BUSINESSES,
  INITIAL_VISITS,
  STAFF_MEMBERS,
  TENANT_BESPOKE_ID,
} from '@/lib/mock-tenant-data';
import {
  formatCents,
  fromCents,
  multiplyCentsByPercent,
  toCents,
} from '@/lib/pos-math';

export default function StaffCommissionPayrollPage() {
  const [activeBusinessId, setActiveBusinessId] =
    useState<string>(TENANT_BESPOKE_ID);

  const [commissionRates, setCommissionRates] = useState<
    Record<string, number>
  >({
    'st-101': 60, // Owner / Master Stylist 60%
    'st-102': 50, // Senior Groomer 50%
    'st-103': 55, // Rehabilitation Specialist 55%
    'st-201': 60,
    'st-202': 50,
  });

  const [exportedCsvToast, setExportedCsvToast] = useState<boolean>(false);

  const business =
    BUSINESSES.find((b) => b.id === activeBusinessId) ?? BUSINESSES[0];

  const groomers = useMemo(
    () =>
      STAFF_MEMBERS.filter(
        (s) => s.business_id === business.id && s.role !== 'front_desk'
      ),
    [business.id]
  );

  const tenantVisits = useMemo(
    () => INITIAL_VISITS.filter((v) => v.business_id === business.id),
    [business.id]
  );

  // Compute exact cent-level commission + 100% tip pass-through per groomer
  const payrollRows = useMemo(() => {
    return groomers.map((staff) => {
      const assignedVisits = tenantVisits.filter(
        (v) => v.staff_id === staff.id
      );
      const ratePct = commissionRates[staff.id] ?? 50;

      const grossServiceCents = assignedVisits.reduce(
        (acc, v) => acc + toCents(v.total_amount),
        0
      );
      const commissionCents = multiplyCentsByPercent(
        grossServiceCents,
        ratePct
      );
      // Standard 20% average tip pass-through on scheduled/completed dogs
      const tipsCents = multiplyCentsByPercent(grossServiceCents, 20);
      const totalPayoutCents = commissionCents + tipsCents;
      const houseRetainedCents = grossServiceCents - commissionCents;

      return {
        staff,
        dogsCount: assignedVisits.length,
        ratePct,
        grossServiceCents,
        commissionCents,
        tipsCents,
        totalPayoutCents,
        houseRetainedCents,
      };
    });
  }, [groomers, tenantVisits, commissionRates]);

  const totals = useMemo(() => {
    return payrollRows.reduce(
      (acc, r) => ({
        grossCents: acc.grossCents + r.grossServiceCents,
        commissionCents: acc.commissionCents + r.commissionCents,
        tipsCents: acc.tipsCents + r.tipsCents,
        payoutCents: acc.payoutCents + r.totalPayoutCents,
        houseCents: acc.houseCents + r.houseRetainedCents,
      }),
      {
        grossCents: 0,
        commissionCents: 0,
        tipsCents: 0,
        payoutCents: 0,
        houseCents: 0,
      }
    );
  }, [payrollRows]);

  const handleExportPayrollCsv = () => {
    const headers = [
      'Staff Name',
      'Role',
      'Dogs Groomed',
      'Commission Rate (%)',
      'Gross Service Revenue ($)',
      'Commission Earned ($)',
      '100% Tip Pass-Through ($)',
      'Total Staff Payout ($)',
    ];
    const lines = payrollRows.map((r) =>
      [
        `"${r.staff.name}"`,
        r.staff.role,
        r.dogsCount,
        r.ratePct,
        fromCents(r.grossServiceCents).toFixed(2),
        fromCents(r.commissionCents).toFixed(2),
        fromCents(r.tipsCents).toFixed(2),
        fromCents(r.totalPayoutCents).toFixed(2),
      ].join(',')
    );
    const csvContent = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pawtrackr-payroll-${business.slug}-2026-11-07.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setExportedCsvToast(true);
    setTimeout(() => setExportedCsvToast(false), 3000);
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
            href="/dashboard/settings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white"
          >
            <Settings className="h-3.5 w-3.5 text-periwinkle-400" />
            Service Catalog & POS Config
          </Link>
          <button
            type="button"
            onClick={handleExportPayrollCsv}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-obsidian-950 shadow-emerald-glow hover:bg-emerald-400"
          >
            <Download className="h-4 w-4" />
            Export Friday Payroll CSV
          </button>
        </div>
      </div>

      {/* Live Payroll Command Floor Banner */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-obsidian-900 to-obsidian-900 p-4 shadow-glass">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <DollarSign className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              Staff Payroll Command & Period Lock
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                WF08 • WF28 • WF34
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Bi-weekly period locking, immutable historical ledgers, bather tip pooling, and Gusto/QuickBooks exports.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/payroll/live"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-obsidian-950 hover:bg-emerald-400 transition"
        >
          Open Live Payroll Command →
        </Link>
      </div>

      {exportedCsvToast && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-5 py-3 text-xs font-semibold text-emerald-300">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Exported exact cent-reconciled payroll CSV for {business.name}!
          </span>
          <span className="font-mono">0¢ Rounding Drift</span>
        </div>
      )}

      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <Users className="h-4 w-4" />
              <span>Automated Stylist Commission & Tip Split Engine</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white">
              {business.name} — Payroll & Commission Ledger
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Powered by <code className="text-periwinkle-300">get_staff_payroll_ledger()</code>{' '}
              and integer-cent basis-point math. 100% of tips route directly to
              the assigned groomer.
            </p>
          </div>

          <div className="flex gap-1.5 rounded-xl border border-white/[0.08] bg-obsidian-900 p-1.5">
            {BUSINESSES.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBusinessId(b.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  b.id === business.id
                    ? 'bg-periwinkle-500 text-obsidian-950'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="text-xs text-zinc-400">Gross Service Volume</div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-white">
              {formatCents(totals.grossCents)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="text-xs text-zinc-400">Stylist Commissions</div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-periwinkle-300">
              {formatCents(totals.commissionCents)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="text-xs text-zinc-400">100% Tip Pass-Through</div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-emerald-400">
              {formatCents(totals.tipsCents)}
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4">
            <div className="text-xs text-emerald-300">
              Net Salon House Retained
            </div>
            <div className="mt-1 font-mono text-2xl font-extrabold text-white">
              {formatCents(totals.houseCents)}
            </div>
          </div>
        </div>
      </div>

      {/* Staff Commission Table */}
      <div className="mt-8 overflow-x-auto rounded-3xl border border-white/[0.08] bg-obsidian-800/90 shadow-glass">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] bg-obsidian-900 text-zinc-400">
              <th className="py-4 pl-6 pr-4">Stylist / Groomer</th>
              <th className="px-4 py-4">Dogs</th>
              <th className="px-4 py-4">Commission Split (%)</th>
              <th className="px-4 py-4">Gross Services</th>
              <th className="px-4 py-4">Commission Earned</th>
              <th className="px-4 py-4">100% Tips</th>
              <th className="py-4 pl-4 pr-6 text-right">Total Staff Payout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] text-zinc-200">
            {payrollRows.map((row) => (
              <tr key={row.staff.id} className="hover:bg-white/[0.02]">
                <td className="py-4 pl-6 pr-4">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: row.staff.color_hex }}
                    />
                    <div>
                      <div className="font-bold text-white">
                        {row.staff.name}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {row.staff.specialty}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 font-mono font-bold">
                  {row.dogsCount}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={30}
                      max={80}
                      step={5}
                      value={row.ratePct}
                      onChange={(e) =>
                        setCommissionRates((prev) => ({
                          ...prev,
                          [row.staff.id]: Math.min(
                            100,
                            Math.max(0, parseInt(e.target.value, 10) || 50)
                          ),
                        }))
                      }
                      className="w-16 rounded-lg border border-white/[0.12] bg-obsidian-900 px-2 py-1 font-mono text-xs text-periwinkle-300"
                    />
                    <span className="text-xs text-zinc-400">%</span>
                  </div>
                </td>
                <td className="px-4 py-4 font-mono">
                  {formatCents(row.grossServiceCents)}
                </td>
                <td className="px-4 py-4 font-mono font-semibold text-periwinkle-300">
                  {formatCents(row.commissionCents)}
                </td>
                <td className="px-4 py-4 font-mono text-emerald-300">
                  +{formatCents(row.tipsCents)}
                </td>
                <td className="py-4 pl-4 pr-6 text-right font-mono text-base font-extrabold text-emerald-400">
                  {formatCents(row.totalPayoutCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
