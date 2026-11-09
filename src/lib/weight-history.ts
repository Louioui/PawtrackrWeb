import type { PetWeightEntry } from '@/types/database';

export function prepareWeightHistory(entries: PetWeightEntry[]): PetWeightEntry[] {
  const byDate = new Map<string, PetWeightEntry>();
  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) continue;
    const parsed = new Date(`${entry.date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== entry.date ||
        !Number.isFinite(entry.weight_lbs) || entry.weight_lbs <= 0) continue;
    byDate.set(entry.date, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function weightChartDomain(entries: PetWeightEntry[]): { low: number; high: number } | null {
  if (entries.length === 0) return null;
  const low = Math.max(0, Math.floor((Math.min(...entries.map((entry) => entry.weight_lbs)) - 0.5) * 2) / 2);
  const high = Math.max(low + 1, Math.ceil((Math.max(...entries.map((entry) => entry.weight_lbs)) + 0.5) * 2) / 2);
  return { low, high };
}

/** Positions are proportional to elapsed calendar time, not entry order. */
export function weightTimePositions(entries: PetWeightEntry[], left = 38, right = 328): number[] {
  if (entries.length === 0) return [];
  const first = Date.parse(`${entries[0].date}T00:00:00Z`);
  const last = Date.parse(`${entries[entries.length - 1].date}T00:00:00Z`);
  if (first === last) return [Math.round((left + right) / 2)];
  return entries.map((entry) =>
    left + ((Date.parse(`${entry.date}T00:00:00Z`) - first) / (last - first)) * (right - left)
  );
}
