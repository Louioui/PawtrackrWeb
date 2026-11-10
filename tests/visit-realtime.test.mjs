import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  visitChangeConcernsTenant, visitChannelFilter, visitChannelName, visitRealtimeStateFrom,
} from '../src/lib/visit-realtime.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('visit channel name and filter are built only from a valid salon id', () => {
  assert.equal(visitChannelName(A), `room-visits-${A}`);
  assert.equal(visitChannelFilter(A.toUpperCase()), `business_id=eq.${A}`);
  for (const bad of [null, undefined, '', 'global', `${A},id=neq.0`, `${A} or 1=1`, 42]) {
    assert.equal(visitChannelName(bad), null);
    assert.equal(visitChannelFilter(bad), null);
  }
});

test('a change naming another salon never triggers a refetch', () => {
  assert.equal(visitChangeConcernsTenant({ new: { business_id: A } }, A), true);
  assert.equal(visitChangeConcernsTenant({ new: { business_id: A }, old: { id: 'x' } }, A), true);
  assert.equal(visitChangeConcernsTenant({ new: { business_id: B } }, A), false);
  assert.equal(visitChangeConcernsTenant({ new: { business_id: B }, old: { business_id: B } }, A), false);
});

test('a delete that carries only a primary key still triggers a tenant-scoped refetch', () => {
  assert.equal(visitChangeConcernsTenant({ new: {}, old: { id: 'x' } }, A), true);
  assert.equal(visitChangeConcernsTenant(null, A), false);
  assert.equal(visitChangeConcernsTenant({ new: { business_id: A } }, 'not-a-uuid'), false);
});

test('socket status maps to an honest calendar state', () => {
  assert.equal(visitRealtimeStateFrom('SUBSCRIBED'), 'live');
  for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) assert.equal(visitRealtimeStateFrom(status), 'interrupted');
  assert.equal(visitRealtimeStateFrom('JOINING'), 'connecting');
});

test('migration 0023 publishes visits without widening replica identity', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0023_publish_visits_to_realtime.sql', import.meta.url), 'utf8');
  assert.match(sql, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.visits/);
  assert.match(sql, /IF EXISTS \(SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'\)/);
  assert.doesNotMatch(sql, /REPLICA IDENTITY FULL;/i);
});
