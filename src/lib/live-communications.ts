// ============================================================================
// PAWTRACKR SLICE 4: COMMUNICATIONS, REPORT CARDS & DAY CLOSEOUT (WF03-WF40)
// ============================================================================

export type CloseoutVisitStatus =
  | 'requested'
  | 'booked'
  | 'confirmed'
  | 'dropped_off'
  | 'checked_in'
  | 'bathing'
  | 'drying'
  | 'styling'
  | 'quality_check'
  | 'ready'
  | 'payment_pending'
  | 'paid'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'late'
  | 'rescheduled_pending'
  | 'change_pending'
  | 'paused'
  | 'refused'
  | 'partly_completed'
  | 'incident_open'
  | 'payment_unknown'
  | 'failed'
  | 'refunded'
  | 'waiver_hold'
  | 'released_unpaid';

export const TERMINAL_CLOSEOUT_STATUSES: ReadonlySet<CloseoutVisitStatus> = new Set<CloseoutVisitStatus>([
  'completed',
  'cancelled',
  'no_show',
  'partly_completed',
  'released_unpaid',
  'refunded',
  'refused',
]);

export type CoatCondition =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'matted'
  | 'severely_matted'
  | 'sensitive_skin';

export const COAT_CONDITIONS: ReadonlyArray<CoatCondition> = [
  'excellent',
  'good',
  'fair',
  'matted',
  'severely_matted',
  'sensitive_skin',
] as const;

export type MessageType =
  | 'booking_confirmation'
  | 'reminder_24h'
  | 'ready_for_pickup'
  | 'report_card_ready'
  | 'recall_prompt'
  | 'ad_hoc';

export type CommunicationChannel = 'sms' | 'email';

export type CommunicationStatus =
  | 'prepared'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'opted_out';

export type CloseoutVisit = {
  id: string;
  status: CloseoutVisitStatus;
  clientName: string;
  petName: string;
  totalAmountCents: number;
};

export type CloseoutTransaction = {
  id: string;
  paymentMethod: 'cash' | 'card' | 'apple_pay' | 'split';
  amountCents: number;
  status: 'pending' | 'completed' | 'refunded' | 'failed';
  settlementStatus: 'settled' | 'pending' | 'voided' | 'refunded';
};

export type RegisterReconciliation = {
  salonDate: string;
  expectedCashCents: number;
  countedCashCents: number;
  varianceCents: number;
  hasVariance: boolean;
  requiresVarianceReason: boolean;
  hasValidVarianceReason: boolean;
  canClose: boolean;
  unresolvedVisits: CloseoutVisit[];
  blockingReason?: string;
};

/**
 * Pure calculation reconciling the cash drawer against scheduled visits and recorded cash transactions.
 */
export function reconcileDailyRegister(
  salonDate: string,
  countedCashCents: number,
  varianceReason: string | null | undefined,
  visits: CloseoutVisit[],
  transactions: CloseoutTransaction[]
): RegisterReconciliation {
  const unresolvedVisits = visits.filter((v) => !TERMINAL_CLOSEOUT_STATUSES.has(v.status));

  // Expected cash is the sum of completed, settled cash transactions
  const expectedCashCents = transactions
    .filter(
      (tx) =>
        tx.paymentMethod === 'cash' &&
        tx.status === 'completed' &&
        tx.settlementStatus === 'settled'
    )
    .reduce((sum, tx) => sum + Math.max(0, Math.round(tx.amountCents)), 0);

  const safeCounted = Math.max(0, Math.round(countedCashCents));
  const varianceCents = safeCounted - expectedCashCents;
  const hasVariance = varianceCents !== 0;

  const cleanReason = varianceReason?.trim() || '';
  const requiresVarianceReason = hasVariance;
  const hasValidVarianceReason = !hasVariance || cleanReason.length >= 5;

  let canClose = true;
  let blockingReason: string | undefined;

  if (unresolvedVisits.length > 0) {
    canClose = false;
    blockingReason = `Cannot close day: ${unresolvedVisits.length} visit(s) remain open or unreleased.`;
  } else if (requiresVarianceReason && !hasValidVarianceReason) {
    canClose = false;
    blockingReason = 'A mandatory explanation reason is required when cash drawer has a variance (WF08).';
  }

  return {
    salonDate,
    expectedCashCents,
    countedCashCents: safeCounted,
    varianceCents,
    hasVariance,
    requiresVarianceReason,
    hasValidVarianceReason,
    canClose,
    unresolvedVisits,
    blockingReason,
  };
}

