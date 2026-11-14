'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserX,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Client, Pet, StaffMember, Visit } from '@/types/database';
import { BehaviorAuraBadge } from './BehaviorAuraBadge';

interface StaffAbsenceTriageModalProps {
  absentStaff: StaffMember;
  allStaff: StaffMember[];
  affectedVisits: Visit[];
  pets: Pet[];
  clients: Client[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmBatchReassignment: (
    reassignments: { visitId: string; newStaffId: string }[]
  ) => void;
}

interface MatchRecommendation {
  visit: Visit;
  pet?: Pet;
  client?: Client;
  recommendedStaff: StaffMember;
  confidenceScore: number; // e.g. 98
  matchReasons: string[];
  hazardWarnings: string[];
}

export function StaffAbsenceTriageModal({
  absentStaff,
  allStaff,
  affectedVisits,
  pets,
  clients,
  isOpen,
  onClose,
  onConfirmBatchReassignment,
}: StaffAbsenceTriageModalProps) {
  // Available replacement candidates (everyone except the absent staff member and front desk)
  const availableCandidates = useMemo(() => {
    return allStaff.filter(
      (s) => s.id !== absentStaff.id && s.role !== 'front_desk'
    );
  }, [allStaff, absentStaff.id]);

  // Map of visitId -> chosen staffId
  const [selectedReplacements, setSelectedReplacements] = useState<
    Record<string, string>
  >({});
  const [isApplying, setIsApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const [showSmsPreview, setShowSmsPreview] = useState(true);

  // Compute AI Match Recommendations for each affected visit
  const recommendations: MatchRecommendation[] = useMemo(() => {
    return affectedVisits.map((visit) => {
      const pet = pets.find((p) => p.id === visit.pet_id);
      const client = clients.find((c) => c.id === visit.client_id);

      const petTags = pet?.behavior_tags || [];
      const hasBiteRisk = petTags.includes('biter');
      const hasMatted = petTags.includes('matted');
      const isSenior = petTags.includes('senior') || petTags.includes('heart_murmur');
      const needsExtraCare = petTags.includes('extra_care') || petTags.includes('anxious');

      // Score each candidate
      let bestCandidate = availableCandidates[0];
      let bestScore = 0;
      let bestReasons: string[] = [];
      let bestWarnings: string[] = [];

      for (const candidate of availableCandidates) {
        let score = 80;
        const reasons: string[] = [];
        const warnings: string[] = [];

        // Specialty alignment
        const specialtyLower = candidate.specialty.toLowerCase();
        if (hasBiteRisk) {
          if (specialtyLower.includes('fear-free') || specialtyLower.includes('master') || candidate.role === 'owner') {
            score += 15;
            reasons.push('Certified for high-hazard handling & bite-risk protocols');
          } else {
            score -= 20;
            warnings.push('Does not hold advanced bite-prevention credential');
          }
        }

        if (isSenior || needsExtraCare) {
          if (specialtyLower.includes('fear-free') || specialtyLower.includes('gentle') || specialtyLower.includes('senior')) {
            score += 12;
            reasons.push('Specialized in low-stress sanctuary & senior pet care');
          }
        }

        if (hasMatted && (specialtyLower.includes('stylist') || specialtyLower.includes('coat'))) {
          score += 10;
          reasons.push('Expert scissor finish & de-matting rescue');
        }

        // Workload factor: stylists with fewer dogs get preference
        if (candidate.active_dogs_count <= 2) {
          score += 8;
          reasons.push(`Low workload slot available (${candidate.active_dogs_count} active dogs)`);
        } else {
          score -= 5;
        }

        const normalizedScore = Math.min(99, Math.max(65, score));
        if (normalizedScore > bestScore) {
          bestScore = normalizedScore;
          bestCandidate = candidate;
          bestReasons = reasons;
          bestWarnings = warnings;
        }
      }

      if (bestReasons.length === 0) {
        bestReasons.push('Available schedule gap matching appointment window');
      }

      return {
        visit,
        pet,
        client,
        recommendedStaff: bestCandidate,
        confidenceScore: bestScore,
        matchReasons: bestReasons,
        hazardWarnings: bestWarnings,
      };
    });
  }, [affectedVisits, pets, clients, availableCandidates]);

  // Initialize selected replacements to AI recommendations
  React.useEffect(() => {
    const initialMap: Record<string, string> = {};
    for (const rec of recommendations) {
      if (rec.recommendedStaff) {
        initialMap[rec.visit.id] = rec.recommendedStaff.id;
      }
    }
    setSelectedReplacements(initialMap);
  }, [recommendations]);

  if (!isOpen) return null;

  const handleApplyBatch = () => {
    setIsApplying(true);
    const reassignments = Object.entries(selectedReplacements).map(
      ([visitId, newStaffId]) => ({ visitId, newStaffId })
    );

    setTimeout(() => {
      onConfirmBatchReassignment(reassignments);
      setIsApplying(false);
      setAppliedSuccess(true);
      setTimeout(() => {
        onClose();
        setAppliedSuccess(false);
      }, 1000);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.12] bg-obsidian-900 p-6 sm:p-8 shadow-2xl text-zinc-100">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                Smart Triage Engine Active
              </div>
              <h2 className="text-xl font-bold text-white mt-1">
                Staff Absence Crisis Management: {absentStaff.name}
              </h2>
              <p className="text-xs text-zinc-400">
                {affectedVisits.length} appointments require reassignment today. AI match scoring automatically accounts for pet behavior hazards and staff skill tiers.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Affected Appointments List */}
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
            <span>Orphaned Appointments & Recommended Match</span>
            <span className="text-periwinkle-300 flex items-center gap-1">
              <Bot className="h-3.5 w-3.5" /> AI Confidence Engine
            </span>
          </div>

          {recommendations.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-obsidian-950 p-6 text-center text-xs text-zinc-400">
              No active appointments found for {absentStaff.name} today.
            </div>
          ) : (
            recommendations.map((rec) => {
              const currentChoice =
                selectedReplacements[rec.visit.id] || rec.recommendedStaff?.id;
              const chosenStaff = allStaff.find((s) => s.id === currentChoice);

              return (
                <div
                  key={rec.visit.id}
                  className="rounded-2xl border border-white/[0.08] bg-obsidian-950 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-periwinkle-300">
                        {rec.visit.time_label}
                      </span>
                      <span className="text-xs font-bold text-white">
                        {rec.pet?.name || 'Pet'} ({rec.pet?.breed})
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        • {rec.client?.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-periwinkle-500/15 border border-periwinkle-500/30 px-2.5 py-0.5 text-[10px] font-bold text-periwinkle-300">
                        {rec.confidenceScore}% AI Match
                      </span>
                    </div>
                  </div>

                  {/* Behavior Tags */}
                  {rec.pet && rec.pet.behavior_tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 mr-1">
                        Hazard Auras:
                      </span>
                      {rec.pet.behavior_tags.map((tag) => (
                        <BehaviorAuraBadge key={tag} tag={tag} />
                      ))}
                    </div>
                  )}

                  {/* AI Match Rationale */}
                  <div className="text-xs text-zinc-300 space-y-1 bg-obsidian-900/60 p-2.5 rounded-xl border border-white/[0.04]">
                    <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Match Rationale:
                    </div>
                    {rec.matchReasons.map((reason, idx) => (
                      <div key={idx} className="text-[11px] text-zinc-400 pl-5">
                        • {reason}
                      </div>
                    ))}
                    {rec.hazardWarnings.length > 0 && (
                      <div className="text-[11px] text-amber-300 pl-5 pt-1">
                        ⚠️ Note: {rec.hazardWarnings.join('; ')}
                      </div>
                    )}
                  </div>

                  {/* Replacement Selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="text-xs text-zinc-400">
                      Reassign from <span className="line-through text-zinc-500">{absentStaff.name}</span> to:
                    </div>

                    <select
                      value={currentChoice}
                      onChange={(e) =>
                        setSelectedReplacements((prev) => ({
                          ...prev,
                          [rec.visit.id]: e.target.value,
                        }))
                      }
                      className="rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-1.5 text-xs text-white focus:border-periwinkle-500 focus:outline-none"
                    >
                      {availableCandidates.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.name} ({staff.role} • {staff.specialty})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* SMS Preview Drawer */}
        {showSmsPreview && recommendations.length > 0 && (
          <div className="mt-6 rounded-2xl border border-periwinkle-500/30 bg-periwinkle-500/10 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-periwinkle-300 flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" /> Automated Client SMS Notification Preview
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">
                Triggered on 1-Tap Reassignment
              </span>
            </div>
            <p className="font-mono text-zinc-200 bg-obsidian-950/80 p-3 rounded-xl border border-white/[0.08] text-[11px] leading-relaxed">
              &quot;Hi Sophia, your stylist {absentStaff.name} is unexpectedly on medical leave today. To preserve your slot with zero disruption, we have reassigned Bello to Senior Specialist Julian Kwon at 10:30 AM. Reply 1 to confirm or visit your portal link to reschedule.&quot;
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/[0.1] px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white transition"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isApplying || appliedSuccess || recommendations.length === 0}
            onClick={handleApplyBatch}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-bold text-obsidian-950 hover:bg-amber-400 transition shadow-lg disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            {isApplying
              ? 'Executing Batch Reassignment...'
              : appliedSuccess
              ? 'Appointments Reassigned & SMS Queued!'
              : `1-Tap Batch Reassign (${affectedVisits.length} Appointments)`}
          </button>
        </div>
      </div>
    </div>
  );
}
