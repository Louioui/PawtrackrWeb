// ============================================================================
// PAWTRACKR WEB — BLUETOOTH / USB HID BARCODE SCANNER WEDGE ENGINE
// Distinguishes hardware laser/2D scanner bursts (<45ms inter-key cadence
// terminated by Enter) from manual human keyboard input.
// ============================================================================

export const MAX_HID_INTER_KEY_MS = 45;
export const MAX_HID_TOTAL_BURST_MS = 600;
export const MIN_BARCODE_LENGTH = 6;
export const MAX_BARCODE_LENGTH = 32;

export type BarcodeSymbology = 'UPC-A' | 'EAN-13' | 'EAN-8' | 'CODE-128';

export interface ValidatedBarcode {
  valid: boolean;
  normalized: string;
  symbology: BarcodeSymbology | null;
  error?: string;
}

/**
 * Computes standard GS1 modulo-10 check digit for 8, 12, or 13 digit GTINs.
 */
export function verifyGs1CheckDigit(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 8) return false;
  const body = digits.slice(0, -1);
  const expectedCheck = Number(digits[digits.length - 1]);
  let sum = 0;

  // From right to left of the data digits (excluding check digit), weights alternate 3, 1, 3, 1...
  for (let i = body.length - 1, pos = 0; i >= 0; i--, pos++) {
    const weight = pos % 2 === 0 ? 3 : 1;
    sum += Number(body[i]) * weight;
  }

  const computedCheck = (10 - (sum % 10)) % 10;
  return computedCheck === expectedCheck;
}

/**
 * Validates and classifies UPC-A, EAN-13, EAN-8, or salon SKU Code-128 barcodes.
 */
export function validateRetailBarcode(raw: string): ValidatedBarcode {
  const cleaned = String(raw ?? '').trim();
  if (cleaned.length < MIN_BARCODE_LENGTH || cleaned.length > MAX_BARCODE_LENGTH) {
    return {
      valid: false,
      normalized: cleaned,
      symbology: null,
      error: `Barcode must be between ${MIN_BARCODE_LENGTH} and ${MAX_BARCODE_LENGTH} characters.`,
    };
  }

  if (!/^[A-Za-z0-9._-]+$/.test(cleaned)) {
    return {
      valid: false,
      normalized: cleaned,
      symbology: null,
      error: 'Barcode contains unsupported non-ASCII or control characters.',
    };
  }

  if (/^\d{12}$/.test(cleaned)) {
    if (!verifyGs1CheckDigit(cleaned)) {
      return {
        valid: false,
        normalized: cleaned,
        symbology: 'UPC-A',
        error: 'Invalid UPC-A check digit.',
      };
    }
    return { valid: true, normalized: cleaned, symbology: 'UPC-A' };
  }

  if (/^\d{13}$/.test(cleaned)) {
    if (!verifyGs1CheckDigit(cleaned)) {
      return {
        valid: false,
        normalized: cleaned,
        symbology: 'EAN-13',
        error: 'Invalid EAN-13 check digit.',
      };
    }
    return { valid: true, normalized: cleaned, symbology: 'EAN-13' };
  }

  if (/^\d{8}$/.test(cleaned)) {
    if (!verifyGs1CheckDigit(cleaned)) {
      return {
        valid: false,
        normalized: cleaned,
        symbology: 'EAN-8',
        error: 'Invalid EAN-8 check digit.',
      };
    }
    return { valid: true, normalized: cleaned, symbology: 'EAN-8' };
  }

  return {
    valid: true,
    normalized: cleaned.toUpperCase(),
    symbology: 'CODE-128',
  };
}

export interface BarcodeKeystrokeCollector {
  feedKey(key: string, timestampMs: number): ValidatedBarcode | null;
  reset(): void;
}

/**
 * Stateful HID keystroke burst detector. Collects rapid printable characters
 * emitted within `MAX_HID_INTER_KEY_MS` and emits a `ValidatedBarcode` on `Enter`.
 */
export function createBarcodeKeystrokeCollector(options?: {
  maxInterKeyMs?: number;
  maxBurstMs?: number;
  onScan?: (result: ValidatedBarcode) => void;
}): BarcodeKeystrokeCollector {
  const maxInterKeyMs = options?.maxInterKeyMs ?? MAX_HID_INTER_KEY_MS;
  const maxBurstMs = options?.maxBurstMs ?? MAX_HID_TOTAL_BURST_MS;

  let buffer = '';
  let startTimeMs = 0;
  let lastKeyTimeMs = 0;

  function reset(): void {
    buffer = '';
    startTimeMs = 0;
    lastKeyTimeMs = 0;
  }

  function feedKey(key: string, timestampMs: number): ValidatedBarcode | null {
    if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') {
      return null;
    }

    if (key === 'Enter' || key === 'Tab') {
      const candidate = buffer;
      const totalElapsed = timestampMs - startTimeMs;
      reset();

      if (
        candidate.length >= MIN_BARCODE_LENGTH &&
        candidate.length <= MAX_BARCODE_LENGTH &&
        totalElapsed >= 0 &&
        totalElapsed <= maxBurstMs
      ) {
        const validated = validateRetailBarcode(candidate);
        if (validated.valid && options?.onScan) {
          options.onScan(validated);
        }
        return validated;
      }
      return null;
    }

    if (key.length !== 1) {
      reset();
      return null;
    }

    if (buffer.length === 0) {
      buffer = key;
      startTimeMs = timestampMs;
      lastKeyTimeMs = timestampMs;
      return null;
    }

    const delta = timestampMs - lastKeyTimeMs;
    if (delta < 0 || delta > maxInterKeyMs) {
      // Human typing cadence — restart buffer from current character
      buffer = key;
      startTimeMs = timestampMs;
      lastKeyTimeMs = timestampMs;
      return null;
    }

    if (buffer.length >= MAX_BARCODE_LENGTH) {
      // Overflow guard against stuck key
      reset();
      return null;
    }

    buffer += key;
    lastKeyTimeMs = timestampMs;
    return null;
  }

  return { feedKey, reset };
}
