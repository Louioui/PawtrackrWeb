import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/;
const statuses = new Set(['booked', 'dropped_off', 'bathing', 'styling', 'ready', 'completed', 'cancelled']);

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return reply({ error: 'Reservations are not configured.' }, 503);
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return reply({ error: 'A signed-in staff session is required.' }, 401);
  const day = req.nextUrl.searchParams.get('date');
  const parsedDay = day && /^\d{4}-\d\d-\d\d$/.test(day) ? new Date(`${day}T00:00:00.000Z`) : null;
  if (!parsedDay || !Number.isFinite(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day) {
    return reply({ error: 'date must be a valid YYYY-MM-DD UTC date.' }, 400);
  }
  const start = parsedDay;
  const end = new Date(start.getTime() + 86400000);
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(match[1]);
  if (authError || !user) return reply({ error: 'The staff session is invalid or expired.' }, 401);
  const { data: membership, error: membershipError } = await supabase.from('staff_members')
    .select('business_id').eq('auth_user_id', user.id).eq('is_active', true).maybeSingle();
  if (membershipError) return reply({ error: 'Staff membership could not be checked.' }, 502);
  if (!membership) return reply({ error: 'An active staff membership is required.' }, 403);

  const { data: visits, error: visitsError } = await supabase.from('visits')
    .select('id,client_id,pet_id,staff_id,status,service_package,scheduled_time,reservation_end')
    .eq('business_id', membership.business_id)
    .gte('scheduled_time', start.toISOString()).lt('scheduled_time', end.toISOString())
    .order('scheduled_time', { ascending: true }).order('id', { ascending: true }).limit(1001);
  if (visitsError || !visits) return reply({ error: 'Reservations could not be loaded.' }, 502);
  if (visits.length > 1000) return reply({ error: 'This day has too many reservations to display.' }, 413);
  const [pets, clients, staff, business, config] = await Promise.all([
    supabase.from('pets').select('id,client_id,name').eq('business_id', membership.business_id).order('name', { ascending: true }).limit(500),
    supabase.from('clients').select('id,name').eq('business_id', membership.business_id).order('name', { ascending: true }).limit(500),
    supabase.from('staff_members').select('id,name,role,is_active').eq('business_id', membership.business_id).order('name', { ascending: true }).limit(200),
    supabase.from('businesses').select('subscription_status').eq('id', membership.business_id).maybeSingle(),
    supabase.from('business_configs').select('custom_settings,currency').eq('business_id', membership.business_id).maybeSingle(),
  ]);
  if (pets.error || clients.error || staff.error || business.error || config.error || !pets.data || !clients.data || !staff.data) {
    return reply({ error: 'Reservation labels could not be loaded.' }, 502);
  }
  const petNames = new Map(pets.data.map((item) => [item.id, item.name]));
  const clientNames = new Map(clients.data.map((item) => [item.id, item.name]));
  const staffNames = new Map(staff.data.map((item) => [item.id, item.name]));
  const canBook = !!business.data && ['active', 'trialing'].includes(business.data.subscription_status) &&
    config.data?.currency === 'USD';
  const settings = (config.data?.custom_settings ?? null) as Record<string, unknown> | null;
  const buffer = settings?.booking_buffer_mins;
  const validBuffer = typeof buffer === 'number' && Number.isInteger(buffer) && buffer >= 0 && buffer <= 240;
  const rawPackages = canBook && validBuffer && Array.isArray(settings?.packages) ? settings.packages : [];
  const services = rawPackages.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const pkg = item as Record<string, unknown>;
    if (typeof pkg.id !== 'string' || !pkg.id.trim() || pkg.id.length > 100 ||
        typeof pkg.name !== 'string' || !pkg.name.trim() || pkg.name.length > 200 ||
        typeof pkg.durationMinutes !== 'number' || !Number.isInteger(pkg.durationMinutes) || pkg.durationMinutes < 1 || pkg.durationMinutes > 1440 ||
        typeof pkg.price !== 'number' || !Number.isFinite(pkg.price) || pkg.price < 0 || Math.round(pkg.price * 100) !== pkg.price * 100) {
      return [];
    }
    return [{ id: pkg.id, name: pkg.name, duration_minutes: pkg.durationMinutes }];
  });
  return reply({
    source: 'supabase_visits',
    business_id: membership.business_id,
    date: day,
    timezone: 'UTC',
    as_of: new Date().toISOString(),
    reservations: visits.map((visit) => ({
      id: visit.id,
      scheduled_time: visit.scheduled_time,
      reservation_end: visit.reservation_end,
      status: visit.status,
      service_package: visit.service_package,
      staff_id: visit.staff_id,
      pet_name: petNames.get(visit.pet_id) ?? 'Unknown pet',
      client_name: clientNames.get(visit.client_id) ?? 'Unknown client',
      staff_name: visit.staff_id ? staffNames.get(visit.staff_id) ?? 'Unknown groomer' : 'Unassigned',
    })),
    booking_options: {
      pets: pets.data.flatMap((pet) => {
        const clientName = clientNames.get(pet.client_id);
        return clientName ? [{ id: pet.id, client_id: pet.client_id, pet_name: pet.name, client_name: clientName }] : [];
      }),
      groomers: staff.data.filter((member) => member.is_active && member.role === 'groomer').map((member) => ({ id: member.id, name: member.name })),
      services,
    },
  }, 200);
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return reply({ error: 'Reservations are not configured.' }, 503);
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return reply({ error: 'A signed-in staff session is required.' }, 401);

  let input: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
    input = parsed as Record<string, unknown>;
  } catch {
    return reply({ error: 'A JSON reservation body is required.' }, 400);
  }
  const { client_id, pet_id, staff_id, package_id, scheduled_time } = input;
  if (![client_id, pet_id, staff_id].every((value) => typeof value === 'string' && uuid.test(value)) ||
      typeof package_id !== 'string' || !package_id || package_id.length > 100 ||
      typeof scheduled_time !== 'string' || !timestamp.test(scheduled_time)) {
    return reply({ error: 'Valid client, pet, groomer, package, and offset-aware time are required.' }, 400);
  }
  const start = new Date(scheduled_time);
  if (!Number.isFinite(start.getTime()) || start.getTime() < Date.now() || start.getTime() > Date.now() + 366 * 86400000) {
    return reply({ error: 'Reservation time must be within the next year.' }, 400);
  }

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(match[1]);
  if (authError || !user) return reply({ error: 'The staff session is invalid or expired.' }, 401);
  const { data: membership, error: membershipError } = await supabase.from('staff_members')
    .select('business_id').eq('auth_user_id', user.id).eq('is_active', true).maybeSingle();
  if (membershipError) return reply({ error: 'Staff membership could not be checked.' }, 502);
  if (!membership) return reply({ error: 'An active staff membership is required.' }, 403);
  const businessId = membership.business_id;

  const [{ data: business, error: businessError }, { data: config, error: configError },
    { data: groomer, error: groomerError }, { data: pet, error: petError }] = await Promise.all([
    supabase.from('businesses').select('subscription_status').eq('id', businessId).maybeSingle(),
    supabase.from('business_configs').select('custom_settings,currency').eq('business_id', businessId).maybeSingle(),
    supabase.from('staff_members').select('id,role').eq('business_id', businessId).eq('id', staff_id).eq('is_active', true).maybeSingle(),
    supabase.from('pets').select('id,client_id').eq('business_id', businessId).eq('id', pet_id).maybeSingle(),
  ]);
  if (businessError || configError || groomerError || petError) return reply({ error: 'Reservation details could not be checked.' }, 502);
  if (!business || !config || !groomer || !pet || pet.client_id !== client_id || groomer.role !== 'groomer' ||
      !['active', 'trialing'].includes(business.subscription_status)) {
    return reply({ error: 'The salon, pet, groomer, or service is unavailable.' }, 422);
  }

  const settings = config.custom_settings as Record<string, unknown> | null;
  const packages = Array.isArray(settings?.packages) ? settings.packages : [];
  const service = packages.find((item): item is Record<string, unknown> =>
    !!item && typeof item === 'object' && !Array.isArray(item) && (item as Record<string, unknown>).id === package_id);
  const buffer = settings?.booking_buffer_mins;
  if (!service || typeof service.name !== 'string' || !service.name || service.name.length > 200 ||
      typeof service.durationMinutes !== 'number' || !Number.isInteger(service.durationMinutes) || service.durationMinutes < 1 || service.durationMinutes > 1440 ||
      typeof service.price !== 'number' || !Number.isFinite(service.price) || service.price < 0 || Math.round(service.price * 100) !== service.price * 100 ||
      config.currency !== 'USD' || typeof buffer !== 'number' || !Number.isInteger(buffer) || buffer < 0 || buffer > 240) {
    return reply({ error: 'The selected service is not configured for reservations.' }, 422);
  }

  const { data: visit, error } = await supabase.from('visits').insert({
    business_id: businessId,
    client_id,
    pet_id,
    staff_id,
    status: 'booked',
    booking_source: 'walk_in',
    service_package: service.name,
    total_amount: service.price.toFixed(2),
    scheduled_time: start.toISOString(),
    duration_minutes: service.durationMinutes,
    booking_buffer_minutes: buffer,
  }).select('id,scheduled_time,reservation_end,status').single();
  if (error?.code === '23P01') return reply({ error: 'That groomer is already booked during this time.' }, 409);
  if (error || !visit) return reply({ error: 'The reservation could not be saved.' }, 502);
  return reply({ reservation: visit }, 201);
}

