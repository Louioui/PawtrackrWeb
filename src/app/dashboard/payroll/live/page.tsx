'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  Lock,
  Unlock,
  Download,
  CheckCircle2,
  AlertTriangle,
  Users,
  Percent,
  Calendar,
  ShieldCheck,
  FileSpreadsheet,
  Receipt,
  ArrowRight,
  Clock,
  X,
  TrendingUp,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import LiveWorkspaceShell from '@/components/LiveWorkspaceShell';
import { formatCents, fromCents, toCents } from '@/lib/pos-math';
import { LiveStaffRole } from '@/lib/workflow-context';
import {
  PayrollPeriodStatus,
  TipPoolMode,
  StaffPayrollLine,
  PayrollPeriodSummary,
  DEFAULT_COMMISSION_RATES,
  DEFAULT_PROGRESSIVE_COMMISSION_TIERS,
  calculateTieredCommissionCents,
} from '@/lib/live-payroll';

type PayrollPeriodRow = {
  id: string;
  business_id: string;
  period_start: string;
  period_end: string;
  status: 'open' | 'locked' | 'exported';
  tip_pool_mode: 'direct' | 'bather_split';
  bather_pool_pct: number;
  total_gross_cents: number;
  total_commission_cents: number;
  total_tips_cents: number;
  total_adjustments_cents: number;
  total_payout_cents: number;
  total_house_cents: number;
  locked_at: string | null;
  locked_by_staff_id: string | null;
  notes: string | null;
  created_at: string;
};

