'use client';

import { Suspense, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Heart,
  MapPin,
  Phone,
  RotateCcw,
  Scissors,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  CustomerBookingDetails,
  CustomerBookingStatus,
} from '@/lib/customer-portal';

interface ManageBookingPortalProps {
  slug: string;
  salonName: string;
  timeZone: string | null;
}

const money = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const timeFormat = (timeZone?: string) =>
  new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timeZone || undefined,
  });

const dateFormat = (timeZone?: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timeZone || undefined,
  });

const statusLabels: Record<CustomerBookingStatus, { label: string; color: string; desc: string }> = {
  booked: {
    label: 'Appointment Confirmed',
    color: 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30',
    desc: 'Your appointment is booked. We look forward to seeing your pet!',
  },
  dropped_off: {
    label: 'Checked In at Salon',
    color: 'bg-sky-400/20 text-sky-300 border-sky-400/30',
    desc: 'Your pet has arrived at the salon and is settling in.',
  },
  bathing: {
    label: 'In Grooming: Bath & Prep',
    color: 'bg-periwinkle-400/20 text-periwinkle-200 border-periwinkle-400/30',
    desc: 'Your pet is enjoying their bath, blow-dry, and coat prep.',
  },
  styling: {
    label: 'In Grooming: Haircut & Styling',
    color: 'bg-indigo-400/20 text-indigo-200 border-indigo-400/30',
    desc: 'Our groomers are carefully styling your pet’s coat, ears, and paws.',
  },
  ready: {
    label: 'Ready for Pickup!',
    color: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40 animate-pulse',
    desc: 'Your pet is finished, looking fabulous, and ready to be picked up!',
  },
  completed: {
    label: 'Completed Visit',
    color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
    desc: 'This grooming visit has concluded. Thank you for visiting us!',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    desc: 'This appointment has been cancelled.',
  },
  no_show: {
    label: 'Missed Appointment',
    color: 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30',
    desc: 'This appointment was marked as missed.',
  },
};

