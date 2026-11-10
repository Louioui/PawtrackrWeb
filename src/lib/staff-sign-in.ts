// Pure rules for the staff sign-in card on /login. Signing in only proves who
// the person is. Which salon they may see is decided afterwards by the
// database from their active staff membership, never by anything on this page.

export const DEFAULT_STAFF_DESTINATION = '/dashboard/appointments/live';

// Only the token-verified staff views are valid places to land after sign-in.
const STAFF_DESTINATIONS = [
  '/dashboard/appointments/live',
  '/dashboard/clients/live',
  '/dashboard/analytics/live',
  '/dashboard/settings/live',
] as const;

// `?next=` comes from the address bar, so it is attacker-controlled. Anything
// that is not exactly one of the staff views falls back to the default, which
// rules out other sites ("//evil.example", "https://…") and odd paths alike.
export function safeStaffDestination(raw: unknown): string {
  return typeof raw === 'string' && (STAFF_DESTINATIONS as readonly string[]).includes(raw)
    ? raw
    : DEFAULT_STAFF_DESTINATION;
}

export type SignInFieldCheck = { ok: true; email: string } | { ok: false; message: string };

export function checkSignInFields(email: unknown, password: unknown): SignInFieldCheck {
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    return { ok: false, message: 'Enter the email address for your staff account.' };
  }
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, message: 'Enter your password.' };
  }
  return { ok: true, email: cleanEmail };
}

// One message for a wrong email and a wrong password, so the form cannot be
// used to discover which addresses have accounts.
export function signInFailureMessage(error: { status?: number; message?: string } | null | undefined): string {
  if (error?.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  if (typeof error?.message === 'string' && /email not confirmed/i.test(error.message)) {
    return 'Confirm your email address from the message we sent, then sign in.';
  }
  if (typeof error?.status === 'number' && error.status >= 500) {
    return 'Sign-in is temporarily unavailable. Nothing was changed; try again shortly.';
  }
  return 'That email and password do not match a staff account.';
}

// Sample-data shortcuts. They open demo screens and never create a session.
export const DEMO_ROLE_LINKS = [
  { label: 'Owner demo', href: '/dashboard', detail: 'Sample salon command center' },
  { label: 'Client portal demo', href: '/portal/bespoke-grooming', detail: 'Sample public booking page' },
  { label: 'Report card demo', href: '/client/cl-101', detail: 'Sample pet parent view' },
] as const;
