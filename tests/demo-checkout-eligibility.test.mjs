import test from 'node:test';
import assert from 'node:assert/strict';
import { canRecordDemoCheckout } from '../src/lib/demo-checkout-eligibility.ts';

const visit = { id: 'visit-a', business_id: 'salon-a', status: 'ready' };
const tx = (business_id, visit_id, status) => ({ business_id, visit_id, status });

test('a demo visit can be completed once, with tenant and visit isolation', () => {
  assert.equal(canRecordDemoCheckout(visit, []), true);
  assert.equal(canRecordDemoCheckout(visit, [tx('salon-a', 'visit-a', 'pending')]), true);
  assert.equal(canRecordDemoCheckout(visit, [tx('salon-a', 'visit-a', 'refunded')]), true);
  assert.equal(canRecordDemoCheckout(visit, [tx('salon-b', 'visit-a', 'completed'), tx('salon-a', 'visit-b', 'completed')]), true);
  assert.equal(canRecordDemoCheckout(visit, [tx('salon-a', 'visit-a', 'completed')]), false);
  assert.equal(canRecordDemoCheckout({ ...visit, status: 'completed' }, []), false);
});
