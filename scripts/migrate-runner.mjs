#!/usr/bin/env node
// ============================================================================
// PAWTRACKR WEB — STATIC MIGRATION INVENTORY
// Checks filenames, order, nonempty content, and SHA-256 fingerprints.
// It does not parse, execute, or validate SQL against PostgreSQL.
// ============================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

console.log('================================================================');
console.log('📦 PAWTRACKR WEB — STATIC SQL MIGRATION INVENTORY');
console.log('================================================================');

if (files.length === 0) throw new Error('No SQL migrations found.');

for (const [index, file] of files.entries()) {
  const expectedPrefix = String(index + 1).padStart(4, '0') + '_';
  if (!file.startsWith(expectedPrefix)) {
    throw new Error(`Expected migration ${expectedPrefix}*, found ${file}.`);
  }
  const fullPath = path.join(migrationsDir, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  if (!content.trim()) throw new Error(`Migration ${file} is empty.`);
  const hash = crypto
    .createHash('sha256')
    .update(content)
    .digest('hex')
    .slice(0, 12);

  console.log(`✓ Inventoried [${file}] — SHA-256 prefix: ${hash}`);
}

console.log(
  `\n✅ ${files.length} sequential SQL files inventoried. SQL execution and RLS behavior remain unverified.\n`
);
