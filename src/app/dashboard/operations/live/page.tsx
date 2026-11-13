'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  FileText,
  Flame,
  Lock,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import LiveWorkspaceShell from '@/components/LiveWorkspaceShell';
import {
  canOpenSalonDay,
  canOverrideUnpaidRelease,
  canStaffAdvanceStage,
  canStaffCheckIn,
  canStaffRelease,
  deriveOperationalQueues,
  isBiteRiskPet,
  isLateArrival,
  OperationalQueues,
  OperationalVisit,
  SalonDayState,
  VisitLifecycleState,
} from '@/lib/live-operations';
import { isLiveStaffRole, LiveStaffRole } from '@/lib/workflow-context';
import ReportCardModal from '@/components/ReportCardModal';
import CloseDayDrawer from '@/components/CloseDayDrawer';
import CommunicationsDrawer from '@/components/CommunicationsDrawer';

const utcDay = () => new Date().toISOString().slice(0, 10);

export default function LiveOperationsPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [phase, setPhase] = useState<'checking' | 'ready' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [statusNotice, setStatusNotice] = useState('');
  const [online, setOnline] = useState(true);

  // Salon identity & session info
  const [salonName, setSalonName] = useState('Pawtrackr Salon');
  const [salonSlug, setSalonSlug] = useState('');
  const [userRole, setUserRole] = useState<LiveStaffRole>('owner');
  const [operatingModel, setOperatingModel] = useState<string>('salon');
  const [bookingStatus, setBookingStatus] = useState<string>('draft');

  // Operational State
  const [selectedDate, setSelectedDate] = useState<string>(utcDay);
  const [dayState, setDayState] = useState<SalonDayState | null>(null);
  const [visits, setVisits] = useState<OperationalVisit[]>([]);
  const [activeTab, setActiveTab] = useState<'arrivals' | 'in_service' | 'ready' | 'exceptions'>('arrivals');

  // Modals & Action Drawers
  const [showOpenDayModal, setShowOpenDayModal] = useState(false);
  const [openDayChecklist, setOpenDayChecklist] = useState({
    shifts_confirmed: true,
    stations_ready: true,
    supplies_stocked: true,
    emergency_contacts_verified: true,
  });

  // Check-In Modal state
  const [checkingInVisit, setCheckingInVisit] = useState<OperationalVisit | null>(null);
  const [collectorName, setCollectorName] = useState('');
  const [collectorPhone, setCollectorPhone] = useState('');
  const [checkInWeight, setCheckInWeight] = useState('');
  const [waiverStatus, setWaiverStatus] = useState<'verified' | 'refused'>('verified');

  // Release Modal state
  const [releasingVisit, setReleasingVisit] = useState<OperationalVisit | null>(null);
  const [releasedToName, setReleasedToName] = useState('');
  const [unpaidOverride, setUnpaidOverride] = useState(false);
  const [unpaidReason, setUnpaidReason] = useState('');

  // Staff Invite Modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<LiveStaffRole>('groomer');
  const [inviteName, setInviteName] = useState('');

  // WF11 Surcharge modal state
  const [surchargeVisit, setSurchargeVisit] = useState<OperationalVisit | null>(null);
  const [surchargeAmount, setSurchargeAmount] = useState('25.00');
  const [surchargeReason, setSurchargeReason] = useState('matted_coat');
  const [surchargeExtraTime, setSurchargeExtraTime] = useState('15');
  const [surchargeNotes, setSurchargeNotes] = useState('');

  // WF05/WF14 Safety Stop modal state
  const [safetyStopVisit, setSafetyStopVisit] = useState<OperationalVisit | null>(null);
  const [stopReason, setStopReason] = useState('');
  const [incidentType, setIncidentType] = useState('dog_bite');
  const [incidentSeverity, setIncidentSeverity] = useState('moderate');
  const [firstAidNotes, setFirstAidNotes] = useState('');
  const [vetContacted, setVetContacted] = useState(false);
  const [suggestedCharge, setSuggestedCharge] = useState('');

  // Care note draft map (keyed by visitId)
  const [careNotes, setCareNotes] = useState<Record<string, string>>({});

  // Offline optimistic action log
  const [offlineSyncAlert, setOfflineSyncAlert] = useState<string | null>(null);

  // Slice 4: Day Closeout, Report Cards & Communications
  const [showCloseDayDrawer, setShowCloseDayDrawer] = useState(false);
  const [reportCardVisit, setReportCardVisit] = useState<OperationalVisit | null>(null);
  const [commsDrawerVisit, setCommsDrawerVisit] = useState<OperationalVisit | null>(null);
  const [showCommsDrawer, setShowCommsDrawer] = useState(false);

  const getAccessToken = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const requestId = useRef(0);

  // Derived queues using pure helper
  const queues: OperationalQueues = useMemo(() => {
    return deriveOperationalQueues(visits, selectedDate);
  }, [visits, selectedDate]);

  // Main data refresh
  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    const client = getSupabaseClient();
    if (!client) {
      setPhase('error');
      setMessage('Supabase is not configured.');
      return;
    }
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }
    setOnline(true);
    setPhase('checking');

    const {
      data: { session },
      error: sessionError,
    } = await client.auth.getSession();
    if (current !== requestId.current) return;
    if (sessionError || !session) {
      setSignedIn(false);
      setPhase('ready');
      return;
    }

    setSignedIn(true);

    try {
      // 1. Fetch staff membership & salon metadata
      const { data: membership } = await client
        .from('staff_members')
        .select('id, business_id, name, role')
        .eq('auth_user_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (membership && isLiveStaffRole(membership.role)) {
        setUserRole(membership.role);
      }

      if (membership?.business_id) {
        const { data: business } = await client
          .from('businesses')
          .select('name, slug, booking_status, operating_model')
          .eq('id', membership.business_id)
          .maybeSingle();

        if (business) {
          setSalonName(business.name);
          setSalonSlug(business.slug);
          setBookingStatus(business.booking_status ?? 'draft');
          setOperatingModel(business.operating_model ?? 'salon');
        }
      }

      // 2. Fetch Day State
      const dayRes = await fetch(`/api/operations/day?date=${selectedDate}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      if (dayRes.ok) {
        const dayData = (await dayRes.json()) as SalonDayState;
        setDayState(dayData);
      }

      // 3. Fetch Visits for the selected day
      const visitsRes = await fetch(`/api/reservations?date=${selectedDate}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });

      if (visitsRes.ok) {
        const visitsData = await visitsRes.json() as { reservations?: OperationalVisit[] };
        if (Array.isArray(visitsData.reservations)) {
          setVisits(visitsData.reservations);
        }
      }

      setMessage('');
      setPhase('ready');
    } catch (err) {
      if (current !== requestId.current) return;
      setPhase('error');
      setMessage(err instanceof Error ? err.message : 'Operations data could not be loaded.');
    }
  }, [selectedDate]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 30_000);

    const onOnline = () => {
      setOnline(true);
      void refresh();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  // Handle staff sign-in
  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setPhase('checking');
    setMessage('');
    const { error } = await client.auth.signInWithPassword({ email, password });
    setPassword('');
    if (error) {
      setPhase('error');
      setMessage('Sign-in failed. Check your staff credentials.');
      return;
    }
    setSignedIn(true);
    void refresh();
  };

  const signOut = async () => {
    await getSupabaseClient()?.auth.signOut();
    setSignedIn(false);
    setMessage('');
  };

  // Action: Open Salon Day (WF18)
  const handleOpenDay = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setStatusNotice('');
    setMessage('');

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/operations/day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          salon_date: selectedDate,
          checklist: openDayChecklist,
        }),
      });

      const body = await res.json() as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not open salon day.');

      setShowOpenDayModal(false);
      setStatusNotice(body.message ?? 'Salon day opened successfully.');
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Opening day failed.');
    }
  };

  // Action: Check in visit (WF01)
  const handleCheckInSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkingInVisit) return;
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const lateCheck = isLateArrival(checkingInVisit.scheduled_time);

      const res = await fetch(`/api/visits/${checkingInVisit.id}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          collector_name: collectorName,
          collector_phone: collectorPhone || null,
          weight_lbs: checkInWeight ? Number(checkInWeight) : null,
          waiver_status: waiverStatus,
          is_late: lateCheck.isLate,
          late_minutes: lateCheck.minutesLate,
        }),
      });

      const body = await res.json() as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error ?? 'Check-in failed.');

      setCheckingInVisit(null);
      setCollectorName('');
      setCollectorPhone('');
      setCheckInWeight('');
      setStatusNotice(body.message ?? 'Visit checked in.');
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Check-in failed.');
    }
  };

  // Action: Acknowledge Safety Notes (WF09)
  const handleAcknowledgeSafety = async (visitId: string) => {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/visits/${visitId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'acknowledge_safety' }),
      });

      const body = await res.json() as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error ?? 'Safety note acknowledgment failed.');

      setStatusNotice('Safety notes acknowledged. Floor work unblocked.');
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Safety acknowledgment failed.');
    }
  };

  // Action: Advance Floor Stage (WF09)
  const handleAdvanceStage = async (visit: OperationalVisit, targetStage: VisitLifecycleState) => {
    const client = getSupabaseClient();
    if (!client) return;

    // Check offline resilience
    if (!navigator.onLine) {
      setOfflineSyncAlert(`Offline: stage transition to ${targetStage} queued locally.`);
      // Optimistic local update
      setVisits((prev) =>
        prev.map((v) => (v.id === visit.id ? { ...v, status: targetStage, version: v.version + 1 } : v)),
      );
      return;
    }

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const careNote = careNotes[visit.id]?.trim() || null;

      const res = await fetch(`/api/visits/${visit.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: 'advance_stage',
          target_stage: targetStage,
          care_note: careNote,
          client_version: visit.version,
        }),
      });

      const body = await res.json() as { error?: string; message?: string; code?: string };
      if (!res.ok) {
        if (res.status === 409) {
          setMessage('Conflict: visit was updated by another team member. Refreshed with latest data.');
          await refresh();
          return;
        }
        throw new Error(body.error ?? 'Could not advance stage.');
      }

      setCareNotes((prev) => {
        const next = { ...prev };
        delete next[visit.id];
        return next;
      });

      setStatusNotice(`Pet advanced to ${targetStage.replace('_', ' ').toUpperCase()}.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Stage progression failed.');
    }
  };

  // Action: Release Pet (WF10)
  const handleReleaseSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!releasingVisit) return;
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/visits/${releasingVisit.id}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          released_to_name: releasedToName,
          unpaid_override: unpaidOverride,
          unpaid_reason: unpaidOverride ? unpaidReason : null,
        }),
      });

      const body = await res.json() as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error ?? 'Pet release failed.');

      setReleasingVisit(null);
      setReleasedToName('');
      setUnpaidOverride(false);
      setUnpaidReason('');
      setStatusNotice(body.message ?? 'Pet released successfully.');
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Pet release failed.');
    }
  };

  // Action: Staff Invite (WF04)
  const handleInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/staff/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          name: inviteName || undefined,
        }),
      });

      const body = await res.json() as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error ?? 'Staff invitation failed.');

      setShowInviteModal(false);
      setInviteEmail('');
      setInviteName('');
      setStatusNotice(body.message ?? 'Staff invitation created.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Staff invitation failed.');
    }
  };

  // Action: Request Extra Work / Surcharge (WF11)
  const handleRequestSurchargeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!surchargeVisit) return;
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/visits/${surchargeVisit.id}/surcharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: 'request',
          amount: Number(surchargeAmount),
          reason: surchargeReason,
          extraTimeMinutes: Number(surchargeExtraTime),
          notes: surchargeNotes || undefined,
        }),
      });

      const body = await res.json() as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Surcharge request failed.');

      setSurchargeVisit(null);
      setSurchargeNotes('');
      setStatusNotice(`Surcharge request for $${Number(surchargeAmount).toFixed(2)} submitted. Visit marked change_pending.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Surcharge request failed.');
    }
  };

  // Action: Safety Stop & Incident Report (WF05 / WF14)
  const handleSafetyStopSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!safetyStopVisit) return;
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/visits/${safetyStopVisit.id}/safety-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          reason: stopReason,
          incidentType: incidentType || undefined,
          severity: incidentSeverity || undefined,
          firstAid: firstAidNotes || undefined,
          vetContacted,
          suggestedCharge: suggestedCharge ? Number(suggestedCharge) : undefined,
        }),
      });

      const body = await res.json() as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Safety stop failed.');

      setSafetyStopVisit(null);
      setStopReason('');
      setFirstAidNotes('');
      setStatusNotice('Service stopped for safety. Visit recorded as partly_completed and incident report locked.');
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Safety stop failed.');
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-950 px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* WORKSPACE SHELL */}
        <LiveWorkspaceShell
          salonName={salonName}
          slug={salonSlug}
          role={userRole}
          operatingModel={operatingModel}
          bookingStatus={bookingStatus}
          onSignOut={signOut}
          headerActions={
            (userRole === 'owner' || userRole === 'manager') && (
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-periwinkle-400/30 bg-periwinkle-500/10 px-3 text-xs font-semibold text-periwinkle-200 hover:bg-periwinkle-500/20"
              >
                <UserPlus className="h-3.5 w-3.5" /> Invite Staff
              </button>
            )
          }
        />

        {/* SIGN IN FORM (IF NOT SIGNED IN) */}
        {isSupabaseConfigured && !signedIn && phase !== 'checking' && (
          <form onSubmit={signIn} className="glass-card mx-auto max-w-md space-y-4 p-5 sm:p-6">
            <h2 className="text-lg font-bold text-white">Operations Command Sign-in</h2>
            <p className="text-sm text-zinc-400">
              Sign in with your verified staff credentials to manage the salon floor, arrivals, and pet release.
            </p>
            <label className="block text-sm text-zinc-200">
              Email
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-white"
              />
            </label>
            <label className="block text-sm text-zinc-200">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 text-white"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 w-full rounded-xl bg-periwinkle-500 px-5 font-bold text-obsidian-950 hover:bg-periwinkle-400"
            >
              Sign In to Command Center
            </button>
          </form>
        )}

        {/* ACTIVE SIGNED-IN OPERATIONS CENTER */}
        {signedIn && (
          <div className="space-y-6">
            {/* SUB-HEADER: DATE PICKER & STATUS */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Salon Date:
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-white/15 bg-obsidian-900 px-3 py-1.5 text-sm font-medium text-white focus:border-periwinkle-400"
                />
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-obsidian-900/60 px-3 text-xs text-zinc-300 hover:text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
              </div>

              {/* Online / Offline badge */}
              <div className="flex items-center gap-2 text-xs">
                {online ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <Wifi className="h-3.5 w-3.5" /> Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-400">
                    <WifiOff className="h-3.5 w-3.5" /> Disconnected · Saving Locally
                  </span>
                )}
              </div>
            </div>

            {/* NOTICES */}
            {statusNotice && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                {statusNotice}
              </div>
            )}
            {message && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                {message}
              </div>
            )}
            {offlineSyncAlert && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                {offlineSyncAlert}
              </div>
            )}

            {/* MANAGER OPENING CHECK DRAWER / BANNER (WF18) */}
            <div className="glass-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                      dayState?.status === 'open'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white">
                        Daily Operational Status:{' '}
                        <span
                          className={
                            dayState?.status === 'open' ? 'text-emerald-400' : 'text-amber-400'
                          }
                        >
                          {dayState?.status === 'open' ? 'OPEN' : 'CLOSED'}
                        </span>
                      </h2>
                    </div>
                    <p className="text-xs text-zinc-400">
                      {dayState?.status === 'open'
                        ? `Opened at ${dayState.opened_at?.slice(11, 16)} UTC · Stations: ${dayState.station_count} · Staff Shifts: ${dayState.active_shifts_count}`
                        : 'Day has not been opened yet. Opening check verifies staff, sanitization, and stations.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCommsDrawerVisit(null);
                      setShowCommsDrawer(true);
                    }}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3.5 text-xs font-semibold text-teal-300 hover:bg-teal-500/20"
                    data-testid="open-communications-btn"
                  >
                    <MessageSquare className="h-4 w-4" /> Message Ledger (WF16)
                  </button>

                  {dayState?.status !== 'open' && canOpenSalonDay(userRole) && (
                    <button
                      type="button"
                      onClick={() => setShowOpenDayModal(true)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-periwinkle-500 px-4 text-xs font-bold text-obsidian-950 hover:bg-periwinkle-400"
                    >
                      <ShieldCheck className="h-4 w-4" /> Open Salon Day (WF18)
                    </button>
                  )}

                  {dayState?.status === 'open' && canOpenSalonDay(userRole) && (
                    <button
                      type="button"
                      onClick={() => setShowCloseDayDrawer(true)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-bold text-obsidian-950 hover:bg-amber-400"
                      data-testid="open-close-day-drawer-btn"
                    >
                      <Lock className="h-4 w-4" /> Close Salon Day (WF08)
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* QUEUE NAVIGATION TABS (WF12) */}
            <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab('arrivals')}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                  activeTab === 'arrivals'
                    ? 'border border-periwinkle-400/40 bg-periwinkle-500/20 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>Arrivals Queue</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-200">
                  {queues.summary.arrivals_count}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('in_service')}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                  activeTab === 'in_service'
                    ? 'border border-cyan-400/40 bg-cyan-500/20 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>In-Service Floor</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-200">
                  {queues.summary.in_service_count}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ready')}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                  activeTab === 'ready'
                    ? 'border border-emerald-400/40 bg-emerald-500/20 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>Ready for Pickup</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-200">
                  {queues.summary.ready_count}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('exceptions')}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                  activeTab === 'exceptions'
                    ? 'border border-amber-400/40 bg-amber-500/20 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>Exceptions</span>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
                  {queues.summary.exceptions_count}
                </span>
              </button>
            </div>

            {/* QUEUE 1: ARRIVALS (WF01) */}
            {activeTab === 'arrivals' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                    Front Desk Arrivals Queue
                  </h3>
                  <span className="text-xs text-zinc-400">
                    Waiver check & collector verification required
                  </span>
                </div>

                {queues.arrivals.length === 0 ? (
                  <p className="glass-card p-6 text-center text-sm text-zinc-400">
                    No arriving pets in queue for {selectedDate}.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {queues.arrivals.map((visit) => {
                      const late = isLateArrival(visit.scheduled_time);
                      return (
                        <div key={visit.id} className="glass-card flex flex-col justify-between p-4 sm:p-5">
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="text-base font-extrabold text-white">
                                  {visit.pet_name}
                                </h4>
                                <p className="text-xs text-zinc-400">
                                  {visit.client_name} · {visit.service_package}
                                </p>
                              </div>
                              <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-mono text-zinc-200">
                                {visit.scheduled_time.slice(11, 16)}
                              </span>
                            </div>

                            {late.isLate && (
                              <div className="flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-300">
                                <Clock className="h-3 w-3" /> Late Arrival ({late.minutesLate}m past
                                15m grace)
                              </div>
                            )}

                            {isBiteRiskPet(visit.pet_notes) && (
                              <div className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300">
                                <AlertTriangle className="h-3 w-3" /> Behavioral Alert: Bite Risk
                              </div>
                            )}

                            <div className="text-xs text-zinc-400">
                              <p>Groomer: {visit.staff_name || 'Unassigned'}</p>
                              <p>Station: {visit.station_name || 'Unassigned'}</p>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-white/10">
                            {canStaffCheckIn(userRole) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setCheckingInVisit(visit);
                                  setCollectorName(visit.client_name);
                                  setCheckInWeight(visit.pet_weight_lbs ? String(visit.pet_weight_lbs) : '');
                                }}
                                className="w-full rounded-xl bg-periwinkle-500 py-2.5 text-xs font-bold text-obsidian-950 hover:bg-periwinkle-400"
                              >
                                Check In Pet (WF01)
                              </button>
                            ) : (
                              <p className="text-center text-xs text-zinc-500">
                                Front desk role required to check in.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* QUEUE 2: IN-SERVICE FLOOR (WF09) */}
            {activeTab === 'in_service' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                    Station Floor Task Cards
                  </h3>
                  <span className="text-xs text-zinc-400">
                    Acknowledge safety notes before service · Sequential progression
                  </span>
                </div>

                {queues.in_service.length === 0 ? (
                  <p className="glass-card p-6 text-center text-sm text-zinc-400">
                    No visits currently in service on the floor.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {queues.in_service.map((visit) => {
                      const needsSafetyAck =
                        visit.status === 'checked_in' && !visit.safety_notes_acknowledged_at;
                      const biteRisk = isBiteRiskPet(visit.pet_notes);

                      return (
                        <div key={visit.id} className="glass-card flex flex-col justify-between p-4 sm:p-5">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="text-base font-extrabold text-white">
                                  {visit.pet_name}
                                </h4>
                                <p className="text-xs text-zinc-400">{visit.service_package}</p>
                              </div>
                              <span className="rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-0.5 text-xs font-semibold capitalize text-cyan-200">
                                {visit.status.replace('_', ' ')}
                              </span>
                            </div>

                            {/* Safety notes banner */}
                            {needsSafetyAck && (
                              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
                                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                                  <ShieldAlert className="h-4 w-4" /> Safety Notes Pending (WF09)
                                </div>
                                <p className="mt-1 text-zinc-300">
                                  Groomer must review and acknowledge safety instructions before work begins.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void handleAcknowledgeSafety(visit.id)}
                                  className="mt-2 w-full rounded-lg bg-amber-400 py-1.5 font-bold text-obsidian-950 hover:bg-amber-300"
                                >
                                  Acknowledge Safety Notes
                                </button>
                              </div>
                            )}

                            {biteRisk && (
                              <div className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-300">
                                ⚠️ Caution: Bite Risk Pet (Restricted for bather alone)
                              </div>
                            )}

                            <div className="text-xs text-zinc-400 space-y-0.5">
                              <p>Station: {visit.station_name || 'Floor Table'}</p>
                              <p>Staff: {visit.staff_name || 'Assigned'}</p>
                              <p>Collector: {visit.authorized_collector_name || 'On file'}</p>
                            </div>

                            {/* Care note input */}
                            <div>
                              <label className="text-xs font-medium text-zinc-400">
                                Care Note for this stage:
                              </label>
                              <input
                                type="text"
                                placeholder="Add grooming note..."
                                value={careNotes[visit.id] ?? ''}
                                onChange={(e) =>
                                  setCareNotes((prev) => ({ ...prev, [visit.id]: e.target.value }))
                                }
                                className="mt-1 w-full rounded border border-white/10 bg-obsidian-900 px-2.5 py-1 text-xs text-white"
                              />
                            </div>
                          </div>

                          {/* Stage progression button */}
                          <div className="mt-4 pt-3 border-t border-white/10">
                            {visit.status === 'checked_in' && (
                              <button
                                type="button"
                                disabled={needsSafetyAck}
                                onClick={() => void handleAdvanceStage(visit, 'bathing')}
                                className="w-full rounded-xl bg-cyan-500 py-2.5 text-xs font-bold text-obsidian-950 hover:bg-cyan-400 disabled:opacity-50"
                              >
                                Advance to Bathing →
                              </button>
                            )}

                            {visit.status === 'bathing' && (
                              <button
                                type="button"
                                onClick={() => void handleAdvanceStage(visit, 'drying')}
                                className="w-full rounded-xl bg-cyan-500 py-2.5 text-xs font-bold text-obsidian-950 hover:bg-cyan-400"
                              >
                                Advance to Drying →
                              </button>
                            )}

                            {visit.status === 'drying' && (
                              <button
                                type="button"
                                disabled={userRole === 'bather'}
                                onClick={() => void handleAdvanceStage(visit, 'styling')}
                                className="w-full rounded-xl bg-violet-500 py-2.5 text-xs font-bold text-white hover:bg-violet-400 disabled:opacity-50"
                              >
                                Advance to Styling →
                              </button>
                            )}

                            {visit.status === 'styling' && (
                              <button
                                type="button"
                                disabled={userRole === 'bather'}
                                onClick={() => void handleAdvanceStage(visit, 'quality_check')}
                                className="w-full rounded-xl bg-violet-500 py-2.5 text-xs font-bold text-white hover:bg-violet-400 disabled:opacity-50"
                              >
                                Quality Check →
                              </button>
                            )}

                            {visit.status === 'quality_check' && (
                              <button
                                type="button"
                                disabled={userRole === 'bather'}
                                onClick={() => void handleAdvanceStage(visit, 'ready')}
                                className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-obsidian-950 hover:bg-emerald-400 disabled:opacity-50"
                              >
                                Mark Ready for Pickup (WF10) →
                              </button>
                            )}

                            {/* Slice 3: Floor Exception Actions (WF11 Surcharges & WF05 Safety Stops) */}
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSurchargeVisit(visit);
                                  setSurchargeAmount('25.00');
                                  setSurchargeReason('matted_coat');
                                  setSurchargeExtraTime('15');
                                  setSurchargeNotes('');
                                }}
                                className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/10 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20"
                              >
                                <DollarSign className="inline mr-1 h-3 w-3" />
                                Extra Work (WF11)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSafetyStopVisit(visit);
                                  setStopReason('');
                                  setIncidentType('dog_bite');
                                  setIncidentSeverity('moderate');
                                  setFirstAidNotes('');
                                  setVetContacted(false);
                                  setSuggestedCharge(((Number(visit.total_amount) || 50) * 0.5).toFixed(2));
                                }}
                                className="flex-1 rounded-lg border border-rose-500/30 bg-rose-500/10 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20"
                              >
                                <AlertTriangle className="inline mr-1 h-3 w-3" />
                                Safety Stop (WF05)
                              </button>
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setReportCardVisit(visit)}
                                  className="flex-1 rounded-lg border border-purple-500/30 bg-purple-500/10 py-1.5 text-[11px] font-semibold text-purple-300 hover:bg-purple-500/20"
                                  data-testid={`report-card-btn-${visit.id}`}
                                >
                                  <FileText className="inline mr-1 h-3 w-3" />
                                  Report Card (WF07)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCommsDrawerVisit(visit);
                                    setShowCommsDrawer(true);
                                  }}
                                  className="flex-1 rounded-lg border border-teal-500/30 bg-teal-500/10 py-1.5 text-[11px] font-semibold text-teal-300 hover:bg-teal-500/20"
                                  data-testid={`notify-btn-${visit.id}`}
                                >
                                  <MessageSquare className="inline mr-1 h-3 w-3" />
                                  Notify (WF16)
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* QUEUE 3: READY FOR PICKUP (WF10) */}
            {activeTab === 'ready' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                    Ready Queue & Release Gate
                  </h3>
                  <span className="text-xs text-zinc-400">
                    Collector match & settled payment required
                  </span>
                </div>

                {queues.ready_for_pickup.length === 0 ? (
                  <p className="glass-card p-6 text-center text-sm text-zinc-400">
                    No pets currently waiting for pickup.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {queues.ready_for_pickup.map((visit) => {
                      const isPaid = visit.status === 'paid';
                      return (
                        <div key={visit.id} className="glass-card flex flex-col justify-between p-4 sm:p-5">
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="text-base font-extrabold text-white">
                                  {visit.pet_name}
                                </h4>
                                <p className="text-xs text-zinc-400">
                                  {visit.client_name} · {visit.service_package}
                                </p>
                              </div>
                              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-200">
                                READY
                              </span>
                            </div>

                            <div className="rounded border border-white/10 bg-obsidian-900/60 p-2.5 text-xs space-y-1">
                              <p className="text-zinc-300">
                                <span className="font-semibold text-white">Authorized Collector:</span>{' '}
                                {visit.authorized_collector_name || visit.client_name}
                              </p>
                              <p className="text-zinc-300">
                                <span className="font-semibold text-white">Payment Status:</span>{' '}
                                {isPaid ? (
                                  <span className="font-bold text-emerald-400">Settled ✓</span>
                                ) : (
                                  <span className="font-bold text-amber-400">Pending Settlement</span>
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setReportCardVisit(visit)}
                                className="flex-1 rounded-lg border border-purple-500/30 bg-purple-500/10 py-1.5 text-[11px] font-semibold text-purple-300 hover:bg-purple-500/20"
                                data-testid={`ready-report-card-btn-${visit.id}`}
                              >
                                <FileText className="inline mr-1 h-3 w-3" />
                                Report Card (WF07)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCommsDrawerVisit(visit);
                                  setShowCommsDrawer(true);
                                }}
                                className="flex-1 rounded-lg border border-teal-500/30 bg-teal-500/10 py-1.5 text-[11px] font-semibold text-teal-300 hover:bg-teal-500/20"
                                data-testid={`ready-notify-btn-${visit.id}`}
                              >
                                <MessageSquare className="inline mr-1 h-3 w-3" />
                                Notify (WF16)
                              </button>
                            </div>

                            {canStaffRelease(userRole) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setReleasingVisit(visit);
                                  setReleasedToName(visit.authorized_collector_name || visit.client_name);
                                }}
                                className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-obsidian-950 hover:bg-emerald-400"
                              >
                                Release Pet (WF10)
                              </button>
                            ) : (
                              <p className="text-center text-xs text-zinc-500">
                                Front desk or manager role required to release.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* QUEUE 4: EXCEPTIONS (WF12) */}
            {activeTab === 'exceptions' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                    Operational Exceptions Queue
                  </h3>
                  <span className="text-xs text-zinc-400">
                    Waiver holds, late arrivals, paused visits & unpaid releases
                  </span>
                </div>

                {queues.exceptions.length === 0 ? (
                  <p className="glass-card p-6 text-center text-sm text-zinc-400">
                    Zero exceptions today. All visits flowing normally.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {queues.exceptions.map((visit) => (
                      <div
                        key={visit.id}
                        className="glass-card border-amber-500/30 flex flex-col justify-between p-4 sm:p-5"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-base font-extrabold text-white">
                                {visit.pet_name}
                              </h4>
                              <p className="text-xs text-zinc-400">{visit.client_name}</p>
                            </div>
                            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-bold uppercase text-amber-200">
                              {visit.status.replace('_', ' ')}
                            </span>
                          </div>

                          <p className="text-xs text-zinc-300">
                            {visit.status === 'waiver_hold'
                              ? 'Pet on WAIVER HOLD. Customer refused liability waiver. Manager decision required before service starts.'
                              : visit.status === 'released_unpaid'
                              ? `Released unpaid by manager override: "${visit.unpaid_release_reason || 'Approved'}"`
                              : `Exception status '${visit.status}' active.`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* MODAL 1: MANAGER OPEN DAY (WF18) */}
        {showOpenDayModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 p-4 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Manager Opening Check (WF18)</h3>
                <button
                  type="button"
                  onClick={() => setShowOpenDayModal(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-zinc-400">
                Opening check ensures staff coverage, sanitized equipment, and emergency contact readiness before appointments begin.
              </p>

              <form onSubmit={handleOpenDay} className="space-y-3">
                <label className="flex items-center gap-2.5 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={openDayChecklist.shifts_confirmed}
                    onChange={(e) =>
                      setOpenDayChecklist((prev) => ({ ...prev, shifts_confirmed: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-obsidian-900"
                  />
                  <span>Staff shifts confirmed & groomers clocked in</span>
                </label>

                <label className="flex items-center gap-2.5 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={openDayChecklist.stations_ready}
                    onChange={(e) =>
                      setOpenDayChecklist((prev) => ({ ...prev, stations_ready: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-obsidian-900"
                  />
                  <span>Stations, tubs, and tables sanitized</span>
                </label>

                <label className="flex items-center gap-2.5 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={openDayChecklist.supplies_stocked}
                    onChange={(e) =>
                      setOpenDayChecklist((prev) => ({ ...prev, supplies_stocked: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-obsidian-900"
                  />
                  <span>Shampoos, towels, and blades fully stocked</span>
                </label>

                <label className="flex items-center gap-2.5 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={openDayChecklist.emergency_contacts_verified}
                    onChange={(e) =>
                      setOpenDayChecklist((prev) => ({
                        ...prev,
                        emergency_contacts_verified: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-obsidian-900"
                  />
                  <span>Emergency veterinary contacts verified</span>
                </label>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-periwinkle-500 py-2.5 text-sm font-bold text-obsidian-950 hover:bg-periwinkle-400"
                  >
                    Confirm & Open Salon Day
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: CHECK IN VISIT (WF01) */}
        {checkingInVisit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 p-4 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">
                  Check In {checkingInVisit.pet_name} (WF01)
                </h3>
                <button
                  type="button"
                  onClick={() => setCheckingInVisit(null)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCheckInSubmit} className="space-y-3">
                <label className="block text-xs font-semibold text-zinc-300">
                  Authorized Collector Name <span className="text-rose-400">*</span>
                  <input
                    type="text"
                    required
                    value={collectorName}
                    onChange={(e) => setCollectorName(e.target.value)}
                    placeholder="Full name of person who will collect pet"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="block text-xs font-semibold text-zinc-300">
                  Collector Phone Number
                  <input
                    type="tel"
                    value={collectorPhone}
                    onChange={(e) => setCollectorPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="block text-xs font-semibold text-zinc-300">
                  Pet Weight at Intake (lbs)
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="300"
                    value={checkInWeight}
                    onChange={(e) => setCheckInWeight(e.target.value)}
                    placeholder="e.g. 24.5"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 text-sm text-white"
                  />
                </label>

                <div className="pt-1">
                  <span className="block text-xs font-semibold text-zinc-300 mb-1">
                    Digital Liability Waiver
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWaiverStatus('verified')}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                        waiverStatus === 'verified'
                          ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                          : 'border-white/10 bg-obsidian-900 text-zinc-400'
                      }`}
                    >
                      ✓ Signed & Verified
                    </button>
                    <button
                      type="button"
                      onClick={() => setWaiverStatus('refused')}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                        waiverStatus === 'refused'
                          ? 'border-rose-400/40 bg-rose-500/20 text-rose-200'
                          : 'border-white/10 bg-obsidian-900 text-zinc-400'
                      }`}
                    >
                      ✕ Refused (Waiver Hold)
                    </button>
                  </div>
                  {waiverStatus === 'refused' && (
                    <p className="mt-1.5 text-xs text-amber-300">
                      Waiver refusal will place visit on WAIVER HOLD. Manager decision required before grooming starts.
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-periwinkle-500 py-2.5 text-sm font-bold text-obsidian-950 hover:bg-periwinkle-400"
                  >
                    Confirm Check-In
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: RELEASE PET (WF10) */}
        {releasingVisit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 p-4 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">
                  Release {releasingVisit.pet_name} (WF10)
                </h3>
                <button
                  type="button"
                  onClick={() => setReleasingVisit(null)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded border border-white/10 bg-obsidian-900/60 p-3 text-xs space-y-1">
                <p className="text-zinc-300">
                  <span className="font-semibold text-white">Expected Collector:</span>{' '}
                  {releasingVisit.authorized_collector_name || releasingVisit.client_name}
                </p>
                <p className="text-zinc-300">
                  <span className="font-semibold text-white">Payment Status:</span>{' '}
                  {releasingVisit.status === 'paid' ? (
                    <span className="font-bold text-emerald-400">Settled ✓</span>
                  ) : (
                    <span className="font-bold text-rose-400">Unsettled / Pending</span>
                  )}
                </p>
              </div>

              <form onSubmit={handleReleaseSubmit} className="space-y-3">
                <label className="block text-xs font-semibold text-zinc-300">
                  Name of Person Collecting Pet <span className="text-rose-400">*</span>
                  <input
                    type="text"
                    required
                    value={releasedToName}
                    onChange={(e) => setReleasedToName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 text-sm text-white"
                  />
                </label>

                {releasingVisit.status !== 'paid' && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                    <p className="text-xs font-bold text-amber-300">
                      Payment is not settled. Standard release is blocked (WF10).
                    </p>

                    {canOverrideUnpaidRelease(userRole) ? (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                          <input
                            type="checkbox"
                            checked={unpaidOverride}
                            onChange={(e) => setUnpaidOverride(e.target.checked)}
                            className="h-4 w-4 rounded border-white/20 bg-obsidian-900"
                          />
                          <span>Manager Override: Release Unpaid</span>
                        </label>

                        {unpaidOverride && (
                          <input
                            type="text"
                            required
                            placeholder="Recorded reason for unpaid release (e.g. invoiced account)"
                            value={unpaidReason}
                            onChange={(e) => setUnpaidReason(e.target.value)}
                            className="w-full rounded border border-white/15 bg-obsidian-900 px-2.5 py-1.5 text-xs text-white"
                          />
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400">
                        Front desk staff cannot release unpaid pets without manager authorization.
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={releasingVisit.status !== 'paid' && !unpaidOverride}
                    className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-obsidian-950 hover:bg-emerald-400 disabled:opacity-40"
                  >
                    Confirm Release & Complete Visit
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: STAFF INVITATION (WF04) */}
        {showInviteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 p-4 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Invite Staff Member (WF04)</h3>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleInviteSubmit} className="space-y-3">
                <label className="block text-xs font-semibold text-zinc-300">
                  Staff Email <span className="text-rose-400">*</span>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="groomer@example.com"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="block text-xs font-semibold text-zinc-300">
                  Full Name
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="First Last"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="block text-xs font-semibold text-zinc-300">
                  Staff Role (RBAC)
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as LiveStaffRole)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 text-sm text-white"
                  >
                    <option value="groomer">Groomer</option>
                    <option value="senior_groomer">Senior Groomer</option>
                    <option value="bather">Bather</option>
                    <option value="front_desk">Front Desk</option>
                    <option value="manager">Manager</option>
                    {userRole === 'owner' && <option value="owner">Owner</option>}
                  </select>
                </label>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-periwinkle-500 py-2.5 text-sm font-bold text-obsidian-950 hover:bg-periwinkle-400"
                  >
                    Send Staff Invitation (7-day link)
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 5: EXTRA WORK / SURCHARGE REQUEST (WF11) */}
        {surchargeVisit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 p-4 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-amber-400" />
                  <h3 className="text-lg font-bold text-white">
                    Request Extra Work for {surchargeVisit.pet_name} (WF11)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSurchargeVisit(null)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-zinc-300">
                In-service coat findings require explicit customer approval. No extra fee can be
                applied without recorded client consent.
              </p>

              <form onSubmit={handleRequestSurchargeSubmit} className="space-y-3">
                <label className="block text-xs font-semibold text-zinc-300">
                  Surcharge Amount ($) <span className="text-rose-400">*</span>
                  <input
                    type="number"
                    step="5.00"
                    min="5.00"
                    required
                    value={surchargeAmount}
                    onChange={(e) => setSurchargeAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 font-mono text-sm text-white"
                  />
                </label>

                <label className="block text-xs font-semibold text-zinc-300">
                  Reason for Extra Care
                  <select
                    value={surchargeReason}
                    onChange={(e) => setSurchargeReason(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 text-sm text-white"
                  >
                    <option value="matted_coat">Matted Coat Dematting</option>
                    <option value="behavioral_handling">Behavioral Handling (2 Handlers)</option>
                    <option value="flea_tick">Flea & Tick Treatment</option>
                    <option value="special_shampoo">Specialized Medicated Shampoo</option>
                    <option value="extra_time">Extended Drying / Scissoring Time</option>
                    <option value="other">Other Extra Care</option>
                  </select>
                </label>

                <label className="block text-xs font-semibold text-zinc-300">
                  Additional Duration (Minutes)
                  <input
                    type="number"
                    step="5"
                    min="0"
                    value={surchargeExtraTime}
                    onChange={(e) => setSurchargeExtraTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 font-mono text-sm text-white"
                  />
                </label>

                <label className="block text-xs font-semibold text-zinc-300">
                  Groomer Findings / Notes for Pet Parent
                  <textarea
                    rows={2}
                    value={surchargeNotes}
                    onChange={(e) => setSurchargeNotes(e.target.value)}
                    placeholder="Describe coat condition or behavioral need..."
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 text-xs text-white"
                  />
                </label>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-obsidian-950 hover:bg-amber-400"
                  >
                    Submit Surcharge Request (WF11)
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 6: SAFETY STOP & INCIDENT REPORT (WF05 / WF14) */}
        {safetyStopVisit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 p-4 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-400" />
                  <h3 className="text-lg font-bold text-white">
                    Unsafe Service Interruption (WF05 / WF14)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSafetyStopVisit(null)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                Stopping a groom marks the visit as <strong className="font-bold underline">partly_completed</strong> (never completed). If injury or equipment hazard occurred, an immutable incident report is submitted.
              </div>

              <form onSubmit={handleSafetyStopSubmit} className="space-y-3">
                <label className="block text-xs font-semibold text-zinc-300">
                  Reason for Stopping Service <span className="text-rose-400">*</span>
                  <input
                    type="text"
                    required
                    value={stopReason}
                    onChange={(e) => setStopReason(e.target.value)}
                    placeholder="Severe distress, bite risk, or equipment failure..."
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 text-sm text-white"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Incident Type
                    <select
                      value={incidentType}
                      onChange={(e) => setIncidentType(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 py-2 text-xs text-white"
                    >
                      <option value="dog_bite">Dog Bite</option>
                      <option value="skin_tear">Skin Tear / Scratch</option>
                      <option value="seizure">Seizure / Collapse</option>
                      <option value="equipment_failure">Equipment Failure</option>
                      <option value="severe_distress">Severe Pet Distress</option>
                      <option value="other">Other Safety Concern</option>
                    </select>
                  </label>

                  <label className="block text-xs font-semibold text-zinc-300">
                    Severity Level
                    <select
                      value={incidentSeverity}
                      onChange={(e) => setIncidentSeverity(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-2 py-2 text-xs text-white"
                    >
                      <option value="minor">Minor</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
                </div>

                <label className="block text-xs font-semibold text-zinc-300">
                  First Aid Administered
                  <textarea
                    rows={2}
                    value={firstAidNotes}
                    onChange={(e) => setFirstAidNotes(e.target.value)}
                    placeholder="Wound cleansed, antiseptic applied, pressure held..."
                    className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-2 text-xs text-white"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2 items-center">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Adjusted Partial Charge ($)
                    <input
                      type="number"
                      step="5.00"
                      min="0"
                      value={suggestedCharge}
                      onChange={(e) => setSuggestedCharge(e.target.value)}
                      placeholder="e.g. 40.00"
                      className="mt-1 w-full rounded-lg border border-white/15 bg-obsidian-900 px-3 py-1.5 font-mono text-sm text-white"
                    />
                  </label>

                  <label className="flex items-center gap-2 pt-4 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={vetContacted}
                      onChange={(e) => setVetContacted(e.target.checked)}
                      className="rounded border-white/20 bg-obsidian-900 text-rose-500"
                    />
                    <span>Vet Clinic Contacted</span>
                  </label>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-rose-500 py-2.5 text-sm font-bold text-white hover:bg-rose-400"
                  >
                    Execute Safety Stop & Lock Report
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SLICE 4: CLOSE SALON DAY DRAWER (WF08) */}
        <CloseDayDrawer
          isOpen={showCloseDayDrawer}
          onClose={() => setShowCloseDayDrawer(false)}
          salonDate={selectedDate}
          visits={visits}
          getAccessToken={getAccessToken}
          onSuccess={(msg) => {
            setStatusNotice(msg);
            setShowCloseDayDrawer(false);
            void refresh();
          }}
        />

        {/* SLICE 4: REPORT CARD MODAL (WF07) */}
        {reportCardVisit && (
          <ReportCardModal
            isOpen={!!reportCardVisit}
            onClose={() => setReportCardVisit(null)}
            visit={reportCardVisit}
            groomerName="Assigned Groomer"
            getAccessToken={getAccessToken}
            onSuccess={(msg) => {
              setStatusNotice(msg);
              setReportCardVisit(null);
              void refresh();
            }}
          />
        )}

        {/* SLICE 4: CLIENT COMMUNICATIONS LEDGER & NOTIFICATIONS (WF16 / WF17) */}
        <CommunicationsDrawer
          isOpen={showCommsDrawer}
          onClose={() => setShowCommsDrawer(false)}
          visitId={commsDrawerVisit?.id}
          clientPhone={commsDrawerVisit?.authorized_collector_phone || null}
          petName={commsDrawerVisit?.pet_name}
          onMessageLogged={() => {
            setStatusNotice('Client communication logged.');
          }}
        />
      </div>
    </div>
  );
}
