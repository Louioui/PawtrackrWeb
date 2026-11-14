import { NextRequest, NextResponse } from 'next/server';
import {
  createRateLimiter,
  getPublicBookingClient,
} from '@/lib/public-booking';
import {
  customerPortalFailure,
  parseRescheduleResponse,
  validateReschedulePayload,
} from '@/lib/customer-portal';

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Allow 5 reschedule attempts per 10 minutes per IP
const allow = createRateLimiter(5, 10 * 60_000);

export async function POST(req: NextRequest) {
  const address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!allow(address)) {
    return reply({ error: 'Too many reschedule attempts. Please wait a few minutes before trying again.' }, 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Reschedule details are required.' }, 400);
  }

  const validated = validateReschedulePayload(body);
  if (!validated.ok) {
    return reply({ error: validated.error }, 400);
  }

  const client = getPublicBookingClient();
  if (!client) {
    return reply({ error: 'Customer booking management is not configured.' }, 503);
  }

  const { data, error } = await client.rpc('public_reschedule_booking', {
    p_slug: validated.slug,
    p_reference: validated.reference,
    p_phone: validated.phoneDigits,
    p_new_start: validated.startsAt,
  });

  if (error) {
    const failure = customerPortalFailure(error.code);
    return reply({ error: failure.error }, failure.status);
  }

  const result = parseRescheduleResponse(data);
  if (!result) {
    return reply(
      { error: 'Appointment was rescheduled, but confirmation could not be generated. Please contact the salon.' },
      502
    );
  }

  return reply({ rescheduled: true, result }, 200);
}
