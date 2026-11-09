import { randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { BUSINESSES, BUSINESS_CONFIGS, STAFF_MEMBERS } from '@/lib/mock-tenant-data';
import { requireLocalDemoApi } from '@/lib/demo-boundary';
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

  try {
    const payload: unknown = await req.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Booking details must be an object.' }, { status: 400 });
    }
    const body = payload as Record<string, unknown>;
    const businessId = text(body.business_id, 80);
    const business = BUSINESSES.find((item) => item.id === businessId);
    const ledger = readServerLedger();
    const storedConfig = ledger.configs[businessId];
    const config = storedConfig && Array.isArray(storedConfig.custom_settings?.packages) &&
      Array.isArray(storedConfig.custom_settings?.addons)
      ? storedConfig : BUSINESS_CONFIGS[businessId];
    const packageId = text(body.package_id, 100);
    const servicePackage = config?.custom_settings.packages.find((item) => item.id === packageId);
    const addonIds = body.addon_ids;
    const validAddons = Array.isArray(addonIds) && addonIds.length <= 20 &&
      addonIds.every((id) => typeof id === 'string' && config?.custom_settings.addons.some((addon) => addon.id === id)) &&
      new Set(addonIds).size === addonIds.length;
    const selectedAddons = validAddons
      ? config.custom_settings.addons.filter((addon) => addonIds.includes(addon.id))
      : [];
    const staffId = text(body.staff_id, 100);
    const staff = STAFF_MEMBERS.find((item) => item.id === staffId && item.business_id === businessId && item.role !== 'front_desk');
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

    if (!business || !config || !servicePackage || !validAddons || !staff ||
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
    const clientId = randomUUID();
    const client: Client = {
      id: clientId, business_id: businessId, name: clientName, phone: clientPhone,
      email: clientEmail, address: '', loyalty_points: 0, lifetime_spend: 0, created_at: now,
    };
    const makePet = (name: string, breed: string, weight: number, behaviorTags: BehaviorTag[], behaviorNotes: string): Pet => ({
      id: randomUUID(), business_id: businessId, client_id: clientId, name, species: 'Canine', breed,
      weight_lbs: weight, age_years: 0, coat_type: 'Not recorded', rabies_verified: false,
      behavior_notes: behaviorNotes, behavior_tags: behaviorTags, avatar_url: '',
      weight_history: [], photo_gallery: [],
    });
    const firstPet = makePet(petName, petBreed, body.pet_weight_lbs as number, tags as BehaviorTag[], notes);
    const pets = [firstPet];
    if (secondPetName) pets.push(makePet(secondPetName, secondPetBreed, body.second_pet_weight_lbs as number, [], ''));

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

    writeServerLedger({
      clients: [client, ...ledger.clients], pets: [...pets, ...ledger.pets], visits: [...visits, ...ledger.visits],
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
