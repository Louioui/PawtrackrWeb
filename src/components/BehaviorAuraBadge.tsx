import React from 'react';
import {
  AlertTriangle,
  HeartPulse,
  Scissors,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react';
import { BehaviorTag } from '@/types/database';

interface AuraStyleConfig {
  label: string;
  shortDesc: string;
  classes: string;
  dotColor: string;
  pulse: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}

export const BEHAVIOR_AURA_MAP: Record<BehaviorTag, AuraStyleConfig> = {
  biter: {
    label: 'BITE RISK ALERT',
    shortDesc: 'Two-person hold or soft basket muzzle required for paws/nails',
    classes:
      'bg-rose-500/15 text-rose-300 border-rose-500/40 shadow-[0_0_20px_-4px_rgba(244,63,94,0.45)]',
    dotColor: 'bg-rose-400',
    pulse: true,
    Icon: ShieldAlert,
  },
  matted: {
    label: 'MATTED COAT',
    shortDesc: 'High-density tangles/pelting — humane demat release signed',
    classes:
      'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-[0_0_18px_-4px_rgba(245,158,11,0.38)]',
    dotColor: 'bg-amber-400',
    pulse: true,
    Icon: Scissors,
  },
  senior: {
    label: 'SENIOR SANCTUARY',
    shortDesc: 'Orthopedic belly sling & low-fatigue 20m standing intervals',
    classes:
      'bg-purple-500/15 text-purple-300 border-purple-500/40 shadow-[0_0_18px_-4px_rgba(168,85,247,0.35)]',
    dotColor: 'bg-purple-400',
    pulse: false,
    Icon: Sparkles,
  },
  heart_murmur: {
    label: 'HEART MURMUR',
    shortDesc: 'Medical flag: monitor respiration & avoid warm cage dryers',
    classes:
      'bg-pink-500/15 text-pink-300 border-pink-500/40 shadow-[0_0_20px_-4px_rgba(236,72,153,0.42)]',
    dotColor: 'bg-pink-400',
    pulse: true,
    Icon: HeartPulse,
  },
  anxious: {
    label: 'DRYER / NOISE SENSITIVE',
    shortDesc: 'Use acoustic happy-hoodie & low-velocity warm air',
    classes:
      'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-[0_0_16px_-4px_rgba(6,182,212,0.35)]',
    dotColor: 'bg-cyan-400',
    pulse: false,
    Icon: Zap,
  },
  cage_reactive: {
    label: 'OPEN-SUITE ONLY',
    shortDesc: 'Cage-reactive — assign to open-top floor suite',
    classes:
      'bg-orange-500/15 text-orange-300 border-orange-500/40 shadow-[0_0_16px_-4px_rgba(249,115,22,0.35)]',
    dotColor: 'bg-orange-400',
    pulse: false,
    Icon: AlertTriangle,
  },
  extra_care: {
    label: 'EXTRA CARE VIP',
    shortDesc: 'Extended buffer time allocated for gentle handling',
    classes:
      'bg-periwinkle-500/15 text-periwinkle-300 border-periwinkle-500/40 shadow-[0_0_16px_-4px_rgba(139,149,255,0.35)]',
    dotColor: 'bg-periwinkle-400',
    pulse: false,
    Icon: Sparkles,
  },
};

export function BehaviorAuraBadge({
  tag,
  size = 'sm',
}: {
  tag: BehaviorTag;
  size?: 'xs' | 'sm' | 'md';
}) {
  const config = BEHAVIOR_AURA_MAP[tag] ?? BEHAVIOR_AURA_MAP.extra_care;
  const { Icon } = config;

  const sizeClasses =
    size === 'xs'
      ? 'px-2 py-0.5 text-[10px] gap-1'
      : size === 'sm'
      ? 'px-2.5 py-1 text-[11px] gap-1.5'
      : 'px-3 py-1.5 text-xs gap-2';

  return (
    <span
      title={config.shortDesc}
      className={`inline-flex items-center rounded-full border font-semibold tracking-wider uppercase transition-all ${sizeClasses} ${config.classes}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${config.dotColor} ${
          config.pulse ? 'animate-ping' : ''
        }`}
      />
      <Icon className="h-3 w-3 shrink-0" />
      <span>{config.label}</span>
    </span>
  );
}
