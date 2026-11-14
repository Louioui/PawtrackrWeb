// ============================================================================
// Customer Self-Service Portal (`WF02` / `WF14`)
//
// Validation, payload verification, and data parsers for pet parents managing
// their appointments by reference code and phone number.
// ============================================================================

export type CustomerBookingStatus =
  | 'booked'
  | 'dropped_off'
  | 'bathing'
  | 'styling'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface CustomerBookingDetails {
  reference: string;
  visitId: string;
  status: CustomerBookingStatus;
  service: string;
  price: number;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  timeZone: string;
  salonName: string;
  salonSlug: string;
  salonPhone: string | null;
  salonAddress: string | null;
  clientName: string;
  petName: string;
  petBreed: string;
  staffName: string | null;
  stationName: string | null;
  canReschedule: boolean;
  canCancel: boolean;
  policyNotice: string;
}

export interface CancelBookingResponse {
  reference: string;
  status: 'cancelled';
  cancelledAt: string;
  service: string;
  petName: string;
  salonName: string;
  alreadyCancelled?: boolean;
  message?: string;
}

export interface RescheduleBookingResponse {
  reference: string;
  status: 'booked';
  service: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  price: number;
  salonName: string;
  petName: string;
  unchanged?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const slugPattern = /^[a-z0-9-]{1,60}$/;
const refPattern = /^[0-9A-Fa-f]{8}$/;
const instantPattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;

export function cleanPhoneDigits(phone: unknown): string {
  if (typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '');
}

export function cleanReference(ref: unknown): string {
  if (typeof ref !== 'string') return '';
  return ref.trim().toUpperCase();
}

export function validateLookupParams(
  slug: unknown,
  reference: unknown,
  phone: unknown
):
  | { ok: true; slug: string; reference: string; phoneDigits: string }
  | { ok: false; error: string } {
  if (typeof slug !== 'string' || !slugPattern.test(slug.trim())) {
    return { ok: false, error: 'A valid salon identifier is required.' };
  }
  const cleanRef = cleanReference(reference);
  if (!refPattern.test(cleanRef)) {
    return { ok: false, error: 'Booking reference must be an 8-character code.' };
  }
  const phoneDigits = cleanPhoneDigits(phone);
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    return { ok: false, error: 'Enter the phone number used when booking (with area code).' };
  }
  return { ok: true, slug: slug.trim(), reference: cleanRef, phoneDigits };
}

export function validateCancelPayload(input: unknown):
  | { ok: true; slug: string; reference: string; phoneDigits: string; reason: string | null }
  | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: 'Cancellation details are required.' };
  const lookup = validateLookupParams(input.slug, input.reference, input.phone);
  if (!lookup.ok) return lookup;
  const reason = typeof input.reason === 'string' && input.reason.trim()
    ? input.reason.trim().slice(0, 500)
    : null;
  return { ...lookup, reason };
}

export function validateReschedulePayload(input: unknown):
  | { ok: true; slug: string; reference: string; phoneDigits: string; startsAt: string }
  | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: 'Reschedule details are required.' };
  const lookup = validateLookupParams(input.slug, input.reference, input.phone);
  if (!lookup.ok) return lookup;
  if (
    typeof input.starts_at !== 'string' ||
    !instantPattern.test(input.starts_at) ||
    !Number.isFinite(Date.parse(input.starts_at))
  ) {
    return { ok: false, error: 'Select a valid available appointment time.' };
  }
  const parsedDate = new Date(input.starts_at);
  if (parsedDate.getTime() < Date.now() + 60 * 60_000) {
    return { ok: false, error: 'New appointment time must be at least 1 hour in the future.' };
  }
  return { ...lookup, startsAt: parsedDate.toISOString() };
}

