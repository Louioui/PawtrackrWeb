import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validSalonTimeZone, validateStaffShiftDraft } from '@/lib/live-reservations';

export const dynamic = 'force-dynamic';

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validDay = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

async function staffContext(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return { error: reply({ error: 'Shifts are not configured.' }, 503) };
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) return { error: reply({ error: 'A signed-in staff session is required.' }, 401) };
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(match[1]);
  if (authError || !user) return { error: reply({ error: 'The staff session is invalid or expired.' }, 401) };
  const { data: membership, error: membershipError } = await supabase.from('staff_members')
    .select('business_id').eq('auth_user_id', user.id).eq('is_active', true).maybeSingle();
  if (membershipError) return { error: reply({ error: 'Staff membership could not be checked.' }, 502) };
  if (!membership) return { error: reply({ error: 'An active staff membership is required.' }, 403) };
  return { supabase, businessId: membership.business_id };
}

export async function GET(req: NextRequest) {
  const day = req.nextUrl.searchParams.get('date');
  if (!validDay(day)) return reply({ error: 'date must be a valid YYYY-MM-DD local date.' }, 400);
  const context = await staffContext(req);
  if (context.error) return context.error;
  const { data, error } = await context.supabase!.from('staff_shifts')
    .select('id,staff_id,shift_date,start_time,end_time,status,assigned_station')
    .eq('business_id', context.businessId!).eq('shift_date', day)
    .order('start_time', { ascending: true }).limit(201);
  if (error || !data || data.length > 200) return reply({ error: 'Salon shifts could not be loaded.' }, 502);
  return reply({ source: 'supabase_staff_shifts', business_id: context.businessId, date: day,
    as_of: new Date().toISOString(), shifts: data }, 200);
}

export async function POST(req: NextRequest) {
  let input: unknown;
  try { input = await req.json(); } catch { return reply({ error: 'A JSON shift body is required.' }, 400); }
  const context = await staffContext(req);
  if (context.error) return context.error;
  const [{ data: config, error: configError }, { data: business, error: businessError }] = await Promise.all([
    context.supabase!.from('business_configs').select('custom_settings').eq('business_id', context.businessId!).maybeSingle(),
    context.supabase!.from('businesses').select('subscription_status').eq('id', context.businessId!).maybeSingle(),
  ]);
  if (configError || businessError) return reply({ error: 'Salon configuration could not be checked.' }, 502);
  if (!business || !['active', 'trialing'].includes(business.subscription_status)) return reply({ error: 'The salon subscription is not active for shift updates.' }, 422);
  const settings = config?.custom_settings as Record<string, unknown> | null;
  const timeZone = settings?.time_zone ?? 'UTC';
  if (!validSalonTimeZone(timeZone)) return reply({ error: 'The salon time zone is invalid.' }, 422);
  const draft = validateStaffShiftDraft(input, timeZone);
  if (!draft || !validDay(draft.shift_date)) return reply({ error: 'Valid groomer, local date, start/end time, status, and station are required.' }, 400);
  const dayMs = Date.parse(`${draft.shift_date}T00:00:00Z`);
  if (dayMs < Date.now() - 86400000 || dayMs > Date.now() + 366 * 86400000) return reply({ error: 'Shift date must be within the next year.' }, 400);
  const { data: groomer, error: groomerError } = await context.supabase!.from('staff_members')
    .select('id').eq('business_id', context.businessId!).eq('id', draft.staff_id).eq('role', 'groomer').eq('is_active', true).maybeSingle();
  if (groomerError) return reply({ error: 'Groomer could not be checked.' }, 502);
  if (!groomer) return reply({ error: 'An active salon groomer is required.' }, 422);
  const { count, error: countError } = await context.supabase!.from('staff_shifts')
    .select('id', { count: 'exact', head: true }).eq('business_id', context.businessId!)
    .eq('staff_id', draft.staff_id).eq('shift_date', draft.shift_date);
  if (countError || count === null) return reply({ error: 'Existing shifts could not be checked.' }, 502);
  if (count >= 20) return reply({ error: 'This groomer has too many shifts on that date.' }, 422);
  const { data: saved, error } = await context.supabase!.from('staff_shifts')
    .insert({ ...draft, business_id: context.businessId }).select('id,staff_id,shift_date,start_time,end_time,status,assigned_station').single();
  if (error || !saved) return reply({ error: 'The shift could not be saved.' }, 502);
  return reply({ shift: saved }, 201);
}

export async function DELETE(req: NextRequest) {
  let input: unknown;
  try { input = await req.json(); } catch { return reply({ error: 'A JSON shift id is required.' }, 400); }
  const id = input && typeof input === 'object' && 'id' in input ? input.id : null;
  if (typeof id !== 'string' || !uuid.test(id)) return reply({ error: 'A valid shift id is required.' }, 400);
  const context = await staffContext(req);
  if (context.error) return context.error;
  const { data, error } = await context.supabase!.from('staff_shifts').delete()
    .eq('business_id', context.businessId!).eq('id', id).select('id').maybeSingle();
  if (error) return reply({ error: 'The shift could not be removed.' }, 502);
  if (!data) return reply({ error: 'Shift not found for this salon.' }, 404);
  return reply({ deleted_id: data.id }, 200);
}
