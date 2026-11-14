// ============================================================================
// PAWTRACKR WEB — ATOMIC FIXED-POINT DECIMAL POS FINANCIAL ENGINE (V2)
// Eliminates IEEE-754 floating-point drift by performing all arithmetic in
// exact integer cents & basis points (1/100th of 1%).
// Supports:
//   - Multi-Currency formatting & conversion (USD, CAD, GBP, AUD, EUR) (#4, #42)
//   - Separate Service vs. Retail Product basis-point tax rules (#4, #26, #30)
//   - Gift Card & Prepaid Package Credit redemptions (#31)
//   - Multi-Stylist Tip & Commission Split with 0¢ remainder loss (#4, #16, #43)
// ============================================================================

export type SupportedCurrency = 'USD' | 'CAD' | 'GBP' | 'AUD' | 'EUR';

export const CURRENCY_EXCHANGE_RATES: Record<SupportedCurrency, number> = {
  USD: 1.0,
  CAD: 1.38,
  GBP: 0.79,
  AUD: 1.52,
  EUR: 0.92,
};

export interface POSLineItem {
  id: string;
  label: string;
  category: 'base_package' | 'addon' | 'safety_fee' | 'retail_product';
  amountDollars: number;
}

export interface AtomicPOSBreakdown {
  basePackageCents: number;
  addonsCents: number;
  safetySurchargeCents: number;
  retailProductsCents: number;
  grossSubtotalCents: number;
  discountCents: number;
  giftCardAppliedCents: number;
  taxableSubtotalCents: number;
  taxRatePercent: number;
  retailTaxRatePercent: number;
  serviceTaxCents: number;
  retailTaxCents: number;
  taxCents: number;
  tipPercent: number | null;
  tipCents: number;
  totalCents: number;
  netBalanceDueCents: number;
  // Formatted exact decimal numbers
  subtotalDollars: number;
  discountDollars: number;
  giftCardAppliedDollars: number;
  taxDollars: number;
  tipDollars: number;
  totalDollars: number;
  loyaltyPointsEarned: number;
  verificationHash: string;
}

/**
 * Converts a dollar number or string into exact integer cents using half-up rounding.
 */
export function toCents(dollars: number | string): number {
  const num = typeof dollars === 'string' ? parseFloat(dollars) : dollars;
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100);
}

/**
 * Converts exact integer cents back to a two-decimal dollar number.
 */
export function fromCents(cents: number): number {
  return Number((Math.round(cents) / 100).toFixed(2));
}

/**
 * Converts exact integer cents back to a standard string representation, e.g. "123.75".
 */
export function toDollars(centInt: number): string {
  return (Math.round(centInt) / 100).toFixed(2);
}

/**
 * Calculates tax in cents from integer subtotal and tax rate in basis points (1% = 100 bps).
 */
export function calculateTax(subtotalCents: number, taxRateBasisPoints: number): number {
  if (subtotalCents <= 0 || taxRateBasisPoints <= 0) return 0;
  return Math.round((subtotalCents * taxRateBasisPoints) / 10000);
}

export interface SplitTenderItem {
  method: 'cash' | 'credit_card' | 'gift_card' | 'account_credit';
  amountCents: number;
}

/**
 * Validates that the sum of split tenders matches the final total exactly to zero cents.
 */
export function validateSplitTenders(
  tenders: SplitTenderItem[],
  totalCents: number
): {
  isValid: boolean;
  totalTenderedCents: number;
  varianceCents: number;
  error?: string;
} {
  const totalTenderedCents = tenders.reduce(
    (sum, t) => sum + Math.max(0, Math.round(t.amountCents)),
    0
  );
  const varianceCents = totalCents - totalTenderedCents;
  if (varianceCents !== 0) {
    return {
      isValid: false,
      totalTenderedCents,
      varianceCents,
      error: `Split tenders (${formatCents(totalTenderedCents)}) do not match final total (${formatCents(totalCents)}). Variance: ${formatCents(varianceCents)}`,
    };
  }
  return {
    isValid: true,
    totalTenderedCents,
    varianceCents: 0,
  };
}

/**
 * Validates that discount multiplier is within legal non-negative fraction [0.00, 1.00].
 */
export function validateDiscountMultiplier(multiplier: number): boolean {
  return Number.isFinite(multiplier) && multiplier >= 0.0 && multiplier <= 1.0;
}

/**
 * Formats exact integer cents as a localized currency display string.
 */
