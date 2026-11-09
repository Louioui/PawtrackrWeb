import type { ServerLedgerData } from './server-db';

type StorePatch = Partial<Omit<ServerLedgerData, 'updatedAt'>>;
const fields = ['configs', 'clients', 'pets', 'visits', 'transactions'] as const;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const namedEntity = (value: unknown): value is Record<string, unknown> =>
  record(value) && typeof value.id === 'string' && value.id.length > 0 &&
  typeof value.business_id === 'string' && value.business_id.length > 0;

/** Checks the fields the demo views and analytics must be able to read safely. */
export function demoStorePatchError(value: unknown): string | null {
  if (!record(value)) return 'Store update must be an object.';
  const keys = Object.keys(value);
  if (!keys.length || keys.some((key) => !fields.includes(key as typeof fields[number]))) {
    return 'Store update contains no supported fields or an unknown field.';
  }
  if (value.configs !== undefined) {
    if (!record(value.configs)) return 'configs must be an object.';
    for (const [businessId, config] of Object.entries(value.configs)) {
      if (!record(config) || config.business_id !== businessId ||
          typeof config.tax_rate !== 'number' || !Number.isFinite(config.tax_rate) || config.tax_rate < 0 || config.tax_rate > 30 ||
          typeof config.loyalty_points_per_dollar !== 'number' || !Number.isInteger(config.loyalty_points_per_dollar) || config.loyalty_points_per_dollar < 0 || config.loyalty_points_per_dollar > 10 ||
          !record(config.custom_settings)) {
        return 'Each config needs a matching business_id, valid tax and loyalty values, and custom_settings.';
      }
      const settings = config.custom_settings;
      if (typeof settings.tagline !== 'string' || typeof settings.address !== 'string' ||
          (settings.weekly_checkout_target_cents !== undefined &&
            (typeof settings.weekly_checkout_target_cents !== 'number' || !Number.isSafeInteger(settings.weekly_checkout_target_cents) || settings.weekly_checkout_target_cents < 1 || settings.weekly_checkout_target_cents > 100_000_000)) ||
          typeof settings.rating !== 'number' || !Number.isFinite(settings.rating) ||
          !Number.isInteger(settings.reviewCount) || !record(settings.operating_hours) ||
          typeof settings.operating_hours.open !== 'string' || typeof settings.operating_hours.close !== 'string' ||
          !Array.isArray(settings.packages) || settings.packages.length === 0 ||
          !settings.packages.every((item) => record(item) && typeof item.id === 'string' && item.id.length > 0 &&
            typeof item.name === 'string' && item.name.length > 0 && typeof item.description === 'string' &&
            typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0 &&
            typeof item.durationMinutes === 'number' && Number.isInteger(item.durationMinutes) && item.durationMinutes >= 15 && item.durationMinutes <= 480) ||
          !Array.isArray(settings.addons) ||
          !settings.addons.every((item) => record(item) && typeof item.id === 'string' && item.id.length > 0 &&
            typeof item.name === 'string' && item.name.length > 0 && typeof item.price === 'number' &&
            Number.isFinite(item.price) && item.price >= 0)) {
        return 'Each config needs a valid salon profile, package catalog, and add-on catalog.';
      }
    }
  }
  for (const field of ['clients', 'pets', 'visits', 'transactions'] as const) {
    if (value[field] === undefined) continue;
    const items = value[field];
    if (!Array.isArray(items) || items.length > 50_000 || !items.every(namedEntity)) {
      return `${field} must be an array of records with id and business_id.`;
    }
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      return `${field} contains duplicate IDs.`;
    }
  }
  if (Array.isArray(value.clients) && value.clients.some((item) => typeof item.name !== 'string')) {
    return 'Each client needs a name.';
  }
  if (Array.isArray(value.pets) && value.pets.some((item) =>
    typeof item.name !== 'string' || typeof item.client_id !== 'string' ||
    !Array.isArray(item.weight_history) || !Array.isArray(item.photo_gallery) ||
    !Array.isArray(item.behavior_tags))) {
    return 'Each pet needs a client, name, and history arrays.';
  }
  if (Array.isArray(value.visits) && value.visits.some((item) =>
    typeof item.client_id !== 'string' || typeof item.pet_id !== 'string' ||
    typeof item.package_name !== 'string' || !Array.isArray(item.addon_ids))) {
    return 'Each visit needs client, pet, package, and add-on fields.';
  }
  if (Array.isArray(value.transactions) && value.transactions.some((item) =>
    typeof item.visit_id !== 'string' ||
    !['pending', 'completed', 'refunded'].includes(String(item.status)) ||
    typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount < 0 ||
    typeof item.created_at !== 'string' || !Number.isFinite(Date.parse(item.created_at)))) {
    return 'Each transaction needs a valid visit, status, amount, and date.';
  }
  return null;
}

export function asDemoStorePatch(value: unknown): StorePatch {
  const error = demoStorePatchError(value);
  if (error) throw new Error(error);
  return value as StorePatch;
}