export function parseCustomerBookingDetails(value: unknown): CustomerBookingDetails | null {
  if (!isRecord(value)) return null;
  const {
    reference,
    visit_id,
    status,
    service,
    price,
    starts_at,
    ends_at,
    duration_minutes,
    time_zone,
    salon_name,
    salon_slug,
    salon_phone,
    salon_address,
    client_name,
    pet_name,
    pet_breed,
    staff_name,
    station_name,
    can_reschedule,
    can_cancel,
    policy_notice,
  } = value;

  if (
    typeof reference !== 'string' ||
    !refPattern.test(reference) ||
    typeof visit_id !== 'string' ||
    typeof status !== 'string' ||
    typeof service !== 'string' ||
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price < 0 ||
    typeof starts_at !== 'string' ||
    !Number.isFinite(Date.parse(starts_at)) ||
    typeof ends_at !== 'string' ||
    !Number.isFinite(Date.parse(ends_at)) ||
    typeof duration_minutes !== 'number' ||
    duration_minutes <= 0 ||
    typeof time_zone !== 'string' ||
    typeof salon_name !== 'string' ||
    typeof salon_slug !== 'string' ||
    typeof client_name !== 'string' ||
    typeof pet_name !== 'string' ||
    typeof pet_breed !== 'string'
  ) {
    return null;
  }

  const validStatuses: CustomerBookingStatus[] = [
    'booked',
    'dropped_off',
    'bathing',
    'styling',
    'ready',
    'completed',
    'cancelled',
    'no_show',
  ];

  const parsedStatus = validStatuses.includes(status as CustomerBookingStatus)
    ? (status as CustomerBookingStatus)
    : 'booked';

  return {
    reference: reference.toUpperCase(),
    visitId: visit_id,
    status: parsedStatus,
    service: service.trim(),
    price,
    startsAt: new Date(starts_at).toISOString(),
    endsAt: new Date(ends_at).toISOString(),
    durationMinutes: Math.round(duration_minutes),
    timeZone: time_zone.trim(),
    salonName: salon_name.trim(),
    salonSlug: salon_slug.trim(),
    salonPhone: typeof salon_phone === 'string' && salon_phone.trim() ? salon_phone.trim() : null,
    salonAddress: typeof salon_address === 'string' && salon_address.trim() ? salon_address.trim() : null,
    clientName: client_name.trim(),
    petName: pet_name.trim(),
    petBreed: pet_breed.trim(),
    staffName: typeof staff_name === 'string' && staff_name.trim() ? staff_name.trim() : null,
    stationName: typeof station_name === 'string' && station_name.trim() ? station_name.trim() : null,
    canReschedule: Boolean(can_reschedule),
    canCancel: Boolean(can_cancel),
    policyNotice:
      typeof policy_notice === 'string' && policy_notice.trim()
        ? policy_notice.trim()
        : 'Appointments can be modified or cancelled online up to 24 hours in advance.',
  };
}

export function parseCancelResponse(value: unknown): CancelBookingResponse | null {
  if (!isRecord(value)) return null;
  const { reference, status, cancelled_at, service, pet_name, salon_name, already_cancelled, message } = value;
  if (
    typeof reference !== 'string' ||
    !refPattern.test(reference) ||
    status !== 'cancelled' ||
    (cancelled_at && !Number.isFinite(Date.parse(String(cancelled_at))))
  ) {
    return null;
  }
  return {
    reference: reference.toUpperCase(),
    status: 'cancelled',
    cancelledAt: cancelled_at ? new Date(String(cancelled_at)).toISOString() : new Date().toISOString(),
    service: typeof service === 'string' ? service : 'Grooming Visit',
    petName: typeof pet_name === 'string' ? pet_name : 'Pet',
    salonName: typeof salon_name === 'string' ? salon_name : 'Salon',
    alreadyCancelled: Boolean(already_cancelled),
    message: typeof message === 'string' ? message : undefined,
  };
}

export function parseRescheduleResponse(value: unknown): RescheduleBookingResponse | null {
  if (!isRecord(value)) return null;
  const { reference, status, service, starts_at, ends_at, time_zone, price, salon_name, pet_name, unchanged } = value;
  if (
    typeof reference !== 'string' ||
    !refPattern.test(reference) ||
    status !== 'booked' ||
    typeof starts_at !== 'string' ||
    !Number.isFinite(Date.parse(starts_at)) ||
    typeof ends_at !== 'string' ||
    !Number.isFinite(Date.parse(ends_at)) ||
    typeof price !== 'number'
  ) {
    return null;
  }
  return {
    reference: reference.toUpperCase(),
    status: 'booked',
    service: typeof service === 'string' ? service : 'Grooming Visit',
    startsAt: new Date(starts_at).toISOString(),
    endsAt: new Date(ends_at).toISOString(),
    timeZone: typeof time_zone === 'string' ? time_zone : 'UTC',
    price,
    salonName: typeof salon_name === 'string' ? salon_name : 'Salon',
    petName: typeof pet_name === 'string' ? pet_name : 'Pet',
    unchanged: Boolean(unchanged),
  };
}

export function customerPortalFailure(code: string | undefined): { status: number; error: string } {
  switch (code) {
    case 'PW020':
      return { status: 404, error: 'This salon is not currently active.' };
    case 'PW021':
      return { status: 400, error: 'Please check your booking reference code, phone number, and appointment details.' };
    case 'PW022':
      return { status: 409, error: 'That time slot is no longer available. Please select another time.' };
    case 'PW023':
      return { status: 429, error: 'Online requests are currently limited. Please contact the salon directly.' };
    case 'PW030':
      return {
        status: 404,
        error: 'No appointment found matching that reference code and phone number. Please verify your details.',
      };
    case 'PW031':
      return {
        status: 400,
        error: 'Only upcoming appointments in booked status can be modified or cancelled online.',
      };
    case 'PW032':
      return {
        status: 403,
        error:
          'Appointments within 24 hours cannot be changed online. Please call the salon directly so staff can assist you.',
      };
    default:
      return {
        status: 502,
        error: 'We were unable to process your appointment request at this moment. Please try again or call the salon.',
      };
  }
}
