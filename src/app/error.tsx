'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <div className="glass-card p-8 space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-extrabold text-white">
          Resilient Workspace Recovery (#44)
        </h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {error.message ||
            'An unexpected view error occurred. Your salon data and POS ledger remain safely isolated.'}
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-xl bg-periwinkle-500 px-4 py-2.5 text-xs font-bold text-obsidian-950"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry Module
          </button>
          <Link
            href="/dashboard"
            className="rounded-xl border border-white/[0.12] bg-obsidian-900 px-4 py-2.5 text-xs font-semibold text-white"
          >
            Return to Command Center
          </Link>
        </div>
      </div>
    </div>
  );
}
