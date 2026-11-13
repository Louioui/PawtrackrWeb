import { type LiveStaffRole, canHandleHighRiskPet } from './workflow-context.ts';

// ============================================================================
// PAWTRACKR SLICE 2: LIVE SALON OPERATIONS, QUEUES & STAGE GUARDS (WF01-WF24)
// ============================================================================

export type VisitLifecycleState =
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
  | 'released_unpaid'
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
  | 'waiver_hold';

export const IN_SERVICE_STAGES: readonly VisitLifecycleState[] = [
  'checked_in',
  'bathing',
  'drying',
  'styling',
  'quality_check',
  'ready',
];

export const VALID_STAGE_SEQUENCE: readonly VisitLifecycleState[] = [
  'checked_in',
  'bathing',
  'drying',
  'styling',
  'quality_check',
  'ready',
];

export type StageNoteEntry = {
  stage: string;
  note: string;
  recorded_at: string;
  recorded_by?: string;
};

export type OperationalVisit = {
  id: string;
  reference?: string | null;
  scheduled_time: string;
  reservation_end: string;
  status: VisitLifecycleState;
  service_package: string;
  staff_id: string | null;
  staff_name?: string;
  station_id?: string | null;
  station_name?: string | null;
  pet_id: string;
  pet_name: string;
  pet_breed?: string | null;
  pet_weight_lbs?: number | null;
  pet_notes?: string | null;
  client_id: string;
  client_name: string;
  client_phone?: string | null;
  total_amount?: number | null;
  version: number;
  checked_in_at?: string | null;
  checked_in_by?: string | null;
  authorized_collector_name?: string | null;
  authorized_collector_phone?: string | null;
  waiver_id?: string | null;
  waiver_status?: 'verified' | 'refused' | 'missing' | null;
  safety_notes_acknowledged_at?: string | null;
  safety_notes_acknowledged_by?: string | null;
  stage_notes?: StageNoteEntry[] | null;
  ready_at?: string | null;
  ready_notified_at?: string | null;
  released_at?: string | null;
  released_by?: string | null;
  released_to_name?: string | null;
  unpaid_release_override_by?: string | null;
  unpaid_release_reason?: string | null;
  late_arrival_minutes?: number | null;
};

export type OperationalQueues = {
  arrivals: OperationalVisit[];
  in_service: OperationalVisit[];
  ready_for_pickup: OperationalVisit[];
  exceptions: OperationalVisit[];
  summary: {
    total: number;
    arrivals_count: number;
    in_service_count: number;
    ready_count: number;
    exceptions_count: number;
    completed_today: number;
  };
};

export type SalonDayState = {
  salon_date: string;
  status: 'open' | 'closed';
  opened_at: string | null;
  opened_by: string | null;
  checklist: Record<string, boolean>;
  station_count: number;
  active_shifts_count: number;
  unassigned_visits_count: number;
};

/**
 * Checks if an appointment is considered late past the salon grace period (15m default).
 */
export function isLateArrival(
  scheduledTimeIso: string,
  currentTimeIso?: string,
  graceMinutes: number = 15,
): { isLate: boolean; minutesLate: number } {
  const scheduled = Date.parse(scheduledTimeIso);
  const current = currentTimeIso ? Date.parse(currentTimeIso) : Date.now();
  if (!Number.isFinite(scheduled) || !Number.isFinite(current)) {
    return { isLate: false, minutesLate: 0 };
  }
  const diffMinutes = Math.floor((current - scheduled) / 60000);
  if (diffMinutes > graceMinutes) {
    return { isLate: true, minutesLate: diffMinutes };
  }
  return { isLate: false, minutesLate: Math.max(0, diffMinutes) };
}

/**
 * Derives the four live operational queues for the Command Center (WF12).
 */
