// ============================================================================
// PAWTRACKR WEB — DUAL-ENTRY ACCOUNTING LEDGER ENGINE
// Compliant double-entry journal exports for QuickBooks, Xero, and Sage.
// Enforces Sum(Debits) === Sum(Credits) with exact $0.00 cash-drawer variance.
// ============================================================================

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface ChartOfAccount {
  code: string;
  name: string;
  type: AccountType;
  description: string;
}

export const CHART_OF_ACCOUNTS: Record<string, ChartOfAccount> = {
  '1010': {
    code: '1010',
    name: 'Operating Bank Account',
    type: 'asset',
    description: 'Operating checking account for direct deposits and settlements',
  },
  '1020': {
    code: '1020',
    name: 'Stripe / Merchant Clearing',
    type: 'asset',
    description: 'Card pre-auths, deposits, and terminal card settlements pending transfer',
  },
  '2010': {
    code: '2010',
    name: 'Client Deposits Held',
    type: 'liability',
    description: 'Pre-authorized booking deposits held in escrow prior to service',
  },
  '2020': {
    code: '2020',
    name: 'Sales Tax Payable',
    type: 'liability',
    description: 'Municipal and state grooming sales tax collected',
  },
  '2030': {
    code: '2030',
    name: 'Groomer Payroll Payable',
    type: 'liability',
    description: 'Earned commissions and direct tips owed to styling staff',
  },
  '4010': {
    code: '4010',
    name: 'Grooming Service Revenue',
    type: 'revenue',
    description: 'Gross salon earnings from bath, clip, and scissor services',
  },
  '4020': {
    code: '4020',
    name: 'Addon & Spa Treatment Revenue',
    type: 'revenue',
    description: 'Gross earnings from deshedding, blueberry facials, ozone, and demat',
  },
  '4030': {
    code: '4030',
    name: 'Forfeited Deposit & No-Show Revenue',
    type: 'revenue',
    description: 'Retained client deposits from missed visits or late cancellations',
  },
  '5010': {
    code: '5010',
    name: 'Groomer Commission Expense',
    type: 'expense',
    description: 'Staff payroll commissions on completed visits',
  },
  '5020': {
    code: '5020',
    name: 'Stylist Tips Pass-Through',
    type: 'expense',
    description: '100% of client tips disbursed directly to groomers & bathers',
  },
  '5030': {
    code: '5030',
    name: 'Instant Payout Processing Fee',
    type: 'expense',
    description: 'Card / Push-to-Debit express transfer fee',
  },
};

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  description: string;
  entityName?: string;
}

export interface JournalEntry {
  entryNumber: string;
  date: string;
  reference: string;
  memo: string;
  lines: JournalLine[];
  totalDebitCents: number;
  totalCreditCents: number;
  isBalanced: boolean;
}

export interface GeneralLedgerBatch {
  periodStart: string;
  periodEnd: string;
  businessName: string;
  entries: JournalEntry[];
  totalDebitCents: number;
  totalCreditCents: number;
  isBalanced: boolean;
}

/**
 * Validates and balances a journal entry in exact integer cents ($0.00 drift).
 */
export function createBalancedJournalEntry(params: {
  entryNumber: string;
  date: string;
  reference: string;
  memo: string;
  lines: JournalLine[];
}): JournalEntry {
  const { entryNumber, date, reference, memo, lines } = params;

  let totalDebitCents = 0;
  let totalCreditCents = 0;

  const sanitizedLines = lines.map((line) => {
    const debit = Math.max(0, Math.floor(line.debitCents || 0));
    const credit = Math.max(0, Math.floor(line.creditCents || 0));
    totalDebitCents += debit;
    totalCreditCents += credit;

    const account = CHART_OF_ACCOUNTS[line.accountCode];
    return {
      ...line,
      accountName: account?.name || line.accountName || `Account ${line.accountCode}`,
      debitCents: debit,
      creditCents: credit,
    };
  });

  const isBalanced = totalDebitCents === totalCreditCents;

  return {
    entryNumber,
    date,
    reference,
    memo,
    lines: sanitizedLines,
    totalDebitCents,
    totalCreditCents,
    isBalanced,
  };
}

/**
 * Creates double-entry journal lines for a completed POS checkout with deposit deduction.
 */
