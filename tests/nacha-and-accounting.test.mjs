import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateAbaRoutingNumber,
  generateNachaDirectDepositFile,
} from '../src/lib/nacha-generator.ts';
import {
  CHART_OF_ACCOUNTS,
  createBalancedJournalEntry,
  buildPosCheckoutJournalEntry,
  buildPayrollDisbursementJournalEntry,
  formatGeneralLedgerCsv,
} from '../src/lib/general-ledger.ts';

test('validateAbaRoutingNumber strictly verifies 9-digit ABA routing check-digits', () => {
  // Valid Federal Reserve ABA routing numbers
  assert.equal(validateAbaRoutingNumber('021000021').valid, true); // JPMorgan Chase NY
  assert.equal(validateAbaRoutingNumber('121000358').valid, true); // Bank of America CA
  assert.equal(validateAbaRoutingNumber('121000248').valid, true); // Wells Fargo SF
  assert.equal(validateAbaRoutingNumber('071000013').valid, true); // Chase Chicago

  // Invalid check digit
  const invalidCheck = validateAbaRoutingNumber('021000022');
  assert.equal(invalidCheck.valid, false);
  assert.match(invalidCheck.error || '', /Invalid ABA routing check-digit/);

  // Invalid length
  assert.equal(validateAbaRoutingNumber('12345678').valid, false);
  assert.equal(validateAbaRoutingNumber('1234567890').valid, false);
});

test('generateNachaDirectDepositFile creates standard 94-character fixed-width records with blocking factor 10', () => {
  const staffDeposits = [
    {
      staffId: 'STF-001',
      staffName: 'Elena Rostova',
      routingNumber: '021000021',
      accountNumber: '9988776655',
      accountType: 'checking',
      amountCents: 185050, // $1,850.50
    },
    {
      staffId: 'STF-002',
      staffName: 'Marcus Vance',
      routingNumber: '121000358',
      accountNumber: '1122334455',
      accountType: 'checking',
      amountCents: 142000, // $1,420.00
    },
  ];

  const result = generateNachaDirectDepositFile(staffDeposits, {
    immediateDestinationRouting: '021000021',
    immediateOriginEin: '123456789',
    destinationBankName: 'JPMORGAN CHASE',
    originSalonName: 'PAWTRACKR SANCTUARY',
  });

  // Verify NACHA invariants
  assert.equal(result.isValid94CharsPerLine, true);
  assert.equal(result.entryCount, 2);
  assert.equal(result.totalCreditCents, 327050); // $3,270.50 exact
  assert.equal(result.totalDebitCents, 0);

  // Blocking factor 10: line count must be an exact multiple of 10
  assert.equal(result.recordCount % 10, 0);
  assert.equal(result.blockCount, result.recordCount / 10);

  const lines = result.nachaContent.trim().split('\r\n');
  assert.equal(lines.length, result.recordCount);

  // Verify Record 1 (File Header)
  assert.equal(lines[0].startsWith('101 021000021'), true);
  assert.equal(lines[0].length, 94);

  // Verify Record 5 (Batch Header)
  assert.equal(lines[1].startsWith('5220PAWTRACKR'), true);
  assert.equal(lines[1].length, 94);

  // Verify Record 6 (Entry Details)
  assert.equal(lines[2].startsWith('62202100002'), true); // 02100002 prefix
  assert.equal(lines[2].length, 94);
  assert.match(lines[2], /0000185050/); // $1,850.50 amount

  assert.equal(lines[3].startsWith('62212100035'), true); // 12100035 prefix
  assert.equal(lines[3].length, 94);
  assert.match(lines[3], /0000142000/); // $1,420.00 amount

  // Verify Record 8 (Batch Control)
  assert.equal(lines[4].startsWith('8220'), true);
  assert.equal(lines[4].length, 94);
  assert.match(lines[4], /000000327050/); // Total credit cents

  // Verify Record 9 (File Control)
  assert.equal(lines[5].startsWith('9000001'), true);
  assert.equal(lines[5].length, 94);

  // Verify Blocking Padding (lines 6..9 are all '9's)
  for (let i = 6; i < lines.length; i++) {
    assert.equal(lines[i], '9'.repeat(94));
  }
});

test('createBalancedJournalEntry and General Ledger builder enforce Sum(Debits) === Sum(Credits)', () => {
  // 1. Balanced POS Checkout with Deposit Applied
  const posEntry = buildPosCheckoutJournalEntry({
    entryNumber: 'JE-POS-001',
    date: '2026-11-14',
    visitId: 'v-101',
    clientName: 'Liam O’Connor',
    serviceRevenueCents: 11000,
    addonRevenueCents: 1500,
    taxCents: 1031,
    tipCents: 2000,
    depositAppliedCents: 2500,
    netCardChargedCents: 13031,
    cashReceivedCents: 0,
  });

  assert.equal(posEntry.isBalanced, true);
  assert.equal(posEntry.totalDebitCents, posEntry.totalCreditCents);
  assert.equal(posEntry.totalDebitCents, 15531); // 2500 + 13031 = 15531

  // 2. Balanced Payroll Disbursement
  const payrollEntry = buildPayrollDisbursementJournalEntry({
    entryNumber: 'JE-PAY-001',
    date: '2026-11-14',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-14',
    totalCommissionsCents: 450000, // $4,500.00
    totalTipsCents: 85000,         // $850.00
    totalPayoutCents: 535000,       // $5,350.00
    instantPayoutFeeCents: 0,
  });

  assert.equal(payrollEntry.isBalanced, true);
  assert.equal(payrollEntry.totalDebitCents, payrollEntry.totalCreditCents);
  assert.equal(payrollEntry.totalDebitCents, 535000);

  // 3. Format CSV export
  const csv = formatGeneralLedgerCsv({
    periodStart: '2026-11-01',
    periodEnd: '2026-11-14',
    businessName: 'Pawtrackr Sanctuary',
    entries: [posEntry, payrollEntry],
    totalDebitCents: posEntry.totalDebitCents + payrollEntry.totalDebitCents,
    totalCreditCents: posEntry.totalCreditCents + payrollEntry.totalCreditCents,
    isBalanced: true,
  });

  assert.match(csv, /JournalEntryNumber,Date,AccountCode/);
  assert.match(csv, /"JE-POS-001"/);
  assert.match(csv, /"1020","Stripe \/ Merchant Clearing"/);
  assert.match(csv, /"2010","Client Deposits Held"/);
  assert.match(csv, /"4010","Grooming Service Revenue"/);
  assert.match(csv, /"JE-PAY-001"/);
  assert.match(csv, /"5010","Groomer Commission Expense"/);
});
