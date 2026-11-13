'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Banknote,
  Receipt,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Printer,
  DollarSign,
  Tag,
  Percent,
  X,
  FileText,
  Search,
  Lock,
} from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import LiveWorkspaceShell from '@/components/LiveWorkspaceShell';
import {
  calculateLivePOSBreakdown,
  validatePOSMath,
  formatItemizedReceipt,
  validateRefundEligibility,
  roundToCents,
  ItemizedReceipt,
  POSTenderType,
} from '@/lib/live-pos';
import { LiveStaffRole } from '@/lib/workflow-context';

type POSVisit = {
  id: string;
  client_id: string;
  pet_id: string;
  service_package: string;
  total_amount: number;
  scheduled_time: string;
  status: string;
  client_name?: string;
  pet_name?: string;
};

type POSTransaction = {
  id: string;
  visit_id: string;
  amount: number;
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  payment_method: string;
  settlement_status: string;
  status: string;
  settled_at: string | null;
  created_at: string;
  client_name?: string;
  pet_name?: string;
  service_package?: string;
};

export default function LivePOSPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [phase, setPhase] = useState<'checking' | 'ready' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [statusNotice, setStatusNotice] = useState('');

  // Salon identity & session info
  const [salonName, setSalonName] = useState('Pawtrackr Salon');
  const [salonSlug, setSalonSlug] = useState('');
  const [role, setRole] = useState<LiveStaffRole>('front_desk');
  const [operatingModel, setOperatingModel] = useState<'salon' | 'mobile_van' | 'hybrid'>('salon');
  const [bookingStatus, setBookingStatus] = useState<'draft' | 'published' | 'paused'>('draft');

  // Register state
  const [visits, setVisits] = useState<POSVisit[]>([]);
  const [transactions, setTransactions] = useState<POSTransaction[]>([]);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Breakdown inputs
  const [discountInput, setDiscountInput] = useState('0.00');
  const [taxRateInput, setTaxRateInput] = useState('0.0825'); // 8.25% default
  const [selectedTipPercent, setSelectedTipPercent] = useState<number | 'custom'>(15);
  const [customTipInput, setCustomTipInput] = useState('0.00');
  const [tenderType, setTenderType] = useState<POSTenderType>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals
  const [activeReceipt, setActiveReceipt] = useState<ItemizedReceipt | null>(null);
  const [refundTx, setRefundTx] = useState<POSTransaction | null>(null);
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [refundReasonInput, setRefundReasonInput] = useState('');

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
  }, []);

  const fetchSalonAndData = async (token: string) => {
    setPhase('checking');
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setPhase('error');
        setMessage('Supabase client is not available.');
        return;
      }
      const { data: member } = await supabase
        .from('staff_members')
        .select('id, business_id, role, businesses(name, slug, operating_model, booking_status)')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (member) {
        setRole(member.role as LiveStaffRole);
        const biz = member.businesses as unknown as {
          name: string;
          slug: string;
          operating_model: 'salon' | 'mobile_van' | 'hybrid';
          booking_status: 'draft' | 'published' | 'paused';
        } | null;
        if (biz) {
          setSalonName(biz.name);
          setSalonSlug(biz.slug);
          setOperatingModel(biz.operating_model);
          setBookingStatus(biz.booking_status);
        }
      }

      // Fetch active checkout-eligible visits
      const { data: visitData } = await supabase
        .from('visits')
        .select(`
          id,
          client_id,
          pet_id,
          service_package,
          total_amount,
          scheduled_time,
          status,
          pets ( name ),
          clients ( name )
        `)
        .in('status', ['ready', 'styling', 'bathing', 'checked_in', 'released_unpaid', 'paid'])
        .order('scheduled_time', { ascending: false })
        .limit(30);

      if (visitData) {
        const formatted: POSVisit[] = visitData.map((v) => {
          const pet = v.pets as unknown as { name: string } | null;
          const client = v.clients as unknown as { name: string } | null;
          return {
            id: v.id,
            client_id: v.client_id,
            pet_id: v.pet_id,
            service_package: v.service_package,
            total_amount: Number(v.total_amount),
            scheduled_time: v.scheduled_time,
            status: v.status,
            pet_name: pet?.name || 'Pet',
            client_name: client?.name || 'Client',
          };
        });
        setVisits(formatted);
        if (formatted.length > 0 && !selectedVisitId) {
          setSelectedVisitId(formatted[0].id);
        }
      }

      // Fetch recent transactions
      const { data: txData } = await supabase
        .from('transactions')
        .select(`
          id,
          visit_id,
          amount,
          subtotal,
          discount,
          tax,
          tip,
          payment_method,
          settlement_status,
          status,
          settled_at,
          created_at,
          visits (
            service_package,
            pets ( name ),
            clients ( name )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (txData) {
        const formattedTx: POSTransaction[] = txData.map((t) => {
          const v = t.visits as unknown as {
            service_package: string;
            pets?: { name: string } | null;
            clients?: { name: string } | null;
          } | null;
          return {
            id: t.id,
            visit_id: t.visit_id,
            amount: Number(t.amount),
            subtotal: Number(t.subtotal),
            discount: Number(t.discount),
            tax: Number(t.tax),
            tip: Number(t.tip),
            payment_method: t.payment_method,
            settlement_status: t.settlement_status,
            status: t.status || t.settlement_status || 'settled',
            settled_at: t.settled_at,
            created_at: t.created_at,
            client_name: v?.clients?.name || 'Client',
            pet_name: v?.pets?.name || 'Pet',
            service_package: v?.service_package || 'Groom',
          };
        });
        setTransactions(formattedTx);
      }

      setPhase('ready');
    } catch (err) {
      setPhase('error');
      setMessage(err instanceof Error ? err.message : 'Error loading POS workspace.');
    }
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    setPhase('checking');
    const supabase = getSupabaseClient();
    if (!supabase) {
      setPhase('ready');
      setMessage('Supabase client not available.');
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      setPhase('ready');
      setMessage(error?.message || 'Failed to sign in.');
      return;
    }
    setSignedIn(true);
    fetchSalonAndData(data.session.access_token);
  };

  const selectedVisit = useMemo(
    () => visits.find((v) => v.id === selectedVisitId) || null,
    [visits, selectedVisitId]
  );

  // Compute breakdown for selected visit
  const breakdown = useMemo(() => {
    if (!selectedVisit) {
      return { subtotal: 0, discount: 0, tax: 0, tip: 0, amount: 0 };
    }
    const subtotal = roundToCents(selectedVisit.total_amount);
    const discount = roundToCents(Math.max(0, Number(discountInput) || 0));
    const taxRate = Math.max(0, Number(taxRateInput) || 0);

    let tip = 0;
    if (selectedTipPercent === 'custom') {
      tip = roundToCents(Math.max(0, Number(customTipInput) || 0));
    } else if (typeof selectedTipPercent === 'number') {
      const taxable = Math.max(0, subtotal - discount);
      tip = roundToCents(taxable * (selectedTipPercent / 100));
    }

    return calculateLivePOSBreakdown({
      subtotal,
      discount,
      taxRate,
      tip,
    });
  }, [selectedVisit, discountInput, taxRateInput, selectedTipPercent, customTipInput]);

  // Execute checkout
  const handleExecuteCheckout = async () => {
    if (!selectedVisit) return;
    setIsSubmitting(true);
    setStatusNotice('');

    const validation = validatePOSMath(breakdown);
    if (!validation.valid) {
      setStatusNotice(`Math error: ${validation.error}`);
      setIsSubmitting(false);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setStatusNotice('Supabase client not available.');
        setIsSubmitting(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatusNotice('No active session.');
        setIsSubmitting(false);
        return;
      }

      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          visitId: selectedVisit.id,
          subtotal: breakdown.subtotal,
          discount: breakdown.discount,
          tax: breakdown.tax,
          tip: breakdown.tip,
          amount: breakdown.amount,
          paymentMethod: tenderType,
          isCashSettled: tenderType === 'cash',
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setStatusNotice(body.error || 'Failed to complete checkout.');
        setIsSubmitting(false);
        return;
      }

      setStatusNotice(
        tenderType === 'cash'
          ? `✓ Cash payment settled: $${breakdown.amount.toFixed(2)} recorded in drawer.`
          : `✓ Card payment recorded: $${breakdown.amount.toFixed(2)} pending capture.`
      );

      // Open receipt modal immediately
      const receipt = formatItemizedReceipt({
        transaction: {
          id: body.transaction.id,
          amount: breakdown.amount,
          subtotal: breakdown.subtotal,
          discount: breakdown.discount,
          tax: breakdown.tax,
          tip: breakdown.tip,
          payment_method: tenderType,
          settlement_status: tenderType === 'cash' ? 'settled' : 'pending',
          settled_at: tenderType === 'cash' ? new Date().toISOString() : null,
          created_at: new Date().toISOString(),
        },
        visit: {
          id: selectedVisit.id,
          service_package: selectedVisit.service_package,
          pet_name: selectedVisit.pet_name,
          client_name: selectedVisit.client_name,
          scheduled_time: selectedVisit.scheduled_time,
          status: tenderType === 'cash' ? 'paid' : 'payment_pending',
        },
        salon: {
          name: salonName,
        },
      });
      setActiveReceipt(receipt);

      // Refresh data
      fetchSalonAndData(session.access_token);
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Checkout error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Execute refund
  const handleExecuteRefund = async () => {
    if (!refundTx) return;
    setIsSubmitting(true);
    setStatusNotice('');

    const refundAmount = roundToCents(Number(refundAmountInput) || 0);
    const eligibility = validateRefundEligibility({
      transaction: refundTx,
      refundAmount,
      role,
      reason: refundReasonInput,
    });

    if (!eligibility.eligible) {
      setStatusNotice(eligibility.error || 'Refund rejected by policy');
      setIsSubmitting(false);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setStatusNotice('Supabase client not available.');
        setIsSubmitting(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatusNotice('No active session.');
        setIsSubmitting(false);
        return;
      }

      const res = await fetch('/api/pos/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          transactionId: refundTx.id,
          amount: refundAmount,
          reason: refundReasonInput,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setStatusNotice(body.error || 'Failed to process refund.');
        setIsSubmitting(false);
        return;
      }

      setStatusNotice(`✓ Refund of $${refundAmount.toFixed(2)} processed and ledgered.`);
      setRefundTx(null);
      setRefundAmountInput('');
      setRefundReasonInput('');
      fetchSalonAndData(session.access_token);
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Refund error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredVisits = useMemo(() => {
    if (!searchQuery.trim()) return visits;
    const q = searchQuery.toLowerCase();
    return visits.filter(
      (v) =>
        v.client_name?.toLowerCase().includes(q) ||
        v.pet_name?.toLowerCase().includes(q) ||
        v.service_package?.toLowerCase().includes(q)
    );
  }, [visits, searchQuery]);

  return (
    <div className="min-h-screen bg-obsidian-950 text-white font-sans antialiased">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <LiveWorkspaceShell
          salonName={salonName}
          slug={salonSlug}
          role={role}
          operatingModel={operatingModel}
          bookingStatus={bookingStatus}
          onSignOut={async () => {
            const supabase = getSupabaseClient();
            if (supabase) {
              await supabase.auth.signOut();
            }
            setSignedIn(false);
          }}
        />

        {!signedIn ? (
          <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-obsidian-900/90 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-periwinkle-500/10 text-periwinkle-400">
                <CreditCard className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white">Live POS Register Sign In</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Front desk, managers, and owners can check out visits and issue receipts.
              </p>
            </div>

            {message && (
              <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
                {message}
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4">
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                Staff Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-periwinkle-400 focus:outline-none focus:ring-1 focus:ring-periwinkle-400"
                  placeholder="staff@example.test"
                />
              </label>

              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                Staff Password
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-obsidian-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-periwinkle-400 focus:outline-none focus:ring-1 focus:ring-periwinkle-400"
                  placeholder="••••••••"
                />
              </label>

              <button
                type="submit"
                disabled={phase === 'checking'}
                className="w-full rounded-xl bg-periwinkle-500 py-2.5 text-sm font-semibold text-obsidian-950 transition hover:bg-periwinkle-400 disabled:opacity-50"
              >
                {phase === 'checking' ? 'Verifying...' : 'Access POS Register'}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            {statusNotice && (
              <div
                className={`flex items-center justify-between rounded-xl border p-4 text-sm ${
                  statusNotice.startsWith('✓')
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                }`}
              >
                <span>{statusNotice}</span>
                <button onClick={() => setStatusNotice('')} className="text-zinc-400 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left Column: Eligible Visits Queue (5 cols) */}
              <div className="space-y-4 lg:col-span-5">
                <div className="rounded-2xl border border-white/10 bg-obsidian-900/80 p-5 shadow-xl backdrop-blur-md">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-white text-base">Visits at Register</h3>
                      <p className="text-xs text-zinc-400">Select visit to calculate itemized checkout</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href="/dashboard/operations/live"
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20"
                        data-testid="pos-day-closeout-link"
                      >
                        <Lock className="h-3 w-3" /> Day Closeout (WF08)
                      </Link>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-zinc-300">
                        {filteredVisits.length} open
                      </span>
                    </div>
                  </div>

                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search client, pet or service..."
                      className="w-full rounded-xl border border-white/10 bg-obsidian-800/80 pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:border-periwinkle-400 focus:outline-none"
                    />
                  </div>

                  <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {filteredVisits.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-xs text-zinc-400">
                        No active visits waiting for checkout.
                      </div>
                    ) : (
                      filteredVisits.map((v) => {
                        const isSelected = v.id === selectedVisitId;
                        return (
                          <button
                            key={v.id}
                            onClick={() => setSelectedVisitId(v.id)}
                            className={`w-full text-left rounded-xl border p-3 transition ${
                              isSelected
                                ? 'border-periwinkle-400 bg-periwinkle-500/10 shadow-md ring-1 ring-periwinkle-400'
                                : 'border-white/10 bg-obsidian-800/60 hover:border-white/20 hover:bg-obsidian-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-bold text-sm text-white">
                                  {v.pet_name}
                                </span>
                                <span className="ml-2 text-xs text-zinc-400">
                                  ({v.client_name})
                                </span>
                                <p className="mt-0.5 text-xs text-zinc-300">
                                  {v.service_package}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="font-mono font-bold text-sm text-periwinkle-300">
                                  ${v.total_amount.toFixed(2)}
                                </span>
                                <span className="mt-1 block rounded px-1.5 py-0.5 text-[10px] uppercase font-semibold text-zinc-300 bg-white/5">
                                  {v.status.replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Recent Transactions & Dispute Ledger */}
                <div className="rounded-2xl border border-white/10 bg-obsidian-900/80 p-5 shadow-xl backdrop-blur-md">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-white text-base">Recent Settlements</h3>
                      <p className="text-xs text-zinc-400">Drawer & gateway reconciliation</p>
                    </div>
                  </div>

                  <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                    {transactions.length === 0 ? (
                      <p className="py-4 text-center text-xs text-zinc-500">No settled checkouts yet.</p>
                    ) : (
                      transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between rounded-xl border border-white/10 bg-obsidian-800/50 p-2.5 text-xs"
                        >
                          <div>
                            <span className="font-bold text-white">{tx.pet_name}</span>
                            <span className="ml-1 text-zinc-400 font-mono">
                              (${tx.amount.toFixed(2)})
                            </span>
                            <p className="text-[11px] text-zinc-400">
                              {tx.payment_method.toUpperCase()} · {tx.settlement_status}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                const receipt = formatItemizedReceipt({
                                  transaction: tx,
                                  visit: {
                                    id: tx.visit_id,
                                    service_package: tx.service_package || 'Service Groom',
                                    pet_name: tx.pet_name,
                                    client_name: tx.client_name,
                                    status: tx.settlement_status === 'settled' ? 'paid' : 'pending',
                                  },
                                  salon: { name: salonName },
                                });
                                setActiveReceipt(receipt);
                              }}
                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/10"
                            >
                              <Receipt className="inline mr-1 h-3 w-3" />
                              Receipt
                            </button>
                            {(role === 'owner' || role === 'manager') &&
                              tx.settlement_status === 'settled' && (
                                <button
                                  onClick={() => {
                                    setRefundTx(tx);
                                    setRefundAmountInput(tx.amount.toFixed(2));
                                    setRefundReasonInput('');
                                  }}
                                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/20"
                                >
                                  <RotateCcw className="inline mr-1 h-3 w-3" />
                                  Refund
                                </button>
                              )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Checkout Register (7 cols) */}
              <div className="lg:col-span-7">
                {selectedVisit ? (
                  <div className="rounded-2xl border border-white/10 bg-obsidian-900/90 p-6 shadow-2xl backdrop-blur-xl">
                    <div className="mb-6 border-b border-white/10 pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="rounded bg-periwinkle-500/20 px-2 py-0.5 text-xs font-semibold text-periwinkle-300 uppercase">
                            Register Itemization
                          </span>
                          <h2 className="mt-1 text-2xl font-extrabold text-white">
                            {selectedVisit.pet_name} · {selectedVisit.service_package}
                          </h2>
                          <p className="text-sm text-zinc-400">
                            Client: {selectedVisit.client_name} · Status:{' '}
                            <span className="capitalize">{selectedVisit.status.replace('_', ' ')}</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs uppercase text-zinc-400">Total Due</span>
                          <p className="font-mono text-3xl font-extrabold text-periwinkle-300">
                            ${breakdown.amount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Breakdown Inputs */}
                    <div className="space-y-4">
                      {/* Subtotal & Discount Row */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-xl border border-white/10 bg-obsidian-800/60 p-3">
                          <span className="text-xs text-zinc-400">Service Base Amount</span>
                          <p className="mt-1 font-mono text-lg font-bold text-white">
                            ${breakdown.subtotal.toFixed(2)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-obsidian-800/60 p-3">
                          <div className="flex items-center justify-between text-xs text-zinc-400">
                            <span>Discount / Promo ($)</span>
                            <Tag className="h-3 w-3 text-zinc-400" />
                          </div>
                          <input
                            type="number"
                            step="0.50"
                            min="0"
                            max={breakdown.subtotal}
                            value={discountInput}
                            onChange={(e) => setDiscountInput(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-white/10 bg-obsidian-900 px-3 py-1 font-mono text-sm text-white focus:border-periwinkle-400 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Tax & Tip Presets */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-zinc-400">
                          <span>Tip Percentage</span>
                          <span className="font-mono text-zinc-300">
                            Tip Amount: ${breakdown.tip.toFixed(2)}
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {[0, 15, 20, 25].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setSelectedTipPercent(pct)}
                              className={`rounded-xl border py-2 text-xs font-semibold transition ${
                                selectedTipPercent === pct
                                  ? 'border-periwinkle-400 bg-periwinkle-500/20 text-periwinkle-300'
                                  : 'border-white/10 bg-obsidian-800/80 text-zinc-300 hover:bg-obsidian-800'
                              }`}
                            >
                              {pct === 0 ? 'No Tip' : `${pct}%`}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setSelectedTipPercent('custom')}
                            className={`rounded-xl border py-2 text-xs font-semibold transition ${
                              selectedTipPercent === 'custom'
                                ? 'border-periwinkle-400 bg-periwinkle-500/20 text-periwinkle-300'
                                : 'border-white/10 bg-obsidian-800/80 text-zinc-300 hover:bg-obsidian-800'
                            }`}
                          >
                            Custom
                          </button>
                        </div>
                        {selectedTipPercent === 'custom' && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-zinc-400">Custom Tip ($):</span>
                            <input
                              type="number"
                              step="1.00"
                              min="0"
                              value={customTipInput}
                              onChange={(e) => setCustomTipInput(e.target.value)}
                              className="rounded-lg border border-white/10 bg-obsidian-800 px-3 py-1 font-mono text-xs text-white focus:border-periwinkle-400 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>

                      {/* Tender Selector */}
                      <div className="space-y-2 pt-2">
                        <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                          Tender Method (WF06 Invariant)
                        </span>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setTenderType('cash')}
                            className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                              tenderType === 'cash'
                                ? 'border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400'
                                : 'border-white/10 bg-obsidian-800/60 hover:bg-obsidian-800'
                            }`}
                          >
                            <Banknote className="h-6 w-6 text-emerald-400" />
                            <div>
                              <p className="font-bold text-sm text-white">Cash Tender</p>
                              <p className="text-xs text-zinc-400">
                                Settle instantly in salon cash drawer
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setTenderType('card')}
                            className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${
                              tenderType === 'card'
                                ? 'border-periwinkle-400 bg-periwinkle-500/10 ring-1 ring-periwinkle-400'
                                : 'border-white/10 bg-obsidian-800/60 hover:bg-obsidian-800'
                            }`}
                          >
                            <CreditCard className="h-6 w-6 text-periwinkle-400" />
                            <div>
                              <p className="font-bold text-sm text-white">Card Capture</p>
                              <p className="text-xs text-zinc-400">
                                Terminal / pending gateway settlement
                              </p>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Summary Breakdown Box */}
                      <div className="rounded-xl border border-white/10 bg-obsidian-950/60 p-4 space-y-1.5 text-xs font-mono">
                        <div className="flex justify-between text-zinc-400">
                          <span>Subtotal:</span>
                          <span>${breakdown.subtotal.toFixed(2)}</span>
                        </div>
                        {breakdown.discount > 0 && (
                          <div className="flex justify-between text-emerald-400">
                            <span>Discount:</span>
                            <span>-${breakdown.discount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-zinc-400">
                          <span>Tax ({(Number(taxRateInput) * 100).toFixed(2)}%):</span>
                          <span>${breakdown.tax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Tip:</span>
                          <span>${breakdown.tip.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-2 font-bold text-sm text-white">
                          <span>Atomic Amount:</span>
                          <span className="text-periwinkle-300">${breakdown.amount.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <button
                        type="button"
                        onClick={handleExecuteCheckout}
                        disabled={isSubmitting}
                        className="w-full rounded-xl bg-periwinkle-500 py-3 text-sm font-bold text-obsidian-950 transition hover:bg-periwinkle-400 disabled:opacity-50"
                      >
                        {isSubmitting
                          ? 'Recording Checkout...'
                          : `Complete ${tenderType === 'cash' ? 'Cash Settlement' : 'Card Checkout'} ($${breakdown.amount.toFixed(2)})`}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-obsidian-900/40 p-12 text-center text-sm text-zinc-400">
                    Select a visit from the left column to begin itemized register checkout.
                  </div>
                )}
              </div>
            </div>

            {/* Receipt Modal */}
            {activeReceipt && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-2xl border border-white/15 bg-obsidian-900 p-6 shadow-2xl">
                  <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-5 w-5 text-periwinkle-400" />
                      <span className="font-mono text-xs font-bold text-zinc-300">
                        {activeReceipt.receiptId}
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveReceipt(null)}
                      className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Receipt Paper Simulation */}
                  <div className="rounded-xl border border-white/10 bg-obsidian-950 p-5 font-mono text-xs space-y-3">
                    <div className="text-center border-b border-dashed border-white/10 pb-3">
                      <p className="font-bold text-sm text-white">{activeReceipt.salon.name}</p>
                      <p className="text-[11px] text-zinc-400">{activeReceipt.salon.address}</p>
                      <p className="text-[11px] text-zinc-400">{activeReceipt.salon.phone}</p>
                    </div>

                    <div className="border-b border-dashed border-white/10 pb-2 text-[11px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Client:</span>
                        <span className="text-white">{activeReceipt.client.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Pet:</span>
                        <span className="text-white">{activeReceipt.client.petName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Service:</span>
                        <span className="text-white">{activeReceipt.client.servicePackage}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Tender:</span>
                        <span className="text-white">{activeReceipt.payment.tenderType}</span>
                      </div>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between text-zinc-400">
                        <span>Subtotal:</span>
                        <span>{activeReceipt.breakdown.subtotal}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Tax:</span>
                        <span>{activeReceipt.breakdown.tax}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Tip:</span>
                        <span>{activeReceipt.breakdown.tip}</span>
                      </div>
                      <div className="flex justify-between border-t border-dashed border-white/20 pt-1.5 font-bold text-sm text-white">
                        <span>TOTAL PAID:</span>
                        <span className="text-periwinkle-300">{activeReceipt.breakdown.total}</span>
                      </div>
                    </div>

                    <div className="pt-2 text-center">
                      {activeReceipt.payment.isVerifiedSettled ? (
                        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Payment Confirmed & Settled
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-300">
                          <Clock className="h-3 w-3" />
                          Card Pending Gateway Settlement
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => window.print()}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white hover:bg-white/10"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Print Receipt
                    </button>
                    <button
                      onClick={() => setActiveReceipt(null)}
                      className="flex-1 rounded-xl bg-periwinkle-500 py-2 text-xs font-semibold text-obsidian-950 hover:bg-periwinkle-400"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Refund & Dispute Modal (WF15) */}
            {refundTx && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-obsidian-900 p-6 shadow-2xl">
                  <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-5 w-5 text-rose-400" />
                      <span className="font-bold text-sm text-white">
                        Authorise Refund (WF15)
                      </span>
                    </div>
                    <button
                      onClick={() => setRefundTx(null)}
                      className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="text-xs text-zinc-300 mb-4">
                    Refunds are restricted to Managers and Owners. A mandatory explanation reason
                    (min 10 characters) is legally recorded in the audit trail.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium uppercase text-zinc-400">
                        Refund Amount ($) (Max: ${refundTx.amount.toFixed(2)})
                      </label>
                      <input
                        type="number"
                        step="0.50"
                        min="0.50"
                        max={refundTx.amount}
                        value={refundAmountInput}
                        onChange={(e) => setRefundAmountInput(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-obsidian-800 px-3 py-2 font-mono text-sm text-white focus:border-rose-400 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase text-zinc-400">
                        Mandatory Explanation Reason (min 10 characters)
                      </label>
                      <textarea
                        rows={3}
                        value={refundReasonInput}
                        onChange={(e) => setRefundReasonInput(e.target.value)}
                        placeholder="State reason for customer dispute or satisfaction refund..."
                        className="mt-1 w-full rounded-xl border border-white/10 bg-obsidian-800 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-rose-400 focus:outline-none"
                      />
                      <span className="text-[10px] text-zinc-500">
                        {refundReasonInput.trim().length}/10 characters minimum
                      </span>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setRefundTx(null)}
                        className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white hover:bg-white/10"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isSubmitting || refundReasonInput.trim().length < 10}
                        onClick={handleExecuteRefund}
                        className="flex-1 rounded-xl bg-rose-500 py-2 text-xs font-semibold text-white hover:bg-rose-400 disabled:opacity-50"
                      >
                        {isSubmitting ? 'Processing...' : 'Authorise Refund'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