export default function LivePayrollPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [phase, setPhase] = useState<'checking' | 'ready' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [statusNotice, setStatusNotice] = useState('');

  // Salon identity & session info
  const [salonName, setSalonName] = useState('Pawtrackr Salon');
  const [salonSlug, setSalonSlug] = useState('');
  const [role, setRole] = useState<LiveStaffRole>('owner');
  const [operatingModel, setOperatingModel] = useState<'salon' | 'mobile_van' | 'hybrid'>('salon');
  const [bookingStatus, setBookingStatus] = useState<'draft' | 'published' | 'paused'>('draft');

  // Date range & controls
  const now = useMemo(() => new Date(), []);
  const defaultEnd = useMemo(() => now.toISOString().slice(0, 10), [now]);
  const defaultStart = useMemo(
    () => new Date(now.getTime() - 13 * 86400000).toISOString().slice(0, 10),
    [now]
  );

  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [tipPoolMode, setTipPoolMode] = useState<TipPoolMode>('direct');
  const [batherPoolPct, setBatherPoolPct] = useState<number>(15.0);

  // Loaded payroll state
  const [summary, setSummary] = useState<PayrollPeriodSummary | null>(null);
  const [periods, setPeriods] = useState<PayrollPeriodRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Lock period modal
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [lockNotes, setLockNotes] = useState('');
  const [isLocking, setIsLocking] = useState(false);

  // Auth bootstrap
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setPhase('error');
      setMessage('Supabase client is not configured.');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setPhase('error');
      setMessage('Supabase client failed to initialize.');
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSignedIn(true);
        fetchSalonAndData(session.access_token);
      } else {
        setPhase('ready');
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSignedIn(true);
        fetchSalonAndData(session.access_token);
      } else {
        setSignedIn(false);
        setPhase('ready');
      }
    });

    return () => subscription.unsubscribe();
  }, [defaultStart, defaultEnd]);

  const fetchSalonAndData = useCallback(
    async (token: string, pStart = periodStart, pEnd = periodEnd, mode = tipPoolMode, pct = batherPoolPct) => {
      setIsLoading(true);
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        // 1. Fetch user membership & salon details
        const {
          data: { user },
        } = await supabase.auth.getUser(token);
        if (user) {
          const { data: staff } = await supabase
            .from('staff_members')
            .select('role, business_id')
            .eq('auth_user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

          if (staff) {
            setRole(staff.role as LiveStaffRole);
            const { data: business } = await supabase
              .from('businesses')
              .select('name, slug, operating_model, booking_status')
              .eq('id', staff.business_id)
              .maybeSingle();

            if (business) {
              setSalonName(business.name);
              setSalonSlug(business.slug);
              setOperatingModel(business.operating_model ?? 'salon');
              setBookingStatus(business.booking_status ?? 'draft');
            }
          }
        }

        // 2. Fetch live payroll summary & past periods from API
        const res = await fetch(
          `/api/payroll?start_date=${pStart}&end_date=${pEnd}&tip_pool_mode=${mode}&bather_pool_pct=${pct}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to load payroll ledger');
        }

        const json = await res.json();
        const rawSummary = json.summary;

        if (rawSummary) {
          const rawLines = Array.isArray(rawSummary.staff_breakdown) ? rawSummary.staff_breakdown : [];
          const staffLines: StaffPayrollLine[] = rawLines.map((s: Record<string, unknown>) => ({
            staffId: String(s.staff_id || ''),
            staffName: String(s.staff_name || 'Staff Member'),
            role: String(s.role || 'groomer'),
            commissionRatePct: Number(s.commission_rate_pct || 0),
            serviceCount: Number(s.service_count || 0),
            grossServiceCents: Number(s.gross_cents || 0),
            commissionCents: Number(s.commission_cents || 0),
            directTipsCents: Number(s.direct_tips_cents || 0),
            pooledTipsCents: Number(s.pooled_tips_cents || 0),
            totalTipsCents: Number(s.total_tips_cents || 0),
            adjustmentsCents: Number(s.adjustments_cents || 0),
            netPayoutCents: Number(s.payout_cents || 0),
          }));

          setSummary({
            periodStart: String(rawSummary.period_start || pStart),
            periodEnd: String(rawSummary.period_end || pEnd),
            status: rawSummary.is_locked ? 'locked' : 'open',
            tipPoolMode: mode,
            batherPoolPct: pct,
            staffLines,
            totalGrossCents: Number(rawSummary.total_gross_cents || 0),
            totalCommissionCents: Number(rawSummary.total_commission_cents || 0),
            totalTipsCents: Number(rawSummary.total_tips_cents || 0),
            totalAdjustmentsCents: Number(rawSummary.total_adjustments_cents || 0),
            totalPayoutCents: Number(rawSummary.total_payout_cents || 0),
            totalHouseRetainedCents: Number(rawSummary.total_house_cents || 0),
          });
        }

        if (Array.isArray(json.periods)) {
          setPeriods(json.periods);
        }

        setPhase('ready');
      } catch (err: unknown) {
        console.error('Payroll fetch error:', err);
        setPhase('error');
        setMessage(err instanceof Error ? err.message : 'Failed to load payroll data.');
      } finally {
        setIsLoading(false);
      }
    },
    [periodStart, periodEnd, tipPoolMode, batherPoolPct]
  );

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setPhase('checking');
    setMessage('');
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setPhase('error');
      setMessage(error.message);
    }
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSignedIn(false);
    setSummary(null);
  };

  const handleFilterApply = () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchSalonAndData(session.access_token, periodStart, periodEnd, tipPoolMode, batherPoolPct);
      }
    });
  };

  const handleLockPeriod = async () => {
    setIsLocking(true);
    setStatusNotice('');
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/payroll/period/lock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          period_start: periodStart,
          period_end: periodEnd,
          tip_pool_mode: tipPoolMode,
          bather_pool_pct: batherPoolPct,
          notes: lockNotes || 'Bi-weekly closeout lock',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to lock pay period');
      }

      setLockModalOpen(false);
      setStatusNotice(`Pay period ${periodStart} to ${periodEnd} successfully locked (WF08).`);
      await fetchSalonAndData(session.access_token, periodStart, periodEnd, tipPoolMode, batherPoolPct);
    } catch (err: unknown) {
      setStatusNotice(err instanceof Error ? err.message : 'Error locking pay period');
    } finally {
      setIsLocking(false);
    }
  };

  const handleExport = (format: 'gusto' | 'quickbooks') => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      const url = `/api/payroll/export?format=${format}&start_date=${periodStart}&end_date=${periodEnd}&tip_pool_mode=${tipPoolMode}&bather_pool_pct=${batherPoolPct}`;
      window.open(url, '_blank');
      setStatusNotice(`Exported ${format.toUpperCase()} payroll CSV for ${periodStart} to ${periodEnd} (WF34).`);
    });
  };

  // Sign-in view
  if (!signedIn) {
    return (
      <main className="min-h-screen bg-[#0B090E] text-white flex flex-col justify-center items-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#14121A]/80 p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#8B95FF]/10 text-[#8B95FF] border border-[#8B95FF]/20 shadow-inner">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Staff Payroll Command</h1>
              <p className="text-xs text-zinc-400">Fixed-point commission & tip pool reconciliation</p>
            </div>
          </div>

          {phase === 'error' && (
            <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-300 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <span>{message}</span>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Staff Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="manager@pawtrackr.com"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#8B95FF] focus:outline-none focus:ring-1 focus:ring-[#8B95FF]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-[#8B95FF] focus:outline-none focus:ring-1 focus:ring-[#8B95FF]"
              />
            </div>
            <button
              type="submit"
              disabled={phase === 'checking'}
              className="w-full rounded-xl bg-[#8B95FF] px-4 py-3 text-sm font-semibold text-[#0B090E] transition-all hover:bg-[#9FA8FF] active:scale-[0.99] disabled:opacity-50 mt-2 flex items-center justify-center gap-2 shadow-lg shadow-[#8B95FF]/20"
            >
              {phase === 'checking' ? 'Verifying Session...' : 'Authenticate Payroll Session'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </main>
    );
  }

  const isPeriodLocked = summary?.status === 'locked' || summary?.status === 'exported';
  const isManagerOrOwner = role === 'owner' || role === 'manager';

  return (
    <main className="min-h-screen bg-[#0B090E] text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <LiveWorkspaceShell
          salonName={salonName}
          slug={salonSlug}
          role={role}
          operatingModel={operatingModel}
          bookingStatus={bookingStatus}
          onSignOut={handleSignOut}
        />

        {statusNotice && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button onClick={() => setStatusNotice('')} className="text-zinc-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Header & Quick Action Buttons */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-white">Staff Commission & Tip Payroll</h1>
              {isPeriodLocked ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-0.5 text-xs font-semibold text-purple-300">
                  <Lock className="h-3 w-3" /> Period Locked (PW060)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-300">
                  <Unlock className="h-3 w-3" /> Period Open
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Fixed-point integer cents reconciliation • 0¢ tip rounding drift • Gusto & QuickBooks exports
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleExport('gusto')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/[0.08] transition-all"
            >
              <Download className="h-3.5 w-3.5 text-[#8B95FF]" /> Export Gusto CSV
            </button>
            <button
              onClick={() => handleExport('quickbooks')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/[0.08] transition-all"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" /> Export QuickBooks CSV
            </button>
            {isManagerOrOwner && !isPeriodLocked && (
              <button
                onClick={() => setLockModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#8B95FF] px-4 py-2.5 text-xs font-semibold text-[#0B090E] hover:bg-[#9FA8FF] shadow-lg shadow-[#8B95FF]/20 transition-all"
              >
                <Lock className="h-3.5 w-3.5" /> Lock Pay Period (WF08)
              </button>
            )}
          </div>
        </div>

        {/* Date Filter & Tip Pool Settings Bar */}
        <div className="rounded-2xl border border-white/10 bg-[#14121A]/80 p-5 backdrop-blur-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Period Start
              </label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-white focus:border-[#8B95FF] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Period End
              </label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-white focus:border-[#8B95FF] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Tip Pool Distribution
              </label>
              <select
                value={tipPoolMode}
                onChange={(e) => setTipPoolMode(e.target.value as TipPoolMode)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-white focus:border-[#8B95FF] focus:outline-none"
              >
                <option value="direct" className="bg-[#14121A]">100% Direct Stylist Pass-Through</option>
                <option value="bather_split" className="bg-[#14121A]">Bather Pool Split (Custom %)</option>
              </select>
            </div>
            <div className="flex gap-2">
              {tipPoolMode === 'bather_split' && (
                <div className="w-24">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Bather %
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    step="0.5"
                    value={batherPoolPct}
                    onChange={(e) => setBatherPoolPct(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white focus:border-[#8B95FF] focus:outline-none"
                  />
                </div>
              )}
              <button
                onClick={handleFilterApply}
                disabled={isLoading}
                className="flex-1 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-all flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Recalculate
              </button>
            </div>
          </div>
        </div>

        {/* 4 Financial Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#14121A]/80 p-5 backdrop-blur-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Gross Service Volume</span>
            <p className="text-2xl font-bold tracking-tight text-white mt-1">
              {formatCents(summary?.totalGrossCents ?? 0)}
            </p>
            <span className="text-[11px] text-zinc-500 mt-0.5 block">Excluding retail products & tips</span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#14121A]/80 p-5 backdrop-blur-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Stylist Commissions</span>
            <p className="text-2xl font-bold tracking-tight text-[#8B95FF] mt-1">
              {formatCents(summary?.totalCommissionCents ?? 0)}
            </p>
            <span className="text-[11px] text-zinc-500 mt-0.5 block">Staff production earnings</span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#14121A]/80 p-5 backdrop-blur-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Tip Distribution</span>
            <p className="text-2xl font-bold tracking-tight text-emerald-400 mt-1">
              {formatCents(summary?.totalTipsCents ?? 0)}
            </p>
            <span className="text-[11px] text-zinc-500 mt-0.5 block">
              {tipPoolMode === 'direct' ? '100% direct stylist' : `${batherPoolPct}% bather pool split`}
            </span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#14121A]/80 p-5 backdrop-blur-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">House Retained Net</span>
            <p className="text-2xl font-bold tracking-tight text-amber-300 mt-1">
              {formatCents(summary?.totalHouseRetainedCents ?? 0)}
            </p>
            <span className="text-[11px] text-zinc-500 mt-0.5 block">Salon revenue after commissions</span>
          </div>
        </div>

        {/* Progressive Marginal Commission Tier Brackets */}
        <div className="rounded-2xl border border-white/10 bg-[#14121A]/80 p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3.5">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-[#8B95FF]" />
              <h2 className="text-sm font-bold text-white tracking-tight">
                Progressive Marginal Groomer Commission Brackets
              </h2>
            </div>
            <span className="font-mono text-[11px] text-emerald-300">
              PostgreSQL `calculate_progressive_commission_cents` • 0¢ Drift
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {DEFAULT_PROGRESSIVE_COMMISSION_TIERS.map((tier, idx) => {
              const sampleGross = idx === 0 ? 200_000 : idx === 1 ? 400_000 : 650_000;
              const sampleCommission = calculateTieredCommissionCents(
                sampleGross,
                40,
                DEFAULT_PROGRESSIVE_COMMISSION_TIERS
              );
              return (
                <div
                  key={tier.label ?? idx}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{tier.label}</span>
                    <span className="rounded-full border border-[#8B95FF]/30 bg-[#8B95FF]/10 px-2 py-0.5 font-mono font-bold text-[#8B95FF]">
                      {tier.ratePct}% marginal
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-zinc-400">
                    Sample {formatCents(sampleGross)} gross →{' '}
                    <span className="text-emerald-300 font-semibold">{formatCents(sampleCommission)}</span> payout
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Staff Payroll Breakdown Table */}
        <div className="rounded-2xl border border-white/10 bg-[#14121A]/80 backdrop-blur-xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#8B95FF]" />
              <h2 className="text-base font-bold text-white tracking-tight">Staff Compensation Breakdown</h2>
            </div>
            <span className="text-xs text-zinc-400">
              {summary?.staffLines.length ?? 0} active team members
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.02] border-b border-white/10 text-zinc-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4 text-center">Services</th>
                  <th className="py-3 px-4 text-right">Gross Services</th>
                  <th className="py-3 px-4 text-center">Commission %</th>
                  <th className="py-3 px-4 text-right">Commission ($)</th>
                  <th className="py-3 px-4 text-right">Direct Tips</th>
                  <th className="py-3 px-4 text-right">Pooled Tips</th>
                  <th className="py-3 px-4 text-right">Total Tips</th>
                  <th className="py-3 px-4 text-right">Adjustments</th>
                  <th className="py-3 px-4 text-right font-bold text-white">Net Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-zinc-300">
                {(!summary?.staffLines || summary.staffLines.length === 0) ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-zinc-500">
                      No staff visit records found for this period.
                    </td>
                  </tr>
                ) : (
                  summary.staffLines.map((line) => (
                    <tr key={line.staffId} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-white">{line.staffName}</td>
                      <td className="py-3.5 px-4">
                        <span className="capitalize px-2 py-0.5 rounded-full text-[11px] font-medium border border-white/10 bg-white/5 text-zinc-300">
                          {line.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono">{line.serviceCount}</td>
                      <td className="py-3.5 px-4 text-right font-mono">{formatCents(line.grossServiceCents)}</td>
                      <td className="py-3.5 px-4 text-center font-mono">{line.commissionRatePct}%</td>
                      <td className="py-3.5 px-4 text-right font-mono text-[#8B95FF]">
                        {formatCents(line.commissionCents)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-zinc-400">
                        {formatCents(line.directTipsCents)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-zinc-400">
                        {formatCents(line.pooledTipsCents)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-400">
                        {formatCents(line.totalTipsCents)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-amber-300">
                        {line.adjustmentsCents < 0 ? `-${formatCents(Math.abs(line.adjustmentsCents))}` : formatCents(line.adjustmentsCents)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white text-sm">
                        {formatCents(line.netPayoutCents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {summary && summary.staffLines.length > 0 && (
                <tfoot className="bg-white/[0.04] border-t border-white/10 font-bold text-white">
                  <tr>
                    <td colSpan={3} className="py-3.5 px-4 uppercase tracking-wider text-xs">Total Ledger Payout</td>
                    <td className="py-3.5 px-4 text-right font-mono">{formatCents(summary.totalGrossCents)}</td>
                    <td className="py-3.5 px-4"></td>
                    <td className="py-3.5 px-4 text-right font-mono text-[#8B95FF]">
                      {formatCents(summary.totalCommissionCents)}
                    </td>
                    <td colSpan={2} className="py-3.5 px-4"></td>
                    <td className="py-3.5 px-4 text-right font-mono text-emerald-400">
                      {formatCents(summary.totalTipsCents)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-amber-300">
                      {formatCents(summary.totalAdjustmentsCents)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-base text-[#8B95FF]">
                      {formatCents(summary.totalPayoutCents)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Historical Pay Periods Audit Table */}
        <div className="rounded-2xl border border-white/10 bg-[#14121A]/80 backdrop-blur-xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-zinc-400" />
              <h2 className="text-base font-bold text-white tracking-tight">Historical Payroll Periods</h2>
            </div>
            <span className="text-xs text-zinc-400">{periods.length} closed periods</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.02] border-b border-white/10 text-zinc-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Pay Period Range</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Tip Mode</th>
                  <th className="py-3 px-4 text-right">Gross Services</th>
                  <th className="py-3 px-4 text-right">Commissions</th>
                  <th className="py-3 px-4 text-right">Tips</th>
                  <th className="py-3 px-4 text-right font-bold text-white">Total Payout</th>
                  <th className="py-3 px-4 text-right">Locked At</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-zinc-300">
                {periods.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-zinc-500">
                      No historical locked payroll periods yet.
                    </td>
                  </tr>
                ) : (
                  periods.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-semibold text-white">
                        {p.period_start} <span className="text-zinc-500">→</span> {p.period_end}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="capitalize px-2 py-0.5 rounded-full text-[11px] font-semibold border border-purple-500/30 bg-purple-500/10 text-purple-300">
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center capitalize text-zinc-400">
                        {p.tip_pool_mode === 'bather_split' ? `Bather (${p.bather_pool_pct}%)` : 'Direct'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">{formatCents(p.total_gross_cents)}</td>
                      <td className="py-3 px-4 text-right font-mono text-[#8B95FF]">
                        {formatCents(p.total_commission_cents)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400">
                        {formatCents(p.total_tips_cents)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-white">
                        {formatCents(p.total_payout_cents)}
                      </td>
                      <td className="py-3 px-4 text-right text-zinc-500">
                        {p.locked_at ? new Date(p.locked_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <a
                          href={`/api/payroll/export?format=gusto&start_date=${p.period_start}&end_date=${p.period_end}&tip_pool_mode=${p.tip_pool_mode}&bather_pool_pct=${p.bather_pool_pct}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#8B95FF] hover:underline text-[11px]"
                        >
                          <Download className="h-3 w-3" /> CSV
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lock Pay Period Modal (WF08) */}
        {lockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#14121A] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-[#8B95FF]" />
                  <h3 className="text-lg font-bold text-white">Lock Pay Period (WF08)</h3>
                </div>
                <button onClick={() => setLockModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Locking pay period <span className="font-bold text-white">{periodStart}</span> to{' '}
                  <span className="font-bold text-white">{periodEnd}</span> records the total commission and tip ledger
                  into the immutable database audit trail (<span className="font-mono text-purple-300">PW060</span>).
                  Once locked, financial numbers cannot be edited or deleted.
                </p>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Total Gross Services:</span>
                    <span className="font-mono font-bold text-white">{formatCents(summary?.totalGrossCents ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Total Commissions:</span>
                    <span className="font-mono font-bold text-[#8B95FF]">
                      {formatCents(summary?.totalCommissionCents ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Total Tips:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {formatCents(summary?.totalTipsCents ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-2 text-sm">
                    <span className="font-bold text-white">Total Payout:</span>
                    <span className="font-mono font-bold text-white">{formatCents(summary?.totalPayoutCents ?? 0)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Closeout Notes / Sign-off
                  </label>
                  <textarea
                    rows={3}
                    value={lockNotes}
                    onChange={(e) => setLockNotes(e.target.value)}
                    placeholder="Bi-weekly payroll audit approved by manager..."
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-white placeholder-zinc-500 focus:border-[#8B95FF] focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    onClick={() => setLockModalOpen(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLockPeriod}
                    disabled={isLocking}
                    className="rounded-xl bg-[#8B95FF] px-5 py-2 text-xs font-semibold text-[#0B090E] hover:bg-[#9FA8FF] disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-lg shadow-[#8B95FF]/20"
                  >
                    {isLocking ? 'Locking Period...' : 'Confirm & Lock Ledger'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
