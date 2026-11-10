import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { provisioningFailure, validateSalonProvisioning } from '@/lib/onboarding';

const reply = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function callerClient(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return { failure: reply({ error: 'Salon sign-up is not configured.' }, 503) };
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return { failure: reply({ error: 'Sign in to continue.' }, 401) };
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await supabase.auth.getUser(match[1]);
  if (error || !user) return { failure: reply({ error: 'Your session is invalid or expired.' }, 401) };
  return { supabase, user };
}

// Reports whether the signed-in user already belongs to a salon. Row-level
// security returns only the caller's own tenant, so no id is taken from the request.
export async function GET(req: NextRequest) {
  const caller = await callerClient(req);
  if ('failure' in caller) return caller.failure;
  const { supabase, user } = caller;
  const { data: membership, error } = await supabase.from('staff_members')
    .select('business_id,name,role,is_active').eq('auth_user_id', user.id).maybeSingle();
  if (error) return reply({ error: 'Your salon membership could not be checked.' }, 502);
  if (!membership) return reply({ member: false, email_confirmed: Boolean(user.email_confirmed_at) }, 200);
  if (!membership.is_active) return reply({ member: true, active: false }, 200);
  const { data: salon, error: salonError } = await supabase.from('businesses')
    .select('name,slug,subscription_status').eq('id', membership.business_id).maybeSingle();
  if (salonError || !salon) return reply({ error: 'Your salon could not be loaded.' }, 502);
  return reply({
    member: true,
    active: true,
    staff: { name: membership.name, role: membership.role },
    salon: { name: salon.name, slug: salon.slug, subscription_status: salon.subscription_status },
  }, 200);
}

// Creates the caller's salon, settings, and owner membership in one database
// transaction. The owner is always the authenticated caller.
export async function POST(req: NextRequest) {
  const caller = await callerClient(req);
  if ('failure' in caller) return caller.failure;
  const { supabase, user } = caller;
  if (!user.email_confirmed_at) return reply({ error: 'Confirm your email address before creating a salon.' }, 403);

  let body: unknown;
  try { body = await req.json(); } catch { return reply({ error: 'Salon details are required.' }, 400); }
  const checked = validateSalonProvisioning(body);
  if (!checked.ok) return reply({ error: checked.error }, 400);

  const { error } = await supabase.rpc('provision_salon', {
    p_salon_name: checked.draft.salon_name,
    p_slug: checked.draft.slug,
    p_time_zone: checked.draft.time_zone,
    p_owner_name: checked.draft.owner_name,
  });
  if (error) {
    const failure = provisioningFailure(error.code);
    return reply({ error: failure.error }, failure.status);
  }
  return reply({ salon: { name: checked.draft.salon_name, slug: checked.draft.slug } }, 201);
}
