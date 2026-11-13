import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { getPublicBookingClient } from '@/lib/public-booking';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: offerId } = await params;

  if (!uuidPattern.test(offerId)) {
    return noStoreJson({ error: 'Valid waitlist offer UUID is required.' }, 400);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Body optional
  }

  const url = new URL(req.url);
  const claimToken =
    (typeof body.claimToken === 'string' ? body.claimToken.trim() : null) ||
    url.searchParams.get('token') ||
    '';

  let supabase = null;
  const hasAuthHeader = Boolean(req.headers.get('authorization'));

  if (hasAuthHeader) {
    const auth = await requireActiveStaffSession(req, 'Decline waitlist offer');
    if (auth.ok) {
      supabase = auth.ctx.supabase;
    }
  }

  if (!supabase) {
    supabase = getPublicBookingClient();
  }

  if (!supabase) {
    return noStoreJson({ error: 'Database service is currently unavailable.' }, 503);
  }

  // Look up offer
  const query = supabase
    .from('waitlist_offers')
    .select('id, waitlist_entry_id, status, claim_token')
    .eq('id', offerId);

  if (claimToken) {
    query.eq('claim_token', claimToken);
  }

  const { data: offer, error: fetchError } = await query.single();

  if (fetchError || !offer) {
    return noStoreJson({ error: 'Waitlist offer not found or token invalid' }, 404);
  }

  if (offer.status !== 'pending') {
    return noStoreJson(
      { error: `Waitlist offer is no longer pending (status: ${offer.status})` },
      422
    );
  }

  // Update offer to declined
  const { error: updateOfferError } = await supabase
    .from('waitlist_offers')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', offerId);

  if (updateOfferError) {
    return noStoreJson({ error: 'Failed to update offer status' }, 500);
  }

  // Revert waitlist entry back to active so next slot can be offered
  await supabase
    .from('waitlist_entries')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', offer.waitlist_entry_id);

  return noStoreJson({ success: true, message: 'Slot offer declined' }, 200);
}
