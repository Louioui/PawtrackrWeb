import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { readServerLedger, writeServerLedger } from '@/lib/server-db';
import { Visit } from '@/types/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      business_id,
      client_name,
      client_phone,
      client_email,
      pet_name,
      pet_breed,
      pet_weight_lbs,
      behavior_tags = [],
      behavior_notes = '',
      package_id,
      package_name,
      addon_ids = [],
      total_amount,
      scheduled_time,
      staff_id = 'st-101',
      duration_minutes = 90,
      second_pet_name,
      second_pet_breed,
      second_pet_weight_lbs,
    } = body;

    if (!business_id || !client_name || !pet_name || !package_name || !scheduled_time) {
      return NextResponse.json(
        { error: 'Missing required booking fields or tenant business_id.' },
        { status: 400 }
      );
    }

    const visitId = `vis-${Date.now().toString(36)}`;
    const supabase = getSupabaseClient(business_id);

    if (supabase) {
      // Optional cloud write if Supabase credentials are provided
      await supabase.from('visits').insert({
        business_id,
        service_package: package_name,
        addon_items: addon_ids,
        total_amount,
        scheduled_time,
        status: 'booked',
        booking_source: 'online',
      });
    }

    // Persist directly to Server-Side Multi-Tenant Ledger (`.pawtrackr-data/tenant-ledger.json`)
    const ledger = readServerLedger();
    const persistedVisit: Visit = {
      id: visitId,
      business_id,
      client_id: 'cl-101',
      pet_id: 'pet-101',
      staff_id,
      status: 'booked',
      booking_source: 'online',
      package_id: package_id || 'pkg-doodle-sculpt',
      package_name: second_pet_name
        ? `${package_name} (+ 2nd Dog: ${second_pet_name})`
        : package_name,
      base_price: Number(total_amount) || 125,
      addon_ids,
      total_amount: Number(total_amount) || 125,
      scheduled_time,
      time_label: scheduled_time.split(' ').slice(1).join(' ') || '10:30 AM',
      duration_minutes: Number(duration_minutes) || 90,
      bay_or_van: second_pet_name
        ? 'Multi-Pet Household Suite'
        : 'Online Self-Booked Slot',
      report_card_notes: second_pet_name
        ? `${behavior_notes} [Multi-Pet Household: ${pet_name} & ${second_pet_name} (${second_pet_breed || 'Canine'}, ${second_pet_weight_lbs || 20} lbs)]`
        : behavior_notes,
      weight_logged_lbs: Number(pet_weight_lbs) || 24.6,
      created_at: new Date().toISOString(),
    };
    writeServerLedger({
      visits: [persistedVisit, ...ledger.visits],
    });

    return NextResponse.json({
      ok: true,
      confirmationCode: `PT-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      visit: persistedVisit,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create booking';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
