import type { Transaction, Visit } from '@/types/database';

/** A single-process demo guard; production checkout needs transactional idempotency. */
export function canRecordDemoCheckout(visit: Visit, transactions: readonly Transaction[]): boolean {
  if (visit.status === 'completed') return false;
  return !transactions.some((item) =>
    item.business_id === visit.business_id && item.visit_id === visit.id && item.status === 'completed'
  );
}
