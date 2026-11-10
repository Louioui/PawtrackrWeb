import { NextRequest, NextResponse } from 'next/server';
import { createRateLimiter, getPublicBookingClient, publicBookingFailure, validBookingDate, validBookingSlug } from '@/lib/public-booking';

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const allow = createRateLimiter(60, 60_000);

// Open start times for one service on one salon-local date. Anonymous: the
// database function returns times only, never who is booked or which groomer.
export async function GET(req: NextRequest) {
  const address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!allow(address)) return reply({ error: 'Too many requests. Wait a minute and try again.' }, 429);
  const params = req.nextUrl.searchParams;
  const slug = params.get('slug');
  const packageId = params.get('package_id');
  const date = params.get('date');
  if (!validBookingSlug(slug) || !packageId || packageId.length > 100 || !validBookingDate(date)) {
    return reply({ error: 'slug, package_id, and a YYYY-MM-DD date are required.' }, 400);
  }
  const client = getPublicBookingClient();
  if (!client) return reply({ error: 'Online booking is not configured.' }, 503);
  const { data, error } = await client.rpc('public_booking_slots', { p_slug: slug, p_package_id: packageId, p_date: date });
  if (error) {
    const failure = publicBookingFailure(error.code);
    return reply({ error: failure.error }, failure.status);
  }
  const slots = (Array.isArray(data) ? data : []).flatMap((row: unknown) => {
    const value = row && typeof row === 'object' ? (row as { slot_start?: unknown }).slot_start : null;
    return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? [new Date(value).toISOString()] : [];
  });
  return reply({ slug, package_id: packageId, date, as_of: new Date().toISOString(), slots }, 200);
}
