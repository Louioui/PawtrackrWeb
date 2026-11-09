'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Delete,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { BUSINESSES, STAFF_MEMBERS } from '@/lib/mock-tenant-data';

const PIN_MAP: Record<string, { staffId: string; name: string; role: string }> =
  {
    '1010': {
      staffId: 'st-101',
      name: 'Elena Vance',
      role: 'Owner • Master Stylist',
    },
    '2020': {
      staffId: 'st-102',
      name: 'Julian Kwon',
      role: 'Senior Groomer',
    },
    '3030': {
      staffId: 'st-103',
      name: 'Sora Takahashi',
      role: 'Fear-Free Senior Specialist',
    },
    '4040': {
      staffId: 'st-104',
      name: 'Maya Lin',
      role: 'Front Desk POS Concierge',
    },
  };

export default function SalonLoginAndStationPinPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<'pin_pad' | 'owner_auth'>('pin_pad');
  const [pinCode, setPinCode] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [unlockedStaff, setUnlockedStaff] = useState<{
    name: string;
    role: string;
  } | null>(null);

  // Owner email / magic link state
  const [email, setEmail] = useState<string>('elena@bespokegrooming.live');
  const [password, setPassword] = useState<string>('••••••••••••');
  const [selectedTenantId, setSelectedTenantId] = useState<string>(
    BUSINESSES[0].id
  );
  const [magicLinkSent, setMagicLinkSent] = useState<boolean>(false);

  const handleDigitPress = (digit: string) => {
    setPinError(null);
    if (pinCode.length >= 4) return;
    const nextPin = pinCode + digit;
    setPinCode(nextPin);

    if (nextPin.length === 4) {
      const matched = PIN_MAP[nextPin];
      if (matched) {
        setUnlockedStaff({ name: matched.name, role: matched.role });
        setTimeout(() => {
          router.push('/dashboard');
        }, 900);
      } else {
        setPinError('Invalid Groomer PIN. Try 1010, 2020, 3030, or 4040.');
        setTimeout(() => setPinCode(''), 700);
      }
    }
  };

  const handleOwnerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setMagicLinkSent(true);
    setTimeout(() => {
      router.push('/dashboard');
    }, 1000);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-white/[0.1] bg-obsidian-800/95 shadow-2xl">
        {/* Top Mode Switcher */}
        <div className="grid grid-cols-2 border-b border-white/[0.08] bg-obsidian-900 p-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setAuthMode('pin_pad')}
            className={`flex items-center justify-center gap-2 rounded-2xl py-3 transition ${
              authMode === 'pin_pad'
                ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <KeyRound className="h-4 w-4" />
            1-Tap Groomer Station PIN
          </button>
          <button
            type="button"
            onClick={() => setAuthMode('owner_auth')}
            className={`flex items-center justify-center gap-2 rounded-2xl py-3 transition ${
              authMode === 'owner_auth'
                ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Lock className="h-4 w-4" />
            Owner Supabase Auth
          </button>
        </div>

        {authMode === 'pin_pad' ? (
          <div className="p-6 sm:p-8 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-0.5 text-[11px] font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Wet-Hands Friendly Salon Kiosk Mode
            </span>
            <h1 className="mt-3 text-2xl font-extrabold text-white">
              Enter 4-Digit Stylist Station PIN
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Switch active groomer station in under 1 second without full sign
              out.
            </p>

            {/* Quick Staff PIN Reference Chips */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {Object.entries(PIN_MAP).map(([pin, info]) => (
                <button
                  key={pin}
                  type="button"
                  onClick={() => {
                    setPinCode(pin);
                    setUnlockedStaff({ name: info.name, role: info.role });
                    setTimeout(() => router.push('/dashboard'), 800);
                  }}
                  className="rounded-xl border border-white/[0.08] bg-obsidian-900 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-periwinkle-500/50 hover:text-white"
                >
                  <span className="font-mono font-bold text-periwinkle-300">
                    {pin}
                  </span>{' '}
                  • {info.name.split(' ')[0]}
                </button>
              ))}
            </div>

            {/* 4-Dot PIN Indicator */}
            <div className="my-6 flex justify-center gap-4">
              {[0, 1, 2, 3].map((idx) => {
                const filled = pinCode.length > idx;
                return (
                  <div
                    key={idx}
                    className={`h-4 w-4 rounded-full border transition-all ${
                      filled
                        ? 'scale-110 border-periwinkle-400 bg-periwinkle-500 shadow-periwinkle-glow'
                        : 'border-zinc-600 bg-obsidian-900'
                    }`}
                  />
                );
              })}
            </div>

            {pinError && (
              <p className="mb-4 text-xs font-semibold text-rose-400">
                {pinError}
              </p>
            )}

            {unlockedStaff && (
              <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 py-2.5 text-xs font-bold text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Station Unlocked: {unlockedStaff.name} ({unlockedStaff.role})
              </div>
            )}

            {/* Tactile Numeric Keypad */}
            <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigitPress(digit)}
                  className="flex h-14 items-center justify-center rounded-2xl border border-white/[0.09] bg-obsidian-900 font-mono text-xl font-bold text-white transition hover:border-periwinkle-500/50 hover:bg-obsidian-700 active:scale-95"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPinCode('')}
                className="flex h-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-obsidian-900/60 text-xs font-bold text-zinc-400 hover:text-white"
              >
                CLEAR
              </button>
              <button
                type="button"
                onClick={() => handleDigitPress('0')}
                className="flex h-14 items-center justify-center rounded-2xl border border-white/[0.09] bg-obsidian-900 font-mono text-xl font-bold text-white transition hover:border-periwinkle-500/50 hover:bg-obsidian-700 active:scale-95"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinCode((prev) => prev.slice(0, -1))}
                className="flex h-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-obsidian-900/60 text-zinc-400 hover:text-white"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleOwnerLogin} className="space-y-4 p-6 sm:p-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-400">
                Supabase JWT + Tenant RLS Session
              </span>
              <h2 className="mt-1 text-2xl font-extrabold text-white">
                Salon Owner Command Sign-In
              </h2>
              <p className="text-xs text-zinc-400">
                Authenticates and injects your isolated{' '}
                <code className="text-emerald-300">business_id</code> into
                PostgreSQL `request.jwt.claims`.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300">
                Select Isolated Salon Tenant
              </label>
              <select
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
              >
                {BUSINESSES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (business_id: {b.id.slice(0, 8)}...)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300">
                Owner Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300">
                Password or Passkey
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            {magicLinkSent && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-3 text-xs font-semibold text-emerald-300">
                ✓ JWT Session Verified! Redirecting to isolated Command
                Center...
              </div>
            )}

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-xs font-bold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400"
            >
              Authenticate & Enter Command Center
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
