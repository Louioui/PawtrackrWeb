// ============================================================================
// SALON READINESS & CAPABILITY HONESTY EVALUATOR (WF03 / WF28 / WF31 / WF32)
// ============================================================================

import type { CapabilityStatus, LiveStaffRole, OperatingModel, SalonBookingStatus } from './workflow-context.ts';
import { isBookableGroomerRole } from './workflow-context.ts';

export type SalonStationType =
  | 'grooming_table'
  | 'bathing_tub'
  | 'drying_station'
  | 'van_bay'
  | 'holding_suite'
  | 'table'
  | 'tub'
  | 'cage_dryer'
  | 'van';

export type SalonStationRecord = {
  id: string;
  name: string;
  station_type: SalonStationType;
  is_active: boolean;
};

export type WeeklyHoursDay = {
  closed: boolean;
  open: string;
  close: string;
};

export type WeeklyHoursMap = Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', WeeklyHoursDay>;

export type WeeklyShiftRecord = {
  id: string;
  staff_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  station_id: string | null;
  assigned_station: string;
  is_active: boolean;
};

export type SalonPolicySettings = {
  trial_days: number;
  deposit_required: boolean;
  booking_approval_mode: 'immediate' | 'approval_required';
  tax_services: boolean;
  cancellation_window_hours: number;
  tips_refundable: boolean;
  chargeback_claws_back_commission: boolean;
  receipt_link_ttl_days: number;
};

export const DEFAULT_SALON_POLICIES: SalonPolicySettings = {
  trial_days: 30,
  deposit_required: false,
  booking_approval_mode: 'immediate',
  tax_services: false,
  cancellation_window_hours: 24,
  tips_refundable: false,
  chargeback_claws_back_commission: false,
  receipt_link_ttl_days: 30,
};

export type ReadinessCheckItem = {
  id: 'identity_zone' | 'operating_hours' | 'services' | 'groomers' | 'shifts' | 'stations';
  label: string;
  passed: boolean;
  blocking: true;
  detail: string;
  actionHref: string;
};

export type CapabilityReadinessItem = {
  id: 'online_booking' | 'staff_calendar' | 'card_payments' | 'text_messages' | 'report_cards';
  label: string;
  status: CapabilityStatus;
  summary: string;
};

export type SalonReadinessReport = {
  canPublish: boolean;
  isAcceptingOnlineBookings: boolean;
  blockingCount: number;
  bookingStatus: SalonBookingStatus;
  operatingModel: OperatingModel;
  checks: ReadinessCheckItem[];
  capabilities: CapabilityReadinessItem[];
};

const clockMinutes = (clock: unknown): number | null => {
  if (typeof clock !== 'string' || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(clock)) return null;
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
};

const validIanaZone = (zone: unknown): zone is string => {
  if (typeof zone !== 'string' || !zone || zone.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

export function buildDefaultWeeklyHours(open = '08:00', close = '18:00'): WeeklyHoursMap {
  return {
    '0': { closed: true, open, close },
    '1': { closed: false, open, close },
    '2': { closed: false, open, close },
    '3': { closed: false, open, close },
    '4': { closed: false, open, close },
    '5': { closed: false, open, close },
    '6': { closed: false, open, close },
  };
}

export function normalizeSalonPolicies(raw: unknown): SalonPolicySettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SALON_POLICIES };
  const input = raw as Record<string, unknown>;
  const intInRange = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
  const boolOr = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

  return {
    trial_days: intInRange(input.trial_days, 1, 90, DEFAULT_SALON_POLICIES.trial_days),
    deposit_required: boolOr(input.deposit_required, DEFAULT_SALON_POLICIES.deposit_required),
    booking_approval_mode:
      input.booking_approval_mode === 'approval_required' ? 'approval_required' : 'immediate',
    tax_services: boolOr(input.tax_services, DEFAULT_SALON_POLICIES.tax_services),
    cancellation_window_hours: intInRange(
      input.cancellation_window_hours,
      0,
      168,
      DEFAULT_SALON_POLICIES.cancellation_window_hours,
    ),
    tips_refundable: boolOr(input.tips_refundable, DEFAULT_SALON_POLICIES.tips_refundable),
    chargeback_claws_back_commission: boolOr(
      input.chargeback_claws_back_commission,
      DEFAULT_SALON_POLICIES.chargeback_claws_back_commission,
    ),
    receipt_link_ttl_days: intInRange(
      input.receipt_link_ttl_days,
      1,
      365,
      DEFAULT_SALON_POLICIES.receipt_link_ttl_days,
    ),
  };
}

