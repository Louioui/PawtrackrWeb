// Input rules for the demo checkout route. The arithmetic in pos-math.ts is
// exact, but it will faithfully compute a total from nonsense: Number('abc')
// is NaN, a negative price turns into a negative discount, and 1e15 dollars no
// longer fits in whole cents. Refuse those before any money is calculated.

const MAX_LINE_DOLLARS = 100_000;
const PAYMENT_METHODS = new Set(['card', 'apple_pay', 'cash', 'split']);
const TIP_MODES = new Set(['percent', 'custom']);

// A plain number, or a numeric string as an HTML input would send it.
const amount = (value: unknown, max: number): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
};

// Returns a message describing the first problem, or null when the input is usable.
export function demoCheckoutInputError(input: Record<string, unknown>): string | null {
  if (amount(input.base_package_dollars, MAX_LINE_DOLLARS) === null) return 'The service price must be between $0 and $100,000.';
  const addons = input.addon_items_dollars ?? [];
  if (!Array.isArray(addons) || addons.length > 30 || addons.some((item) => amount(item, MAX_LINE_DOLLARS) === null)) {
    return 'Add-on prices must be a list of up to 30 amounts between $0 and $100,000.';
  }
  if (amount(input.safety_surcharge_dollars ?? 0, MAX_LINE_DOLLARS) === null) return 'The safety surcharge must be between $0 and $100,000.';
  if (amount(input.discount_dollars ?? 0, MAX_LINE_DOLLARS) === null) return 'The discount must be between $0 and $100,000.';
  if (amount(input.tax_rate_percent ?? 0, 25) === null) return 'The tax rate must be between 0% and 25%.';
  const tipMode = input.tip_mode ?? 'percent';
  if (typeof tipMode !== 'string' || !TIP_MODES.has(tipMode)) return 'The tip must be a percentage or a custom amount.';
  if (amount(input.tip_percent ?? 0, 100) === null) return 'The tip percentage must be between 0% and 100%.';
  if (amount(input.custom_tip_dollars ?? 0, MAX_LINE_DOLLARS) === null) return 'The custom tip must be between $0 and $100,000.';
  const method = input.payment_method ?? 'card';
  if (typeof method !== 'string' || !PAYMENT_METHODS.has(method)) return 'Choose card, Apple Pay, cash, or split payment.';
  if (amount(input.loyalty_points_per_dollar ?? 0, 100) === null) return 'Loyalty points per dollar must be between 0 and 100.';
  return null;
}
