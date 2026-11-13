/**
 * live-waitlist.ts
 *
 * Domain logic for Pawtrackr Web Waitlist Engine, Automated Slot Holds,
 * GiST Re-verification & Versioned Rebooking (WF02, WF15, WF38, WF39).
 */

export type WaitlistStatus = 'active' | 'offered' | 'booked' | 'cancelled' | 'expired';
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type TimePreference = 'any' | 'morning' | 'afternoon' | 'weekend';

export interface WaitlistEntry {
  id: string;
  business_id: string;
  client_id: string;
  pet_id: string;
  service_package: string;
  preferred_staff_id?: string | null;
  preferred_dates: string[];
  time_preference: TimePreference;
  notes?: string | null;
  status: WaitlistStatus;
  rank_position: number;
  created_at: string;
  updated_at: string;
  client?: {
    id: string;
    full_name: string;
    phone: string;
    email?: string | null;
  };
  pet?: {
    id: string;
    name: string;
    breed: string;
  };
  staff?: {
    id: string;
    name: string;
  };
}

export interface WaitlistOffer {
  id: string;
  business_id: string;
  waitlist_entry_id: string;
  offered_start: string;
  offered_end: string;
  assigned_staff_id: string;
  assigned_station_id?: string | null;
  offer_expires_at: string;
  status: OfferStatus;
  claim_token: string;
  claimed_visit_id?: string | null;
  created_at: string;
  updated_at: string;
  staff?: {
    id: string;
    name: string;
  };
  entry?: WaitlistEntry;
}

export interface ExpirationCalculation {
  expiresAt: Date;
  isExpired: boolean;
  remainingMs: number;
  remainingFormatted: string;
}

/**
 * Calculates slot hold expiration window (default 120 minutes / 2 hours).
 * Invariant: Silence is never acceptance. Once remainingMs <= 0, the hold is strictly expired.
 */
export function calculateOfferExpiration(
  createdInstant: string | Date,
  durationMinutes: number = 120,
  referenceNow: string | Date = new Date()
): ExpirationCalculation {
  const start = new Date(createdInstant);
  const now = new Date(referenceNow);

  if (isNaN(start.getTime())) {
    throw new Error('Invalid createdInstant timestamp');
  }
  if (isNaN(now.getTime())) {
    throw new Error('Invalid referenceNow timestamp');
  }

  // Clamped duration between 15 and 1440 minutes (24h)
  const clampedMinutes = Math.min(1440, Math.max(15, Math.floor(durationMinutes) || 120));
  const expiresAt = new Date(start.getTime() + clampedMinutes * 60 * 1000);
  const remainingMs = expiresAt.getTime() - now.getTime();
  const isExpired = remainingMs <= 0;

  let remainingFormatted = 'Expired';
  if (!isExpired) {
    const totalMinutes = Math.floor(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0) {
      remainingFormatted = `${hours}h ${mins}m`;
    } else {
      remainingFormatted = `${mins}m`;
    }
  }

  return {
    expiresAt,
    isExpired,
    remainingMs: Math.max(0, remainingMs),
    remainingFormatted,
  };
}

/**
 * Validates if an offer is currently claimable based on status and expiration.
 */
export function isOfferClaimable(
  offer: { status: string; offer_expires_at: string | Date },
  referenceNow: string | Date = new Date()
): boolean {
  if (offer.status !== 'pending') {
    return false;
  }
  const expiresAt = new Date(offer.offer_expires_at);
  const now = new Date(referenceNow);
  return expiresAt.getTime() > now.getTime();
}

/**
 * Deterministically ranks waitlist entries:
 * 1. Active entries come first
 * 2. rank_position ascending
 * 3. created_at ascending (FIFO tiebreak)
 */
export function rankWaitlistCandidates(entries: WaitlistEntry[]): WaitlistEntry[] {
  return [...entries].sort((a, b) => {
    // Status prioritization: 'active' entries first, then 'offered', then others
    const statusPriority = (s: WaitlistStatus): number => {
      if (s === 'active') return 0;
      if (s === 'offered') return 1;
      return 2;
    };

    const statusDiff = statusPriority(a.status) - statusPriority(b.status);
    if (statusDiff !== 0) return statusDiff;

    const rankDiff = a.rank_position - b.rank_position;
    if (rankDiff !== 0) return rankDiff;

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

/**
 * Filters waitlist entries by client time preference.
 */
export function filterEntriesByTimePreference(
  entries: WaitlistEntry[],
  preference: TimePreference
): WaitlistEntry[] {
  if (preference === 'any') {
    return entries;
  }
  return entries.filter((e) => e.time_preference === 'any' || e.time_preference === preference);
}

/**
 * Formats notification SMS / email text for outgoing slot offer with anti-injection escaping.
 */
export function formatWaitlistNotificationText(params: {
  petName: string;
  servicePackage: string;
  slotStart: string | Date;
  expiresAt: string | Date;
  claimUrl: string;
  salonName?: string;
}): string {
  const pet = (params.petName || 'Your pet').trim();
  const pkg = (params.servicePackage || 'appointment').trim();
  const salon = (params.salonName || 'Pawtrackr Salon').trim();
  const slotDate = new Date(params.slotStart);
  const expDate = new Date(params.expiresAt);

  const formattedSlot = !isNaN(slotDate.getTime())
    ? slotDate.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : String(params.slotStart);

  const formattedExp = !isNaN(expDate.getTime())
    ? expDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : String(params.expiresAt);

  const cleanUrl = params.claimUrl.trim().replace(/[\r\n]/g, '');

  return (
    `Great news from ${salon}! A slot opened up for ${pet} (${pkg}) on ${formattedSlot}. ` +
    `This hold expires at ${formattedExp} (2 hours). ` +
    `Tap to accept and book: ${cleanUrl}`
  );
}
