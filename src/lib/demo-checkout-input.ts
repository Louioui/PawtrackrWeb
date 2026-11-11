// Input rules for the demo checkout route. The arithmetic in pos-math.ts is
// exact, but it will faithfully compute a total from nonsense: Number('abc')
// is NaN, a negative price turns into a negative discount, and 1e15 dollars no
// longer fits in whole cents. Refuse those before any money is calculated.

const MAX_LINE_DOLLARS = 100_000;
const PAYMENT_METHODS = new Set(['card', 'apple_pay', 'cash', 'split']);
const TIP_MODES = new Set(['percent', 'custom']);
const MAX_TAX_RATE_PERCENT = 30;

// Only a missing field takes its default. The route's destructuring defaults
// apply to undefined but not null, so an explicit null must be refused here or
// it would reach the calculation and the stored record as null.
const orDefault = (value: unknown, fallback: unknown): unknown => value === undefined ? fallback : value;

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
  const addons = orDefault(input.addon_items_dollars, []);
  if (!Array.isArray(addons) || addons.length > 30 || addons.some((item) => amount(item, MAX_LINE_DOLLARS) === null)) {
    return 'Add-on prices must be a list of up to 30 amounts between $0 and $100,000.';
  }
  if (amount(orDefault(input.safety_surcharge_dollars, 0), MAX_LINE_DOLLARS) === null) return 'The safety surcharge must be between $0 and $100,000.';
  if (amount(orDefault(input.discount_dollars, 0), MAX_LINE_DOLLARS) === null) return 'The discount must be between $0 and $100,000.';
  // 30% matches the ceiling salon settings accept (demo-store-validation.ts),
  // so a rate a salon was allowed to save can always be checked out.
  if (amount(orDefault(input.tax_rate_percent, 0), MAX_TAX_RATE_PERCENT) === null) return 'The tax rate must be between 0% and 30%.';
  const tipMode = orDefault(input.tip_mode, 'percent');
  if (typeof tipMode !== 'string' || !TIP_MODES.has(tipMode)) return 'The tip must be a percentage or a custom amount.';
  if (amount(orDefault(input.tip_percent, 0), 100) === null) return 'The tip percentage must be between 0% and 100%.';
  if (amount(orDefault(input.custom_tip_dollars, 0), MAX_LINE_DOLLARS) === null) return 'The custom tip must be between $0 and $100,000.';
  const method = orDefault(input.payment_method, 'card');
  if (typeof method !== 'string' || !PAYMENT_METHODS.has(method)) return 'Choose card, Apple Pay, cash, or split payment.';
  if (amount(orDefault(input.loyalty_points_per_dollar, 0), 100) === null) return 'Loyalty points per dollar must be between 0 and 100.';
  return null;
}
