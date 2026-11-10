export type LiveClientPet = {
  id: string;
  client_id: string;
  pet_name: string;
  breed: string;
  weight_lbs: number | null;
  client_name: string;
  client_phone: string;
  client_email: string | null;
};

export type LiveClientRoster = {
  source: 'supabase_clients_pets';
  business_id: string;
  as_of: string;
  client_count: number;
  pet_count: number;
  pets: LiveClientPet[];
};

export type ValidatedClientPetIntake = {
  client_name: string;
  client_phone: string;
  client_email: string | null;
  pet_name: string;
  breed: string;
  weight_lbs: string | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const label = (value: unknown, max = 120): value is string => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;

export function validateClientPetIntake(input: unknown): ValidatedClientPetIntake | null {
  if (!object(input)) return null;
  const { client_name, client_phone, client_email, pet_name, breed, weight_lbs } = input;
  if (!label(client_name) || !label(client_phone, 40) || !label(pet_name) || !label(breed)) {
    return null;
  }
  const phoneDigits = client_phone.replace(/\D/g, '');
  if (phoneDigits.length < 7 || phoneDigits.length > 20) return null;

  let normalizedEmail: string | null = null;
  if (client_email !== undefined && client_email !== null && String(client_email).trim() !== '') {
    if (typeof client_email !== 'string') return null;
    const trimmed = client_email.trim();
    if (trimmed.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
    normalizedEmail = trimmed;
  }

  let normalizedWeight: string | null = null;
  if (weight_lbs !== undefined && weight_lbs !== null && String(weight_lbs).trim() !== '') {
    if (typeof weight_lbs !== 'number' && typeof weight_lbs !== 'string') return null;
    const text = String(weight_lbs).trim();
    const parsed = Number(text);
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(text) || !Number.isFinite(parsed) || parsed <= 0 || parsed > 300) {
      return null;
    }
    normalizedWeight = parsed.toFixed(2);
  }

  return {
    client_name: client_name.trim(),
    client_phone: client_phone.trim(),
    client_email: normalizedEmail,
    pet_name: pet_name.trim(),
    breed: breed.trim(),
    weight_lbs: normalizedWeight,
  };
}

export function normalizeLiveClientRoster(input: unknown): LiveClientRoster {
  if (!object(input) || input.source !== 'supabase_clients_pets' ||
      typeof input.business_id !== 'string' || !uuid.test(input.business_id) ||
      typeof input.as_of !== 'string' || !Number.isFinite(Date.parse(input.as_of)) ||
      typeof input.client_count !== 'number' || !Number.isSafeInteger(input.client_count) || input.client_count < 0 ||
      !Array.isArray(input.pets) || input.pets.length > 500 ||
      input.pet_count !== input.pets.length) {
    throw new Error('Invalid live client roster');
  }
  const seen = new Set<string>();
  const pets: LiveClientPet[] = input.pets.map((raw: unknown) => {
    if (!object(raw) || typeof raw.id !== 'string' || !uuid.test(raw.id) || seen.has(raw.id) ||
        typeof raw.client_id !== 'string' || !uuid.test(raw.client_id) ||
        !label(raw.pet_name) || !label(raw.breed) || !label(raw.client_name) || !label(raw.client_phone, 40) ||
        !(raw.client_email === null || (typeof raw.client_email === 'string' && raw.client_email.length <= 160))) {
      throw new Error('Invalid live pet record');
    }
    let weight: number | null = null;
    if (raw.weight_lbs !== null && raw.weight_lbs !== undefined) {
      const parsed = typeof raw.weight_lbs === 'number' ? raw.weight_lbs : Number(raw.weight_lbs);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 300) throw new Error('Invalid live pet weight');
      weight = parsed;
    }
    seen.add(raw.id);
    return {
      id: raw.id,
      client_id: raw.client_id,
      pet_name: raw.pet_name.trim(),
      breed: raw.breed.trim(),
      weight_lbs: weight,
      client_name: raw.client_name.trim(),
      client_phone: raw.client_phone.trim(),
      client_email: raw.client_email,
    };
  });
  pets.sort((a, b) => a.pet_name.localeCompare(b.pet_name) || a.id.localeCompare(b.id));
  return {
    source: 'supabase_clients_pets',
    business_id: input.business_id,
    as_of: input.as_of,
    client_count: input.client_count,
    pet_count: pets.length,
    pets,
  };
}
