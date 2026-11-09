import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWeightHistory, weightChartDomain, weightTimePositions } from '../src/lib/weight-history.ts';

test('weight entries sort by date and latest duplicate date wins', () => {
  assert.deepEqual(prepareWeightHistory([
    { date: '2026-11-07', weight_lbs: 24.4 },
    { date: '2026-05-12', weight_lbs: 23.8 },
    { date: '2026-11-07', weight_lbs: 24.6 },
  ]), [
    { date: '2026-05-12', weight_lbs: 23.8 },
    { date: '2026-11-07', weight_lbs: 24.6 },
  ]);
});

test('weight chart input omits invalid dates and nonpositive measurements', () => {
  assert.deepEqual(prepareWeightHistory([
    { date: '2026-02-30', weight_lbs: 24 },
    { date: 'bad', weight_lbs: 24 },
    { date: '2026-11-07', weight_lbs: 0 },
    { date: '2026-11-08', weight_lbs: Number.NaN },
  ]), []);
});

test('weight chart positions follow elapsed time for irregular observations', () => {
  const entries = prepareWeightHistory([
    { date: '2026-01-01', weight_lbs: 20 },
    { date: '2026-01-02', weight_lbs: 21 },
    { date: '2026-01-11', weight_lbs: 22 },
  ]);
  assert.deepEqual(weightTimePositions(entries, 0, 100), [0, 10, 100]);
  assert.deepEqual(weightTimePositions(entries.slice(0, 1), 0, 100), [50]);
});

test('weight axis never suggests a negative physical weight', () => {
  assert.deepEqual(weightChartDomain([]), null);
  assert.deepEqual(weightChartDomain([{ date: '2026-11-01', weight_lbs: 0.1 }]), { low: 0, high: 1 });
  assert.deepEqual(weightChartDomain([{ date: '2026-11-01', weight_lbs: 23.8 }, { date: '2026-11-02', weight_lbs: 24.6 }]), { low: 23, high: 25.5 });
});
