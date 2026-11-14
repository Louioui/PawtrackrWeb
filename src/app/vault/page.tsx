'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Camera,
  ShieldCheck,
  Sparkles,
  Sliders,
  Scissors,
  CheckCircle2,
  Eye,
  FileCheck,
  Lock,
  Download,
  Share2,
  Trash2,
} from 'lucide-react';

interface VaultItem {
  id: string;
  petName: string;
  breed: string;
  styleTag: string;
  groomer: string;
  date: string;
  beforeLabel: string;
  afterLabel: string;
  exifStripped: boolean;
  watermarkApplied: boolean;
}

const VAULT_ITEMS: VaultItem[] = [
  {
    id: 'v-1',
    petName: 'Barnaby',
    breed: 'Goldendoodle',
    styleTag: 'Teddy Bear Scissor Cut',
    groomer: 'Elena Rostova',
    date: 'Today, Nov 14',
    beforeLabel: 'Overgrown 8-Week Matted Coat',
    afterLabel: 'Fluffed Teddy Bear Finish & Hand Scissor Legs',
    exifStripped: true,
    watermarkApplied: true,
  },
  {
    id: 'v-2',
    petName: 'Bella',
    breed: 'Standard Poodle',
    styleTag: 'Asian Fusion Flare',
    groomer: 'Marcus Vance',
    date: 'Yesterday, Nov 13',
    beforeLabel: 'Heavy Undergrowth & Ear Knots',
    afterLabel: 'Contoured Asian Fusion Head & Bell-Bottom Feet',
    exifStripped: true,
    watermarkApplied: true,
  },
  {
    id: 'v-3',
    petName: 'Rocco',
    breed: 'French Bulldog',
    styleTag: 'Undercoat Deshed & Hydro-Glow',
    groomer: 'Elena Rostova',
    date: 'Nov 12',
    beforeLabel: 'Dull Shedding Coat & Facial Wrinkle Dirt',
    afterLabel: 'Silky De-Shedded Gloss & Wrinkle Balm Treatment',
    exifStripped: true,
    watermarkApplied: true,
  },
];

