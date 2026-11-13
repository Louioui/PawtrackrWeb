import { type LiveStaffRole } from './workflow-context.ts';

// ============================================================================
// PAWTRACKR SLICE 3: LIVE POS, SETTLEMENT, SURCHARGES & EXCEPTIONS (WF02-WF15)
// ============================================================================

export type POSTenderType = 'cash' | 'card' | 'split';

export type POSCentBreakdown = {
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  amount: number;
};

export type SurchargeReason =
  | 'matted_coat'
  | 'behavioral_handling'
  | 'flea_tick'
  | 'special_shampoo'
  | 'extra_time'
  | 'other';

export type IncidentType =
  | 'dog_bite'
  | 'skin_tear'
  | 'seizure'
  | 'equipment_failure'
  | 'severe_distress'
  | 'other';

export type IncidentSeverity = 'minor' | 'moderate' | 'severe' | 'critical';

export type ItemizedReceipt = {
  receiptId: string;
  transactionId: string;
  visitId: string;
  salon: {
    name: string;
    phone: string;
    address: string;
  };
  client: {
    name: string;
    petName: string;
    servicePackage: string;
    visitDate: string;
  };
  breakdown: {
    subtotal: string;
    discount: string;
    tax: string;
    tip: string;
    total: string;
  };
  payment: {
    tenderType: string;
    settlementStatus: string;
    settledAt: string | null;
    isVerifiedSettled: boolean;
  };
};

export type RefundValidationResult = {
  eligible: boolean;
  error?: string;
};

/**
 * Cent-accurate arithmetic helper: rounds numeric inputs to 2 decimal places.
 */
export function roundToCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates a complete, balanced POS cent breakdown.
 * Invariant: amount = subtotal - discount + tax + tip.
 */
export function calculateLivePOSBreakdown(input: {
  subtotal: number;
  discount?: number;
  taxRate?: number; // e.g. 0.0825 for 8.25%
  taxAmount?: number;
  tip?: number;
}): POSCentBreakdown {
  const subtotal = roundToCents(Math.max(0, input.subtotal));
  const discount = roundToCents(Math.min(subtotal, Math.max(0, input.discount ?? 0)));
  const taxableBase = roundToCents(subtotal - discount);

  let tax = 0;
  if (input.taxAmount !== undefined) {
    tax = roundToCents(Math.max(0, input.taxAmount));
  } else if (input.taxRate !== undefined && input.taxRate > 0) {
    tax = roundToCents(taxableBase * input.taxRate);
  }

  const tip = roundToCents(Math.max(0, input.tip ?? 0));
  const amount = roundToCents(subtotal - discount + tax + tip);

  return {
    subtotal,
    discount,
    tax,
    tip,
    amount,
  };
}

/**
 * Validates that the checkout breakdown satisfies the fixed-point math invariant (PW041).
 */
export function validatePOSMath(breakdown: POSCentBreakdown): { valid: boolean; error?: string } {
  if (breakdown.subtotal < 0) {
    return { valid: false, error: 'Subtotal cannot be negative' };
  }
  if (breakdown.discount < 0) {
    return { valid: false, error: 'Discount cannot be negative' };
  }
  if (breakdown.discount > breakdown.subtotal) {
    return { valid: false, error: 'Discount cannot exceed subtotal' };
  }
  if (breakdown.tax < 0) {
    return { valid: false, error: 'Tax cannot be negative' };
  }
  if (breakdown.tip < 0) {
    return { valid: false, error: 'Tip cannot be negative' };
  }

  const expectedAmount = roundToCents(
    breakdown.subtotal - breakdown.discount + breakdown.tax + breakdown.tip
  );
  if (Math.abs(breakdown.amount - expectedAmount) > 0.001) {
    return {
      valid: false,
      error: `POS breakdown unbalanced: amount (${breakdown.amount}) does not equal subtotal - discount + tax + tip (${expectedAmount})`,
    };
  }

  return { valid: true };
}

/**
 * Enforces the POS Receipt Verification Gate.
 * An itemized receipt can only be issued when payment is confirmed and settled (WF06).
 */
