// ============================================================================
// PAWTRACKR WEB — OFFICIAL NACHA ACH DIRECT DEPOSIT GENERATOR
// Implements the 94-character fixed-width NACHA standard for commercial
// bank direct deposits, ABA routing check-digit validation, entry hashing,
// and blocking-factor-10 file padding.
// ============================================================================

export interface NachaStaffDepositItem {
  staffId: string;
  staffName: string;
  routingNumber: string;
  accountNumber: string;
  accountType?: 'checking' | 'savings';
  amountCents: number;
}

export interface NachaFileOptions {
  immediateDestinationRouting: string; // Salon's bank routing (9 digits)
  immediateOriginEin: string;          // Salon's Federal EIN / Tax ID (9-10 digits)
  destinationBankName: string;         // e.g. "CHASE BANK" (max 23 chars)
  originSalonName: string;             // e.g. "PAWTRACKR SALON" (max 23 chars)
  companyId?: string;                  // Defaults to EIN
  effectiveDate?: Date;                // Settlement date (defaults to next business day)
  fileIdModifier?: string;             // Defaults to 'A'
}

export interface NachaGenerationResult {
  nachaContent: string;
  recordCount: number;
  blockCount: number;
  totalCreditCents: number;
  totalDebitCents: number;
  entryCount: number;
  entryHash: string;
  isValid94CharsPerLine: boolean;
}

/**
 * Validates a 9-digit ABA routing number using the official NACHA check-digit algorithm:
 * (10 - [3(d1+d4+d7) + 7(d2+d5+d8) + 1(d3+d6)] % 10) % 10 === d9
 */
export function validateAbaRoutingNumber(routing: string): { valid: boolean; error?: string } {
  if (!routing || typeof routing !== 'string') {
    return { valid: false, error: 'Routing number is required.' };
  }
  const clean = routing.replace(/[^0-9]/g, '');
  if (clean.length !== 9) {
    return { valid: false, error: `Routing number must be exactly 9 digits (got ${clean.length}).` };
  }

  const d = clean.split('').map((c) => parseInt(c, 10));
  const weightedSum =
    3 * (d[0] + d[3] + d[6]) +
    7 * (d[1] + d[4] + d[7]) +
    1 * (d[2] + d[5]);

  const expectedCheckDigit = (10 - (weightedSum % 10)) % 10;
  if (d[8] !== expectedCheckDigit) {
    return {
      valid: false,
      error: `Invalid ABA routing check-digit: expected ${expectedCheckDigit}, received ${d[8]}.`,
    };
  }

  return { valid: true };
}

// Helpers for fixed-width field formatting
function padRight(str: string, length: number, padChar = ' '): string {
  const clean = (str || '').slice(0, length);
  return clean.padEnd(length, padChar);
}

function padLeft(str: string, length: number, padChar = '0'): string {
  const clean = (str || '').slice(0, length);
  return clean.padStart(length, padChar);
}

