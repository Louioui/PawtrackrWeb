const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const paymentMethods = new Set(['card', 'apple_pay', 'cash', 'split']);

export type LiveEligibleVisit = {
  id: string;
  pet_name: string;
  service_package: string;
  scheduled_time: string;
  quoted_cents: number;
};

export type ValidatedLiveCheckout = {
  visit_id: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  payment_method: 'card' | 'apple_pay' | 'cash' | 'split';
};

export function databaseMoneyToCents(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToDatabaseMoney(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100_000_000) {
    throw new Error('Invalid cent amount');
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function validateLiveCheckoutInput(input: unknown): ValidatedLiveCheckout | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const { visit_id, subtotal_cents, discount_cents, tax_cents, tip_cents, payment_method } = raw;
  if (typeof visit_id !== 'string' || !uuid.test(visit_id) ||
      typeof payment_method !== 'string' || !paymentMethods.has(payment_method)) {
    return null;
  }
  const amounts = [subtotal_cents, discount_cents, tax_cents, tip_cents];
  if (!amounts.every((value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000)) {
    return null;
  }
  const [sub, disc, tax, tip] = amounts;
  if (disc > sub) return null;
  const total = sub - disc + tax + tip;
  if (!Number.isSafeInteger(total) || total < 0 || total > 100_000_000) return null;
  return {
    visit_id,
    subtotal_cents: sub,
    discount_cents: disc,
    tax_cents: tax,
    tip_cents: tip,
    total_cents: total,
    payment_method: payment_method as ValidatedLiveCheckout['payment_method'],
  };
}

export function normalizeEligibleVisits(raw: unknown): LiveEligibleVisit[] {
  if (!Array.isArray(raw) || raw.length > 200) throw new Error('Invalid eligible visits');
  const seen = new Set<string>();
  return raw.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid eligible visit');
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !uuid.test(row.id) || seen.has(row.id) ||
        typeof row.pet_name !== 'string' || !row.pet_name.trim() || row.pet_name.length > 200 ||
        typeof row.service_package !== 'string' || !row.service_package.trim() || row.service_package.length > 200 ||
        typeof row.scheduled_time !== 'string' || !Number.isFinite(Date.parse(row.scheduled_time)) ||
        typeof row.quoted_cents !== 'number' || !Number.isSafeInteger(row.quoted_cents) ||
        row.quoted_cents < 0 || row.quoted_cents > 100_000_000) {
      throw new Error('Invalid eligible visit');
    }
    seen.add(row.id);
    return {
      id: row.id,
      pet_name: row.pet_name,
      service_package: row.service_package,
      scheduled_time: row.scheduled_time,
      quoted_cents: row.quoted_cents,
    };
  });
}

export function utcDailyCheckoutTotals(
  rows: readonly { amount: unknown; created_at: string; status: string }[],
  days: 7 | 30 | 90,
  now: Date
) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return { utc_date: date.toISOString().slice(0, 10), recorded_checkout_cents: 0, checkout_count: 0 };
  });
  const byDate = new Map(daily.map((row) => [row.utc_date, row]));
  for (const row of rows) {
    if (row.status !== 'completed') continue;
    const at = new Date(row.created_at);
    const cents = databaseMoneyToCents(row.amount);
    if (!Number.isFinite(at.getTime()) || at > now || cents === null) throw new Error('Invalid checkout row');
    const day = byDate.get(at.toISOString().slice(0, 10));
    if (!day) continue;
    day.recorded_checkout_cents += cents;
    day.checkout_count += 1;
  }
  return daily;
}
