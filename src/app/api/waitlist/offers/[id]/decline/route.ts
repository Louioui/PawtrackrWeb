import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { getPublicBookingClient } from '@/lib/public-booking';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const claimTokenPattern = /^[0-9a-f]{16,64}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: offerId } = await params;

  if (!uuidPattern.test(offerId)) {
    return noStoreJson({ error: 'Valid waitlist offer UUID is required.' }, 400);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Body optional when token passed in query string
  }

  const url = new URL(req.url);
  const claimToken =
    (typeof body.claimToken === 'string' ? body.claimToken.trim() : '') ||
    (url.searchParams.get('token')?.trim() ?? '');

  let staffBusinessId: string | null = null;
  let supabase = null;
  const hasAuthHeader = Boolean(req.headers.get('authorization'));

  if (hasAuthHeader) {
    const auth = await requireActiveStaffSession(req, 'Decline waitlist offer');
    if (!auth.ok) return auth.response;
    supabase = auth.ctx.supabase;
    staffBusinessId = auth.ctx.membership.business_id;
  } else {
    // Anonymous pet-parent decline MUST supply a valid cryptographic claim token (prevents IDOR)
    if (!claimToken || !claimTokenPattern.test(claimToken)) {
      return noStoreJson(
        { error: 'A valid waitlist claim token is required to decline an offer.' },
        401,
      );
    }
    supabase = getPublicBookingClient();
  }

  if (!supabase) {
    return noStoreJson({ error: 'Database service is currently unavailable.' }, 503);
  }

  let query = supabase
    .from('waitlist_offers')
    .select('id, business_id, waitlist_entry_id, status, claim_token')
    .eq('id', offerId);

  if (staffBusinessId) {
    query = query.eq('business_id', staffBusinessId);
  }
  if (claimToken) {
    query = query.eq('claim_token', claimToken);
  }

  const { data: offer, error: fetchError } = await query.maybeSingle();

  if (fetchError || !offer) {
    return noStoreJson({ error: 'Waitlist offer not found or token invalid' }, 404);
  }

  if (offer.status !== 'pending') {
    return noStoreJson(
      { error: `Waitlist offer is no longer pending (status: ${offer.status})` },
      422,
    );
  }

  let updateQuery = supabase
    .from('waitlist_offers')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .eq('business_id', offer.business_id)
    .eq('status', 'pending');

  if (claimToken) {
    updateQuery = updateQuery.eq('claim_token', claimToken);
  }

  const { error: updateOfferError } = await updateQuery;

  if (updateOfferError) {
    return noStoreJson({ error: 'Failed to update offer status' }, 500);
  }

  await supabase
    .from('waitlist_entries')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', offer.waitlist_entry_id)
    .eq('business_id', offer.business_id);

  return noStoreJson({ success: true, message: 'Slot offer declined' }, 200);
}
