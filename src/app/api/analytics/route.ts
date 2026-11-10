import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  centsToDatabaseMoney,
  databaseMoneyToCents,
  settlementTotals, utcDailyCheckoutTotals,
  validateLiveCheckoutInput,
} from '@/lib/production-analytics';

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
  const rows: { amount: unknown; created_at: string; status: string; settlement_status: unknown }[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('transactions')
      .select('id,amount,created_at,status,settlement_status')
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

  const visitsResult = await supabase.from('visits')
    .select('id,pet_id,service_package,scheduled_time,total_amount,status')
    .eq('business_id', staff.business_id)
    .neq('status', 'cancelled')
    .order('scheduled_time', { ascending: false })
    .limit(100);
  if (visitsResult.error || !visitsResult.data) {
    return reply({ error: 'Checkout data could not be loaded.' }, 502);
  }
  const visitIds = visitsResult.data.map((item) => item.id);
  const visitPetIds = [...new Set(visitsResult.data.map((item) => item.pet_id))];
  const [completedTxResult, petsResult] = await Promise.all([
    visitIds.length
      ? supabase.from('transactions')
          .select('visit_id')
          .eq('business_id', staff.business_id)
          .eq('status', 'completed')
          .in('visit_id', visitIds)
      : Promise.resolve({ data: [], error: null }),
    visitPetIds.length
      ? supabase.from('pets')
          .select('id,name')
          .eq('business_id', staff.business_id)
          .in('id', visitPetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (completedTxResult.error || petsResult.error || !completedTxResult.data || !petsResult.data) {
    return reply({ error: 'Checkout data could not be loaded.' }, 502);
  }
  const completedVisitIds = new Set(completedTxResult.data.map((item) => item.visit_id));
  const petNames = new Map(petsResult.data.map((item) => [item.id, item.name]));
  const eligibleVisits = visitsResult.data.flatMap((visit) => {
    if (completedVisitIds.has(visit.id)) return [];
    const quotedCents = databaseMoneyToCents(visit.total_amount);
    if (quotedCents === null) return [];
    return [{
      id: visit.id,
      pet_name: petNames.get(visit.pet_id) ?? 'Unknown pet',
      service_package: visit.service_package,
      scheduled_time: visit.scheduled_time,
      quoted_cents: quotedCents,
    }];
  });

  try {
    const daily = utcDailyCheckoutTotals(rows, days, now);
    return reply({
      source: 'supabase_recorded_checkouts',
      settlement_confirmed: false,
      settlement: settlementTotals(rows),
      business_id: staff.business_id,
      as_of: now.toISOString(),
      timezone: 'UTC',
      days,
      recorded_checkout_cents: daily.reduce((sum, day) => sum + day.recorded_checkout_cents, 0),
      checkout_count: daily.reduce((sum, day) => sum + day.checkout_count, 0),
      daily,
      eligible_visits: eligibleVisits,
    }, 200);
  } catch {
    return reply({ error: 'Checkout data failed validation.' }, 502);
  }
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) return reply({ error: 'Production analytics is not configured.' }, 503);

  const tokenMatch = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!tokenMatch) return reply({ error: 'A signed-in staff session is required.' }, 401);

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return reply({ error: 'A JSON checkout body is required.' }, 400);
  }
  const checkout = validateLiveCheckoutInput(rawBody);
  if (!checkout) {
    return reply({ error: 'Valid visit_id, integer-cent amounts, and payment_method are required.' }, 400);
  }

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

  const [{ data: business, error: businessError }, { data: visit, error: visitError }, { data: existingTx, error: txCheckError }] = await Promise.all([
    supabase.from('businesses').select('subscription_status').eq('id', staff.business_id).maybeSingle(),
    supabase.from('visits').select('id,status').eq('business_id', staff.business_id).eq('id', checkout.visit_id).maybeSingle(),
    supabase.from('transactions').select('id').eq('business_id', staff.business_id).eq('visit_id', checkout.visit_id).eq('status', 'completed').maybeSingle(),
  ]);
  if (businessError || visitError || txCheckError) {
    return reply({ error: 'Checkout eligibility could not be checked.' }, 502);
  }
  if (!business || !['active', 'trialing'].includes(business.subscription_status) || !visit || visit.status === 'cancelled') {
    return reply({ error: 'The salon or visit is not eligible for checkout.' }, 422);
  }
  if (existingTx) {
    return reply({ error: 'A completed checkout is already recorded for this visit.' }, 409);
  }

  const { data: createdTx, error: insertError } = await supabase.from('transactions').insert({
    business_id: staff.business_id,
    visit_id: checkout.visit_id,
    subtotal: centsToDatabaseMoney(checkout.subtotal_cents),
    discount: centsToDatabaseMoney(checkout.discount_cents),
    tax: centsToDatabaseMoney(checkout.tax_cents),
    tip: centsToDatabaseMoney(checkout.tip_cents),
    amount: centsToDatabaseMoney(checkout.total_cents),
    payment_method: checkout.payment_method,
    status: 'completed',
  }).select('id,visit_id,amount,status,created_at').single();
  if (insertError?.code === '23505') {
    return reply({ error: 'A completed checkout is already recorded for this visit.' }, 409);
  }
  if (insertError || !createdTx) {
    return reply({ error: 'The checkout record could not be saved.' }, 502);
  }

  const { data: updatedVisit, error: visitUpdateError } = await supabase.from('visits')
    .update({ status: 'completed' })
    .eq('business_id', staff.business_id)
    .eq('id', checkout.visit_id)
    .select('id')
    .maybeSingle();
  if (visitUpdateError || !updatedVisit) {
    return reply({
      error: 'The checkout was recorded, but the visit status could not be updated.',
      transaction: createdTx,
    }, 502);
  }

  return reply({
    transaction: createdTx,
    recorded_checkout_cents: checkout.total_cents,
    settlement_confirmed: false,
  }, 201);
}
