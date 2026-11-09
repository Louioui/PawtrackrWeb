import type { ServerLedgerData } from './server-db';

export type DemoStoreContent = Omit<ServerLedgerData, 'updatedAt'>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function choose<T>(base: T | undefined, local: T | undefined, remote: T | undefined): { value: T | undefined } | null {
  if (same(local, remote) || same(remote, base)) return { value: local };
  if (same(local, base)) return { value: remote };
  return null;
}

function mergeRecords<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] | null {
  const toMap = (records: T[]) => {
    const map = new Map<string, T>();
    for (const record of records) {
      if (typeof record.id !== 'string' || map.has(record.id)) return null;
      map.set(record.id, record);
    }
    return map;
  };
  const before = toMap(base);
  const ours = toMap(local);
  const theirs = toMap(remote);
  if (!before || !ours || !theirs) return null;

  const result: T[] = [];
  const ids = new Set([...local.map((record) => record.id), ...remote.map((record) => record.id), ...base.map((record) => record.id)]);
  for (const id of ids) {
    const selected = choose(before.get(id), ours.get(id), theirs.get(id));
    if (!selected) return null;
    if (selected.value) result.push(selected.value);
  }
  return result;
}

function mergeConfigs(base: DemoStoreContent['configs'], local: DemoStoreContent['configs'], remote: DemoStoreContent['configs']) {
  const result: DemoStoreContent['configs'] = {};
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)])) {
    const selected = choose(base[id], local[id], remote[id]);
    if (!selected) return null;
    if (selected.value) result[id] = selected.value;
  }
  return result;
}

/** Three-way merge independent demo records; competing edits to one ID remain unresolved. */
export function mergeDemoStore(base: DemoStoreContent, local: DemoStoreContent, remote: DemoStoreContent): DemoStoreContent | null {
  const configs = mergeConfigs(base.configs, local.configs, remote.configs);
  const clients = mergeRecords(base.clients, local.clients, remote.clients);
  const pets = mergeRecords(base.pets, local.pets, remote.pets);
  const visits = mergeRecords(base.visits, local.visits, remote.visits);
  const transactions = mergeRecords(base.transactions, local.transactions, remote.transactions);
  if (!configs || !clients || !pets || !visits || !transactions) return null;
  return { configs, clients, pets, visits, transactions };
}