/**
 * Report Card Publication Gate (WF07)
 * A report card can only be published once the pet reaches ready, paid, partly_completed, or completed.
 */
export function canPublishReportCard(status: string): boolean {
  return ['ready', 'paid', 'partly_completed', 'completed'].includes(status);
}

export type ReportCardInput = {
  coatCondition: CoatCondition;
  behaviorTags: string[];
  careNotes?: string;
  recommendations?: string;
  photos?: string[];
};

export function validateReportCardInput(input: unknown): { valid: boolean; error?: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Report card payload is required.' };
  }

  const r = input as Record<string, unknown>;
  if (!r.coatCondition || typeof r.coatCondition !== 'string') {
    return { valid: false, error: 'Coat condition is required.' };
  }

  if (!COAT_CONDITIONS.includes(r.coatCondition as CoatCondition)) {
    return { valid: false, error: `Invalid coat condition: ${r.coatCondition}.` };
  }

  if (r.behaviorTags !== undefined && !Array.isArray(r.behaviorTags)) {
    return { valid: false, error: 'Behavior tags must be an array of strings.' };
  }

  return { valid: true };
}

export function formatReportCardSummary(
  petName: string,
  groomerName: string,
  card: ReportCardInput
): string {
  const coatLabel = card.coatCondition.replace(/_/g, ' ').toUpperCase();
  const tags = card.behaviorTags.length > 0 ? card.behaviorTags.join(', ') : 'None logged';
  const notes = card.careNotes?.trim() || 'No special care notes recorded.';
  const recs = card.recommendations?.trim() || 'Standard regular grooming schedule recommended.';

  return [
    `🐾 Report Card for ${petName}`,
    `Groomed by: ${groomerName}`,
    `Coat Condition: ${coatLabel}`,
    `Behavior on Table: ${tags}`,
    `Care Notes: ${notes}`,
    `Groomer Recommendations: ${recs}`,
  ].join('\n\n');
}

/**
 * Recall Recommendations by Breed Coat Cycle (WF03, WF38, WF39, WF40)
 */
export type BreedCycleInfo = {
  cycleWeeks: number;
  reason: string;
};

const HIGH_MAINTENANCE_BREEDS = [
  'poodle',
  'doodle',
  'goldendoodle',
  'labradoodle',
  'bichon',
  'maltese',
  'shih tzu',
  'yorkshire terrier',
  'yorkie',
  'pomeranian',
];

const SHORT_COAT_BREEDS = [
  'labrador',
  'labrador retriever',
  'pitbull',
  'boxer',
  'chihuahua',
  'french bulldog',
  'frenchie',
  'boston terrier',
  'pug',
  'beagle',
  'dachshund',
];

export function getBreedCoatCycle(breedName?: string | null): BreedCycleInfo {
  const lower = (breedName || '').toLowerCase().trim();

  if (HIGH_MAINTENANCE_BREEDS.some((b) => lower.includes(b))) {
    return {
      cycleWeeks: 4,
      reason: 'Curly, fine, or fast-growing coats require 4-week professional grooming to prevent painful matting.',
    };
  }

  if (SHORT_COAT_BREEDS.some((b) => lower.includes(b))) {
    return {
      cycleWeeks: 8,
      reason: 'Short smooth coats thrive on 8-week bathing and de-shedding cycles to protect skin oils.',
    };
  }

  // Medium / Wire / Double coats (Terriers, Spaniels, Retrievers, Aussies)
  return {
    cycleWeeks: 6,
    reason: 'Medium and double coats maintain optimal health and skin hygiene with 6-week maintenance cycles.',
  };
}

export function computeNextRecallDate(
  lastVisitDate: string | Date,
  breedName?: string | null
): { recallDate: string; cycleWeeks: number; reason: string } {
  const base = new Date(lastVisitDate);
  const cycle = getBreedCoatCycle(breedName);

  const next = new Date(base.getTime() + cycle.cycleWeeks * 7 * 24 * 60 * 60 * 1000);
  const recallDate = next.toISOString().split('T')[0];

  return {
    recallDate,
    cycleWeeks: cycle.cycleWeeks,
    reason: cycle.reason,
  };
}

export type ClientCareVisitSummary = {
  visitId: string;
  date: string;
  status: string;
  totalCents: number;
  servicePackage: string;
  coatCondition?: CoatCondition;
  behaviorTags?: string[];
  incidentType?: string;
  incidentSeverity?: string;
};

