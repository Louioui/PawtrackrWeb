import { NextRequest, NextResponse } from 'next/server';
import {
  createRateLimiter,
  getPublicBookingClient,
} from '@/lib/public-booking';
import {
  customerPortalFailure,
  parseCancelResponse,
  validateCancelPayload,
} from '@/lib/customer-portal';

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Allow 5 cancellation attempts per 10 minutes per IP
const allow = createRateLimiter(5, 10 * 60_000);

export async function POST(req: NextRequest) {
  const address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!allow(address)) {
    return reply({ error: 'Too many cancellation attempts. Please wait a few minutes before trying again.' }, 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Cancellation details are required.' }, 400);
  }

  const validated = validateCancelPayload(body);
  if (!validated.ok) {
    return reply({ error: validated.error }, 400);
  }

  const client = getPublicBookingClient();
  if (!client) {
    return reply({ error: 'Customer booking management is not configured.' }, 503);
  }

  const { data, error } = await client.rpc('public_cancel_booking', {
    p_slug: validated.slug,
    p_reference: validated.reference,
    p_phone: validated.phoneDigits,
    p_reason: validated.reason,
  });

  if (error) {
    const failure = customerPortalFailure(error.code);
    return reply({ error: failure.error }, failure.status);
  }

  const result = parseCancelResponse(data);
  if (!result) {
    return reply(
      { error: 'Appointment was cancelled, but confirmation could not be generated. Please check with the salon.' },
      502
    );
  }

  return reply({ cancelled: true, result }, 200);
}
