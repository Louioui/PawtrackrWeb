'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  Plus,
  Send,
  CheckCircle2,
  AlertTriangle,
  Users,
  Calendar,
  Sparkles,
  RefreshCw,
  ExternalLink,
  X,
  Timer,
  Check,
  ShieldCheck,
  XCircle,
  Copy,
} from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import LiveWorkspaceShell from '@/components/LiveWorkspaceShell';
import { LiveStaffRole } from '@/lib/workflow-context';
import {
  WaitlistEntry,
  WaitlistOffer,
  calculateOfferExpiration,
  formatWaitlistNotificationText,
  rankWaitlistCandidates,
} from '@/lib/live-waitlist';

export default function LiveWaitlistPage() {
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

  // Waitlist data
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [offers, setOffers] = useState<WaitlistOffer[]>([]);
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [stations, setStations] = useState<Array<{ id: string; name: string }>>([]);
  const [clients, setClients] = useState<Array<{ id: string; full_name: string; phone: string }>>([]);
  const [pets, setPets] = useState<Array<{ id: string; name: string; breed: string; client_id: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  // New waitlist entry modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedPetId, setSelectedPetId] = useState('');
  const [servicePackage, setServicePackage] = useState('Full Groom');
  const [preferredStaffId, setPreferredStaffId] = useState('');
  const [timePreference, setTimePreference] = useState<'any' | 'morning' | 'afternoon' | 'weekend'>('any');
  const [preferredDate, setPreferredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);

  // Offer modal
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [targetEntry, setTargetEntry] = useState<WaitlistEntry | null>(null);
  const [offeredStart, setOfferedStart] = useState('');
  const [offeredEnd, setOfferedEnd] = useState('');
  const [assignedStaffId, setAssignedStaffId] = useState('');
  const [assignedStationId, setAssignedStationId] = useState('');
  const [holdMinutes, setHoldMinutes] = useState(120);
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);

  // Notification preview modal
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [copiedNotification, setCopiedNotification] = useState(false);

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
        fetchWaitlistData(session.access_token);
      } else {
        setPhase('ready');
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSignedIn(true);
        fetchWaitlistData(session.access_token);
      } else {
        setSignedIn(false);
        setPhase('ready');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchWaitlistData = useCallback(async (token: string) => {
    setIsLoading(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;

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
            setSalonName(business.name || 'Pawtrackr Salon');
            setSalonSlug(business.slug || '');
            setOperatingModel((business.operating_model as any) || 'salon');
            setBookingStatus((business.booking_status as any) || 'draft');
          }

          // Fetch active staff roster
          const { data: roster } = await supabase
            .from('staff_members')
            .select('id, name')
            .eq('business_id', staff.business_id)
            .eq('is_active', true);
          setStaffMembers(roster || []);

          // Fetch active stations
          const { data: activeStations } = await supabase
            .from('salon_stations')
            .select('id, name')
            .eq('business_id', staff.business_id)
            .eq('is_active', true);
          setStations(activeStations || []);

          // Fetch clients & pets for waitlist entry creation
          const { data: clientList } = await supabase
            .from('clients')
            .select('id, full_name, phone')
            .eq('business_id', staff.business_id)
            .order('full_name');
          setClients(clientList || []);

          const { data: petList } = await supabase
            .from('pets')
            .select('id, name, breed, client_id')
            .eq('business_id', staff.business_id)
            .order('name');
          setPets(petList || []);
        }
      }

      // Fetch waitlist entries and offers via API
      const res = await fetch('/api/waitlist', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setEntries(json.entries || []);
        setOffers(json.offers || []);
      }
      setPhase('ready');
    } catch (err: any) {
      console.error('Waitlist fetch error:', err);
      setStatusNotice('Error loading waitlist data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Filtered pets for selected client
  const availablePets = useMemo(() => {
    if (!selectedClientId) return [];
    return pets.filter((p) => p.client_id === selectedClientId);
  }, [pets, selectedClientId]);

  // Derived metrics
  const activeEntries = useMemo(
    () => entries.filter((e) => e.status === 'active'),
    [entries]
  );
  const pendingOffers = useMemo(
    () => offers.filter((o) => o.status === 'pending'),
    [offers]
  );
  const bookedCount = useMemo(
    () => entries.filter((e) => e.status === 'booked').length,
    [entries]
  );
  const expiredCount = useMemo(
    () => entries.filter((e) => e.status === 'expired').length,
    [entries]
  );

  const rankedEntries = useMemo(() => rankWaitlistCandidates(entries), [entries]);

  // Handle Login
  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
    }
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  // Create waitlist entry
  const handleAddWaitlistEntry = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !selectedPetId || !servicePackage) {
      setStatusNotice('Please fill in client, pet, and service package.');
      return;
    }

    setIsSubmittingEntry(true);
    setStatusNotice('');
    try {
      const supabase = getSupabaseClient();
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!session) return;

      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          clientId: selectedClientId,
          petId: selectedPetId,
          servicePackage,
          preferredStaffId: preferredStaffId || null,
          preferredDates: preferredDate ? [preferredDate] : [],
          timePreference,
          notes: notes || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setStatusNotice(json.error || 'Failed to add client to waitlist.');
        return;
      }

      setAddModalOpen(false);
      setSelectedClientId('');
      setSelectedPetId('');
      setNotes('');
      setPreferredDate('');
      setStatusNotice('Client added to waitlist queue successfully.');
      fetchWaitlistData(session.access_token);
    } catch (err: any) {
      setStatusNotice(err.message || 'Error creating waitlist entry.');
    } finally {
      setIsSubmittingEntry(false);
    }
  };

  // Open Offer Modal
  const openOfferModal = (entry: WaitlistEntry) => {
    setTargetEntry(entry);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const end = new Date(tomorrow);
    end.setHours(11, 0, 0, 0);

    setOfferedStart(tomorrow.toISOString().slice(0, 16));
    setOfferedEnd(end.toISOString().slice(0, 16));
    setAssignedStaffId(entry.preferred_staff_id || staffMembers[0]?.id || '');
    setAssignedStationId(stations[0]?.id || '');
    setHoldMinutes(120);
    setOfferModalOpen(true);
  };

  // Generate slot offer
  const handleGenerateOffer = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetEntry || !offeredStart || !offeredEnd || !assignedStaffId) {
      setStatusNotice('Please specify start, end, and assigned groomer.');
      return;
    }

    setIsSubmittingOffer(true);
    setStatusNotice('');
    try {
      const supabase = getSupabaseClient();
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!session) return;

      const res = await fetch('/api/waitlist/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          waitlistEntryId: targetEntry.id,
          offeredStart: new Date(offeredStart).toISOString(),
          offeredEnd: new Date(offeredEnd).toISOString(),
          assignedStaffId,
          assignedStationId: assignedStationId || null,
          holdDurationMinutes: holdMinutes,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setStatusNotice(json.error || 'Failed to generate slot offer.');
        return;
      }

      setOfferModalOpen(false);
      setStatusNotice('2-hour slot hold offer generated successfully.');

      // Format notification text preview
      const claimUrl = `${window.location.origin}/waitlist/claim?offerId=${json.offer_id}&token=${json.claim_token}`;
      const msg = formatWaitlistNotificationText({
        petName: targetEntry.pet?.name || 'Your pet',
        servicePackage: targetEntry.service_package,
        slotStart: new Date(offeredStart),
        expiresAt: new Date(json.expires_at),
        claimUrl,
        salonName,
      });
      setPreviewText(msg);
      setNoticeModalOpen(true);

      fetchWaitlistData(session.access_token);
    } catch (err: any) {
      setStatusNotice(err.message || 'Error generating offer.');
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  // Claim offer
  const handleClaimOffer = async (offer: WaitlistOffer) => {
    setStatusNotice('');
    try {
      const supabase = getSupabaseClient();
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!session) return;

      const res = await fetch(`/api/waitlist/offers/${offer.id}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ claimToken: offer.claim_token }),
      });

      const json = await res.json();
      if (!res.ok) {
        setStatusNotice(json.error || 'Failed to claim offer.');
        return;
      }

      setStatusNotice('Appointment booked and confirmed from waitlist!');
      fetchWaitlistData(session.access_token);
    } catch (err: any) {
      setStatusNotice(err.message || 'Error claiming offer.');
    }
  };

  // Decline offer
  const handleDeclineOffer = async (offer: WaitlistOffer) => {
    setStatusNotice('');
    try {
      const supabase = getSupabaseClient();
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!session) return;

      const res = await fetch(`/api/waitlist/offers/${offer.id}/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ claimToken: offer.claim_token }),
      });

      const json = await res.json();
      if (!res.ok) {
        setStatusNotice(json.error || 'Failed to decline offer.');
        return;
      }

      setStatusNotice('Offer declined. Candidate returned to active waitlist.');
      fetchWaitlistData(session.access_token);
    } catch (err: any) {
      setStatusNotice(err.message || 'Error declining offer.');
    }
  };

  // Trigger manual sweep
  const handleSweepExpired = async () => {
    setIsLoading(true);
    setStatusNotice('');
    try {
      const supabase = getSupabaseClient();
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!session) return;

      await fetch('/api/waitlist', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setStatusNotice('Waitlist hold sweep completed. Expired offers cleared.');
      fetchWaitlistData(session.access_token);
    } catch (err: any) {
      setStatusNotice(err.message || 'Sweep failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Copy notification text
  const copyToClipboard = () => {
    navigator.clipboard.writeText(previewText);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#0B090E] text-zinc-100 selection:bg-[#8B95FF]/30">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Navigation & Salon Shell */}
        <LiveWorkspaceShell
          salonName={salonName}
          slug={salonSlug}
          role={role}
          operatingModel={operatingModel}
          bookingStatus={bookingStatus}
          onSignOut={handleSignOut}
        >
          {/* Header Bar */}
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-[#8B95FF] ring-4 ring-[#8B95FF]/20" />
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Smart Waitlist &amp; Slot Hold Engine
                </h1>
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                Automated 2-hour versioned slot holds (WF15), silence-as-expiration guards, and GiST re-verification.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleSweepExpired}
                disabled={isLoading}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.08]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Sweep Expired Holds
              </button>

              <button
                onClick={() => setAddModalOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-[#8B95FF] px-4 py-2 text-xs font-semibold text-[#0B090E] transition-all hover:bg-[#8B95FF]/90 shadow-lg shadow-[#8B95FF]/20"
              >
                <Plus className="h-4 w-4" />
                Add to Waitlist
              </button>
            </div>
          </div>

          {/* Status notification toast */}
          {statusNotice && (
            <div className="mb-6 flex items-center justify-between rounded-lg border border-[#8B95FF]/30 bg-[#8B95FF]/10 px-4 py-3 text-sm text-[#8B95FF]">
              <span>{statusNotice}</span>
              <button
                onClick={() => setStatusNotice('')}
                className="ml-3 text-xs text-zinc-400 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Login Gate if unauthenticated */}
          {!signedIn && (
            <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl">
              <div className="mb-4 text-center">
                <ShieldCheck className="mx-auto h-10 w-10 text-[#8B95FF]" />
                <h2 className="mt-2 text-lg font-bold text-white">Staff Authentication Required</h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Sign in with your verified staff credentials to manage the waitlist.
                </p>
              </div>

              {message && (
                <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                  {message}
                </div>
              )}

              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400">Staff Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                    placeholder="staff@pawtrackr.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#8B95FF] py-2.5 text-xs font-bold text-[#0B090E] transition-all hover:bg-[#8B95FF]/90"
                >
                  Sign In to Live Waitlist
                </button>
              </form>
            </div>
          )}

          {/* Authenticated Dashboard Content */}
          {signedIn && (
            <div className="space-y-8">
              {/* Metric Cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Active Waiting</span>
                    <Users className="h-4 w-4 text-[#8B95FF]" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-white">{activeEntries.length}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">Pets ready for open slots</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Active Slot Holds</span>
                    <Timer className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-amber-300">{pendingOffers.length}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">2-hour hold countdowns live</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Claimed &amp; Booked</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-emerald-300">{bookedCount}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">Reclaimed revenue</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Expired Holds</span>
                    <XCircle className="h-4 w-4 text-zinc-500" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-zinc-400">{expiredCount}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">Promoted to next candidate</div>
                </div>
              </div>

              {/* Active Slot Holds Ticker */}
              {pendingOffers.length > 0 && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-5 backdrop-blur-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Timer className="h-5 w-5 text-amber-400" />
                      <h2 className="text-base font-bold text-white">Active 2-Hour Slot Holds</h2>
                    </div>
                    <span className="rounded bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-300">
                      Silence Never Acceptance
                    </span>
                  </div>

                  <div className="space-y-3">
                    {pendingOffers.map((offer) => {
                      const exp = calculateOfferExpiration(offer.created_at, 120);
                      const petName = offer.entry?.pet?.name || 'Pet';
                      const clientPhone = offer.entry?.client?.phone || '';
                      const slotTime = new Date(offer.offered_start).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      });
                      const slotDate = new Date(offer.offered_start).toLocaleDateString([], {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      });

                      return (
                        <div
                          key={offer.id}
                          className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/40 p-4 sm:flex-row sm:items-center"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{petName}</span>
                              <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-zinc-300">
                                {offer.entry?.service_package || 'Service'}
                              </span>
                              <span className="text-xs text-zinc-400">· {clientPhone}</span>
                            </div>
                            <div className="mt-1 text-xs text-zinc-400">
                              Offered Slot: <span className="text-zinc-200">{slotDate} at {slotTime}</span> with{' '}
                              <span className="text-zinc-200">{offer.staff?.name || 'Staff'}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{exp.remainingFormatted}</span>
                            </div>

                            <button
                              onClick={() => handleClaimOffer(offer)}
                              className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                            >
                              Mark Claimed
                            </button>

                            <button
                              onClick={() => handleDeclineOffer(offer)}
                              className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30 transition-colors"
                            >
                              Decline &amp; Release
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Waitlist Queue Table */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white">Waitlist Priority Queue</h2>
                    <p className="text-xs text-zinc-400">
                      Ranked candidates ordered by request position and submission timestamp.
                    </p>
                  </div>
                </div>

                {rankedEntries.length === 0 ? (
                  <div className="py-12 text-center text-sm text-zinc-500">
                    No active pet parents currently on the waitlist.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-zinc-400">
                          <th className="pb-3 font-semibold">Rank</th>
                          <th className="pb-3 font-semibold">Pet &amp; Breed</th>
                          <th className="pb-3 font-semibold">Client</th>
                          <th className="pb-3 font-semibold">Service</th>
                          <th className="pb-3 font-semibold">Time Preference</th>
                          <th className="pb-3 font-semibold">Status</th>
                          <th className="pb-3 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {rankedEntries.map((entry) => {
                          const statusColor =
                            entry.status === 'active'
                              ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30'
                              : entry.status === 'offered'
                              ? 'bg-[#8B95FF]/10 text-[#8B95FF] border-[#8B95FF]/30'
                              : entry.status === 'booked'
                              ? 'bg-blue-400/10 text-blue-300 border-blue-400/30'
                              : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';

                          return (
                            <tr key={entry.id} className="hover:bg-white/[0.02]">
                              <td className="py-3 font-mono font-bold text-zinc-300">
                                #{entry.rank_position}
                              </td>
                              <td className="py-3 font-medium text-white">
                                <div>{entry.pet?.name || 'Pet'}</div>
                                <div className="text-[11px] text-zinc-500">
                                  {entry.pet?.breed || 'Standard'}
                                </div>
                              </td>
                              <td className="py-3 text-zinc-300">
                                <div>{entry.client?.full_name || 'Client'}</div>
                                <div className="text-[11px] text-zinc-500">
                                  {entry.client?.phone || ''}
                                </div>
                              </td>
                              <td className="py-3 text-zinc-300">{entry.service_package}</td>
                              <td className="py-3 capitalize text-zinc-400">
                                {entry.time_preference}
                              </td>
                              <td className="py-3">
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusColor}`}
                                >
                                  {entry.status}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                {entry.status === 'active' && (
                                  <button
                                    onClick={() => openOfferModal(entry)}
                                    className="rounded-lg bg-[#8B95FF]/15 px-3 py-1.5 text-xs font-semibold text-[#8B95FF] hover:bg-[#8B95FF]/25 transition-colors"
                                  >
                                    Offer Slot Hold
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add to Waitlist Modal */}
          {addModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0B090E] p-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-lg font-bold text-white">Add Pet to Waitlist Queue</h3>
                  <button
                    onClick={() => setAddModalOpen(false)}
                    className="text-zinc-400 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleAddWaitlistEntry} className="mt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">Select Client</label>
                    <select
                      required
                      value={selectedClientId}
                      onChange={(e) => {
                        setSelectedClientId(e.target.value);
                        setSelectedPetId('');
                      }}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                    >
                      <option value="">Choose a pet parent...</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} ({c.phone})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400">Select Pet</label>
                    <select
                      required
                      disabled={!selectedClientId}
                      value={selectedPetId}
                      onChange={(e) => setSelectedPetId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none disabled:opacity-40"
                    >
                      <option value="">Choose pet...</option>
                      {availablePets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.breed})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400">Service Package</label>
                      <input
                        type="text"
                        required
                        value={servicePackage}
                        onChange={(e) => setServicePackage(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400">Time Preference</label>
                      <select
                        value={timePreference}
                        onChange={(e) => setTimePreference(e.target.value as any)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                      >
                        <option value="any">Any Time</option>
                        <option value="morning">Morning (8am - 12pm)</option>
                        <option value="afternoon">Afternoon (12pm - 5pm)</option>
                        <option value="weekend">Weekend Preferred</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400">
                      Preferred Groomer (Optional)
                    </label>
                    <select
                      value={preferredStaffId}
                      onChange={(e) => setPreferredStaffId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                    >
                      <option value="">Any Available Groomer</option>
                      {staffMembers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400">Notes / Preferences</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Nervous around clippers, needs morning drop-off"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setAddModalOpen(false)}
                      className="rounded-lg px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingEntry}
                      className="rounded-lg bg-[#8B95FF] px-5 py-2 text-xs font-bold text-[#0B090E] hover:bg-[#8B95FF]/90 transition-all"
                    >
                      {isSubmittingEntry ? 'Saving...' : 'Add to Queue'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Generate Slot Offer Modal */}
          {offerModalOpen && targetEntry && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0B090E] p-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">Generate 2-Hour Slot Hold</h3>
                    <p className="text-xs text-zinc-400">
                      Offering slot to: {targetEntry.pet?.name} ({targetEntry.client?.full_name})
                    </p>
                  </div>
                  <button
                    onClick={() => setOfferModalOpen(false)}
                    className="text-zinc-400 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleGenerateOffer} className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400">Slot Start</label>
                      <input
                        type="datetime-local"
                        required
                        value={offeredStart}
                        onChange={(e) => setOfferedStart(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400">Slot End</label>
                      <input
                        type="datetime-local"
                        required
                        value={offeredEnd}
                        onChange={(e) => setOfferedEnd(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400">Assigned Stylist</label>
                      <select
                        required
                        value={assignedStaffId}
                        onChange={(e) => setAssignedStaffId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                      >
                        <option value="">Select groomer...</option>
                        {staffMembers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400">Station / Table</label>
                      <select
                        value={assignedStationId}
                        onChange={(e) => setAssignedStationId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                      >
                        <option value="">Default Station</option>
                        {stations.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400">Hold Duration</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min={15}
                        max={1440}
                        value={holdMinutes}
                        onChange={(e) => setHoldMinutes(parseInt(e.target.value, 10) || 120)}
                        className="w-24 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#8B95FF] focus:outline-none"
                      />
                      <span className="text-xs text-zinc-400">minutes (Default 120 = 2 hours)</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setOfferModalOpen(false)}
                      className="rounded-lg px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingOffer}
                      className="rounded-lg bg-[#8B95FF] px-5 py-2 text-xs font-bold text-[#0B090E] hover:bg-[#8B95FF]/90 transition-all"
                    >
                      {isSubmittingOffer ? 'Generating...' : 'Lock Slot & Generate Hold'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Outgoing Notification Preview Modal */}
          {noticeModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0B090E] p-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#8B95FF]" />
                    <h3 className="text-lg font-bold text-white">Slot Hold Ready to Send</h3>
                  </div>
                  <button
                    onClick={() => setNoticeModalOpen(false)}
                    className="text-zinc-400 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <p className="text-xs text-zinc-400">
                    Copy and send this notification to the pet parent via SMS or email:
                  </p>

                  <div className="rounded-xl border border-white/10 bg-black/60 p-4 font-mono text-xs leading-relaxed text-zinc-200">
                    {previewText}
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-2 rounded-lg bg-[#8B95FF] px-4 py-2 text-xs font-bold text-[#0B090E] hover:bg-[#8B95FF]/90 transition-all"
                    >
                      {copiedNotification ? (
                        <>
                          <Check className="h-4 w-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy Message Text
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </LiveWorkspaceShell>
      </div>
    </div>
  );
}
