'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Compass,
  HelpCircle,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react';

const ONBOARDING_STEPS = [
  {
    step: 1,
    title: '1. Configure Salon Service Catalog & Tax Rate',
    desc: 'Set your breed packages, add-ons, and municipal tax rate in /dashboard/settings.',
    href: '/dashboard/settings',
  },
  {
    step: 2,
    title: '2. Import Legacy MoeGo / DaySmart Clients',
    desc: 'Upload your existing CSV export in /dashboard/import to auto-tag Behavior Auras.',
    href: '/dashboard/import',
  },
  {
    step: 3,
    title: '3. Share Your Public Self-Booking URL',
    desc: 'Let pet parents book 24/7 at pawtrackr.live/bespoke-grooming without phone tag.',
    href: '/portal/bespoke-grooming',
  },
  {
    step: 4,
    title: '4. Run 4-Step Atomic POS Checkout',
    desc: 'Settle appointments with 0¢ drawer drift and automatic loyalty rewards in /dashboard.',
    href: '/dashboard',
  },
];

export function SupportAndTourWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'tour' | 'support'>('tour');
  const [feedbackText, setFeedbackText] = useState('');
  const [sentSupport, setSentSupport] = useState(false);

  const handleSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;
    setSentSupport(true);
    setFeedbackText('');
    setTimeout(() => setSentSupport(false), 3500);
  };

  return (
    <div className="mx-auto flex max-w-7xl justify-end px-4 pb-6 sm:px-6 lg:px-8">
      {isOpen ? (
        <div className="w-80 sm:w-96 overflow-hidden rounded-3xl border border-periwinkle-500/40 bg-obsidian-800/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/[0.08] bg-obsidian-900 px-4 py-3">
            <div className="flex gap-1.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setMode('tour')}
                className={`rounded-lg px-2.5 py-1 transition ${
                  mode === 'tour'
                    ? 'bg-periwinkle-500 text-obsidian-950'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Onboarding Tour (#39)
              </button>
              <button
                type="button"
                onClick={() => setMode('support')}
                className={`rounded-lg px-2.5 py-1 transition ${
                  mode === 'support'
                    ? 'bg-periwinkle-500 text-obsidian-950'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Support preview
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-zinc-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {mode === 'tour' ? (
            <div className="p-4 space-y-2.5">
              <p className="text-xs text-zinc-300">
                Interactive 4-step launch checklist for your salon or mobile van:
              </p>
              {ONBOARDING_STEPS.map((item) => (
                <Link
                  key={item.step}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className="block rounded-xl border border-white/[0.08] bg-obsidian-900/80 p-3 text-xs transition hover:border-periwinkle-500/50"
                >
                  <div className="font-bold text-white">{item.title}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    {item.desc}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <form onSubmit={handleSupportSubmit} className="p-4 space-y-3">
              <p className="text-xs text-zinc-300">
                Preview a support request for reader setup or CSV migration.
                This demo does not send messages.
              </p>
              <textarea
                rows={3}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Describe your question or feature request..."
                className="w-full rounded-xl border border-white/[0.12] bg-obsidian-900 p-3 text-xs text-white focus:border-periwinkle-500 focus:outline-none"
              />
              {sentSupport && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Request preview complete. No ticket was sent.
                </div>
              )}
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-obsidian-950"
              >
                <Send className="h-3.5 w-3.5" />
                Preview support request
              </button>
            </form>
          )}
        </div>
      ) : (
        <button
          type="button"
          aria-label="Open Tour & Concierge"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-periwinkle-500/40 bg-obsidian-800/95 px-4 py-2.5 text-xs font-bold text-white shadow-periwinkle-glow backdrop-blur-xl transition hover:scale-105 hover:border-periwinkle-400"
        >
          <Compass className="h-4 w-4 text-periwinkle-400" />
          <span>Tour & Concierge</span>
        </button>
      )}
    </div>
  );
}
