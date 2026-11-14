import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRecoveryEmail,
  validateNewPassword,
  recoveryFailureMessage,
} from '../src/lib/password-recovery.ts';

test('validates recovery email format strictly', () => {
  assert.deepEqual(validateRecoveryEmail('  staff@salon.example  '), { ok: true, email: 'staff@salon.example' });
  assert.equal(validateRecoveryEmail('invalid-email').ok, false);
  assert.equal(validateRecoveryEmail('').ok, false);
  assert.equal(validateRecoveryEmail(null).ok, false);
  assert.equal(validateRecoveryEmail(undefined).ok, false);
  assert.equal(validateRecoveryEmail(`${'a'.repeat(250)}@example.com`).ok, false);
});

test('enforces 10-character minimum and exact match for password reset', () => {
  assert.equal(validateNewPassword('short', 'short').ok, false);
  assert.equal(validateNewPassword('123456789', '123456789').ok, false);
  assert.equal(validateNewPassword('ValidPassword123!', 'MismatchedPassword123!').ok, false);
  assert.deepEqual(
    validateNewPassword('ValidPassword123!', 'ValidPassword123!'),
    { ok: true, password: 'ValidPassword123!' },
  );
});

test('handles rate limit, 500 error, and general errors distinctly', () => {
  const rateLimitMsg1 = recoveryFailureMessage({ status: 429 });
  const rateLimitMsg2 = recoveryFailureMessage({ message: 'email rate limit exceeded' });
  assert.match(rateLimitMsg1, /rate limit/i);
  assert.match(rateLimitMsg2, /rate limit/i);

  const serverErrorMsg = recoveryFailureMessage({ status: 502 });
  assert.match(serverErrorMsg, /temporarily unavailable/i);

  const genericMsg = recoveryFailureMessage({ status: 400 });
  assert.match(genericMsg, /check that the email address/i);
});
