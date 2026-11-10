// Pure validation for self-serve salon provisioning. The database function
// public.provision_salon (migration 0017) is the authority; this gives the
// form and the API the same early, readable answer.

export type SalonProvisioningDraft = {
  salon_name: string;
  slug: string;
  time_zone: string;
  owner_name: string;
};

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function suggestSalonSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function validateSalonProvisioning(input: unknown):
  { ok: true; draft: SalonProvisioningDraft } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Salon details are required.' };
  const raw = input as Record<string, unknown>;
  const salonName = typeof raw.salon_name === 'string' ? raw.salon_name.trim() : '';
  const ownerName = typeof raw.owner_name === 'string' ? raw.owner_name.trim() : '';
  const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
  if (salonName.length < 2 || salonName.length > 120) return { ok: false, error: 'Enter a salon name between 2 and 120 characters.' };
  if (ownerName.length < 1 || ownerName.length > 120) return { ok: false, error: 'Enter your name.' };
  if (slug.length < 3 || slug.length > 60 || !slugPattern.test(slug)) {
    return { ok: false, error: 'The web address needs 3 to 60 lowercase letters, numbers, or single hyphens.' };
  }
  if (!validTimeZone(raw.time_zone)) return { ok: false, error: 'Choose a valid time zone.' };
  return { ok: true, draft: { salon_name: salonName, slug, time_zone: raw.time_zone, owner_name: ownerName } };
}

// Maps the SQLSTATEs raised by public.provision_salon to an HTTP answer.
export function provisioningFailure(code: string | undefined): { status: number; error: string } {
  switch (code) {
    case 'PW010': return { status: 401, error: 'Sign in again to create your salon.' };
    case 'PW011': return { status: 409, error: 'This account already belongs to a salon.' };
    case 'PW012': return { status: 400, error: 'Check the salon name, web address, your name, and time zone.' };
    case '23505': return { status: 409, error: 'That web address is already taken. Try another.' };
    default: return { status: 502, error: 'The salon could not be created. Nothing was saved.' };
  }
}