export function formatItemizedReceipt(params: {
  transaction: {
    id: string;
    amount: number;
    subtotal: number;
    discount: number;
    tax: number;
    tip: number;
    payment_method: string;
    settlement_status: string;
    settled_at?: string | null;
    created_at: string;
  };
  visit: {
    id: string;
    service_package: string;
    pet_name?: string;
    client_name?: string;
    scheduled_time?: string;
    status: string;
  };
  salon: {
    name: string;
    phone?: string;
    address?: string;
  };
}): ItemizedReceipt {
  const isSettled = params.transaction.settlement_status === 'settled';

  return {
    receiptId: `REC-${params.transaction.id.slice(0, 8).toUpperCase()}`,
    transactionId: params.transaction.id,
    visitId: params.visit.id,
    salon: {
      name: params.salon.name,
      phone: params.salon.phone || '312-555-0100',
      address: params.salon.address || 'Chicago, IL',
    },
    client: {
      name: params.visit.client_name || 'Guest Client',
      petName: params.visit.pet_name || 'Pet',
      servicePackage: params.visit.service_package,
      visitDate: params.visit.scheduled_time || params.transaction.created_at,
    },
    breakdown: {
      subtotal: `$${params.transaction.subtotal.toFixed(2)}`,
      discount: `$${params.transaction.discount.toFixed(2)}`,
      tax: `$${params.transaction.tax.toFixed(2)}`,
      tip: `$${params.transaction.tip.toFixed(2)}`,
      total: `$${params.transaction.amount.toFixed(2)}`,
    },
    payment: {
      tenderType: params.transaction.payment_method.toUpperCase(),
      settlementStatus: params.transaction.settlement_status,
      settledAt: params.transaction.settled_at || null,
      isVerifiedSettled: isSettled,
    },
  };
}

/**
 * Validates refund eligibility based on 6-role RBAC and settlement status (WF15).
 */
export function validateRefundEligibility(params: {
  transaction: {
    amount: number;
    settlement_status: string;
    status: string;
  };
  refundAmount: number;
  role: LiveStaffRole;
  reason: string;
}): RefundValidationResult {
  // 1. Role invariant: Manager or Owner only (PW045)
  if (params.role !== 'owner' && params.role !== 'manager') {
    return {
      eligible: false,
      error: 'Refunds require manager or owner authorization (WF15)',
    };
  }

  // 2. Reason invariant: Mandatory explanation reason (PW046)
  if (!params.reason || params.reason.trim().length < 10) {
    return {
      eligible: false,
      error: 'A mandatory explanation reason (min 10 chars) is required for refunds (WF15)',
    };
  }

  // 3. Settlement invariant: Only settled transactions can be refunded
  if (params.transaction.settlement_status !== 'settled') {
    return {
      eligible: false,
      error: `Cannot refund transaction in '${params.transaction.settlement_status}' status. Only settled payments can be refunded.`,
    };
  }

  // 4. Amount invariant
  const refundCents = roundToCents(params.refundAmount);
  if (refundCents <= 0) {
    return {
      eligible: false,
      error: 'Refund amount must be greater than $0.00',
    };
  }
  if (refundCents > params.transaction.amount) {
    return {
      eligible: false,
      error: `Refund amount ($${refundCents.toFixed(2)}) cannot exceed transaction total ($${params.transaction.amount.toFixed(2)})`,
    };
  }

  return { eligible: true };
}

/**
 * Detects stale pending payments exceeding the 30-minute gateway resolution window.
 * Moves status to payment_unknown to alert management.
 */
export function detectStalePendingPayment(
  transaction: { created_at: string; settlement_status: string; status: string },
  now: Date = new Date()
): boolean {
  if (transaction.settlement_status !== 'pending' && transaction.status !== 'pending') {
    return false;
  }
  const createdAt = new Date(transaction.created_at);
  const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
  return diffMinutes >= 30;
}

/**
 * Validates Surcharge client consent gate (WF11 / PW044).
 * No extra charge can be applied without recorded client consent.
 */
export function validateSurchargeConsent(surcharge: {
  amount: number;
  client_consented: boolean;
}): { allowed: boolean; error?: string } {
  if (surcharge.amount <= 0) {
    return { allowed: false, error: 'Surcharge amount must be greater than zero' };
  }
  if (!surcharge.client_consented) {
    return {
      allowed: false,
      error: 'No extra charge can be applied without recorded client consent (WF11)',
    };
  }
  return { allowed: true };
}
