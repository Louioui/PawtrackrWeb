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
    // Body optional if claimToken is passed as query param
  }

  const url = new URL(req.url);
  const claimToken =
    (typeof body.claimToken === 'string' ? body.claimToken.trim() : null) ||
    url.searchParams.get('token') ||
    '';

  if (!claimToken || claimToken.length < 8) {
    return noStoreJson({ error: 'Valid claim token is required to claim a slot hold.' }, 400);
  }

  // Determine client: authenticated staff or public client
  let supabase = null;
  const hasAuthHeader = Boolean(req.headers.get('authorization'));

  if (hasAuthHeader) {
    const auth = await requireActiveStaffSession(req, 'Claim waitlist offer');
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

  // Execute atomic claim RPC with GiST re-verification
  const { data, error } = await supabase.rpc('claim_waitlist_offer', {
    p_offer_id: offerId,
    p_claim_token: claimToken,
  });

  if (error) {
    // Error code PW062 means slot hold expired
    if (error.code === 'PW062' || error.message.includes('PW062') || error.message.includes('expired')) {
      return noStoreJson(
        {
          error: 'This slot hold has expired. The appointment was released to the next pet in line.',
          code: 'PW062',
        },
        410
      );
    }
    return noStoreJson({ error: error.message || 'Failed to claim waitlist offer' }, 422);
  }

  return noStoreJson({ success: true, ...data }, 200);
}
