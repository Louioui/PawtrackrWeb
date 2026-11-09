'use client';

import React, { useState } from 'react';
import {
  Camera,
  CheckCircle2,
  MessageSquare,
  Send,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Client, GroomingPhotoPair, Pet, Visit } from '@/types/database';

interface ReportCardPublisherModalProps {
  visit: Visit;
  pet: Pet;
  client: Client;
  stylistName: string;
  onClose: () => void;
  onPublish: (payload: {
    visitId: string;
    petId: string;
    weightLogged: number;
    reportCardNotes: string;
    newPhotoPair: GroomingPhotoPair;
    sendReadySms: boolean;
  }) => void;
}

const PRESET_BEFORE_PHOTOS = [
  'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?auto=format&fit=crop&w=800&q=80',
];

const PRESET_AFTER_PHOTOS = [
  'https://images.unsplash.com/photo-1591769225440-811ad7d6eab3?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=800&q=80',
];

export function ReportCardPublisherModal({
  visit,
  pet,
  client,
  stylistName,
  onClose,
  onPublish,
}: ReportCardPublisherModalProps) {
  const [beforeUrl, setBeforeUrl] = useState<string>(PRESET_BEFORE_PHOTOS[0]);
  const [afterUrl, setAfterUrl] = useState<string>(PRESET_AFTER_PHOTOS[0]);
  const [beforeCaption, setBeforeCaption] = useState<string>(
    'Intake coat check: dense curls behind ears & damp paw pads.'
  );
  const [afterCaption, setAfterCaption] = useState<string>(
    'Completed warm ozone hydro-bath, hand-scissored columns & blueberry facial!'
  );
  const [coatScore, setCoatScore] = useState<number>(9.7);
  const [weightLogged, setWeightLogged] = useState<string>(
    String(visit.weight_logged_lbs || pet.weight_lbs)
  );
  const [notes, setNotes] = useState<string>(visit.report_card_notes);
  const [sendReadySms, setSendReadySms] = useState<boolean>(true);

  const handleFilePreview = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'before' | 'after'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    if (target === 'before') {
      setBeforeUrl(objectUrl);
    } else {
      setAfterUrl(objectUrl);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newPair: GroomingPhotoPair = {
      id: `gal-${Date.now().toString(36)}`,
      visit_date: 'Nov 07, 2026 (Just Published)',
      package_name: visit.package_name,
      groomer_name: stylistName,
      before_url: beforeUrl,
      after_url: afterUrl,
      before_caption: beforeCaption,
      after_caption: afterCaption,
      coat_condition_score: coatScore,
    };

    onPublish({
      visitId: visit.id,
      petId: pet.id,
      weightLogged: parseFloat(weightLogged) || pet.weight_lbs,
      reportCardNotes: notes,
      newPhotoPair: newPair,
      sendReadySms,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/[0.12] bg-obsidian-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-obsidian-900/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Before & After Cloud Uploader + Digital Report Card
              </h2>
              <p className="text-xs text-zinc-400">
                Bucket:{' '}
                <code className="text-periwinkle-300">
                  grooming-photos/{visit.business_id.slice(0, 8)}/{pet.id}
                </code>
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

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Before & After Photo Upload Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Before Photo */}
            <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-amber-300">
                  1. Before Intake Photo
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white/[0.07] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/[0.14]">
                  <Upload className="h-3 w-3" />
                  Upload File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFilePreview(e, 'before')}
                    className="hidden"
                  />
                </label>
              </div>
              <img
                src={beforeUrl}
                alt="Before preview"
                className="mt-2.5 h-40 w-full rounded-xl object-cover"
              />
              <input
                type="text"
                value={beforeCaption}
                onChange={(e) => setBeforeCaption(e.target.value)}
                className="mt-2.5 w-full rounded-lg border border-white/[0.1] bg-obsidian-800 px-2.5 py-1.5 text-xs text-zinc-200"
              />
            </div>

            {/* After Photo */}
            <div className="rounded-2xl border border-emerald-500/35 bg-obsidian-900/80 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-emerald-300">
                  2. After Finish Photo
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/30">
                  <Upload className="h-3 w-3" />
                  Upload File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFilePreview(e, 'after')}
                    className="hidden"
                  />
                </label>
              </div>
              <img
                src={afterUrl}
                alt="After preview"
                className="mt-2.5 h-40 w-full rounded-xl object-cover"
              />
              <input
                type="text"
                value={afterCaption}
                onChange={(e) => setAfterCaption(e.target.value)}
                className="mt-2.5 w-full rounded-lg border border-white/[0.1] bg-obsidian-800 px-2.5 py-1.5 text-xs text-zinc-200"
              />
            </div>
          </div>

          {/* Vitals & Stylist Notes */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-300">
                Calibrated Scale Weight (lbs)
              </label>
              <input
                type="number"
                step="0.1"
                value={weightLogged}
                onChange={(e) => setWeightLogged(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 font-mono text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300">
                Coat Health & Hydration Score ({coatScore}/10)
              </label>
              <input
                type="range"
                min="7.0"
                max="10.0"
                step="0.1"
                value={coatScore}
                onChange={(e) => setCoatScore(parseFloat(e.target.value))}
                className="mt-3 w-full accent-emerald-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300">
              Stylist Digital Report Card Summary (Visible in Client Portal)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
            />
          </div>

          {/* Automated Ready-for-Pickup SMS Toggle */}
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-periwinkle-500/35 bg-periwinkle-500/10 p-4 text-xs">
            <input
              type="checkbox"
              checked={sendReadySms}
              onChange={(e) => setSendReadySms(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-periwinkle-500"
            />
            <div>
              <div className="flex items-center gap-1.5 font-bold text-white">
                <MessageSquare className="h-3.5 w-3.5 text-periwinkle-400" />
                <span>
                  Auto-Text &ldquo;Ready for Pickup + Report Card Link&rdquo; to{' '}
                  {client.name} ({client.phone})
                </span>
              </div>
              <p className="mt-1 text-zinc-300">
                Advances visit status to{' '}
                <strong className="text-amber-300">READY FOR PICKUP</strong> and
                dispatches SMS with 1-tap link to{' '}
                <code className="text-periwinkle-300">
                  /client/{client.id}
                </code>
                .
              </p>
            </div>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/[0.1] px-4 py-2.5 text-xs font-semibold text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-xs font-bold text-obsidian-950 shadow-emerald-glow hover:bg-emerald-400"
            >
              <Send className="h-3.5 w-3.5" />
              Publish Report Card & Notify Parent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
