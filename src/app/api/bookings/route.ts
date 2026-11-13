import { randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { BUSINESSES, BUSINESS_CONFIGS, STAFF_MEMBERS } from '@/lib/mock-tenant-data';
import { requireLocalDemoApi } from '@/lib/demo-boundary';
import { containsMarkup } from '@/lib/input-safety';
import { readServerLedger, writeServerLedger } from '@/lib/server-db';
import { fromCents, toCents } from '@/lib/pos-math';
import { addMinutesToLabeledSlot, isStaffSlotAvailable } from '@/lib/booking-availability';
import type { BehaviorTag, Client, Pet, Visit } from '@/types/database';

const SLOTS = new Set(['09:00 AM', '10:30 AM', '12:00 PM', '01:30 PM', '03:00 PM', '04:30 PM']);
const TAGS = new Set<BehaviorTag>(['biter', 'matted', 'senior', 'extra_care', 'anxious', 'heart_murmur', 'cage_reactive']);
const text = (value: unknown, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const validWeight = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 300;

export async function POST(req: NextRequest) {
  const blocked = requireLocalDemoApi();
  if (blocked) return blocked;

  // A body that is not JSON is the caller's mistake, not a server failure.
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Booking details must be valid JSON.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Booking details must be an object.' }, { status: 400 });
    }
    const body = payload as Record<string, unknown>;
    const businessId = text(body.business_id, 80);
    const ledger = readServerLedger();
    const storedConfig = ledger.configs[businessId];
    const business =
      BUSINESSES.find((item) => item.id === businessId) ??
      storedConfig?.custom_settings?.business_profile;
    const config = storedConfig && Array.isArray(storedConfig.custom_settings?.packages) &&
      Array.isArray(storedConfig.custom_settings?.addons)
      ? storedConfig : BUSINESS_CONFIGS[businessId];
    const packageId = text(body.package_id, 100);
    const servicePackage = config?.custom_settings.packages.find((item) => item.id === packageId);
    const addonIds = body.addon_ids;
    const validAddons = Array.isArray(addonIds) && addonIds.length <= 20 &&
      addonIds.every((id) => typeof id === 'string' && config?.custom_settings.addons.some((addon) => addon.id === id)) &&
      new Set(addonIds).size === addonIds.length;
    // config is undefined for an unknown salon; an empty add-on list would
    // otherwise pass validation and dereference it.
    const selectedAddons = validAddons && config
      ? config.custom_settings.addons.filter((addon) => addonIds.includes(addon.id))
      : [];
    const staffId = text(body.staff_id, 100);
    const staffPool = Array.isArray(storedConfig?.custom_settings?.staff_roster) &&
      storedConfig.custom_settings.staff_roster.length > 0
      ? storedConfig.custom_settings.staff_roster
      : STAFF_MEMBERS;
    const staff = staffPool.find((item) => item.id === staffId && item.business_id === businessId && item.role !== 'front_desk');
    const clientName = text(body.client_name);
    const clientPhone = text(body.client_phone, 40);
    const clientEmail = text(body.client_email, 200);
    const petName = text(body.pet_name);
    const petBreed = text(body.pet_breed);
    const notes = text(body.behavior_notes, 1000);
    const tags = body.behavior_tags;
    const validTags = Array.isArray(tags) && tags.length <= TAGS.size && tags.every((tag) => TAGS.has(tag));
    const secondPetName = text(body.second_pet_name);
    const secondPetBreed = text(body.second_pet_breed);
    const secondPackageId = text(body.second_package_id, 100);
    const secondPackage = secondPetName
      ? config?.custom_settings.packages.find((item) => item.id === secondPackageId)
      : null;
    const scheduledTime = text(body.scheduled_time, 40);
    const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2} [AP]M)$/.exec(scheduledTime);
    const validDate = Boolean(match && !Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`)) &&
      new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) === match[1] &&
      match[1] >= new Date().toISOString().slice(0, 10));

    // The salon itself is unknown to this service: its setup has not synced.
    // Distinct from bad booking details, so the page can say what went wrong.
    const markupInName = [clientName, petName, secondPetName].some((value) => containsMarkup(value));
    if (markupInName) {
      return NextResponse.json({ error: 'Names cannot contain < or > characters.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    if (!business || !config) {
      return NextResponse.json({ error: 'This salon is not ready for online booking yet.', code: 'salon_setup_pending' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }

    if (!servicePackage || !validAddons || !staff ||
        !clientName || !clientPhone || !clientEmail || !petName || !petBreed ||
        clientPhone.replace(/\D/g, '').length < 7 ||
        !validWeight(body.pet_weight_lbs) || !validTags || !validDate || !SLOTS.has(match![2]) ||
        (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) ||
        (secondPetName && (!secondPetBreed || !validWeight(body.second_pet_weight_lbs) || !secondPackage)) ||
        (!secondPetName && (secondPetBreed || secondPackageId))) {
      return NextResponse.json({ error: 'Check the salon, service, staff, date, and pet details before booking.' }, { status: 400 });
    }

    const requestedDuration = servicePackage.durationMinutes + (secondPackage?.durationMinutes ?? 0);
    if (!isStaffSlotAvailable(ledger.visits, businessId, staffId, scheduledTime, requestedDuration)) {
      return NextResponse.json({ error: 'This groomer already has a visit during that time. Choose another slot or groomer.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }

    const now = new Date().toISOString();
    const requestedClientId = text(body.client_id, 80);
    const existingClient = requestedClientId
      ? ledger.clients.find((c) => c.id === requestedClientId && c.business_id === businessId)
      : undefined;
    const clientId = existingClient?.id ?? randomUUID();
    const client: Client = {
      id: clientId,
      business_id: businessId,
      name: clientName,
      phone: clientPhone,
      email: clientEmail,
      address: existingClient?.address ?? business.city_state,
      loyalty_points: existingClient?.loyalty_points ?? 0,
      lifetime_spend: existingClient?.lifetime_spend ?? 0,
      created_at: existingClient?.created_at ?? now,
    };
    const requestedPetId = text(body.pet_id, 80);
    const existingPet = requestedPetId
      ? ledger.pets.find((p) => p.id === requestedPetId && p.client_id === clientId && p.business_id === businessId)
      : undefined;
    const bookingDateStr = match![1];
    const makePet = (
      name: string,
      breed: string,
      weight: number,
      behaviorTags: BehaviorTag[],
      behaviorNotes: string,
      existing?: Pet
    ): Pet => ({
      id: existing?.id ?? randomUUID(),
      business_id: businessId,
      client_id: clientId,
      name,
      species: existing?.species ?? 'Canine',
      breed,
      weight_lbs: weight,
      age_years: existing?.age_years ?? 2,
      coat_type: existing?.coat_type ?? 'Combination Coat',
      rabies_verified: existing?.rabies_verified ?? true,
      behavior_notes: behaviorNotes,
      behavior_tags: behaviorTags,
      avatar_url:
        existing?.avatar_url ||
        'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=600&q=80',
      weight_history: existing?.weight_history?.length
        ? existing.weight_history
        : [{ date: bookingDateStr, weight_lbs: weight }],
      photo_gallery: existing?.photo_gallery ?? [],
    });
    const firstPet = makePet(
      petName,
      petBreed,
      body.pet_weight_lbs as number,
      tags as BehaviorTag[],
      notes,
      existingPet
    );
    const pets = [firstPet];
    if (secondPetName) {
      pets.push(
        makePet(
          secondPetName,
          secondPetBreed,
          body.second_pet_weight_lbs as number,
          [],
          ''
        )
      );
    }

    const firstPriceCents = toCents(servicePackage.price) + selectedAddons.reduce((sum, addon) => sum + toCents(addon.price), 0) -
      (body.join_vip_club === true ? Math.round(toCents(servicePackage.price) * 0.15) : 0);
    const secondPriceCents = secondPackage ? Math.max(0, toCents(secondPackage.price) - 1000) : 0;
    const makeVisit = (pet: Pet, pkg: typeof servicePackage, amountCents: number, selectedAddonIds: string[], visitTime: string): Visit => ({
      id: randomUUID(), business_id: businessId, client_id: clientId, pet_id: pet.id, staff_id: staffId,
      status: 'booked', booking_source: 'online', package_id: pkg.id, package_name: pkg.name,
      base_price: pkg.price, addon_ids: selectedAddonIds, total_amount: fromCents(amountCents),
      scheduled_time: visitTime, time_label: visitTime.slice(11), duration_minutes: pkg.durationMinutes,
      bay_or_van: secondPetName ? 'Multi-Pet Household Suite' : 'Online Self-Booked Slot',
      report_card_notes: pet.behavior_notes, weight_logged_lbs: pet.weight_lbs, created_at: now,
    });
    const visits = [makeVisit(firstPet, servicePackage, firstPriceCents, addonIds as string[], scheduledTime)];
    if (secondPackage) {
      const secondStart = addMinutesToLabeledSlot(scheduledTime, servicePackage.durationMinutes);
      if (!secondStart) return NextResponse.json({ error: 'Booking time could not be scheduled.' }, { status: 400 });
      visits.push(makeVisit(pets[1], secondPackage, secondPriceCents, [], secondStart));
    }
    const totalDollars = fromCents(firstPriceCents + secondPriceCents);

    const newPetIds = new Set(pets.map((p) => p.id));
    writeServerLedger({
      clients: [client, ...ledger.clients.filter((c) => c.id !== client.id)],
      pets: [...pets, ...ledger.pets.filter((p) => !newPetIds.has(p.id))],
      visits: [...visits, ...ledger.visits],
    });

    return NextResponse.json({
      ok: true,
      confirmationCode: `PT-${randomBytes(4).toString('hex').toUpperCase()}`,
      client, pets, visits, totalDollars,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create demo booking';
    return NextResponse.json({ error: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