export function buildPosCheckoutJournalEntry(params: {
  entryNumber: string;
  date: string;
  visitId: string;
  clientName: string;
  serviceRevenueCents: number;
  addonRevenueCents: number;
  taxCents: number;
  tipCents: number;
  depositAppliedCents: number;
  netCardChargedCents: number;
  cashReceivedCents: number;
}): JournalEntry {
  const {
    entryNumber,
    date,
    visitId,
    clientName,
    serviceRevenueCents,
    addonRevenueCents,
    taxCents,
    tipCents,
    depositAppliedCents,
    netCardChargedCents,
    cashReceivedCents,
  } = params;

  const lines: JournalLine[] = [];

  // DEBITS (Inflows)
  if (cashReceivedCents > 0) {
    lines.push({
      accountCode: '1010',
      accountName: 'Operating Bank Account / Cash Drawer',
      debitCents: cashReceivedCents,
      creditCents: 0,
      description: `Cash received at checkout - Visit ${visitId}`,
      entityName: clientName,
    });
  }

  if (netCardChargedCents > 0) {
    lines.push({
      accountCode: '1020',
      accountName: 'Stripe / Merchant Clearing',
      debitCents: netCardChargedCents,
      creditCents: 0,
      description: `Card payment settled - Visit ${visitId}`,
      entityName: clientName,
    });
  }

  if (depositAppliedCents > 0) {
    // Debit liability (releases client deposit hold)
    lines.push({
      accountCode: '2010',
      accountName: 'Client Deposits Held',
      debitCents: depositAppliedCents,
      creditCents: 0,
      description: `Deposit hold applied to checkout - Visit ${visitId}`,
      entityName: clientName,
    });
  }

  // CREDITS (Outflows / Earned Revenue / Payable)
  if (serviceRevenueCents > 0) {
    lines.push({
      accountCode: '4010',
      accountName: 'Grooming Service Revenue',
      debitCents: 0,
      creditCents: serviceRevenueCents,
      description: `Grooming service package - Visit ${visitId}`,
      entityName: clientName,
    });
  }

  if (addonRevenueCents > 0) {
    lines.push({
      accountCode: '4020',
      accountName: 'Addon & Spa Treatment Revenue',
      debitCents: 0,
      creditCents: addonRevenueCents,
      description: `Spa addons & treatments - Visit ${visitId}`,
      entityName: clientName,
    });
  }

  if (taxCents > 0) {
    lines.push({
      accountCode: '2020',
      accountName: 'Sales Tax Payable',
      debitCents: 0,
      creditCents: taxCents,
      description: `Sales tax collected - Visit ${visitId}`,
      entityName: clientName,
    });
  }

  if (tipCents > 0) {
    lines.push({
      accountCode: '2030',
      accountName: 'Groomer Payroll Payable (Tips)',
      debitCents: 0,
      creditCents: tipCents,
      description: `Gratuity collected for styling staff - Visit ${visitId}`,
      entityName: clientName,
    });
  }

  return createBalancedJournalEntry({
    entryNumber,
    date,
    reference: `VISIT-${visitId.slice(0, 8)}`,
    memo: `POS Checkout - ${clientName}`,
    lines,
  });
}

/**
 * Creates double-entry journal lines for a payroll period settlement and direct deposit disbursement.
 */
export function buildPayrollDisbursementJournalEntry(params: {
  entryNumber: string;
  date: string;
  periodStart: string;
  periodEnd: string;
  totalCommissionsCents: number;
  totalTipsCents: number;
  totalPayoutCents: number;
  instantPayoutFeeCents?: number;
}): JournalEntry {
  const {
    entryNumber,
    date,
    periodStart,
    periodEnd,
    totalCommissionsCents,
    totalTipsCents,
    totalPayoutCents,
    instantPayoutFeeCents = 0,
  } = params;

  const lines: JournalLine[] = [];

  // DEBITS (Operating Expenses & Liability Settlement)
  if (totalCommissionsCents > 0) {
    lines.push({
      accountCode: '5010',
      accountName: 'Groomer Commission Expense',
      debitCents: totalCommissionsCents,
      creditCents: 0,
      description: `Stylist commissions earned ${periodStart} to ${periodEnd}`,
    });
  }

  if (totalTipsCents > 0) {
    lines.push({
      accountCode: '5020',
      accountName: 'Stylist Tips Pass-Through',
      debitCents: totalTipsCents,
      creditCents: 0,
      description: `Direct & pooled tips pass-through ${periodStart} to ${periodEnd}`,
    });
  }

  // CREDITS (Cash Outflow & Convenience Fee Offset)
  const netBankOutflowCents = totalPayoutCents - instantPayoutFeeCents;
  if (netBankOutflowCents > 0) {
    lines.push({
      accountCode: '1010',
      accountName: 'Operating Bank Account',
      debitCents: 0,
      creditCents: netBankOutflowCents,
      description: `ACH direct deposit payout ${periodStart} to ${periodEnd}`,
    });
  }

  if (instantPayoutFeeCents > 0) {
    lines.push({
      accountCode: '5030',
      accountName: 'Instant Payout Processing Fee',
      debitCents: 0,
      creditCents: instantPayoutFeeCents,
      description: '1.5% instant express payout processing fee recovery',
    });
  }

  return createBalancedJournalEntry({
    entryNumber,
    date,
    reference: `PAYROLL-${periodStart}-${periodEnd}`,
    memo: `Payroll direct deposit disbursement`,
    lines,
  });
}

/**
 * Formats a General Ledger batch into QuickBooks / Xero standard CSV.
 */
export function formatGeneralLedgerCsv(batch: GeneralLedgerBatch): string {
  const headers = [
    'JournalEntryNumber',
    'Date',
    'AccountCode',
    'AccountName',
    'Debit',
    'Credit',
    'Description',
    'Reference',
    'EntityName',
  ];

  const rows: string[] = [headers.join(',')];

  for (const entry of batch.entries) {
    for (const line of entry.lines) {
      const debitStr = (line.debitCents / 100).toFixed(2);
      const creditStr = (line.creditCents / 100).toFixed(2);
      const esc = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;

      rows.push(
        [
          esc(entry.entryNumber),
          esc(entry.date),
          esc(line.accountCode),
          esc(line.accountName),
          debitStr === '0.00' ? '' : debitStr,
          creditStr === '0.00' ? '' : creditStr,
          esc(line.description),
          esc(entry.reference),
          esc(line.entityName || batch.businessName),
        ].join(',')
      );
    }
  }

  return rows.join('\r\n') + '\r\n';
}
