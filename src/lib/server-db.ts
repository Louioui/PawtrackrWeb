// ============================================================================
// PAWTRACKR WEB — PERSISTENT SERVER-SIDE MULTI-TENANT LEDGER (DISK + SUPABASE)
// Persists all bookings, walk-ins, catalog updates, waivers, and atomic POS
// transactions to `.pawtrackr-data/tenant-ledger.json` so every device on the
// network shares a single server-side source of truth even before cloud setup.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { demoStorePatchError } from './demo-store-validation';
import {
  BUSINESS_CONFIGS,
  CLIENTS,
  INITIAL_TRANSACTIONS,
  INITIAL_VISITS,
  PETS,
} from './mock-tenant-data';
import {
  BusinessConfig,
  Client,
  Pet,
  Transaction,
  Visit,
} from '@/types/database';

export interface ServerLedgerData {
  configs: Record<string, BusinessConfig>;
  clients: Client[];
  pets: Pet[];
  visits: Visit[];
  transactions: Transaction[];
  updatedAt: number;
}

const DATA_DIR = process.env.PAWTRACKR_DEMO_DATA_DIR ?? path.join(process.cwd(), '.pawtrackr-data');
const LEDGER_FILE = path.join(DATA_DIR, 'tenant-ledger.json');

const SEED_LEDGER: ServerLedgerData = {
  configs: BUSINESS_CONFIGS,
  clients: CLIENTS,
  pets: PETS,
  visits: INITIAL_VISITS,
  transactions: INITIAL_TRANSACTIONS,
  updatedAt: Date.now(),
};

export function readServerLedger(): ServerLedgerData {
  try {
    if (!fs.existsSync(LEDGER_FILE)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(
        LEDGER_FILE,
        JSON.stringify(SEED_LEDGER, null, 2),
        'utf8'
      );
      return SEED_LEDGER;
    }
    const raw = fs.readFileSync(LEDGER_FILE, 'utf8');
    const parsed = JSON.parse(raw) as ServerLedgerData;
    if (demoStorePatchError({
      configs: parsed.configs,
      clients: parsed.clients,
      pets: parsed.pets,
      visits: parsed.visits,
      transactions: parsed.transactions,
    })) return SEED_LEDGER;
    return {
      configs: parsed.configs ?? SEED_LEDGER.configs,
      clients: parsed.clients ?? SEED_LEDGER.clients,
      pets: parsed.pets ?? SEED_LEDGER.pets,
      visits: parsed.visits ?? SEED_LEDGER.visits,
      transactions: parsed.transactions ?? SEED_LEDGER.transactions,
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch {
    return SEED_LEDGER;
  }
}

export function writeServerLedger(
  partial: Partial<Omit<ServerLedgerData, 'updatedAt'>>
): ServerLedgerData {
  const current = readServerLedger();
  const next: ServerLedgerData = {
    ...current,
    ...partial,
    updatedAt: Math.max(Date.now(), current.updatedAt + 1),
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporaryFile = path.join(DATA_DIR, `tenant-ledger-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryFile, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(temporaryFile, LEDGER_FILE);
  } catch (error) {
    try { fs.rmSync(temporaryFile, { force: true }); } catch { /* Keep the original write error. */ }
    throw error;
  }

  return next;
}
