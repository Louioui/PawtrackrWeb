import { NextRequest, NextResponse } from 'next/server';
import {
  createRateLimiter,
  getPublicBookingClient,
} from '@/lib/public-booking';
import {
  customerPortalFailure,
  parseCustomerBookingDetails,
  validateLookupParams,
} from '@/lib/customer-portal';

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Allow up to 20 lookups per 10 minutes per IP to prevent reference scanning
const allow = createRateLimiter(20, 10 * 60_000);

export async function GET(req: NextRequest) {
  const address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!allow(address)) {
    return reply({ error: 'Too many lookup attempts. Please wait a few minutes before trying again.' }, 429);
  }

  const { searchParams } = req.nextUrl;
  const slug = searchParams.get('slug');
  const reference = searchParams.get('ref') || searchParams.get('reference');
  const phone = searchParams.get('phone');

  const validated = validateLookupParams(slug, reference, phone);
  if (!validated.ok) {
    return reply({ error: validated.error }, 400);
  }

  const client = getPublicBookingClient();
  if (!client) {
    return reply({ error: 'Customer booking management is not configured.' }, 503);
  }

  const { data, error } = await client.rpc('public_get_booking_by_reference', {
    p_slug: validated.slug,
    p_reference: validated.reference,
    p_phone: validated.phoneDigits,
  });

  if (error) {
    const failure = customerPortalFailure(error.code);
    return reply({ error: failure.error }, failure.status);
  }

  const booking = parseCustomerBookingDetails(data);
  if (!booking) {
    return reply(
      { error: 'Appointment details could not be parsed. Please contact the salon directly.' },
      502
    );
  }

  return reply({ booking }, 200);
}