export default function DigitalAssetVaultPage() {
  const [items] = useState<VaultItem[]>(VAULT_ITEMS);
  const [selectedItemId, setSelectedItemId] = useState<string>('v-1');
  const [sliderPosition, setSliderPosition] = useState<number>(50); // 0 to 100%
  const [isWatermarkEnabled, setIsWatermarkEnabled] = useState<boolean>(true);
  const [isExifStrippingActive, setIsExifStrippingActive] = useState<boolean>(true);

  const activeItem = items.find((i) => i.id === selectedItemId) || items[0];

  return (
    <div className="min-h-screen bg-obsidian-950 text-white selection:bg-periwinkle-500/30 selection:text-periwinkle-200">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-obsidian-900/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-periwinkle-500/40 bg-periwinkle-500/15 text-periwinkle-300 shadow-periwinkle-glow">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white sm:text-lg">
                  Digital Asset Vault & Before/After
                </h1>
                <span className="rounded-md border border-periwinkle-500/30 bg-periwinkle-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-periwinkle-300">
                  EXIF PRIVACY SHIELD
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Interactive before/after transformation slider, custom salon watermarks, and EXIF sanitization.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              <span>EXIF Geotags Purged (100%)</span>
            </div>

            <Link
              href="/dashboard"
              className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08]"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Interactive Before / After Split Slider Showcase */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Main Visual Comparison Slider (8 Cols) */}
          <div className="flex flex-col rounded-3xl border border-white/[0.08] bg-obsidian-900/70 p-5 lg:col-span-8">
            <div className="flex items-center justify-between pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white">
                    {activeItem.petName} — {activeItem.styleTag}
                  </h2>
                  <span className="rounded bg-periwinkle-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-periwinkle-300">
                    {activeItem.breed}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Stylist: <span className="text-zinc-200">{activeItem.groomer}</span> • {activeItem.date}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsWatermarkEnabled(!isWatermarkEnabled)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    isWatermarkEnabled
                      ? 'border-periwinkle-500/40 bg-periwinkle-500/15 text-periwinkle-300'
                      : 'border-white/[0.1] bg-white/[0.04] text-zinc-400'
                  }`}
                >
                  Watermark: {isWatermarkEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* Split Comparison Frame */}
            <div className="relative mt-2 h-96 w-full select-none overflow-hidden rounded-2xl border border-white/[0.12] bg-obsidian-950">
              {/* After Layer (Background) */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950/40 via-obsidian-900 to-purple-950/40">
                <div className="text-center p-6">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-periwinkle-500/40 bg-periwinkle-500/15 text-periwinkle-300 shadow-periwinkle-glow">
                    <Scissors className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 font-mono text-sm font-bold text-emerald-400">
                    AFTER: {activeItem.afterLabel}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400 max-w-sm">
                    Groomed to perfection. Ultrasonic deshedding, hand-scissored silhouette, and
                    botanical coat polish.
                  </p>
                </div>

                {/* Applied Salon Watermark Badge */}
                {isWatermarkEnabled && (
                  <div className="absolute bottom-4 right-4 rounded-xl border border-white/[0.15] bg-black/60 px-3 py-1.5 backdrop-blur-md">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-white">
                      <Sparkles className="h-3 w-3 text-periwinkle-300" />
                      <span>PAWTRACKR • {activeItem.petName.toUpperCase()}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Before Layer (Clipped by sliderPosition) */}
              <div
                className="absolute inset-y-0 left-0 overflow-hidden bg-gradient-to-br from-zinc-900 via-obsidian-900 to-stone-900 border-r-2 border-periwinkle-400"
                style={{ width: `${sliderPosition}%` }}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 w-[700px]">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/15 text-amber-300">
                    <Sliders className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 font-mono text-sm font-bold text-amber-300">
                    BEFORE: {activeItem.beforeLabel}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400 max-w-sm text-center">
                    Intake observation. Matted coat, debris accumulation, and unkempt ear fringe.
                  </p>
                </div>
              </div>

              {/* Slider Handle */}
              <div
                className="absolute inset-y-0 -ml-3 flex items-center pointer-events-none"
                style={{ left: `${sliderPosition}%` }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-periwinkle-500 text-obsidian-950 shadow-2xl">
                  <Sliders className="h-4 w-4" />
                </div>
              </div>

              {/* Draggable Range Overlay */}
              <input
                type="range"
                min={0}
                max={100}
                value={sliderPosition}
                onChange={(e) => setSliderPosition(Number(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
              />
            </div>

            {/* Slider Instructions */}
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
              <span>← Drag slider left for AFTER</span>
              <span className="font-mono text-periwinkle-300 font-bold">{sliderPosition}% Split</span>
              <span>Drag slider right for BEFORE →</span>
            </div>
          </div>

          {/* Privacy & EXIF Inspector Panel (4 Cols) */}
          <div className="space-y-4 lg:col-span-4">
            <div className="rounded-3xl border border-white/[0.08] bg-obsidian-900/70 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  EXIF Privacy Sanitizer
                </span>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                  AUTO-STRIP ACTIVE
                </span>
              </div>

              <p className="text-xs text-zinc-400">
                To protect client privacy, mobile van photos are stripped of all embedded
                camera metadata and GPS residential coordinates prior to cloud sync.
              </p>

              <div className="rounded-2xl border border-white/[0.08] bg-obsidian-950 p-3.5 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-500">GPS Coordinates:</span>
                  <span className="text-rose-400 line-through">34.0195, -118.4912</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Camera Device:</span>
                  <span className="text-rose-400 line-through">Apple iPhone 15 Pro</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Sanitized Status:</span>
                  <span className="text-emerald-400 font-bold">100% Zero PII Bleed</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-periwinkle-500 py-2.5 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow transition hover:bg-periwinkle-400"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Generate VIP Pet Parent Showcase Link
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export High-Res Watermarked PNG
                </button>
              </div>
            </div>

            {/* Pet Gallery Selector */}
            <div className="rounded-3xl border border-white/[0.08] bg-obsidian-900/70 p-5 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                Recent Transformations ({items.length})
              </span>
              <div className="space-y-2">
                {items.map((item) => {
                  const isSelected = item.id === selectedItemId;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? 'border-periwinkle-500/60 bg-periwinkle-500/15'
                          : 'border-white/[0.08] bg-obsidian-950 hover:border-white/[0.15]'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{item.petName}</div>
                        <div className="text-[11px] text-zinc-400">{item.styleTag}</div>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-500">{item.date}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