export function deriveOperationalQueues(
  visits: OperationalVisit[],
  filterDate?: string,
): OperationalQueues {
  const arrivals: OperationalVisit[] = [];
  const in_service: OperationalVisit[] = [];
  const ready_for_pickup: OperationalVisit[] = [];
  const exceptions: OperationalVisit[] = [];
  let completed_today = 0;

  for (const v of visits) {
    if (filterDate) {
      const visitDate = v.scheduled_time.slice(0, 10);
      if (visitDate !== filterDate) continue;
    }

    if (v.status === 'completed') {
      completed_today++;
      continue;
    }

    // Arrivals queue: waiting to be checked in
    if (v.status === 'booked' || v.status === 'confirmed' || v.status === 'dropped_off') {
      arrivals.push(v);
    }

    // In-service floor queue: actively being groomed / bathed / checked
    if (
      v.status === 'checked_in' ||
      v.status === 'bathing' ||
      v.status === 'drying' ||
      v.status === 'styling' ||
      v.status === 'quality_check'
    ) {
      in_service.push(v);
    }

    // Ready for pickup queue
    if (v.status === 'ready' || v.status === 'payment_pending' || v.status === 'paid') {
      ready_for_pickup.push(v);
    }

    // Exceptions queue
    if (
      v.status === 'waiver_hold' ||
      v.status === 'late' ||
      v.status === 'paused' ||
      v.status === 'refused' ||
      v.status === 'partly_completed' ||
      v.status === 'incident_open' ||
      v.status === 'payment_unknown' ||
      v.status === 'failed' ||
      v.status === 'released_unpaid' ||
      v.status === 'no_show' ||
      v.status === 'rescheduled_pending' ||
      v.status === 'change_pending'
    ) {
      exceptions.push(v);
    }
  }

  // Sort queues logically by scheduled time
  const byScheduledTime = (a: OperationalVisit, b: OperationalVisit) =>
    a.scheduled_time.localeCompare(b.scheduled_time);

  arrivals.sort(byScheduledTime);
  in_service.sort(byScheduledTime);
  ready_for_pickup.sort(byScheduledTime);
  exceptions.sort(byScheduledTime);

  return {
    arrivals,
    in_service,
    ready_for_pickup,
    exceptions,
    summary: {
      total: arrivals.length + in_service.length + ready_for_pickup.length + exceptions.length,
      arrivals_count: arrivals.length,
      in_service_count: in_service.length,
      ready_count: ready_for_pickup.length,
      exceptions_count: exceptions.length,
      completed_today,
    },
  };
}

/**
 * Checks if pet has bite risk or high behavioral hazard keywords.
 */
export function isBiteRiskPet(petNotes?: string | null): boolean {
  if (!petNotes || typeof petNotes !== 'string') return false;
  const lower = petNotes.toLowerCase();
  return (
    lower.includes('bite') ||
    lower.includes('biter') ||
    lower.includes('aggressive') ||
    lower.includes('muzzle') ||
    lower.includes('caution') ||
    lower.includes('snappy')
  );
}

/**
 * Validates whether a staff member with a given role can advance a visit to the target stage.
 */
export function canStaffAdvanceStage(
  role: LiveStaffRole,
  currentStage: VisitLifecycleState,
  targetStage: VisitLifecycleState,
  options?: {
    safetyNotesAcknowledged?: boolean;
    petNotes?: string | null;
  },
): { allowed: boolean; reason?: string } {
  // Only floor staff, managers and owners can advance grooming stages
  if (role === 'front_desk') {
    return {
      allowed: false,
      reason: 'Front desk staff cannot advance floor grooming stages.',
    };
  }

  // Safety notes acknowledgment check
  if (currentStage === 'checked_in' && targetStage !== 'checked_in') {
    if (!options?.safetyNotesAcknowledged) {
      return {
        allowed: false,
        reason: 'Safety notes must be acknowledged before service begins (WF09).',
      };
    }
  }

  // Bather role boundaries (WF04 / WF09)
  if (role === 'bather') {
    if (targetStage !== 'bathing' && targetStage !== 'drying') {
      return {
        allowed: false,
        reason: 'Bathers may only progress visits to Bathing or Drying stages.',
      };
    }

    if (isBiteRiskPet(options?.petNotes)) {
      return {
        allowed: false,
        reason: 'Bathers cannot handle bite-risk pets without a groomer or manager present.',
      };
    }
  }

  // Stage sequence order check
  const currentIndex = VALID_STAGE_SEQUENCE.indexOf(currentStage);
  const targetIndex = VALID_STAGE_SEQUENCE.indexOf(targetStage);

  if (currentIndex === -1 || targetIndex === -1) {
    return {
      allowed: false,
      reason: `Cannot transition from '${currentStage}' to '${targetStage}'.`,
    };
  }

  if (targetIndex !== currentIndex + 1) {
    return {
      allowed: false,
      reason: `Invalid stage progression: cannot jump from '${currentStage}' to '${targetStage}'. Must follow sequential order.`,
    };
  }

  return { allowed: true };
}

/**
 * Role permissions for operational actions.
 */
export function canStaffCheckIn(role: LiveStaffRole): boolean {
  return role === 'owner' || role === 'manager' || role === 'front_desk';
}

export function canStaffRelease(role: LiveStaffRole): boolean {
  return role === 'owner' || role === 'manager' || role === 'front_desk';
}

export function canOverrideUnpaidRelease(role: LiveStaffRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function canOpenSalonDay(role: LiveStaffRole): boolean {
  return role === 'owner' || role === 'manager';
}

// Offline queue entry structure for disconnected station floor
export type OfflineStageUpdate = {
  id: string;
  visitId: string;
  clientVersion: number;
  targetStage: VisitLifecycleState;
  careNote?: string;
  timestamp: string;
  status: 'pending' | 'synced' | 'conflict';
  error?: string;
};
