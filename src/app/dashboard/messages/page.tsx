'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCheck,
  CheckCircle2,
  CreditCard,
  FileSignature,
  MessageSquare,
  Phone,
  Scissors,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  CLIENTS,
  PETS,
  TENANT_BESPOKE_ID,
} from '@/lib/mock-tenant-data';
import { BehaviorAuraBadge } from '@/components/BehaviorAuraBadge';
import { formatCurrency } from '@/lib/pos-math';

interface SmsMessage {
  id: string;
  sender: 'salon' | 'client';
  text: string;
  timestamp: string;
  badge?: string;
}

interface ThreadRecord {
  clientId: string;
  petId: string;
  unread: boolean;
  messages: SmsMessage[];
}

const INITIAL_THREADS: ThreadRecord[] = [
  {
    clientId: 'cl-101',
    petId: 'pet-101',
    unread: true,
    messages: [
      {
        id: 'm-1',
        sender: 'salon',
        text: 'Hi Sophia! Bello is checked in at Bespoke Grooming Studio. Elena noticed tight friction mats behind both ears from his rain harness. May we apply our $25 Humane Demat & Silk Serum treatment so we can save his plush ear length?',
        timestamp: '09:12 AM',
        badge: 'Matted Coat Approval Request',
      },
      {
        id: 'm-2',
        sender: 'client',
        text: 'Yes please!! Definitely save his fluffy ears if possible, I approve the $25 demat treatment. Thank you Elena!',
        timestamp: '09:14 AM',
        badge: 'Parent Approved (+$25)',
      },
      {
        id: 'm-3',
        sender: 'salon',
        text: 'Wonderful! Ear tangles are safely out with zero stress. He is in the warm ozone hydro-bath now.',
        timestamp: '09:35 AM',
      },
    ],
  },
  {
    clientId: 'cl-103',
    petId: 'pet-103',
    unread: false,
    messages: [
      {
        id: 'm-4',
        sender: 'salon',
        text: 'Hi Hannah! Senior Sanctuary update: Mochi rested comfortably in our orthopedic belly sling and her heart rate stayed super calm. She is fluffed and ready for pickup!',
        timestamp: '10:15 AM',
        badge: 'Ready for Pickup Alert',
      },
      {
        id: 'm-5',
        sender: 'client',
        text: 'You guys are the best with her! On my way now—I will tap Google Pay at the desk.',
        timestamp: '10:18 AM',
      },
    ],
  },
  {
    clientId: 'cl-102',
    petId: 'pet-102',
    unread: false,
    messages: [
      {
        id: 'm-6',
        sender: 'salon',
        text: 'Hi Devon! Koda did great for his 2-person fear-free nail dremel today. His undercoat blowout is 80% done.',
        timestamp: '10:30 AM',
      },
    ],
  },
];

