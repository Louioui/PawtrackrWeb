import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STAFF_DESTINATION, DEMO_ROLE_LINKS, checkSignInFields, safeStaffDestination, signInFailureMessage,
} from '../src/lib/staff-sign-in.ts';

test('post-sign-in destination accepts only the staff views', () => {
  assert.equal(safeStaffDestination('/dashboard/clients/live'), '/dashboard/clients/live');
  for (const hostile of [null, undefined, '', '//evil.example', 'https://evil.example/dashboard/appointments/live',
    '/\\evil.example', '/dashboard', '/dashboard/appointments/live/../../admin', '/dashboard/clients/live?x=1',
    'javascript:alert(1)', ' /dashboard/clients/live', 42]) {
    assert.equal(safeStaffDestination(hostile), DEFAULT_STAFF_DESTINATION);
  }
});

test('sign-in fields are checked before any request is sent', () => {
  assert.deepEqual(checkSignInFields('  owner@example.test ', 'pw'), { ok: true, email: 'owner@example.test' });
  assert.equal(checkSignInFields('owner', 'pw').ok, false);
  assert.equal(checkSignInFields('owner@example.test', '').ok, false);
  assert.equal(checkSignInFields(null, undefined).ok, false);
  assert.equal(checkSignInFields(`${'a'.repeat(250)}@example.test`, 'pw').ok, false);
});

test('wrong email and wrong password produce the same message', () => {
  const unknownUser = signInFailureMessage({ status: 400, message: 'Invalid login credentials' });
  const wrongPassword = signInFailureMessage({ status: 400, message: 'invalid_grant' });
  assert.equal(unknownUser, wrongPassword);
  assert.doesNotMatch(unknownUser, /invalid_grant|credentials/i);
});

test('rate limit, unconfirmed email and outages are explained distinctly', () => {
  const messages = new Set([
    signInFailureMessage({ status: 429 }),
    signInFailureMessage({ status: 400, message: 'Email not confirmed' }),
    signInFailureMessage({ status: 503 }),
    signInFailureMessage(null),
  ]);
  assert.equal(messages.size, 4);
});

test('demo shortcuts are labeled as demos and stay off live staff routes', () => {
  assert.equal(DEMO_ROLE_LINKS.length, 3);
  for (const link of DEMO_ROLE_LINKS) {
    assert.match(link.label, /demo/i);
    assert.doesNotMatch(link.href, /\/live/);
    assert.match(link.href, /^\/[a-z]/);
  }
});