export async function PATCH(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return reply({ error: 'Reservations are not configured.' }, 503);
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return reply({ error: 'A signed-in staff session is required.' }, 401);

  let input: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
    input = parsed as Record<string, unknown>;
  } catch {
    return reply({ error: 'A JSON status update body is required.' }, 400);
  }
  const { id, status } = input;
  if (typeof id !== 'string' || !uuid.test(id) || typeof status !== 'string' || !statuses.has(status)) {
    return reply({ error: 'Valid reservation id and status are required.' }, 400);
  }

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(match[1]);
  if (authError || !user) return reply({ error: 'The staff session is invalid or expired.' }, 401);
  const { data: membership, error: membershipError } = await supabase.from('staff_members')
    .select('business_id').eq('auth_user_id', user.id).eq('is_active', true).maybeSingle();
  if (membershipError) return reply({ error: 'Staff membership could not be checked.' }, 502);
  if (!membership) return reply({ error: 'An active staff membership is required.' }, 403);

  const { data: business, error: businessError } = await supabase.from('businesses')
    .select('subscription_status').eq('id', membership.business_id).maybeSingle();
  if (businessError) return reply({ error: 'Reservation details could not be checked.' }, 502);
  if (!business || !['active', 'trialing'].includes(business.subscription_status)) {
    return reply({ error: 'The salon subscription is not active for reservation updates.' }, 422);
  }

  const { data: visit, error } = await supabase.from('visits')
    .update({ status })
    .eq('business_id', membership.business_id)
    .eq('id', id)
    .select('id,scheduled_time,reservation_end,status')
    .maybeSingle();
  if (error?.code === '23P01') return reply({ error: 'That groomer is already booked during this time.' }, 409);
  if (error) return reply({ error: 'The reservation status could not be updated.' }, 502);
  if (!visit) return reply({ error: 'Reservation not found for this salon.' }, 404);
  return reply({ reservation: visit }, 200);
}
