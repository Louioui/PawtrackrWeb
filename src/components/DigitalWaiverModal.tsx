'use client';

import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  FileSignature,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Client, Pet } from '@/types/database';
import { BehaviorAuraBadge } from './BehaviorAuraBadge';

interface DigitalWaiverModalProps {
  pet: Pet;
  client: Client;
  businessName: string;
  onClose: () => void;
  onSigned: (waiverRecord: {
    petId: string;
    hash: string;
    signedAt: string;
    signerName: string;
  }) => void;
}

export function DigitalWaiverModal({
  pet,
  client,
  businessName,
  onClose,
  onSigned,
}: DigitalWaiverModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [signerName, setSignerName] = useState(client.name);
  const [agreedMatted, setAgreedMatted] = useState(true);
  const [agreedSeniorOrSafety, setAgreedSeniorOrSafety] = useState(true);

  const startDraw = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX =
      'touches' in e ? e.touches[0].clientX : e.nativeEvent.clientX;
    const clientY =
      'touches' in e ? e.touches[0].clientY : e.nativeEvent.clientY;

    ctx.strokeStyle = '#8B95FF';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
    setHasStroke(true);
  };

  const moveDraw = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX =
      'touches' in e ? e.touches[0].clientX : e.nativeEvent.clientX;
    const clientY =
      'touches' in e ? e.touches[0].clientY : e.nativeEvent.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDraw = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const handleCompleteWaiver = (e: React.FormEvent) => {
    e.preventDefault();
    const hash = `WAIVER-RLS-${pet.id.toUpperCase()}-${Date.now()
      .toString(36)
      .toUpperCase()}`;
    onSigned({
      petId: pet.id,
      hash,
      signedAt: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      signerName,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/[0.12] bg-obsidian-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-obsidian-900/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-periwinkle-500/40 bg-periwinkle-500/15 text-periwinkle-400">
              <FileSignature className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Digital Coat & Safety Liability Release
              </h2>
              <p className="text-xs text-zinc-400">
                {businessName} • Pet: <span className="text-white">{pet.name}</span>{' '}
                ({pet.breed})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-white/[0.08] p-2 text-zinc-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleCompleteWaiver} className="space-y-4 p-6">
          {/* Active Safety Flags Requiring Waiver */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
                <ShieldAlert className="h-4 w-4" />
                Triggered by Active Behavior Auras
              </span>
              <div className="flex flex-wrap gap-1.5">
                {pet.behavior_tags.map((tag) => (
                  <BehaviorAuraBadge key={tag} tag={tag} size="xs" />
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-200 leading-relaxed">
              {pet.behavior_notes}
            </p>
          </div>

          {/* Legal Checkboxes */}
          <div className="space-y-2.5 rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4 text-xs text-zinc-300">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedMatted}
                onChange={(e) => setAgreedMatted(e.target.checked)}
                required
                className="mt-0.5 h-4 w-4 rounded border-zinc-600 accent-periwinkle-500"
              />
              <span>
                <strong className="text-white">
                  Humane Dematting & Coat Rescue Release:
                </strong>{' '}
                I authorize {businessName} to perform humane dematting or clip
                tightly pelted areas close to the skin to prioritize{' '}
                {pet.name}&apos;s comfort and skin safety.
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedSeniorOrSafety}
                onChange={(e) => setAgreedSeniorOrSafety(e.target.checked)}
                required
                className="mt-0.5 h-4 w-4 rounded border-zinc-600 accent-periwinkle-500"
              />
              <span>
                <strong className="text-white">
                  Senior / Cardiac & Fear-Free Handling Protocol:
                </strong>{' '}
                I understand comfort-first grooming prioritizes low stress over
                cosmetic perfection, and I authorize 2-person gentle handling or
                soft basket muzzle usage if needed for paw/nail safety.
              </span>
            </label>
          </div>

          {/* Interactive Signature Canvas */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-300">
                Draw Finger / Stylus Signature Below (or Confirm Typed Legal
                Sign-off)
              </span>
              <button
                type="button"
                onClick={clearSignature}
                className="inline-flex items-center gap-1 text-zinc-400 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Clear Pad
              </button>
            </div>
            <div className="mt-1.5 overflow-hidden rounded-2xl border border-periwinkle-500/40 bg-obsidian-950">
              <canvas
                ref={canvasRef}
                width={580}
                height={115}
                onMouseDown={startDraw}
                onMouseMove={moveDraw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={moveDraw}
                onTouchEnd={stopDraw}
                className="w-full cursor-crosshair touch-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-400">
                Legal Signer Name (Pet Parent)
              </label>
              <input
                type="text"
                required
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-xs text-white"
              />
            </div>
            <div className="flex flex-col justify-end">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400"
              >
                <ShieldCheck className="h-4 w-4" />
                {hasStroke
                  ? 'Certify Drawn Signature & Attach to File'
                  : 'Certify E-Signature & Attach to File'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
