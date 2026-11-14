// Pure rules and validators for self-service password recovery and password resets.
// Conforms to Pawtrackr's minimum 10-character password security policy.

export type RecoveryEmailCheck =
  | { ok: true; email: string }
  | { ok: false; message: string };

export function validateRecoveryEmail(email: unknown): RecoveryEmailCheck {
  const clean = typeof email === 'string' ? email.trim() : '';
  if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 254) {
    return { ok: false, message: 'Please enter a valid staff email address.' };
  }
  return { ok: true, email: clean };
}

export type NewPasswordCheck =
  | { ok: true; password: string }
  | { ok: false; message: string };

export function validateNewPassword(
  password: unknown,
  confirmPassword: unknown,
): NewPasswordCheck {
  if (typeof password !== 'string' || password.length < 10) {
    return { ok: false, message: 'Your new password must be at least 10 characters long.' };
  }
  if (password !== confirmPassword) {
    return { ok: false, message: 'Passwords do not match. Please verify both fields.' };
  }
  return { ok: true, password };
}

export function recoveryFailureMessage(
  error: { status?: number; message?: string } | null | undefined,
): string {
  if (
    error?.status === 429 ||
    (typeof error?.message === 'string' && /rate limit/i.test(error.message))
  ) {
    return 'Email rate limit exceeded. Supabase default mailer allows only 3-4 emails per hour. Configure a Custom SMTP provider (such as Resend) in Supabase Dashboard -> Authentication -> SMTP Settings, or have an admin reset your password directly.';
  }

  if (typeof error?.status === 'number' && error.status >= 500) {
    return 'Password recovery is temporarily unavailable. Please check your connection and try again in a few minutes.';
  }

  return 'Failed to send recovery email. Check that the email address is correct and try again.';
}
