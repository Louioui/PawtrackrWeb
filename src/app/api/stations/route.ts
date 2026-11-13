import { NextRequest } from 'next/server';
import { appendWorkflowEvent, noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedStationTypes = new Set(['grooming_table', 'bathing_tub', 'drying_station', 'van_bay', 'holding_suite']);

export async function GET(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Salon stations');
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.ctx.supabase
    .from('salon_stations')
    .select('id, name, station_type, is_active, notes, created_at, updated_at')
    .eq('business_id', auth.ctx.membership.business_id)
    .order('name', { ascending: true })
    .limit(101);

  if (error || !data) {
    return noStoreJson({ error: 'Stations could not be loaded.' }, 502);
  }

  return noStoreJson(
    {
      source: 'supabase_salon_stations',
      business_id: auth.ctx.membership.business_id,
      as_of: new Date().toISOString(),
      stations: data,
    },
    200,
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Salon stations', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const stationType = typeof body.station_type === 'string' ? body.station_type.trim() : '';
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : true;
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 300) : null;

  if (name.length < 1 || name.length > 120) {
    return noStoreJson({ error: 'Station name must be between 1 and 120 characters.' }, 400);
  }
  if (!allowedStationTypes.has(stationType)) {
    return noStoreJson(
      { error: 'station_type must be grooming_table, bathing_tub, drying_station, van_bay, or holding_suite.' },
      400,
    );
  }

  const { data: station, error: insertError } = await auth.ctx.supabase
    .from('salon_stations')
    .insert({
      business_id: auth.ctx.membership.business_id,
      name,
      station_type: stationType,
      is_active: isActive,
      notes,
    })
    .select('id, name, station_type, is_active, notes, created_at, updated_at')
    .single();

  if (insertError || !station) {
    return noStoreJson({ error: 'Station could not be saved.' }, 502);
  }

  await appendWorkflowEvent(auth.ctx, {
    workflow_id: 'WF01',
    event_type: 'station_created',
    source_record_type: 'salon_stations',
    source_record_id: station.id,
    new_state: station.station_type,
    metadata: { name: station.name, is_active: station.is_active },
  });

  return noStoreJson({ station }, 201);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Salon stations', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!uuidPattern.test(id)) {
    return noStoreJson({ error: 'A valid station id is required.' }, 400);
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 120) {
      return noStoreJson({ error: 'Station name must be between 1 and 120 characters.' }, 400);
    }
    updates.name = name;
  }
  if (body.station_type !== undefined) {
    const stationType = typeof body.station_type === 'string' ? body.station_type.trim() : '';
    if (!allowedStationTypes.has(stationType)) {
      return noStoreJson(
        { error: 'station_type must be grooming_table, bathing_tub, drying_station, van_bay, or holding_suite.' },
        400,
      );
    }
    updates.station_type = stationType;
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      return noStoreJson({ error: 'is_active must be a boolean.' }, 400);
    }
    updates.is_active = body.is_active;
  }
  if (body.notes !== undefined) {
    updates.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 300) : null;
  }

  if (Object.keys(updates).length === 0) {
    return noStoreJson({ error: 'At least one field to update is required.' }, 400);
  }

  const { data: station, error: updateError } = await auth.ctx.supabase
    .from('salon_stations')
    .update(updates)
    .eq('business_id', auth.ctx.membership.business_id)
    .eq('id', id)
    .select('id, name, station_type, is_active, notes, created_at, updated_at')
    .maybeSingle();

  if (updateError) {
    return noStoreJson({ error: 'Station could not be updated.' }, 502);
  }
  if (!station) {
    return noStoreJson({ error: 'Station not found.' }, 404);
  }

  await appendWorkflowEvent(auth.ctx, {
    workflow_id: 'WF01',
    event_type: 'station_updated',
    source_record_type: 'salon_stations',
    source_record_id: station.id,
    new_state: station.station_type,
    metadata: { updates },
  });

  return noStoreJson({ station }, 200);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Salon stations', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!uuidPattern.test(id)) {
    return noStoreJson({ error: 'A valid station id is required.' }, 400);
  }

  // Soft deactivate first or try deleting
  const { data: deleted, error: deleteError } = await auth.ctx.supabase
    .from('salon_stations')
    .delete()
    .eq('business_id', auth.ctx.membership.business_id)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (deleteError) {
    // If foreign key constraint prevents deletion, deactivate instead
    const { data: deactivated, error: deactError } = await auth.ctx.supabase
      .from('salon_stations')
      .update({ is_active: false })
      .eq('business_id', auth.ctx.membership.business_id)
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (deactError || !deactivated) {
      return noStoreJson({ error: 'Station could not be deleted or deactivated.' }, 502);
    }

    await appendWorkflowEvent(auth.ctx, {
      workflow_id: 'WF01',
      event_type: 'station_deactivated',
      source_record_type: 'salon_stations',
      source_record_id: id,
      reason: 'Station has associated visits/shifts; deactivated rather than deleted.',
    });

    return noStoreJson({ deactivated_id: id }, 200);
  }

  if (!deleted) {
    return noStoreJson({ error: 'Station not found.' }, 404);
  }

  await appendWorkflowEvent(auth.ctx, {
    workflow_id: 'WF01',
    event_type: 'station_deleted',
    source_record_type: 'salon_stations',
    source_record_id: id,
  });

  return noStoreJson({ deleted_id: id }, 200);
}
