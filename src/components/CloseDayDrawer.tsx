'use client';

import React, { useState, useMemo } from 'react';
import { X, Lock, CheckCircle2, AlertTriangle, AlertCircle, Banknote, ShieldAlert } from 'lucide-react';
import {
  reconcileDailyRegister,
  type CloseoutVisit,
  type CloseoutTransaction,
} from '@/lib/live-communications';

export type CloseDayDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  salonDate: string;
  visits: Array<{
    id: string;
    status: string;
    client_name?: string;
    pet_name?: string;
    total_amount?: number | null;
  }>;
  transactions?: Array<{
    id: string;
    payment_method: string;
    amount: number;
    status: string;
    settlement_status: string;
  }>;
  onSuccess: (message: string) => void;
  getAccessToken: () => Promise<string | null>;
};

export default function CloseDayDrawer({
  isOpen,
  onClose,
  salonDate,
  visits,
  transactions = [],
  onSuccess,
  getAccessToken,
}: CloseDayDrawerProps) {
  const [countedCash, setCountedCash] = useState<string>('0.00');
  const [varianceReason, setVarianceReason] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map to Closeout types
  const closeoutVisits: CloseoutVisit[] = useMemo(() => {
    return visits.map((v) => ({
      id: v.id,
      status: v.status as any,
      clientName: v.client_name || 'Client',
      petName: v.pet_name || 'Pet',
      totalAmountCents: Math.round(Number(v.total_amount || 0) * 100),
    }));
  }, [visits]);

  const closeoutTxs: CloseoutTransaction[] = useMemo(() => {
    return transactions.map((t) => ({
      id: t.id,
      paymentMethod: t.payment_method as any,
      amountCents: Math.round(Number(t.amount || 0) * 100),
      status: t.status as any,
      settlementStatus: t.settlement_status as any,
    }));
  }, [transactions]);

  const countedCashCents = Math.round((parseFloat(countedCash) || 0) * 100);

  const reconciliation = useMemo(() => {
    return reconcileDailyRegister(
      salonDate,
      countedCashCents,
      varianceReason,
      closeoutVisits,
      closeoutTxs
    );
  }, [salonDate, countedCashCents, varianceReason, closeoutVisits, closeoutTxs]);

  if (!isOpen) return null;

  const handleCloseDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconciliation.canClose) {
      setError(reconciliation.blockingReason || 'Cannot close day due to unresolved invariants.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('You must be signed in.');

      const res = await fetch('/api/operations/day/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          salon_date: salonDate,
          counted_cash_cents: countedCashCents,
          variance_reason: varianceReason || undefined,
          closeout_summary: {
            total_visits: visits.length,
            unresolved_count: reconciliation.unresolvedVisits.length,
            expected_cash_cents: reconciliation.expectedCashCents,
            counted_cash_cents: countedCashCents,
            variance_cents: reconciliation.varianceCents,
          },
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to close salon day.');
      }

      onSuccess(`Register day ${salonDate} successfully locked and closed!`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Closeout failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 p-4 backdrop-blur-sm">
      <div className="glass-card relative max-h-[92vh] w-full max-w-xl overflow-y-auto p-5 sm:p-6 text-zinc-100 border border-white/15">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">
              End-of-Day Register Closeout (WF08)
            </h3>
            <p className="text-xs text-zinc-400">
              Salon Date: {salonDate} · Drawer Count & Ledger Lock
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleCloseDay} className="mt-4 space-y-4 text-xs">
          {/* Unresolved visits warning */}
          {reconciliation.unresolvedVisits.length > 0 ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {reconciliation.unresolvedVisits.length} Unresolved Visit(s) on Schedule
                </span>
              </div>
              <p className="text-zinc-300">
                All visits for {salonDate} must reach a terminal state (completed, released unpaid, partly completed, cancelled, or no-show) before the register day can be locked.
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-amber-300">
                {reconciliation.unresolvedVisits.slice(0, 5).map((v) => (
                  <li key={v.id}>
                    {v.petName} ({v.clientName}) — Current status: <span className="font-mono">{v.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>All scheduled visits are resolved and eligible for day closeout.</span>
            </div>
          )}

          {/* Cash Drawer Reconciliation Section */}
          <div className="rounded-xl border border-white/10 bg-obsidian-900/60 p-4 space-y-3">
            <div className="flex items-center gap-2 font-bold text-white text-sm">
              <Banknote className="h-4 w-4 text-emerald-400" />
              <span>Cash Drawer Balancing</span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-lg border border-white/10 bg-obsidian-950 p-3">
                <span className="text-zinc-400 block text-xs">Expected Cash (Settled)</span>
                <span className="text-lg font-mono font-bold text-white">
                  ${(reconciliation.expectedCashCents / 100).toFixed(2)}
                </span>
              </div>

              <div className="rounded-lg border border-white/10 bg-obsidian-950 p-3">
                <span className="text-zinc-400 block text-xs">Drawer Variance</span>
                <span
                  className={`text-lg font-mono font-bold ${
                    reconciliation.hasVariance
                      ? reconciliation.varianceCents > 0
                        ? 'text-cyan-400'
                        : 'text-rose-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {reconciliation.varianceCents > 0 ? '+' : ''}
                  ${(reconciliation.varianceCents / 100).toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Counted Physical Cash in Drawer ($):
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-obsidian-950 p-2.5 font-mono text-sm text-white focus:border-periwinkle-400"
                required
              />
            </div>

            {/* Variance Reason field if variance != 0 */}
            {reconciliation.hasVariance && (
              <div className="pt-2 border-t border-white/10">
                <label className="block font-semibold uppercase tracking-wider text-amber-300 mb-1">
                  Mandatory Variance Explanation (WF08):
                </label>
                <textarea
                  rows={2}
                  value={varianceReason}
                  onChange={(e) => setVarianceReason(e.target.value)}
                  placeholder="e.g. $10 overage: client left cash tip outside register; drawer counted twice."
                  className="w-full rounded-lg border border-amber-500/40 bg-obsidian-950 p-2.5 text-xs text-white focus:border-amber-400"
                  required
                />
                {!reconciliation.hasValidVarianceReason && (
                  <p className="mt-1 text-xs text-rose-300">
                    A minimum 5-character explanation note is legally required when variance is present.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-zinc-400 text-xs">
            ⚠️ <strong>Legal Invariant:</strong> Once confirmed, this day's financial ledger will be permanently locked from retroactive edits or deletions.
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || !reconciliation.canClose}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-obsidian-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              <Lock className="h-3.5 w-3.5" /> Sign Off & Lock Salon Day (WF08)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
