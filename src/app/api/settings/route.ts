import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  validateAddonsList,
  validateGroomerIntake,
  validatePackagesList,
  validateSalonSettingsUpdate,
} from '@/lib/live-settings';
import { parseClockMinute, validSalonTimeZone } from '@/lib/live-reservations';

export const dynamic = 'force-dynamic';

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return reply({ error: 'Salon settings are not configured.' }, 503);
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

  const [businessResult, configResult, groomersResult] = await Promise.all([
    supabase.from('businesses').select('id,name,slug,city_state,subscription_status').eq('id', membership.business_id).maybeSingle(),
    supabase.from('business_configs').select('tax_rate,currency,custom_settings').eq('business_id', membership.business_id).maybeSingle(),
    supabase.from('staff_members').select('id,name,specialty,is_active').eq('business_id', membership.business_id).eq('role', 'groomer').order('name', { ascending: true }).limit(200),
  ]);
  if (businessResult.error || configResult.error || groomersResult.error || !businessResult.data || !groomersResult.data) {
    return reply({ error: 'Salon settings could not be loaded.' }, 502);
  }

  const business = businessResult.data;
  const config = configResult.data;
  const rawSettings = (config?.custom_settings ?? null) as Record<string, unknown> | null;
  const rawTax = config?.tax_rate !== undefined && config?.tax_rate !== null ? Number(config.tax_rate) : 8.25;
  const taxRate = Number.isFinite(rawTax) && rawTax >= 0 && rawTax <= 30 ? Number(rawTax.toFixed(2)) : 8.25;
  const rawBuffer = rawSettings?.booking_buffer_mins;
  const timeZone = validSalonTimeZone(rawSettings?.time_zone) ? rawSettings.time_zone : 'UTC';
  const bookingBufferMins = typeof rawBuffer === 'number' && Number.isInteger(rawBuffer) && rawBuffer >= 0 && rawBuffer <= 240 ? rawBuffer : 15;
  const rawHours = rawSettings?.operating_hours as Record<string, unknown> | undefined;
  const openMin = parseClockMinute(rawHours?.open);
  const closeMin = parseClockMinute(rawHours?.close);
  const operatingHours = openMin !== null && closeMin !== null && openMin < closeMin
    ? { open: rawHours?.open as string, close: rawHours?.close as string }
    : { open: '08:00', close: '18:00' };
  const packages = validatePackagesList(rawSettings?.packages) ?? [];
  const addons = validateAddonsList(rawSettings?.addons) ?? [];

  return reply({
    source: 'supabase_business_settings',
    business_id: membership.business_id,
    as_of: new Date().toISOString(),
    salon_name: business.name,
    slug: business.slug,
    city_state: business.city_state ?? null,
    subscription_status: business.subscription_status,
    tax_rate: taxRate,
    currency: 'USD',
    booking_buffer_mins: bookingBufferMins,
    time_zone: timeZone,
    operating_hours: operatingHours,
    packages,
    addons,
    groomers: groomersResult.data.map((member) => ({
      id: member.id,
      name: member.name,
      specialty: member.specialty ?? null,
      is_active: Boolean(member.is_active),
    })),
  }, 200);
}

export async function PATCH(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return reply({ error: 'Salon settings are not configured.' }, 503);
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return reply({ error: 'A signed-in staff session is required.' }, 401);

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return reply({ error: 'A JSON salon settings body is required.' }, 400);
  }
  const update = validateSalonSettingsUpdate(rawBody);
  if (!update) {
    return reply({ error: 'Valid tax_rate (0–30), booking_buffer_mins (0–240), time_zone, operating_hours, packages, and addons are required.' }, 400);
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

  const [businessResult, existingConfigResult] = await Promise.all([
    supabase.from('businesses').select('subscription_status').eq('id', membership.business_id).maybeSingle(),
    supabase.from('business_configs').select('custom_settings').eq('business_id', membership.business_id).maybeSingle(),
  ]);
  if (businessResult.error || existingConfigResult.error) {
    return reply({ error: 'Salon status could not be checked.' }, 502);
  }
  if (!businessResult.data || !['active', 'trialing'].includes(businessResult.data.subscription_status)) {
    return reply({ error: 'The salon subscription is not active for settings updates.' }, 422);
  }

  const existingCustom = existingConfigResult.data?.custom_settings &&
    typeof existingConfigResult.data.custom_settings === 'object' &&
    !Array.isArray(existingConfigResult.data.custom_settings)
    ? (existingConfigResult.data.custom_settings as Record<string, unknown>)
    : {};

  const mergedCustom = {
    ...existingCustom,
    booking_buffer_mins: update.booking_buffer_mins,
    time_zone: update.time_zone,
    operating_hours: update.operating_hours,
    packages: update.packages,
    addons: update.addons,
  };

  const { data: savedConfig, error: saveError } = await supabase.from('business_configs').upsert({
    business_id: membership.business_id,
    tax_rate: update.tax_rate.toFixed(2),
    currency: 'USD',
    custom_settings: mergedCustom,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id' }).select('business_id,tax_rate,currency,custom_settings,updated_at').single();
  if (saveError || !savedConfig) {
    return reply({ error: 'The salon settings could not be saved.' }, 502);
  }

  return reply({ config: savedConfig }, 200);
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return reply({ error: 'Salon settings are not configured.' }, 503);
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return reply({ error: 'A signed-in staff session is required.' }, 401);

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return reply({ error: 'A JSON groomer intake body is required.' }, 400);
  }
  const intake = validateGroomerIntake(rawBody);
  if (!intake) {
    return reply({ error: 'A valid groomer name is required.' }, 400);
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
    return reply({ error: 'The salon subscription is not active for staff registration.' }, 422);
  }

  const { data: createdGroomer, error: groomerError } = await supabase.from('staff_members').insert({
    business_id: membership.business_id,
    name: intake.name,
    specialty: intake.specialty,
    role: 'groomer',
    is_active: true,
  }).select('id,name,specialty,is_active').single();
  if (groomerError || !createdGroomer) {
    return reply({ error: 'The groomer record could not be saved.' }, 502);
  }

  return reply({ groomer: createdGroomer }, 201);
}