function PortalContent({ slug, salonName, timeZone }: ManageBookingPortalProps) {
  const searchParams = useSearchParams();
  const initialRef = (searchParams.get('ref') || searchParams.get('reference') || '').toUpperCase();
  const initialPhone = searchParams.get('phone') || '';

  const [reference, setReference] = useState(initialRef);
  const [phone, setPhone] = useState(initialPhone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [booking, setBooking] = useState<CustomerBookingDetails | null>(null);

  // Cancellation state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Reschedule state
  const [showReschedule, setShowReschedule] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [rescheduling, setRescheduling] = useState(false);

  const refInputId = useId();
  const phoneInputId = useId();
  const cancelReasonId = useId();

  // Auto-fetch if both ref and phone are present in URL
  useEffect(() => {
    if (initialRef && initialPhone && !booking && !loading) {
      handleLookup(initialRef, initialPhone);
    }
  }, [initialRef, initialPhone]);

  const handleLookup = async (lookupRef = reference, lookupPhone = phone) => {
    setError(null);
    setActionSuccess(null);
    setLoading(true);

    try {
      const query = new URLSearchParams({
        slug,
        ref: lookupRef.trim().toUpperCase(),
        phone: lookupPhone.replace(/\D/g, ''),
      });

      const res = await fetch(`/api/public/bookings/manage?${query.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to find booking. Please check your reference code and phone number.');
        setBooking(null);
        return;
      }

      setBooking(data.booking);
      setShowCancelModal(false);
      setShowReschedule(false);
    } catch {
      setError('Connection dropped while checking your appointment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!booking) return;
    setCancelling(true);
    setError(null);

    try {
      const res = await fetch('/api/public/bookings/manage/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          reference: booking.reference,
          phone: phone.replace(/\D/g, ''),
          reason: cancelReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to cancel this appointment online.');
        return;
      }

      setActionSuccess('Your appointment has been successfully cancelled.');
      setShowCancelModal(false);
      // Refresh booking details
      handleLookup(booking.reference, phone);
    } catch {
      setError('A connection issue occurred while cancelling. Please verify with the salon.');
    } finally {
      setCancelling(false);
    }
  };

  // Load available slots when date changes for rescheduling
  const handleDateChange = async (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlot('');
    setSlots([]);
    if (!dateStr || !booking) return;

    setLoadingSlots(true);
    try {
      // Find package id if we can, or query with slug
      const res = await fetch(
        `/api/public/availability?slug=${encodeURIComponent(slug)}&package_id=full_groom&date=${dateStr}`
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data.slots)) {
        setSlots(data.slots);
      } else {
        setSlots([]);
      }
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleReschedule = async () => {
    if (!booking || !selectedSlot) return;
    setRescheduling(true);
    setError(null);

    try {
      const res = await fetch('/api/public/bookings/manage/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          reference: booking.reference,
          phone: phone.replace(/\D/g, ''),
          starts_at: selectedSlot,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to reschedule appointment.');
        return;
      }

      setActionSuccess('Your appointment has been rescheduled successfully!');
      setShowReschedule(false);
      handleLookup(booking.reference, phone);
    } catch {
      setError('Connection interrupted during reschedule. Please refresh to check appointment time.');
    } finally {
      setRescheduling(false);
    }
  };

  const inputStyle =
    'mt-1.5 block w-full rounded-lg border border-white/10 bg-obsidian-900/80 px-3.5 py-2.5 text-sm font-medium text-white placeholder-zinc-500 focus:border-periwinkle-400 focus:outline-none focus:ring-1 focus:ring-periwinkle-400';

  return (
    <div className="mt-8 space-y-6">
      {/* Lookup Card */}
      <section className="glass-card p-5 sm:p-6" aria-labelledby="lookup-heading">
        <h2 id="lookup-heading" className="text-xl font-bold text-white">
          Find your appointment
        </h2>
        <p className="mt-1 text-sm text-zinc-300">
          Enter your 8-character confirmation reference and the mobile phone number used during booking.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLookup();
          }}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <div>
            <label htmlFor={refInputId} className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Booking Reference
            </label>
            <input
              id={refInputId}
              type="text"
              required
              maxLength={8}
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              className={`${inputStyle} font-mono tracking-widest uppercase`}
            />
          </div>

          <div>
            <label htmlFor={phoneInputId} className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Mobile Phone
            </label>
            <input
              id={phoneInputId}
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className={inputStyle}
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={loading || !reference || !phone}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-periwinkle-400 px-5 text-sm font-bold text-obsidian-950 transition hover:bg-periwinkle-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {loading ? 'Searching…' : 'Find Appointment'}
            </button>
          </div>
        </form>
      </section>

      {/* Global notifications */}
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {actionSuccess && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
          <p>{actionSuccess}</p>
        </div>
      )}

      {/* Appointment Details & Live Status Tracker */}
      {booking && (
        <article className="glass-card divide-y divide-white/10" aria-labelledby="appointment-heading">
          {/* Header & Status Banner */}
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-mono text-xs font-semibold tracking-wider text-periwinkle-300 uppercase">
                  Reference: {booking.reference}
                </span>
                <h2 id="appointment-heading" className="mt-1 text-2xl font-bold text-white">
                  {booking.petName}’s Appointment
                </h2>
                <p className="text-sm text-zinc-400">
                  {booking.petBreed} · Booked by {booking.clientName}
                </p>
              </div>

              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold ${
                  statusLabels[booking.status]?.color || 'bg-zinc-800 text-zinc-300'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {statusLabels[booking.status]?.label || booking.status}
              </div>
            </div>

            <p className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-zinc-300">
              {statusLabels[booking.status]?.desc}
            </p>
          </div>

          {/* Schedule & Salon Details */}
          <div className="grid gap-4 p-5 text-sm sm:grid-cols-2 sm:p-6">
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-periwinkle-300" aria-hidden="true" />
                <div>
                  <div className="text-xs text-zinc-400">Scheduled Date</div>
                  <div className="font-semibold text-white">
                    {dateFormat(booking.timeZone).format(new Date(booking.startsAt))}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-periwinkle-300" aria-hidden="true" />
                <div>
                  <div className="text-xs text-zinc-400">Time Window</div>
                  <div className="font-semibold text-white">
                    {timeFormat(booking.timeZone).format(new Date(booking.startsAt))} –{' '}
                    {timeFormat(booking.timeZone).format(new Date(booking.endsAt))}
                    <span className="ml-1 text-xs text-zinc-400">
                      ({booking.timeZone.replaceAll('_', ' ')})
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">Duration: ~{booking.durationMinutes} min</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-periwinkle-300" aria-hidden="true" />
                <div>
                  <div className="text-xs text-zinc-400">Service Package</div>
                  <div className="font-semibold text-white">
                    {booking.service} · {money(booking.price)}
                  </div>
                  {booking.staffName && (
                    <div className="text-xs text-zinc-400">Groomer: {booking.staffName}</div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-periwinkle-300" aria-hidden="true" />
                <div>
                  <div className="text-xs text-zinc-400">Location</div>
                  <div className="font-semibold text-white">{booking.salonName}</div>
                  {booking.salonAddress && (
                    <div className="text-xs text-zinc-400">{booking.salonAddress}</div>
                  )}
                  {booking.salonPhone && (
                    <a
                      href={`tel:${booking.salonPhone}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-periwinkle-300 hover:underline"
                    >
                      <Phone className="h-3 w-3" />
                      {booking.salonPhone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Center: Reschedule / Cancel */}
          {booking.status === 'booked' && (
            <div className="p-5 sm:p-6">
              <h3 className="text-base font-bold text-white">Need to make changes?</h3>
              <p className="mt-1 text-xs text-zinc-400">{booking.policyNotice}</p>

              {booking.canCancel || booking.canReschedule ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReschedule(!showReschedule);
                      setShowCancelModal(false);
                    }}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-periwinkle-400 px-4 text-xs font-bold text-obsidian-950 transition hover:bg-periwinkle-300"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Reschedule Appointment
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowCancelModal(!showCancelModal);
                      setShowReschedule(false);
                    }}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20"
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Cancel Appointment
                  </button>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3.5 text-xs text-amber-200">
                  <p>
                    This appointment is within 24 hours of scheduled time. Online modifications are closed. If you need
                    to adjust or cancel, please call {booking.salonName} directly at{' '}
                    <strong className="text-white">{booking.salonPhone || 'the salon'}</strong>.
                  </p>
                </div>
              )}

              {/* Inline Reschedule Picker */}
              {showReschedule && (
                <div className="mt-5 rounded-xl border border-white/10 bg-obsidian-950/60 p-4 sm:p-5">
                  <h4 className="text-sm font-bold text-white">Pick a new appointment time</h4>
                  <div className="mt-3 max-w-xs">
                    <label className="block text-xs text-zinc-300">Choose date</label>
                    <input
                      type="date"
                      value={selectedDate}
                      min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className={inputStyle}
                    />
                  </div>

                  {loadingSlots && (
                    <p className="mt-3 text-xs text-periwinkle-300">Checking open groomer slots…</p>
                  )}

                  {selectedDate && !loadingSlots && (
                    <div className="mt-4">
                      <span className="block text-xs text-zinc-300">Available time slots</span>
                      {slots.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {slots.map((slot) => {
                            const isSelected = selectedSlot === slot;
                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => setSelectedSlot(slot)}
                                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                  isSelected
                                    ? 'border-periwinkle-400 bg-periwinkle-400 text-obsidian-950 font-bold'
                                    : 'border-white/10 bg-white/5 text-zinc-200 hover:border-white/20'
                                }`}
                              >
                                {timeFormat(timeZone || undefined).format(new Date(slot))}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-zinc-400">
                          No open slots available on this date. Please try another day.
                        </p>
                      )}
                    </div>
                  )}

                  {selectedSlot && (
                    <div className="mt-5 flex gap-3">
                      <button
                        type="button"
                        disabled={rescheduling}
                        onClick={handleReschedule}
                        className="rounded-lg bg-emerald-400 px-4 py-2 text-xs font-bold text-obsidian-950 hover:bg-emerald-300 disabled:opacity-50"
                      >
                        {rescheduling ? 'Confirming…' : 'Confirm New Time'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowReschedule(false)}
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Inline Cancel Confirmation */}
              {showCancelModal && (
                <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 sm:p-5">
                  <h4 className="text-sm font-bold text-rose-200">Are you sure you want to cancel?</h4>
                  <p className="mt-1 text-xs text-rose-100/80">
                    Your reserved slot will be freed immediately for another pet. You can re-book online anytime.
                  </p>

                  <div className="mt-3">
                    <label htmlFor={cancelReasonId} className="block text-xs text-zinc-300">
                      Reason for cancellation (optional)
                    </label>
                    <input
                      id={cancelReasonId}
                      type="text"
                      maxLength={200}
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="e.g. Schedule conflict, pet feeling unwell"
                      className={inputStyle}
                    />
                  </div>

                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      disabled={cancelling}
                      onClick={handleCancel}
                      className="rounded-lg bg-rose-500 px-4 py-2 text-xs font-bold text-white hover:bg-rose-400 disabled:opacity-50"
                    >
                      {cancelling ? 'Cancelling…' : 'Yes, Cancel Appointment'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(false)}
                      className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
                    >
                      Keep Appointment
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </article>
      )}

      {/* Digital Pet Report Card (WF07) */}
      {booking?.reportCard && (
        <article className="glass-card mt-6 overflow-hidden border border-emerald-500/20 bg-emerald-950/10 p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {booking.petName}’s Digital Report Card
                </h3>
                <p className="text-xs text-zinc-400">
                  Published {new Date(booking.reportCard.publishedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
              Coat: {booking.reportCard.coatCondition.replace('_', ' ')}
            </div>
          </div>

          {/* Behavior Tags */}
          {booking.reportCard.behaviorTags.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-zinc-400">Temperament & Behavior</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {booking.reportCard.behaviorTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-xs text-zinc-200"
                  >
                    <Heart className="h-2.5 w-2.5 text-rose-300" aria-hidden="true" />
                    {tag.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Care Notes & Recommendations */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {booking.reportCard.careNotes && (
              <div className="rounded-lg bg-white/[0.03] p-3 text-xs">
                <div className="font-semibold text-white">Groomer Care Notes</div>
                <p className="mt-1 text-zinc-300">{booking.reportCard.careNotes}</p>
              </div>
            )}
            {booking.reportCard.recommendations && (
              <div className="rounded-lg bg-white/[0.03] p-3 text-xs">
                <div className="font-semibold text-white">Next Visit Recommendations</div>
                <p className="mt-1 text-zinc-300">{booking.reportCard.recommendations}</p>
              </div>
            )}
          </div>

          {/* Photos Gallery */}
          {booking.reportCard.photos.length > 0 && (
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                <Camera className="h-3.5 w-3.5 text-periwinkle-300" aria-hidden="true" />
                Grooming Photo Gallery
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {booking.reportCard.photos.map((photo, index) => (
                  <div
                    key={photo.url || photo.path || index}
                    className="overflow-hidden rounded-xl border border-white/10 bg-obsidian-950/80"
                  >
                    {photo.url ? (
                      <img
                        src={photo.url}
                        alt={photo.caption || `${booking.petName} grooming photo`}
                        className="h-44 w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-44 w-full items-center justify-center bg-obsidian-900 text-xs text-zinc-500">
                        Photo attached
                      </div>
                    )}
                    {photo.caption && (
                      <div className="p-2.5 text-xs text-zinc-300">{photo.caption}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>
      )}

      {/* Back to catalog */}
      <div className="pt-4 text-center sm:text-left">
        <Link
          href={`/portal/live/${slug}`}
          className="text-xs font-semibold text-periwinkle-300 hover:text-white"
        >
          ← Return to {salonName} booking page
        </Link>
      </div>
    </div>
  );
}

export default function ManageBookingPortal(props: ManageBookingPortalProps) {
  return (
    <Suspense fallback={<div className="glass-card mt-8 p-6 text-sm text-zinc-400">Loading appointment portal…</div>}>
      <PortalContent {...props} />
    </Suspense>
  );
}