export default function TwoWaySmsConciergePage() {
  const [threads, setThreads] = useState<ThreadRecord[]>(INITIAL_THREADS);
  const [selectedClientId, setSelectedClientId] = useState<string>('cl-101');
  const [draftText, setDraftText] = useState<string>('');

  const activeThread =
    threads.find((t) => t.clientId === selectedClientId) ?? threads[0];
  const activeClient =
    CLIENTS.find((c) => c.id === activeThread.clientId) ?? CLIENTS[0];
  const activePet =
    PETS.find((p) => p.id === activeThread.petId) ?? PETS[0];

  const appendMessage = (text: string, badge?: string) => {
    if (!text.trim()) return;
    const newMsg: SmsMessage = {
      id: `m-${Date.now().toString(36)}`,
      sender: 'salon',
      text,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      badge,
    };
    setThreads((prev) =>
      prev.map((t) =>
        t.clientId === activeThread.clientId
          ? { ...t, unread: false, messages: [...t.messages, newMsg] }
          : t
      )
    );
    setDraftText('');
  };

  const handleSendForm = (e: React.FormEvent) => {
    e.preventDefault();
    appendMessage(draftText);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {/* Sub-nav */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-periwinkle-500/40"
        >
          <ArrowLeft className="h-4 w-4 text-periwinkle-400" />
          Back to Salon Command Center
        </Link>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>2-Way SMS Concierge • Works across Android, Windows, iOS & Web</span>
        </div>
      </div>

      {/* Main 2-Column Messaging Console */}
      <div className="grid grid-cols-1 overflow-hidden rounded-3xl border border-white/[0.1] bg-obsidian-800/95 shadow-2xl lg:grid-cols-12">
        {/* Left 4 Cols: Client & Pet Thread List */}
        <div className="border-b border-white/[0.08] bg-obsidian-900/90 lg:col-span-4 lg:border-b-0 lg:border-r">
          <div className="border-b border-white/[0.08] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-400">
                Live SMS & Approval Inbox
              </span>
              <span className="rounded-full bg-periwinkle-500/20 px-2.5 py-0.5 font-mono text-[11px] font-bold text-periwinkle-300">
                {threads.length} Active
              </span>
            </div>
            <h1 className="mt-1 text-lg font-extrabold text-white">
              Pet Parent Concierge
            </h1>
          </div>

          <div className="divide-y divide-white/[0.06]">
            {threads.map((thread) => {
              const c = CLIENTS.find((item) => item.id === thread.clientId);
              const p = PETS.find((item) => item.id === thread.petId);
              if (!c || !p) return null;
              const isSelected = thread.clientId === activeThread.clientId;
              const lastMsg = thread.messages[thread.messages.length - 1];

              return (
                <button
                  key={thread.clientId}
                  type="button"
                  onClick={() => setSelectedClientId(thread.clientId)}
                  className={`flex w-full items-start gap-3.5 p-4 text-left transition ${
                    isSelected
                      ? 'bg-periwinkle-500/15 border-l-4 border-l-periwinkle-500'
                      : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <img
                    src={p.avatar_url}
                    alt={p.name}
                    className="h-12 w-12 rounded-2xl object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white truncate">
                        {p.name} ({c.name.split(' ')[0]})
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400">
                        {lastMsg?.timestamp}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-periwinkle-300">
                      {p.breed} • {c.phone}
                    </p>
                    <p className="mt-1 truncate text-xs text-zinc-400">
                      {lastMsg?.text}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 8 Cols: Active Conversation + 1-Tap Groomer Action Macros */}
        <div className="flex flex-col justify-between lg:col-span-8">
          {/* Active Pet Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-obsidian-900/60 px-6 py-4">
            <div className="flex items-center gap-3">
              <img
                src={activePet.avatar_url}
                alt={activePet.name}
                className="h-11 w-11 rounded-xl object-cover"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-white">
                    {activePet.name} — {activeClient.name}
                  </h2>
                  <span className="font-mono text-xs text-zinc-400">
                    {activeClient.phone}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {activePet.behavior_tags.map((tag) => (
                    <BehaviorAuraBadge key={tag} tag={tag} size="xs" />
                  ))}
                </div>
              </div>
            </div>

            <Link
              href={`/client/${activeClient.id}`}
              className="rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:border-emerald-500/40"
            >
              View Digital Passport →
            </Link>
          </div>

          {/* Message History */}
          <div className="max-h-[420px] min-h-[340px] space-y-4 overflow-y-auto p-6">
            {activeThread.messages.map((msg) => {
              const isSalon = msg.sender === 'salon';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isSalon ? 'items-end' : 'items-start'
                  }`}
                >
                  {msg.badge && (
                    <span
                      className={`mb-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        isSalon
                          ? 'bg-periwinkle-500/20 text-periwinkle-300 border border-periwinkle-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {msg.badge}
                    </span>
                  )}
                  <div
                    className={`max-w-lg rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      isSalon
                        ? 'bg-periwinkle-500 text-obsidian-950 font-medium shadow-periwinkle-glow'
                        : 'border border-white/[0.1] bg-obsidian-900 text-zinc-100'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-zinc-500">
                    <span>{msg.timestamp}</span>
                    {isSalon && <CheckCheck className="h-3 w-3 text-emerald-400" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 1-Tap Groomer Smart SMS Macros */}
          <div className="border-t border-white/[0.08] bg-obsidian-900/90 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                1-Tap Groomer Macros:
              </span>
              <button
                type="button"
                onClick={() =>
                  appendMessage(
                    `Hi ${activeClient.name.split(' ')[0]}! We found tight coat matting on ${activePet.name}. Please reply YES to approve our $25 Humane Demat & Coat Rescue protocol.`,
                    'Matted Coat Shave/Demat Consent'
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25"
              >
                <Scissors className="h-3 w-3" />
                Request Demat Approval (+$25)
              </button>

              <button
                type="button"
                onClick={() =>
                  appendMessage(
                    `Hi ${activeClient.name.split(' ')[0]}! ${activePet.name} is fluffed, styled, and ready for pickup! Tap here to view his Digital Report Card or pay via Google Pay / Apple Pay / Card: pawtrackr.live/client/${activeClient.id}`,
                    'Ready for Pickup + Pay Link'
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25"
              >
                <CreditCard className="h-3 w-3" />
                Send Ready + Contactless Pay Link
              </button>

              <button
                type="button"
                onClick={() =>
                  appendMessage(
                    `Quick sanctuary update: ${activePet.name} is doing wonderfully in the warm hydro-massage bath! About 35 minutes remaining.`,
                    'Spa Progress Update'
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg border border-periwinkle-500/40 bg-periwinkle-500/15 px-2.5 py-1 text-[11px] font-semibold text-periwinkle-300 hover:bg-periwinkle-500/25"
              >
                <Sparkles className="h-3 w-3" />
                Send 35m Hydro-Spa Update
              </button>
            </div>

            <form onSubmit={handleSendForm} className="flex gap-2">
              <input
                type="text"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder={`Type SMS message to ${activeClient.name} (${activeClient.phone})...`}
                className="flex-1 rounded-xl border border-white/[0.12] bg-obsidian-800 px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-periwinkle-500 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-periwinkle-500 px-5 py-2.5 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400"
              >
                <Send className="h-3.5 w-3.5" />
                Send SMS
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
