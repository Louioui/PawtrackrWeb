import type { Transaction } from '@/types/database';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Only a matching, completed demo record may update the client and chart. */
export function parseDemoCheckoutResponse(
  httpOk: boolean,
  body: unknown,
  expected: { businessId: string; visitId: string; totalCents: number }
): Transaction {
  if (!httpOk || !object(body) || body.ok !== true || body.mode !== 'demo') {
    throw new Error(object(body) && typeof body.error === 'string'
      ? body.error
      : 'Demo checkout could not be recorded.');
  }
  const tx = body.transaction;
  if (!object(tx) || typeof tx.id !== 'string' || !tx.id ||
      tx.business_id !== expected.businessId || tx.visit_id !== expected.visitId ||
      tx.status !== 'completed' || typeof tx.amount !== 'number' ||
      !Number.isFinite(tx.amount) || Math.round(tx.amount * 100) !== expected.totalCents ||
      typeof tx.created_at !== 'string' || !Number.isFinite(Date.parse(tx.created_at))) {
    throw new Error('Demo checkout response did not match the requested visit and total.');
  }
  return tx as unknown as Transaction;
}
