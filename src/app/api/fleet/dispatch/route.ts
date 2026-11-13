import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Fleet dispatch');
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const selectedDate = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

  // 1. Fetch active mobile vans for this salon
  const { data: vans, error: vansError } = await auth.ctx.supabase
    .from('salon_stations')
    .select('id, name, station_type, is_active, license_plate, battery_pct, water_tank_pct, gray_water_pct, odometer_miles, current_lat, current_lng, last_telemetry_at')
    .eq('station_type', 'van')
    .order('name', { ascending: true });

  if (vansError) {
    return noStoreJson({ error: vansError.message || 'Failed to fetch mobile vans' }, 502);
  }

  // 2. Fetch scheduled stops/visits for the selected date
  const dayStart = `${selectedDate}T00:00:00.000Z`;
  const dayEnd = `${selectedDate}T23:59:59.999Z`;

  const { data: visits, error: visitsError } = await auth.ctx.supabase
    .from('visits')
    .select(
      'id, scheduled_time, duration_minutes, service_package, total_amount, status, curbside_status, curbside_address, gate_code, drive_minutes_from_prev, miles_from_prev, stop_sequence, client:clients(id, name, phone, email, address), pet:pets(id, name, breed, weight_lbs, behavior_tags), staff:staff_members(id, name), station:salon_stations(id, name, station_type)'
    )
    .gte('scheduled_time', dayStart)
    .lte('scheduled_time', dayEnd)
    .order('stop_sequence', { ascending: true })
    .order('scheduled_time', { ascending: true });

  if (visitsError) {
    return noStoreJson({ error: visitsError.message || 'Failed to fetch curbside visits' }, 502);
  }

  return noStoreJson(
    {
      selectedDate,
      vans: vans || [],
      stops: visits || [],
    },
    200
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Update van telemetry');
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'Malformed JSON payload' }, 400);
  }

  const stationId = typeof body.station_id === 'string' ? body.station_id.trim() : '';
  if (!uuidPattern.test(stationId)) {
    return noStoreJson({ error: 'Valid station_id UUID is required' }, 400);
  }

  const battery = typeof body.battery_pct === 'number' ? Math.round(body.battery_pct) : null;
  const water = typeof body.water_tank_pct === 'number' ? Math.round(body.water_tank_pct) : null;
  const gray = typeof body.gray_water_pct === 'number' ? Math.round(body.gray_water_pct) : null;
  const odometer = typeof body.odometer_miles === 'number' ? body.odometer_miles : null;
  const lat = typeof body.current_lat === 'number' ? body.current_lat : null;
  const lng = typeof body.current_lng === 'number' ? body.current_lng : null;

  const { data, error } = await auth.ctx.supabase.rpc('update_van_telemetry', {
    p_station_id: stationId,
    p_battery: battery,
    p_water: water,
    p_gray: gray,
    p_odometer: odometer,
    p_lat: lat,
    p_lng: lng,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    const status = code === 'PW070' ? 404 : 422;
    return noStoreJson({ error: error.message || 'Failed to update van telemetry' }, status);
  }

  return noStoreJson(data, 200);
}
