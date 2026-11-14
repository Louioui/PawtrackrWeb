'use client';

import React, { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, KeyRound, Mail, ShieldAlert } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { recoveryFailureMessage, validateRecoveryEmail } from '@/lib/password-recovery';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const validated = validateRecoveryEmail(email);
    if (!validated.ok) {
      setErrorMessage(validated.message);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setErrorMessage('Authentication service is not configured in this environment.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error } = await client.auth.resetPasswordForEmail(validated.email, {
        redirectTo,
      });

      if (error) {
        setErrorMessage(recoveryFailureMessage(error));
        return;
      }

      setSuccess(true);
    } catch (err) {
      setErrorMessage(
        recoveryFailureMessage(
          err instanceof Error ? { message: err.message } : null,
        ),
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
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>

        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-periwinkle-400/30 bg-periwinkle-400/10 text-periwinkle-300">
          <KeyRound className="h-6 w-6" />
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
          Reset staff password
        </h1>
        <p className="mt-1.5 text-sm text-zinc-400">
          Enter your registered staff email address and we’ll send you a secure link
          to reset your password.
        </p>

        {!isSupabaseConfigured && (
          <div
            role="status"
            className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3.5 text-xs text-amber-200"
          >
            Live authentication is not configured in this environment. Configure your Supabase credentials in <code className="rounded bg-black/40 px-1 py-0.5 font-mono">.env.local</code>.
          </div>
        )}

        {success ? (
          <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <h2 className="mt-2 text-base font-semibold text-white">Check your email</h2>
            <p className="mt-1 text-xs text-zinc-300">
              We sent a password recovery link to{' '}
              <strong className="text-white">{email.trim()}</strong>.
            </p>
            <p className="mt-3 text-xs text-zinc-400">
              Click the link in the message to choose a new password. If it doesn’t arrive within a few minutes, check your spam folder.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-periwinkle-500 px-4 text-sm font-semibold text-obsidian-950 transition hover:bg-periwinkle-400"
            >
              Return to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-zinc-200">
              Staff email address
              <div className="relative mt-1">
                <input
                  type="email"
                  name="email"
                  autoComplete="username email"
                  required
                  placeholder="groomer@your-salon.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting || !isSupabaseConfigured}
                  className={fieldClass}
                />
              </div>
            </label>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3.5 text-xs leading-relaxed text-amber-200"
              >
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div>{errorMessage}</div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !isSupabaseConfigured}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-periwinkle-500 px-4 text-sm font-semibold text-obsidian-950 transition hover:bg-periwinkle-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {isSubmitting ? 'Sending recovery link…' : 'Send password reset link'}
            </button>

            <div className="pt-2 text-center text-xs text-zinc-400">
              Remembered your password?{' '}
              <Link href="/login" className="font-semibold text-periwinkle-300 hover:underline">
                Sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
