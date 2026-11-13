'use client';

import React, { useState, useEffect } from 'react';
import { X, Sparkles, CheckCircle2, AlertCircle, FileText, Send, Save } from 'lucide-react';
import {
  COAT_CONDITIONS,
  CoatCondition,
  formatReportCardSummary,
} from '@/lib/live-communications';

export type ReportCardModalProps = {
  isOpen: boolean;
  onClose: () => void;
  visit: {
    id: string;
    pet_name: string;
    client_name: string;
    service_package: string;
    status: string;
  } | null;
  groomerName: string;
  onSuccess: (message: string) => void;
  getAccessToken: () => Promise<string | null>;
};

const COMMON_BEHAVIOR_TAGS = [
  'calm',
  'cooperative',
  'happy_tail',
  'gentle',
  'nervous_feet',
  'wiggly',
  'sensitive_ears',
  'vocal',
  'high_energy',
];

export default function ReportCardModal({
  isOpen,
  onClose,
  visit,
  groomerName,
  onSuccess,
  getAccessToken,
}: ReportCardModalProps) {
  const [coatCondition, setCoatCondition] = useState<CoatCondition>('good');
  const [behaviorTags, setBehaviorTags] = useState<string[]>(['calm']);
  const [careNotes, setCareNotes] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardStatus, setCardStatus] = useState<'draft' | 'published'>('draft');

  const canPublish = visit
    ? ['ready', 'paid', 'partly_completed', 'completed'].includes(visit.status)
    : false;

  // Load existing report card if any
  useEffect(() => {
    if (!isOpen || !visit) return;
    setError(null);

    async function loadCard() {
      try {
        const token = await getAccessToken();
        if (!token) return;

        const res = await fetch(`/api/visits/${visit!.id}/report-card`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const body = await res.json();
          if (body.reportCard) {
            setCoatCondition(body.reportCard.coat_condition || 'good');
            setBehaviorTags(body.reportCard.behavior_tags || ['calm']);
            setCareNotes(body.reportCard.care_notes || '');
            setRecommendations(body.reportCard.recommendations || '');
            setCardStatus(body.reportCard.status || 'draft');
          }
        }
      } catch (err) {
        console.error('Failed to load report card', err);
      }
    }

    void loadCard();
  }, [isOpen, visit, getAccessToken]);

  if (!isOpen || !visit) return null;

  const toggleTag = (tag: string) => {
    setBehaviorTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSave = async (action: 'draft' | 'publish') => {
    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('You must be signed in.');

      const res = await fetch(`/api/visits/${visit.id}/report-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          coatCondition,
          behaviorTags,
          careNotes,
          recommendations,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to save report card.');
      }

      onSuccess(
        action === 'publish'
          ? `Report card published for ${visit.pet_name} and client notified!`
          : `Report card draft saved for ${visit.pet_name}.`
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report card operation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 p-4 backdrop-blur-sm">
      <div className="glass-card relative max-h-[92vh] w-full max-w-xl overflow-y-auto p-5 sm:p-6 text-zinc-100 border border-white/15">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-periwinkle-400/30 bg-periwinkle-500/10 text-periwinkle-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">
              Pet Report Card (WF07)
            </h3>
            <p className="text-xs text-zinc-400">
              {visit.pet_name} · Parent: {visit.client_name} · Package: {visit.service_package}
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-4 text-xs">
          {/* Status notice */}
          <div className="rounded-lg border border-white/10 bg-obsidian-900/60 p-2.5 flex items-center justify-between">
            <span className="text-zinc-400">Current Visit Status:</span>
            <span className="font-mono font-bold text-periwinkle-300 uppercase">
              {visit.status}
            </span>
          </div>

          {!canPublish && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 flex items-start gap-2 text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Report card can be drafted now, but can only be published once the pet reaches{' '}
                <strong>Ready</strong> or <strong>Completed</strong>.
              </span>
            </div>
          )}

          {/* Coat Condition */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Coat Condition:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COAT_CONDITIONS.map((cond) => {
                const isSelected = coatCondition === cond;
                return (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => setCoatCondition(cond)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                      isSelected
                        ? 'border-periwinkle-400 bg-periwinkle-500/20 text-white'
                        : 'border-white/10 bg-obsidian-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {cond.replace(/_/g, ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Behavior on Table Tags */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Behavior Tags:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_BEHAVIOR_TAGS.map((tag) => {
                const isSelected = behaviorTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                        : 'border-white/10 bg-obsidian-900/80 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {tag.replace(/_/g, ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Care Notes */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Care Notes (Shampoos, coat treatment, ears, teeth):
            </label>
            <textarea
              rows={2}
              value={careNotes}
              onChange={(e) => setCareNotes(e.target.value)}
              placeholder="e.g. Oatmeal bath applied; coat de-shedded thoroughly; ears cleaned and checked."
              className="w-full rounded-lg border border-white/15 bg-obsidian-900 p-2.5 text-xs text-white focus:border-periwinkle-400"
            />
          </div>

          {/* Recommendations for Pet Parent */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Groomer Recommendations (Home brushing, recall frequency):
            </label>
            <textarea
              rows={2}
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              placeholder="e.g. Daily line brushing recommended. Schedule next bath in 4-6 weeks."
              className="w-full rounded-lg border border-white/15 bg-obsidian-900 p-2.5 text-xs text-white focus:border-periwinkle-400"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => void handleSave('draft')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" /> Save Draft
          </button>

          <button
            type="button"
            disabled={loading || !canPublish}
            onClick={() => void handleSave('publish')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-obsidian-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" /> Publish & Notify Client (WF07)
          </button>
        </div>
      </div>
    </div>
  );
}