function formatYYMMDD(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function formatHHMM(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}${mm}`;
}

/**
 * Generates an official 94-character fixed-width NACHA ACH Direct Deposit file.
 */
export function generateNachaDirectDepositFile(
  deposits: NachaStaffDepositItem[],
  options: NachaFileOptions
): NachaGenerationResult {
  const now = new Date();
  const effective = options.effectiveDate || new Date(now.getTime() + 86400000); // T+1 settlement

  const destRouting = options.immediateDestinationRouting.replace(/[^0-9]/g, '');
  const originEin = options.immediateOriginEin.replace(/[^0-9]/g, '');
  const companyId = (options.companyId || originEin).replace(/[^0-9A-Z]/g, '');
  const originBankRoutingPrefix = destRouting.slice(0, 8);

  const lines: string[] = [];

  // --------------------------------------------------------------------------
  // RECORD 1: FILE HEADER RECORD (94 CHARACTERS)
  // --------------------------------------------------------------------------
  const fileHeader = [
    '1',                                               // 01-01 Record Type Code
    '01',                                              // 02-03 Priority Code
    ' ' + padRight(destRouting, 9),                    // 04-13 Immediate Destination
    ' ' + padRight(originEin, 9),                      // 14-23 Immediate Origin
    formatYYMMDD(now),                                 // 24-29 File Creation Date
    formatHHMM(now),                                   // 30-33 File Creation Time
    (options.fileIdModifier || 'A').slice(0, 1),       // 34-34 File ID Modifier
    '094',                                             // 35-37 Record Size
    '10',                                              // 38-39 Blocking Factor
    '1',                                               // 40-40 Format Code
    padRight(options.destinationBankName || 'DESTINATION BANK', 23), // 41-63 Immediate Destination Name
    padRight(options.originSalonName || 'PAWTRACKR SALON', 23),      // 64-86 Immediate Origin Name
    padRight('PAWTRACK', 8),                          // 87-94 Reference Code
  ].join('');

  lines.push(fileHeader);

  // --------------------------------------------------------------------------
  // RECORD 5: BATCH HEADER RECORD (94 CHARACTERS)
  // --------------------------------------------------------------------------
  const batchNumber = '0000001';
  const batchHeader = [
    '5',                                               // 01-01 Record Type Code
    '220',                                             // 02-04 Service Class Code: 220 Credits Only (Payroll)
    padRight(options.originSalonName || 'PAWTRACKR', 16), // 05-20 Company Name
    padRight('PAYROLL DIRECT', 20),                    // 21-40 Company Discretionary Data
    padRight(companyId, 10),                           // 41-50 Company Identification
    'PPD',                                             // 51-53 Standard Entry Class Code (Prearranged Payment & Deposit)
    padRight('PAYROLL', 10),                           // 54-63 Company Entry Description
    formatYYMMDD(now),                                 // 64-69 Company Descriptive Date
    formatYYMMDD(effective),                           // 70-75 Effective Entry Date
    '   ',                                             // 76-78 Settlement Date (blank for originator)
    '1',                                               // 79-79 Originator Status Code
    padRight(originBankRoutingPrefix, 8),              // 80-87 Originating DFI Identification
    batchNumber,                                       // 88-94 Batch Number
  ].join('');

  lines.push(batchHeader);

  // --------------------------------------------------------------------------
  // RECORD 6: ENTRY DETAIL RECORDS (94 CHARACTERS EACH)
  // --------------------------------------------------------------------------
  let totalCreditCents = 0;
  let entryHashSum = 0;

  deposits.forEach((dep, idx) => {
    const amountCents = Math.max(0, Math.floor(dep.amountCents || 0));
    totalCreditCents += amountCents;

    const routing = dep.routingNumber.replace(/[^0-9]/g, '');
    const routingPrefix = routing.slice(0, 8);
    const checkDigit = routing.slice(8, 9) || '0';

    entryHashSum += parseInt(routingPrefix, 10) || 0;

    // Transaction Code: 22 = Automated Deposit (Checking), 32 = Savings
    const txCode = dep.accountType === 'savings' ? '32' : '22';
    const traceNumber = padLeft(originBankRoutingPrefix, 8) + padLeft(String(idx + 1), 7);

    const entryDetail = [
      '6',                                             // 01-01 Record Type Code
      txCode,                                          // 02-03 Transaction Code
      padRight(routingPrefix, 8),                      // 04-11 Receiving DFI Identification
      checkDigit,                                      // 12-12 Check Digit
      padRight(dep.accountNumber.replace(/[^0-9A-Z]/gi, ''), 17), // 13-29 DFI Account Number
      padLeft(String(amountCents), 10),                // 30-39 Amount in Cents ($0.00 drift)
      padRight(dep.staffId, 15),                       // 40-54 Individual Identification Number
      padRight(dep.staffName.toUpperCase(), 22),       // 55-76 Individual Name
      '  ',                                            // 77-78 Discretionary Data
      '0',                                             // 79-79 Addenda Record Indicator
      traceNumber,                                     // 80-94 Trace Number
    ].join('');

    lines.push(entryDetail);
  });

  // Entry Hash is sum of all 8-digit routing prefixes, modulo 10^10, padded to 10 digits
  const entryHashStr = padLeft(String(entryHashSum % 10000000000), 10);
  const entryCountStr = padLeft(String(deposits.length), 6);

  // --------------------------------------------------------------------------
  // RECORD 8: BATCH CONTROL RECORD (94 CHARACTERS)
  // --------------------------------------------------------------------------
  const batchControl = [
    '8',                                               // 01-01 Record Type Code
    '220',                                             // 02-04 Service Class Code
    entryCountStr,                                     // 05-10 Entry / Addenda Count
    entryHashStr,                                      // 11-20 Entry Hash
    padLeft('0', 12),                                  // 21-32 Total Debit Entry Dollar Amount (0 for payroll)
    padLeft(String(totalCreditCents), 12),             // 33-44 Total Credit Entry Dollar Amount
    padRight(companyId, 10),                           // 45-54 Company Identification
    padRight('', 19),                                  // 55-73 Message Authentication Code (blank)
    padRight('', 6),                                   // 74-79 Reserved (blank)
    padRight(originBankRoutingPrefix, 8),              // 80-87 Originating DFI Identification
    batchNumber,                                       // 88-94 Batch Number
  ].join('');

  lines.push(batchControl);

  // --------------------------------------------------------------------------
  // RECORD 9: FILE CONTROL RECORD (94 CHARACTERS)
  // --------------------------------------------------------------------------
  // Non-padded lines so far: File Header(1) + Batch Header(1) + Entries(N) + Batch Control(1) + File Control(1)
  const logicalLineCount = lines.length + 1;
  const blockCount = Math.ceil(logicalLineCount / 10);

  const fileControl = [
    '9',                                               // 01-01 Record Type Code
    padLeft('1', 6),                                   // 02-07 Batch Count
    padLeft(String(blockCount), 6),                    // 08-13 Block Count
    padLeft(String(deposits.length), 8),               // 14-21 Entry / Addenda Count
    entryHashStr,                                      // 22-31 Entry Hash
    padLeft('0', 12),                                  // 32-43 Total Debit Dollar Amount
    padLeft(String(totalCreditCents), 12),             // 44-55 Total Credit Dollar Amount
    padRight('', 39),                                  // 56-94 Reserved (blank)
  ].join('');

  lines.push(fileControl);

  // --------------------------------------------------------------------------
  // BLOCKING FACTOR 10: PAD WITH 94-CHAR '9' RECORDS UP TO MULTIPLE OF 10
  // --------------------------------------------------------------------------
  const paddingNeeded = blockCount * 10 - lines.length;
  const padRecord = '9'.repeat(94);
  for (let i = 0; i < paddingNeeded; i++) {
    lines.push(padRecord);
  }

  // Verify all records conform to strict 94-character length
  const isValid94CharsPerLine = lines.every((line) => line.length === 94);

  return {
    nachaContent: lines.join('\r\n') + '\r\n',
    recordCount: lines.length,
    blockCount,
    totalCreditCents,
    totalDebitCents: 0,
    entryCount: deposits.length,
    entryHash: entryHashStr,
    isValid94CharsPerLine,
  };
}
