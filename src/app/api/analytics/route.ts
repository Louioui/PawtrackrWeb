import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { utcDailyCheckoutTotals } from '@/lib/production-analytics';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const reply = (body: unknown, status: number) => NextResponse.json(body, { status, headers: noStore });

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return reply({ error: 'Production analytics is not configured.' }, 503);

  const tokenMatch = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!tokenMatch) return reply({ error: 'A signed-in staff session is required.' }, 401);
  const daysParam = req.nextUrl.searchParams.get('days') ?? '30';
  if (daysParam !== '7' && daysParam !== '30' && daysParam !== '90') return reply({ error: 'days must be 7, 30, or 90.' }, 400);
  const days = Number(daysParam) as 7 | 30 | 90;

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${tokenMatch[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(tokenMatch[1]);
  if (authError || !user) return reply({ error: 'The staff session is invalid or expired.' }, 401);

  const { data: staff, error: staffError } = await supabase.from('staff_members')
    .select('business_id').eq('auth_user_id', user.id).eq('is_active', true).maybeSingle();
  if (staffError) return reply({ error: 'Staff membership could not be checked.' }, 502);
  if (!staff) return reply({ error: 'An active staff membership is required.' }, 403);

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - days + 1);
  const rows: { amount: unknown; created_at: string; status: string }[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('transactions')
      .select('id,amount,created_at,status')
      .eq('business_id', staff.business_id)
      .eq('status', 'completed')
      .gte('created_at', start.toISOString())
      .lte('created_at', now.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error || !data) return reply({ error: 'Checkout data could not be loaded.' }, 502);
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  try {
    const daily = utcDailyCheckoutTotals(rows, days, now);
    return reply({
      source: 'supabase_recorded_checkouts',
      settlement_confirmed: false,
      business_id: staff.business_id,
      as_of: now.toISOString(),
      timezone: 'UTC',
      days,
      recorded_checkout_cents: daily.reduce((sum, day) => sum + day.recorded_checkout_cents, 0),
      checkout_count: daily.reduce((sum, day) => sum + day.checkout_count, 0),
      daily,
    }, 200);
  } catch {
    return reply({ error: 'Checkout data failed validation.' }, 502);
  }
}
