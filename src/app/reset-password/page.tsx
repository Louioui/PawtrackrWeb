'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, Lock, ShieldAlert, Sparkles } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { validateNewPassword } from '@/lib/password-recovery';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isRecoverySession, setIsRecoverySession] = useState<boolean | null>(null);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setIsRecoverySession(false);
      return;
    }

    let active = true;

    // Check existing session
    void client.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) {
        setIsRecoverySession(true);
      }
    });

    // Listen for PASSWORD_RECOVERY event
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || Boolean(session)) {
        setIsRecoverySession(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleReset = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const validated = validateNewPassword(password, confirmPassword);
    if (!validated.ok) {
      setErrorMessage(validated.message);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setErrorMessage('Authentication service is not configured.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const { error } = await client.auth.updateUser({
        password: validated.password,
      });

      if (error) {
        setErrorMessage(error.message || 'Failed to update password. Please request a new reset link.');
        return;
      }

      setSuccess(true);
      setPassword('');
      setConfirmPassword('');

      // Auto-redirect to live schedule after brief pause
      setTimeout(() => {
        router.push('/dashboard/appointments/live');
      }, 2500);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred while resetting your password.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass =
    'mt-1 block min-h-11 w-full rounded-lg border border-white/15 bg-obsidian-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:border-periwinkle-400 focus:outline-none focus:ring-2 focus:ring-periwinkle-400/40';

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-obsidian-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
          <Lock className="h-6 w-6" />
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
          Create new password
        </h1>
        <p className="mt-1.5 text-sm text-zinc-400">
          Choose a secure password of at least 10 characters for your staff account.
        </p>

        {!isSupabaseConfigured && (
          <div
            role="status"
            className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3.5 text-xs text-amber-200"
          >
            Live authentication is not configured in this environment.
          </div>
        )}

        {isRecoverySession === false && !success && (
          <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3.5 text-xs leading-relaxed text-amber-200">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                No active password recovery session was detected. If you arrived here directly, please request a password reset email first.
              </div>
            </div>
            <Link
              href="/forgot-password"
              className="mt-2.5 inline-block font-semibold text-amber-100 underline hover:text-white"
            >
              Request a password reset link &rarr;
            </Link>
          </div>
        )}

        {success ? (
          <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" />
            <h2 className="mt-2.5 text-lg font-bold text-white">Password successfully updated</h2>
            <p className="mt-1.5 text-xs text-zinc-300">
              Your staff credentials have been updated securely.
            </p>
            <p className="mt-2 text-xs font-medium text-emerald-300">
              Redirecting you to today’s schedule…
            </p>
            <Link
              href="/dashboard/appointments/live"
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-periwinkle-500 px-4 text-sm font-semibold text-obsidian-950 transition hover:bg-periwinkle-400"
            >
              <Sparkles className="h-4 w-4" /> Open live appointments now
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} noValidate className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-zinc-200">
              New password (10+ characters)
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="new-password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <label className="block text-sm font-medium text-zinc-200">
              Confirm new password
              <input
                type={showPassword ? 'text' : 'password'}
                name="confirm-password"
                autoComplete="new-password"
                required
                minLength={10}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
                className={fieldClass}
              />
            </label>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3.5 text-xs text-amber-200"
              >
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || password.length < 10}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-periwinkle-500 px-4 text-sm font-semibold text-obsidian-950 transition hover:bg-periwinkle-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Updating password…' : 'Update password & sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
