import test from 'node:test';
import assert from 'node:assert/strict';
import { demoCheckoutInputError } from '../src/lib/demo-checkout-input.ts';

const ok = { base_package_dollars: 95, addon_items_dollars: [18, '12.50'], safety_surcharge_dollars: 25,
  discount_dollars: 0, tax_rate_percent: 8.63, tip_mode: 'percent', tip_percent: 20, payment_method: 'card' };

test('an ordinary checkout passes, with or without optional fields', () => {
  assert.equal(demoCheckoutInputError(ok), null);
  assert.equal(demoCheckoutInputError({ base_package_dollars: '95.00' }), null);
  assert.equal(demoCheckoutInputError({ ...ok, tip_mode: 'custom', custom_tip_dollars: 0 }), null);
});

test('prices that are negative, not numbers, or too large are refused', () => {
  for (const bad of [-500, 'abc', 'Infinity', Infinity, NaN, 1e15, null, undefined, '', '1e3', [95], true]) {
    assert.notEqual(demoCheckoutInputError({ ...ok, base_package_dollars: bad }), null, String(bad));
  }
  assert.notEqual(demoCheckoutInputError({ ...ok, addon_items_dollars: [18, -1] }), null);
  assert.notEqual(demoCheckoutInputError({ ...ok, addon_items_dollars: 'x' }), null);
  assert.notEqual(demoCheckoutInputError({ ...ok, addon_items_dollars: Array(31).fill(1) }), null);
  assert.notEqual(demoCheckoutInputError({ ...ok, discount_dollars: -457 }), null);
});

test('tax, tip and payment method stay inside sensible bounds', () => {
  assert.notEqual(demoCheckoutInputError({ ...ok, tax_rate_percent: 1000 }), null);
  assert.notEqual(demoCheckoutInputError({ ...ok, tax_rate_percent: -10 }), null);
  assert.notEqual(demoCheckoutInputError({ ...ok, tip_percent: 500 }), null);
  assert.notEqual(demoCheckoutInputError({ ...ok, tip_mode: 'custom', custom_tip_dollars: -50 }), null);
  assert.notEqual(demoCheckoutInputError({ ...ok, tip_mode: 'steal' }), null);
  assert.notEqual(demoCheckoutInputError({ ...ok, payment_method: 'bitcoin' }), null);
  for (const method of ['card', 'apple_pay', 'cash', 'split']) assert.equal(demoCheckoutInputError({ ...ok, payment_method: method }), null);
});
