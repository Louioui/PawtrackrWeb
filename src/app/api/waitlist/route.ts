import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  // Staff check: waitlist is internal operational data
  const auth = await requireActiveStaffSession(req, 'Waitlist queue');
  if (!auth.ok) return auth.response;

  // Run automated expiration sweep so UI view is always strictly synchronized
  await auth.ctx.supabase.rpc('expire_waitlist_offers');

  // Query waitlist entries
  const { data: entries, error: entriesError } = await auth.ctx.supabase
    .from('waitlist_entries')
    .select(
      '*, client:clients(id, name, phone, email), pet:pets(id, name, breed), staff:staff_members(id, name)'
    )
    .order('rank_position', { ascending: true })
    .order('created_at', { ascending: true });

  if (entriesError) {
    return noStoreJson({ error: entriesError.message || 'Failed to fetch waitlist entries' }, 502);
  }

  // Query active pending slot offers
  const { data: offers, error: offersError } = await auth.ctx.supabase
    .from('waitlist_offers')
    .select(
      '*, staff:staff_members(id, name), entry:waitlist_entries(*, pet:pets(id, name), client:clients(id, name, phone))'
    )
    .eq('status', 'pending')
    .order('offer_expires_at', { ascending: true });

  if (offersError) {
    return noStoreJson({ error: offersError.message || 'Failed to fetch waitlist offers' }, 502);
  }

  return noStoreJson(
    {
      success: true,
      entries: entries || [],
      offers: offers || [],
    },
    200
  );
}

export async function POST(req: NextRequest) {
  // WF02: Add pet parent to waitlist queue
  const auth = await requireActiveStaffSession(req, 'Add to waitlist', [
    'owner',
    'manager',
    'front_desk',
  ]);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  const petId = typeof body.petId === 'string' ? body.petId.trim() : '';
  const servicePackage = typeof body.servicePackage === 'string' ? body.servicePackage.trim() : '';
  const preferredStaffId =
    typeof body.preferredStaffId === 'string' && uuidPattern.test(body.preferredStaffId)
      ? body.preferredStaffId.trim()
      : null;
  const preferredDates = Array.isArray(body.preferredDates)
    ? body.preferredDates.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    : [];
  const timePreference = ['any', 'morning', 'afternoon', 'weekend'].includes(
    String(body.timePreference)
  )
    ? String(body.timePreference)
    : 'any';
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : null;

  if (!uuidPattern.test(clientId) || !uuidPattern.test(petId)) {
    return noStoreJson({ error: 'Valid client and pet UUIDs are required.' }, 400);
  }

  if (!servicePackage || servicePackage.length < 2) {
    return noStoreJson({ error: 'Valid service package name is required.' }, 400);
  }

  const { data, error } = await auth.ctx.supabase.rpc('create_waitlist_entry', {
    p_client_id: clientId,
    p_pet_id: petId,
    p_service_package: servicePackage,
    p_preferred_staff_id: preferredStaffId,
    p_preferred_dates: preferredDates,
    p_time_preference: timePreference,
    p_notes: notes,
  });

  if (error) {
    return noStoreJson({ error: error.message || 'Failed to create waitlist entry' }, 422);
  }

  return noStoreJson({ success: true, ...data }, 201);
}
