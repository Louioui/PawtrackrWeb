'use client';

import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { BillingPlanId } from '@/lib/subscription-checkout';

const PLANS: { id: BillingPlanId; name: string; price: string; detail: string }[] = [
  { id: 'solo_van', name: 'Solo stylist or mobile van', price: '$119 / month', detail: 'One groomer or van operator' },
  { id: 'salon_pro', name: 'Multi-staff salon', price: '$149 / month', detail: 'Unlimited groomers and front-desk staff' },
];

const STATUS_COPY: Record<string, string> = {
  active: 'Your subscription is active.',
  trialing: 'You are on a free trial. Choose a plan to keep your salon running after it ends.',
  past_due: 'Your last payment did not go through. Choose a plan to restart billing.',
  canceled: 'Your subscription has ended. Choose a plan to reactivate your salon.',
};

// Shown on the live settings page. It only asks the server to open Stripe
// Checkout; the salon's status changes later, when Stripe's signed event
// arrives, so this card never claims a payment succeeded on its own.
export function SubscriptionCard({ status }: { status: string }) {
  const [busy, setBusy] = useState<BillingPlanId | null>(null);
  const [message, setMessage] = useState('');
  const [returned, setReturned] = useState<'success' | 'cancelled' | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('billing');
    if (value === 'success' || value === 'cancelled') setReturned(value);
  }, []);

  const start = async (plan: BillingPlanId) => {
    if (busy) return; // a second click must not open a second checkout
    const client = getSupabaseClient();
    if (!client) return;
    setBusy(plan); setMessage('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { setMessage('Your session expired. Sign in again.'); setBusy(null); return; }
      const response = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ plan }),
      });
      const body = await response.json() as { url?: unknown; error?: unknown };
      // Only ever leave for Stripe's own checkout host.
      if (response.ok && typeof body.url === 'string' && body.url.startsWith('https://checkout.stripe.com/')) {
        window.location.assign(body.url); return;
      }
      setMessage(typeof body.error === 'string' ? body.error : 'Checkout could not be started. You have not been charged.');
    } catch {
      setMessage('Checkout could not be started. You have not been charged.');
    }
    setBusy(null);
  };

  return (
    <section className="glass-card p-5 sm:p-6" aria-labelledby="subscription-heading">
      <h2 id="subscription-heading" className="flex items-center gap-2 text-lg font-bold text-white">
        <CreditCard className="h-4 w-4 text-periwinkle-300" /> Subscription
      </h2>
      <p className="mt-1 text-sm text-zinc-300">{STATUS_COPY[status] ?? 'Subscription status is unavailable.'}</p>
      {returned === 'success' && status !== 'active' && (
        <p role="status" className="mt-3 rounded-lg border border-periwinkle-400/30 bg-periwinkle-500/10 px-4 py-3 text-sm text-periwinkle-300">
          Thanks — Stripe is confirming your payment. This page shows “active” once the confirmation arrives; use Refresh to check.
        </p>
      )}
      {returned === 'cancelled' && (
        <p role="status" className="mt-3 text-sm text-zinc-400">Checkout was closed before paying. You have not been charged.</p>
      )}
      {status !== 'active' && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <li key={plan.id} className="rounded-xl border border-white/10 p-4">
              <p className="text-sm font-semibold text-white">{plan.name}</p>
              <p className="mt-0.5 text-xs text-zinc-400">{plan.detail}</p>
              <p className="mt-2 text-base font-bold text-emerald-300">{plan.price}</p>
              <button type="button" disabled={busy !== null} onClick={() => void start(plan.id)}
                className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-periwinkle-500 px-4 text-sm font-semibold text-obsidian-900 disabled:opacity-60">
                {busy === plan.id ? 'Opening secure checkout…' : 'Subscribe with Stripe'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p role="alert" className="mt-3 text-sm text-amber-200">{message}</p>}
      <p className="mt-4 text-xs text-zinc-500">Only the salon owner can start or change the subscription. Card details are entered on Stripe, never in Pawtrackr.</p>
    </section>
  );
}