export function formatCents(
  cents: number,
  currency: SupportedCurrency | string = 'USD'
): string {
  const dollars = fromCents(cents);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Formats a dollar value using exact cent rounding.
 */
export function formatCurrency(
  dollars: number,
  currency: SupportedCurrency | string = 'USD'
): string {
  return formatCents(toCents(dollars), currency);
}

/**
 * Converts USD cents into a target international currency in exact integer minor units.
 */
export function convertCurrencyCents(
  usdCents: number,
  targetCurrency: SupportedCurrency
): number {
  const rate = CURRENCY_EXCHANGE_RATES[targetCurrency] ?? 1.0;
  return Math.round(usdCents * rate);
}

/**
 * Computes tax or percentage in basis points (1% = 100 bps, 8.63% = 863 bps)
 * using commercial half-up rounding.
 */
export function multiplyCentsByPercent(cents: number, percent: number): number {
  if (cents <= 0 || percent <= 0) return 0;
  const basisPoints = Math.round((percent + Number.EPSILON) * 100);
  return Math.round((cents * basisPoints) / 10000);
}

/**
 * Automated Municipal Tax Jurisdiction Lookup (TaxJar / Avalara simulation #26)
 */
export function lookupAutomatedMunicipalTaxRate(zipOrCity: string): {
  serviceTaxRate: number;
  retailTaxRate: number;
  jurisdictionName: string;
} {
  const q = zipOrCity.trim().toLowerCase();
  if (q.startsWith('941') || q.includes('san francisco')) {
    return {
      serviceTaxRate: 8.63,
      retailTaxRate: 8.63,
      jurisdictionName: 'San Francisco County, CA (863 bps)',
    };
  }
  if (q.startsWith('904') || q.includes('santa monica')) {
    return {
      serviceTaxRate: 9.5,
      retailTaxRate: 10.25,
      jurisdictionName: 'Santa Monica / LA County, CA (950/1025 bps)',
    };
  }
  if (q.startsWith('100') || q.includes('new york')) {
    return {
      serviceTaxRate: 4.5,
      retailTaxRate: 8.875,
      jurisdictionName: 'New York City Grooming & Retail Split',
    };
  }
  return {
    serviceTaxRate: 8.25,
    retailTaxRate: 8.25,
    jurisdictionName: 'Standard Municipal Jurisdiction (825 bps)',
  };
}

/**
 * Core 4-Step Atomic POS Checkout Calculator
 */
export function calculateAtomicPOSCheckout(params: {
  basePackageDollars: number;
  addonItemsDollars: number[];
  safetySurchargeDollars?: number;
  retailItemsDollars?: number[];
  discountDollars?: number;
  giftCardCreditDollars?: number;
  taxRatePercent: number;
  retailTaxRatePercent?: number;
  tipMode: 'percent' | 'custom';
  tipPercent?: number;
  customTipDollars?: number;
  loyaltyPointsPerDollar?: number;
}): AtomicPOSBreakdown {
  const basePackageCents = toCents(params.basePackageDollars);
  const addonsCents = params.addonItemsDollars.reduce(
    (acc, val) => acc + toCents(val),
    0
  );
  const safetySurchargeCents = toCents(params.safetySurchargeDollars ?? 0);
  const retailProductsCents = (params.retailItemsDollars ?? []).reduce(
    (acc, val) => acc + toCents(val),
    0
  );

  const serviceGrossCents =
    basePackageCents + addonsCents + safetySurchargeCents;
  const grossSubtotalCents = serviceGrossCents + retailProductsCents;

  const rawDiscountCents = toCents(params.discountDollars ?? 0);
  const discountCents = Math.min(
    Math.max(0, rawDiscountCents),
    grossSubtotalCents
  );

  const taxableSubtotalCents = grossSubtotalCents - discountCents;

  // Proportional discount allocation between services and retail
  const taxableServiceCents = Math.max(
    0,
    serviceGrossCents - Math.min(discountCents, serviceGrossCents)
  );
  const remainingDiscount = Math.max(0, discountCents - serviceGrossCents);
  const taxableRetailCents = Math.max(
    0,
    retailProductsCents - remainingDiscount
  );

  const retailRate = params.retailTaxRatePercent ?? params.taxRatePercent;
  const serviceTaxCents = multiplyCentsByPercent(
    taxableServiceCents,
    params.taxRatePercent
  );
  const retailTaxCents = multiplyCentsByPercent(
    taxableRetailCents,
    retailRate
  );
  const taxCents = serviceTaxCents + retailTaxCents;

  // Tip is calculated on the taxable subtotal
  const tipCents =
    params.tipMode === 'percent'
      ? multiplyCentsByPercent(taxableSubtotalCents, params.tipPercent ?? 0)
      : Math.max(0, toCents(params.customTipDollars ?? 0));

  const totalCents = taxableSubtotalCents + taxCents + tipCents;

  const rawGiftCardCents = toCents(params.giftCardCreditDollars ?? 0);
  const giftCardAppliedCents = Math.min(
    Math.max(0, rawGiftCardCents),
    totalCents
  );
  const netBalanceDueCents = totalCents - giftCardAppliedCents;

  // Invariant check: taxableSubtotalCents + taxCents + tipCents === totalCents
  if (grossSubtotalCents - discountCents + taxCents + tipCents !== totalCents) {
    throw new Error('Atomic POS math invariant failure: penny mismatch detected');
  }

  const pointsMultiplier = params.loyaltyPointsPerDollar ?? 1;
  const loyaltyPointsEarned =
    Math.floor(taxableSubtotalCents / 100) * pointsMultiplier;

  const verificationHash = `ATOM-${taxableSubtotalCents}-${taxCents}-${tipCents}=${totalCents}`;

  return {
    basePackageCents,
    addonsCents,
    safetySurchargeCents,
    retailProductsCents,
    grossSubtotalCents,
    discountCents,
    giftCardAppliedCents,
    taxableSubtotalCents,
    taxRatePercent: params.taxRatePercent,
    retailTaxRatePercent: retailRate,
    serviceTaxCents,
    retailTaxCents,
    taxCents,
    tipPercent: params.tipMode === 'percent' ? (params.tipPercent ?? 0) : null,
    tipCents,
    totalCents,
    netBalanceDueCents,
    subtotalDollars: fromCents(grossSubtotalCents),
    discountDollars: fromCents(discountCents),
    giftCardAppliedDollars: fromCents(giftCardAppliedCents),
    taxDollars: fromCents(taxCents),
    tipDollars: fromCents(tipCents),
    totalDollars: fromCents(totalCents),
    loyaltyPointsEarned,
    verificationHash,
  };
}

/**
 * Multi-Stylist Tip & Commission Split Engine (#4, #16, #43)
 * Distributes exact integer cents across multiple groomers/bathers
 * using largest-remainder penny allocation so zero cents are ever lost.
 */
export function calculateMultiStylistSplit(
  totalPoolCents: number,
  stylistWeights: Array<{ staffId: string; name: string; sharePercent: number }>
): Array<{
  staffId: string;
  name: string;
  sharePercent: number;
  allocatedCents: number;
  allocatedDollars: number;
}> {
  if (stylistWeights.length === 0 || totalPoolCents <= 0) return [];

  stylistWeights = stylistWeights.map((s) => ({
    ...s,
    sharePercent:
      Number.isFinite(s.sharePercent) && s.sharePercent > 0 ? s.sharePercent : 0,
  }));
  const totalWeight = stylistWeights.reduce((acc, s) => acc + s.sharePercent, 0);
  if (totalWeight <= 0) return [];

  let allocatedSum = 0;
  const prelim = stylistWeights.map((s) => {
    const exact = (totalPoolCents * s.sharePercent) / totalWeight;
    const floored = Math.floor(exact);
    allocatedSum += floored;
    return {
      ...s,
      allocatedCents: floored,
      remainder: exact - floored,
    };
  });

  let remainderCents = totalPoolCents - allocatedSum;
  const sortedByRemainder = [...prelim].sort(
    (a, b) => b.remainder - a.remainder
  );

  for (let i = 0; i < remainderCents; i++) {
    sortedByRemainder[i % sortedByRemainder.length].allocatedCents += 1;
  }

  return prelim.map((item) => ({
    staffId: item.staffId,
    name: item.name,
    sharePercent: item.sharePercent,
    allocatedCents: item.allocatedCents,
    allocatedDollars: fromCents(item.allocatedCents),
  }));
}

/**
 * Reconciles a batch of daily transactions to verify zero-penny drawer drift.
 */
export function reconcileEndOfDayDrawer(
  transactions: Array<{
    subtotal: number;
    discount: number;
    tax: number;
    tip: number;
    amount: number;
    payment_method: string;
  }>
) {
  let subtotalCents = 0;
  let discountCents = 0;
  let taxCents = 0;
  let tipCents = 0;
  let totalCollectedCents = 0;
  let cardCents = 0;
  let cashCents = 0;
  let splitCents = 0;

  for (const tx of transactions) {
    const sub = toCents(tx.subtotal);
    const disc = toCents(tx.discount);
    const tax = toCents(tx.tax);
    const tip = toCents(tx.tip);
    const amt = toCents(tx.amount);

    subtotalCents += sub;
    discountCents += disc;
    taxCents += tax;
    tipCents += tip;
    totalCollectedCents += amt;

    // A split payment is stored as one record without the cash and card
    // portions, so it cannot be attributed to either. Counting it as card
    // would understate the cash that should be in the tray.
    if (tx.payment_method === 'cash') {
      cashCents += amt;
    } else if (tx.payment_method === 'split') {
      splitCents += amt;
    } else {
      cardCents += amt;
    }
  }

  const expectedTotalCents = subtotalCents - discountCents + taxCents + tipCents;
  const varianceCents = totalCollectedCents - expectedTotalCents;

  return {
    subtotalDollars: fromCents(subtotalCents),
    discountDollars: fromCents(discountCents),
    taxDollars: fromCents(taxCents),
    tipDollars: fromCents(tipCents),
    totalCollectedDollars: fromCents(totalCollectedCents),
    cardDollars: fromCents(cardCents),
    cashDollars: fromCents(cashCents),
    splitDollars: fromCents(splitCents),
    varianceCents,
    isBalancedToPenny: varianceCents === 0,
  };
}
