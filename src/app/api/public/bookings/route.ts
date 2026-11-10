import { NextRequest, NextResponse } from 'next/server';
import {
  createRateLimiter, getPublicBookingClient, parseBookingConfirmation, publicBookingFailure, validatePublicBookingRequest,
} from '@/lib/public-booking';

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const allow = createRateLimiter(8, 10 * 60_000);

// Books one pet into one open slot. The salon is named only by its public
// slug; the price, duration, buffer, and groomer are all decided in the
// database from the salon's own catalog and schedule.
export async function POST(req: NextRequest) {
  const address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!allow(address)) return reply({ error: 'Too many booking attempts. Wait a few minutes or contact the salon.' }, 429);
  let body: unknown;
  try { body = await req.json(); } catch { return reply({ error: 'Booking details are required.' }, 400); }
  const checked = validatePublicBookingRequest(body);
  if (!checked.ok) return reply({ error: checked.error }, 400);
  const client = getPublicBookingClient();
  if (!client) return reply({ error: 'Online booking is not configured.' }, 503);
  const { request } = checked;
  const { data, error } = await client.rpc('public_book_appointment', {
    p_slug: request.slug, p_package_id: request.package_id, p_start: request.starts_at,
    p_client_name: request.client_name, p_client_phone: request.client_phone, p_client_email: request.client_email,
    p_pet_name: request.pet_name, p_breed: request.breed,
  });
  if (error) {
    const failure = publicBookingFailure(error.code);
    return reply({ error: failure.error }, failure.status);
  }
  const confirmation = parseBookingConfirmation(data);
  // The write succeeded but the answer is unreadable: say so rather than
  // inviting a retry that would create a second booking.
  if (!confirmation) return reply({ error: 'Your booking was saved, but we could not show the confirmation. Please contact the salon to confirm.' }, 502);
  return reply({ booking: confirmation }, 201);
}
