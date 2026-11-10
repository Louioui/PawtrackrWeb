import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validateClientPetIntake } from '@/lib/live-clients';

export const dynamic = 'force-dynamic';

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return reply({ error: 'Client directory is not configured.' }, 503);
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return reply({ error: 'A signed-in staff session is required.' }, 401);

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

  const [clients, pets] = await Promise.all([
    supabase.from('clients').select('id,name,phone,email').eq('business_id', membership.business_id).order('name', { ascending: true }).limit(500),
    supabase.from('pets').select('id,client_id,name,breed,weight_lbs').eq('business_id', membership.business_id).order('name', { ascending: true }).limit(500),
  ]);
  if (clients.error || pets.error || !clients.data || !pets.data) {
    return reply({ error: 'Salon clients and pets could not be loaded.' }, 502);
  }
  const clientById = new Map(clients.data.map((client) => [client.id, client]));
  const petRows = pets.data.flatMap((pet) => {
    const owner = clientById.get(pet.client_id);
    if (!owner) return [];
    return [{
      id: pet.id,
      client_id: pet.client_id,
      pet_name: pet.name,
      breed: pet.breed,
      weight_lbs: pet.weight_lbs !== null && pet.weight_lbs !== undefined ? Number(pet.weight_lbs) : null,
      client_name: owner.name,
      client_phone: owner.phone,
      client_email: owner.email ?? null,
    }];
  });

  return reply({
    source: 'supabase_clients_pets',
    business_id: membership.business_id,
    as_of: new Date().toISOString(),
    client_count: clients.data.length,
    pet_count: petRows.length,
    pets: petRows,
  }, 200);
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return reply({ error: 'Client intake is not configured.' }, 503);
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return reply({ error: 'A signed-in staff session is required.' }, 401);

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return reply({ error: 'A JSON client intake body is required.' }, 400);
  }
  const intake = validateClientPetIntake(rawBody);
  if (!intake) {
    return reply({ error: 'Valid client name, phone, pet name, and breed are required.' }, 400);
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
  if (businessError) return reply({ error: 'Salon status could not be checked.' }, 502);
  if (!business || !['active', 'trialing'].includes(business.subscription_status)) {
    return reply({ error: 'The salon subscription is not active for client intake.' }, 422);
  }

  const { data: createdClient, error: clientError } = await supabase.from('clients').insert({
    business_id: membership.business_id,
    name: intake.client_name,
    phone: intake.client_phone,
    email: intake.client_email,
  }).select('id,name,phone,email').single();
  if (clientError || !createdClient) {
    return reply({ error: 'The client record could not be saved.' }, 502);
  }

  const { data: createdPet, error: petError } = await supabase.from('pets').insert({
    business_id: membership.business_id,
    client_id: createdClient.id,
    name: intake.pet_name,
    breed: intake.breed,
    ...(intake.weight_lbs ? { weight_lbs: intake.weight_lbs } : {}),
  }).select('id,client_id,name,breed,weight_lbs').single();
  if (petError || !createdPet) {
    await supabase.from('clients').delete().eq('business_id', membership.business_id).eq('id', createdClient.id);
    return reply({ error: 'The pet record could not be saved.' }, 502);
  }

  return reply({ client: createdClient, pet: createdPet }, 201);
}
