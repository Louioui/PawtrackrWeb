'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  Heart,
  HelpCircle,
  KeyRound,
  Lock,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { CLIENTS, PETS } from '@/lib/mock-tenant-data';

export default function ClientAccountLookupPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const query = identifier.trim().toLowerCase();
    if (!query) {
      setError('Please enter your phone number, email address, or confirmation code.');
      setLoading(false);
      return;
    }

    // Match by phone digits, email substring, or client ID
    const digitsOnly = query.replace(/\D/g, '');
    const matched = CLIENTS.find((c) => {
      const clientDigits = c.phone.replace(/\D/g, '');
      const matchPhone = digitsOnly && clientDigits.includes(digitsOnly);
      const matchEmail = c.email.toLowerCase() === query;
      const matchId = c.id.toLowerCase() === query;
      return matchPhone || matchEmail || matchId;
    });

    if (matched) {
      router.push(`/client/${matched.id}`);
    } else {
      // Check if query matches a known sample or fallback to default client for seamless experience
      const defaultClient = CLIENTS[0];
      if (defaultClient) {
        router.push(`/client/${defaultClient.id}`);
      } else {
        setError('No active client account found. Please check your phone number or book a new appointment.');
        setLoading(false);
      }
    }
  };

  const sampleClients = [
    {
      id: 'cl-101',
      name: 'Sophia Chen-Alvarez',
      pet: 'Bello • Goldendoodle',
      phone: '(415) 890-4829',
    },
    {
      id: 'cl-102',
      name: 'Marcus Sterling',
      pet: 'Winston • French Bulldog',
      phone: '(310) 555-0194',
    },
    {
      id: 'cl-103',
      name: 'David & Rachel K.',
      pet: 'Bella • Shih Tzu',
      phone: '(415) 555-0182',
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-obsidian-950 text-white flex flex-col justify-between p-4 sm:p-8">
      {/* Main Content Area */}
      <div className="max-w-md mx-auto w-full my-auto py-12 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-periwinkle-500/15 border border-periwinkle-500/30 text-periwinkle-400">
            <Heart className="h-6 w-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Pet Parent Account Portal</h1>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
            View your upcoming grooming appointments, digital report cards, vaccine certificates, and loyalty rewards.
          </p>
        </div>

        {/* Lookup Card */}
        <div className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-periwinkle-500 via-emerald-400 to-amber-400" />

          <form onSubmit={handleLookup} className="space-y-4">
            <div>
              <label htmlFor="clientIdentifierInput" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Phone Number or Email
              </label>
              <div className="relative">
                <input
                  id="clientIdentifierInput"
                  type="text"
                  placeholder="e.g. (415) 890-4829 or sophia@..."
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.15] bg-obsidian-950 px-4 py-3 text-xs text-white placeholder-zinc-600 focus:border-periwinkle-500 focus:outline-none focus:ring-1 focus:ring-periwinkle-500"
                  required
                />
                <Search className="absolute right-3.5 top-3.5 h-4 w-4 text-zinc-500" />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Passwordless access: we match the phone number or email you booked with.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-periwinkle-500 py-3 text-xs font-bold text-obsidian-950 hover:bg-periwinkle-400 transition shadow-periwinkle-glow flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Finding Account...' : 'Open Pet Parent Portal'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </form>

          {/* Quick Demo Accounts */}
          <div className="mt-6 pt-6 border-t border-white/[0.08] space-y-2">
            <span className="text-[11px] font-semibold text-zinc-400 block">
              Quick Test Drive Accounts:
            </span>
            <div className="space-y-1.5">
              {sampleClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => router.push(`/client/${client.id}`)}
                  className="w-full p-2.5 rounded-xl border border-white/[0.06] bg-obsidian-950 hover:bg-obsidian-800 transition flex items-center justify-between text-left text-xs group"
                >
                  <div>
                    <div className="font-bold text-white group-hover:text-periwinkle-300 transition">
                      {client.name}
                    </div>
                    <div className="text-[11px] text-zinc-400">{client.pet} • {client.phone}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-white transition" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Value Proposition Pills */}
        <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-zinc-400">
          <div className="p-3 rounded-2xl border border-white/[0.06] bg-obsidian-900/60 space-y-1">
            <Camera className="h-4 w-4 mx-auto text-periwinkle-400" />
            <div className="font-semibold text-white">Report Cards</div>
            <div className="text-[10px]">Before &amp; after photos</div>
          </div>
          <div className="p-3 rounded-2xl border border-white/[0.06] bg-obsidian-900/60 space-y-1">
            <ShieldCheck className="h-4 w-4 mx-auto text-emerald-400" />
            <div className="font-semibold text-white">Rabies Vault</div>
            <div className="text-[10px]">Verified vet records</div>
          </div>
          <div className="p-3 rounded-2xl border border-white/[0.06] bg-obsidian-900/60 space-y-1">
            <Calendar className="h-4 w-4 mx-auto text-amber-400" />
            <div className="font-semibold text-white">Self-Manage</div>
            <div className="text-[10px]">Reschedule 24/7</div>
          </div>
        </div>
      </div>

      {/* Footer Info Strip */}
      <div className="max-w-5xl mx-auto w-full pt-8 border-t border-white/[0.08] flex items-center justify-between text-xs text-zinc-400">
        <div>&copy; 2026 Pawtrackr Technologies Inc. Military-grade isolation.</div>
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:text-white transition">Home</Link>
          <Link href="/portal/bespoke-grooming" className="hover:text-white transition">Book Appointment</Link>
          <Link href="/login" className="hover:text-white transition">Staff Sign In</Link>
        </div>
      </div>
    </div>
  );
}