export function evaluateSalonReadiness(input: {
  salonName: string;
  slug: string;
  timeZone: string | null | undefined;
  operatingModel?: OperatingModel;
  bookingStatus?: SalonBookingStatus;
  subscriptionActive: boolean;
  operatingHours: { open: string; close: string } | null | undefined;
  weeklyHours?: Partial<Record<string, WeeklyHoursDay>> | null;
  packages: ReadonlyArray<{ id: string; name: string; price: number; durationMinutes: number }>;
  staff: ReadonlyArray<{ id: string; role?: LiveStaffRole | string; is_active: boolean }>;
  weeklyShifts: ReadonlyArray<{ staff_id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean }>;
  datedScheduledShiftCount?: number;
  stations: ReadonlyArray<{ id: string; name: string; station_type: SalonStationType; is_active: boolean }>;
}): SalonReadinessReport {
  const bookingStatus: SalonBookingStatus = input.bookingStatus ?? 'draft';
  const operatingModel: OperatingModel = input.operatingModel ?? 'salon';

  const zoneOk = validIanaZone(input.timeZone) && Boolean(input.salonName.trim()) && Boolean(input.slug.trim());

  const baseOpen = clockMinutes(input.operatingHours?.open);
  const baseClose = clockMinutes(input.operatingHours?.close);
  const baseHoursValid = baseOpen !== null && baseClose !== null && baseOpen < baseClose;

  let openWeekdaysCount = baseHoursValid ? 7 : 0;
  if (input.weeklyHours && typeof input.weeklyHours === 'object') {
    const entries = Object.values(input.weeklyHours).filter((d): d is WeeklyHoursDay => Boolean(d));
    if (entries.length > 0) {
      openWeekdaysCount = entries.filter((d) => {
        if (d.closed) return false;
        const o = clockMinutes(d.open);
        const c = clockMinutes(d.close);
        return o !== null && c !== null && o < c;
      }).length;
    }
  }
  const hoursOk = baseHoursValid && openWeekdaysCount > 0;

  const validPackages = input.packages.filter(
    (pkg) => pkg.id.trim().length > 0 && pkg.name.trim().length > 0 && pkg.price >= 0 && pkg.durationMinutes >= 15,
  );
  const servicesOk = validPackages.length > 0;

  const activeBookableGroomers = input.staff.filter(
    (member) => member.is_active && isBookableGroomerRole(member.role ?? 'groomer'),
  );
  const activeGroomerIds = new Set(activeBookableGroomers.map((g) => g.id));
  const groomersOk = activeBookableGroomers.length > 0;

  const activeWeeklyShifts = input.weeklyShifts.filter((shift) => {
    if (!shift.is_active || !activeGroomerIds.has(shift.staff_id)) return false;
    const s = clockMinutes(shift.start_time);
    const e = clockMinutes(shift.end_time);
    return s !== null && e !== null && s < e;
  });
  const totalCoveringShifts = activeWeeklyShifts.length + (input.datedScheduledShiftCount ?? 0);
  const shiftsOk = groomersOk && totalCoveringShifts > 0;

  const activeStations = input.stations.filter((st) => st.is_active);
  const stationsOk =
    activeStations.length > 0 &&
    (operatingModel !== 'mobile_van' || activeStations.some((st) => st.station_type === 'van' || st.station_type === 'van_bay'));

  const checks: ReadinessCheckItem[] = [
    {
      id: 'identity_zone',
      label: 'Salon identity & time zone',
      passed: zoneOk,
      blocking: true,
      detail: zoneOk
        ? `${input.salonName} · ${input.timeZone} (${operatingModel.replace('_', ' ')})`
        : 'Confirm your salon name, public slug, and valid IANA time zone.',
      actionHref: '/dashboard/settings/live#hours-section',
    },
    {
      id: 'operating_hours',
      label: 'Weekly opening hours',
      passed: hoursOk,
      blocking: true,
      detail: hoursOk
        ? `Open ${openWeekdaysCount} day${openWeekdaysCount === 1 ? '' : 's'}/week (${input.operatingHours?.open}–${input.operatingHours?.close})`
        : 'Configure valid opening and closing hours on at least one day of the week.',
      actionHref: '/dashboard/settings/live#hours-section',
    },
    {
      id: 'services',
      label: 'At least one bookable service',
      passed: servicesOk,
      blocking: true,
      detail: servicesOk
        ? `${validPackages.length} service${validPackages.length === 1 ? '' : 's'} configured with duration & price`
        : 'Online booking is blocked until at least one service has a name, duration, and price.',
      actionHref: '/dashboard/settings/live#services-section',
    },
    {
      id: 'groomers',
      label: 'At least one active groomer',
      passed: groomersOk,
      blocking: true,
      detail: groomersOk
        ? `${activeBookableGroomers.length} active groomer${activeBookableGroomers.length === 1 ? '' : 's'} in roster`
        : 'Add at least one active groomer or senior groomer who can perform appointments.',
      actionHref: '/dashboard/settings/live#groomers-section',
    },
    {
      id: 'shifts',
      label: 'Working shift on open days',
      passed: shiftsOk,
      blocking: true,
      detail: shiftsOk
        ? `${activeWeeklyShifts.length} weekly shift${activeWeeklyShifts.length === 1 ? '' : 's'}${input.datedScheduledShiftCount ? ` + ${input.datedScheduledShiftCount} dated shift(s)` : ''} scheduled`
        : 'A salon with a service must also assign a working groomer shift before slots can open.',
      actionHref: '/dashboard/settings/live#shifts-section',
    },
    {
      id: 'stations',
      label: operatingModel === 'mobile_van' ? 'Active mobile van station' : 'At least one grooming station (table, tub, or van)',
      passed: stationsOk,
      blocking: true,
      detail: stationsOk
        ? `${activeStations.length} active station${activeStations.length === 1 ? '' : 's'} (${activeStations.map((s) => s.name).slice(0, 3).join(', ')})`
        : operatingModel === 'mobile_van'
          ? 'Mobile van salons need at least one active van station before bookings can be placed.'
          : 'Add at least one table, tub, or mobile van so every booked visit has a real place to happen.',
      actionHref: '/dashboard/settings/live#stations-section',
    },
  ];

  const blockingCount = checks.filter((c) => !c.passed).length;
  const canPublish = input.subscriptionActive && blockingCount === 0;
  const isAcceptingOnlineBookings = canPublish && bookingStatus === 'published';

  const capabilities: CapabilityReadinessItem[] = [
    {
      id: 'online_booking',
      label: 'Online booking',
      status: isAcceptingOnlineBookings ? 'ready' : 'partly_ready',
      summary: isAcceptingOnlineBookings
        ? 'Published and accepting real database-checked customer bookings.'
        : bookingStatus === 'paused'
          ? 'Paused for new online bookings; existing appointments are untouched.'
          : blockingCount > 0
            ? `Draft — ${blockingCount} setup item${blockingCount === 1 ? '' : 's'} still blocking launch.`
            : 'All setup checks pass — preview, run a test booking, and click Publish when ready.',
    },
    {
      id: 'staff_calendar',
      label: 'Staff calendar',
      status: zoneOk && hoursOk && groomersOk ? 'ready' : 'partly_ready',
      summary:
        zoneOk && hoursOk && groomersOk
          ? `Live salon-zone schedule active in ${input.timeZone}.`
          : 'Add salon hours and at least one groomer to populate calendar lanes.',
    },
    {
      id: 'card_payments',
      label: 'Card payments',
      status: 'not_connected',
      summary: 'Signed Stripe webhook settlement is built; POS reader & card-entry flow arrives in Slice 3.',
    },
    {
      id: 'text_messages',
      label: 'Text messages & reminders',
      status: 'preview_only',
      summary: 'SMS confirmation and reminder provider delivery is not connected yet (Slice 5).',
    },
    {
      id: 'report_cards',
      label: 'Report cards & private photos',
      status: 'preview_only',
      summary: 'Local preview only; private storage and expiring customer links arrive in Slice 5.',
    },
  ];

  return {
    canPublish,
    isAcceptingOnlineBookings,
    blockingCount,
    bookingStatus,
    operatingModel,
    checks,
    capabilities,
  };
}
