import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDemoStore } from '../src/lib/demo-store-merge.ts';

const base = () => ({ configs: { a: { tax_rate: 8 } }, clients: [], pets: [], visits: [], transactions: [] });

test('merges independent sections and identical server-acknowledged changes', () => {
  const original = base();
  const local = { ...original, clients: [{ id: 'client-1' }] };
  const remote = { ...original, transactions: [{ id: 'tx-1' }] };
  assert.deepEqual(mergeDemoStore(original, local, remote), { ...local, transactions: remote.transactions });
  assert.deepEqual(mergeDemoStore(original, local, { ...original, clients: local.clients }), local);
});

test('merges independent records in the same section', () => {
  const original = base();
  const local = { ...original, clients: [{ id: 'local' }] };
  const remote = { ...original, clients: [{ id: 'remote' }] };
  assert.deepEqual(mergeDemoStore(original, local, remote)?.clients, [...local.clients, ...remote.clients]);
});

test('keeps competing edits to one record unresolved', () => {
  const original = { ...base(), clients: [{ id: 'client-1', loyalty_points: 0 }] };
  const local = { ...original, clients: [{ id: 'client-1', loyalty_points: 10 }] };
  const remote = { ...original, clients: [{ id: 'client-1', loyalty_points: 20 }] };
  assert.equal(mergeDemoStore(original, local, remote), null);
});

test('merges separate salon config changes and rejects duplicate record IDs', () => {
  const original = { ...base(), configs: { a: { tax_rate: 8 }, b: { tax_rate: 9 } } };
  const local = { ...original, configs: { ...original.configs, a: { tax_rate: 7 } } };
  const remote = { ...original, configs: { ...original.configs, b: { tax_rate: 10 } } };
  assert.deepEqual(mergeDemoStore(original, local, remote)?.configs, { a: { tax_rate: 7 }, b: { tax_rate: 10 } });
  assert.equal(mergeDemoStore(base(), { ...base(), clients: [{ id: 'x' }, { id: 'x' }] }, base()), null);
});

test('accepts a server checkout record while retaining a local loyalty update', () => {
  const original = { ...base(), clients: [{ id: 'client-1', loyalty_points: 0 }] };
  const transaction = [{ id: 'checkout-1' }];
  const completedVisit = [{ id: 'visit-1', status: 'completed' }];
  const local = { ...original, clients: [{ id: 'client-1', loyalty_points: 20 }], transactions: transaction, visits: completedVisit };
  const remote = { ...original, transactions: transaction, visits: completedVisit };
  assert.deepEqual(mergeDemoStore(original, local, remote), local);
});