export type ClientCareProfile = {
  clientId: string;
  clientName: string;
  phone: string;
  email?: string;
  totalVisits: number;
  completedVisits: number;
  lifetimeSpendCents: number;
  averageSpendCents: number;
  safetyAlerts: string[];
  lastCoatCondition?: CoatCondition;
  pets: Array<{
    petId: string;
    petName: string;
    breed: string;
    recommendedRecallWeeks: number;
    recommendedNextRecallDate: string;
    recallReason: string;
  }>;
};

export function buildClientCareProfile(
  client: { id: string; name: string; phone: string; email?: string },
  pets: Array<{ id: string; name: string; breed: string }>,
  visits: ClientCareVisitSummary[]
): ClientCareProfile {
  const completed = visits.filter((v) => v.status === 'completed' || v.status === 'paid');
  const lifetimeSpendCents = completed.reduce((sum, v) => sum + v.totalCents, 0);
  const averageSpendCents = completed.length > 0 ? Math.round(lifetimeSpendCents / completed.length) : 0;

  const safetyAlerts: string[] = [];
  const incidents = visits.filter((v) => !!v.incidentType);
  if (incidents.length > 0) {
    safetyAlerts.push(`Prior incident reported (${incidents.map((i) => i.incidentType).join(', ')})`);
  }

  const mattedVisits = visits.filter(
    (v) => v.coatCondition === 'matted' || v.coatCondition === 'severely_matted'
  );
  if (mattedVisits.length > 0) {
    safetyAlerts.push('History of severe coat matting - pre-bath check required');
  }

  const sensitiveVisits = visits.filter((v) => v.coatCondition === 'sensitive_skin');
  if (sensitiveVisits.length > 0) {
    safetyAlerts.push('Sensitive skin recorded - use hypoallergenic shampoo only');
  }

  const petRecallSummaries = pets.map((pet) => {
    const petVisits = visits.filter((v) => v.status === 'completed');
    const latestDate = petVisits.length > 0 ? petVisits[petVisits.length - 1].date : new Date().toISOString();
    const recall = computeNextRecallDate(latestDate, pet.breed);
    return {
      petId: pet.id,
      petName: pet.name,
      breed: pet.breed,
      recommendedRecallWeeks: recall.cycleWeeks,
      recommendedNextRecallDate: recall.recallDate,
      recallReason: recall.reason,
    };
  });

  const lastCoat = visits.length > 0 ? visits[visits.length - 1].coatCondition : undefined;

  return {
    clientId: client.id,
    clientName: client.name,
    phone: client.phone,
    email: client.email,
    totalVisits: visits.length,
    completedVisits: completed.length,
    lifetimeSpendCents,
    averageSpendCents,
    safetyAlerts,
    lastCoatCondition: lastCoat,
    pets: petRecallSummaries,
  };
}

/**
 * Message Validation & Failure Decoupling (WF16, WF17)
 * Failure of a communication notification MUST NOT alter visit status.
 */
export function validateCommunicationPayload(payload: {
  clientId: string;
  messageType: MessageType;
  channel: CommunicationChannel;
  body: string;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  optedOut?: boolean;
}): { valid: boolean; status: CommunicationStatus; error?: string; fallbackTask?: string } {
  if (payload.optedOut) {
    return {
      valid: false,
      status: 'opted_out',
      error: 'Client has opted out of marketing/automated communications.',
      fallbackTask: 'Contact client manually via phone if urgent service notification.',
    };
  }

  if (!payload.body || payload.body.trim().length === 0) {
    return { valid: false, status: 'failed', error: 'Message body cannot be empty.' };
  }

  if (payload.channel === 'sms') {
    if (!payload.recipientPhone || payload.recipientPhone.trim().length < 7) {
      return {
        valid: false,
        status: 'failed',
        error: 'Valid recipient phone number is required for SMS.',
        fallbackTask: 'Call pet parent directly or request updated mobile number at checkout.',
      };
    }
  }

  if (payload.channel === 'email') {
    if (!payload.recipientEmail || !payload.recipientEmail.includes('@')) {
      return {
        valid: false,
        status: 'failed',
        error: 'Valid recipient email address is required for Email.',
        fallbackTask: 'Call pet parent directly or verify email address.',
      };
    }
  }

  return { valid: true, status: 'sent' };
}
