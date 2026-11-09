export function databaseMoneyToCents(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
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
