'use client';

import React, { useState } from 'react';
import { Check, Scissors, Sparkles } from 'lucide-react';

export interface AnatomicalZoneSpec {
  zone: string;
  bladeOrComb: string;
  notes: string;
}

const BLADE_PRESETS = [
  '1/2" CC Guard Comb',
  '3/8" Guard Comb',
  '#4F Blade (3/8")',
  '#5F Blade (1/4")',
  '#7F Blade (1/8")',
  '#10 Sanitary / Pads',
  'Hand Scissor / Donut',
  'Plume / Natural Trim',
];

const DEFAULT_ZONES_BY_PET: Record<string, AnatomicalZoneSpec[]> = {
  'pet-101': [
    {
      zone: 'Head & Muzzle',
      bladeOrComb: 'Hand Scissor / Donut',
      notes: 'Round Asian-fusion teddy muzzle, clear eye corners with #15',
    },
    {
      zone: 'Ears',
      bladeOrComb: '1/2" CC Guard Comb',
      notes: 'Chin-length rounded bell ears, detangle behind base gently',
    },
    {
      zone: 'Body & Back',
      bladeOrComb: '3/8" Guard Comb',
      notes: 'Plush velvet body length following coat lay',
    },
    {
      zone: 'Legs & Columns',
      bladeOrComb: '1/2" CC Guard Comb',
      notes: 'Cylindrical column legs fluffed & hand-scissored',
    },
    {
      zone: 'Paws & Sanitary',
      bladeOrComb: '#10 Sanitary / Pads',
      notes: 'Scoop paw pads clean, round bevel poodles feet + Manuka balm',
    },
    {
      zone: 'Tail',
      bladeOrComb: 'Plume / Natural Trim',
      notes: 'Full flag plume, take 1 inch off tip only',
    },
  ],
};

export function AnatomicalCutCard({
  petId,
  petName,
  editable = true,
}: {
  petId: string;
  petName: string;
  editable?: boolean;
}) {
  const initialZones = DEFAULT_ZONES_BY_PET[petId] ?? [
    {
      zone: 'Head & Muzzle',
      bladeOrComb: 'Hand Scissor / Donut',
      notes: 'Visor clear, rounded cheek blend',
    },
    {
      zone: 'Ears',
      bladeOrComb: '3/8" Guard Comb',
      notes: 'Neat bevel along leather edge',
    },
    {
      zone: 'Body & Back',
      bladeOrComb: '#4F Blade (3/8")',
      notes: 'Even clip with coat growth',
    },
    {
      zone: 'Legs & Columns',
      bladeOrComb: '1/2" CC Guard Comb',
      notes: 'Scissor blend into body',
    },
    {
      zone: 'Paws & Sanitary',
      bladeOrComb: '#10 Sanitary / Pads',
      notes: 'Pad shave + Dremel nail round',
    },
    {
      zone: 'Tail',
      bladeOrComb: 'Plume / Natural Trim',
      notes: 'Feathered natural shape',
    },
  ];

  const [zones, setZones] = useState<AnatomicalZoneSpec[]>(initialZones);
  const [savedToast, setSavedToast] = useState(false);

  const cycleBlade = (idx: number) => {
    if (!editable) return;
    setZones((prev) =>
      prev.map((z, i) => {
        if (i !== idx) return z;
        const currIndex = BLADE_PRESETS.indexOf(z.bladeOrComb);
        const nextBlade =
          BLADE_PRESETS[(currIndex + 1) % BLADE_PRESETS.length];
        return { ...z, bladeOrComb: nextBlade };
      })
    );
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1800);
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-periwinkle-300">
          <Scissors className="h-3.5 w-3.5 text-periwinkle-400" />
          <span>6-Zone Anatomical Blade & Guard Blueprint</span>
        </div>
        {savedToast ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
            <Check className="h-3 w-3" />
            Synced
          </span>
        ) : (
          editable && (
            <span className="text-[10px] text-zinc-400">
              Tap any zone to cycle blade/comb
            </span>
          )
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {zones.map((item, idx) => (
          <button
            key={item.zone}
            type="button"
            onClick={() => cycleBlade(idx)}
            className={`flex flex-col justify-between rounded-xl border border-white/[0.07] bg-obsidian-800/90 p-2.5 text-left transition ${
              editable
                ? 'hover:border-periwinkle-500/50 active:scale-[0.99]'
                : 'cursor-default'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-bold text-white">
                {item.zone}
              </span>
              <span className="rounded-md border border-periwinkle-500/35 bg-periwinkle-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-periwinkle-300">
                {item.bladeOrComb}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-400 leading-snug">
              {item.notes}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
