'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  DollarSign,
  Edit2,
  Plus,
  Percent,
  Scissors,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { StaffMember, StaffRole } from '@/types/database';
import { formatCurrency } from '@/lib/pos-math';

interface AdminStaffManagerProps {
  initialStaff: StaffMember[];
  onUpdateRoster?: (updatedStaff: StaffMember[]) => void;
}

export function AdminStaffManager({
  initialStaff,
  onUpdateRoster,
}: AdminStaffManagerProps) {
  const [roster, setRoster] = useState<StaffMember[]>(initialStaff);
  const [defaultCommissionRate, setDefaultCommissionRate] = useState<number>(50.0);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

  // New staff draft state
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('groomer');
  const [newSpecialty, setNewSpecialty] = useState('Breed Standard Scissoring & De-shed');

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newMember: StaffMember = {
      id: `st-${Date.now()}`,
      business_id: roster[0]?.business_id || 'biz-bespoke',
      name: newName.trim(),
      role: newRole,
      specialty: newSpecialty.trim(),
      color_hex: '#8B95FF',
      active_dogs_count: 0,
    };

    const nextRoster = [...roster, newMember];
    setRoster(nextRoster);
    onUpdateRoster?.(nextRoster);
    setIsAddingNew(false);
    setNewName('');
    setNewSpecialty('Breed Standard Scissoring & De-shed');
  };

  const handleRemoveStaff = (id: string) => {
    const nextRoster = roster.filter((s) => s.id !== id);
    setRoster(nextRoster);
    onUpdateRoster?.(nextRoster);
  };

  return (
    <div className="space-y-8">
      {/* Header with Commission Split Config */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-periwinkle-500/15 border border-periwinkle-500/30 px-3 py-1 text-xs font-bold text-periwinkle-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            RBAC & Executive Payroll Governance
          </div>
          <h2 className="text-2xl font-bold text-white mt-1">
            Salon Staff Roster & Commission Splits
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Manage roles, table lane assignments, and automated period-lock commission tiers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-obsidian-900 px-3.5 py-2 text-xs">
            <span className="text-zinc-400">Standard Commission:</span>
            <span className="font-mono font-bold text-emerald-400">{defaultCommissionRate.toFixed(2)}%</span>
          </div>

          <button
            type="button"
            onClick={() => setIsAddingNew(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-periwinkle-500 px-4 py-2.5 text-xs font-bold text-obsidian-950 hover:bg-periwinkle-400 transition"
          >
            <Plus className="h-4 w-4" /> Add Team Member
          </button>
        </div>
      </div>

      {/* Add New Staff Form Drawer */}
      {isAddingNew && (
        <form
          onSubmit={handleAddStaff}
          className="rounded-2xl border border-periwinkle-500/30 bg-obsidian-900 p-5 space-y-4 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h3 className="text-sm font-bold text-white">Add New Team Member to Roster</h3>
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Rachel Sterling"
                className="w-full rounded-xl border border-white/[0.1] bg-obsidian-950 px-3 py-2 text-xs text-white focus:border-periwinkle-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Role & RBAC Tier
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as StaffRole)}
                className="w-full rounded-xl border border-white/[0.1] bg-obsidian-950 px-3 py-2 text-xs text-white focus:border-periwinkle-500 focus:outline-none"
              >
                <option value="owner">Owner (Full Admin Access)</option>
                <option value="groomer">Senior Stylist / Groomer</option>
                <option value="front_desk">Front Desk POS Concierge</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Handling Specialty
              </label>
              <input
                type="text"
                required
                value={newSpecialty}
                onChange={(e) => setNewSpecialty(e.target.value)}
                placeholder="e.g. Master Scissor & Anxious Care"
                className="w-full rounded-xl border border-white/[0.1] bg-obsidian-950 px-3 py-2 text-xs text-white focus:border-periwinkle-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="rounded-xl border border-white/[0.1] px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-periwinkle-500 px-5 py-2 text-xs font-bold text-obsidian-950 hover:bg-periwinkle-400"
            >
              Save Team Member
            </button>
          </div>
        </form>
      )}

      {/* Roster Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roster.map((staff) => (
          <div
            key={staff.id}
            className="rounded-2xl border border-white/[0.08] bg-obsidian-900 p-5 flex flex-col justify-between space-y-4 hover:border-periwinkle-500/30 transition group shadow-lg"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-periwinkle-300 transition">
                    {staff.name}
                  </h3>
                  <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-periwinkle-500/15 border border-periwinkle-500/30 text-periwinkle-300">
                    {staff.role}
                  </span>
                </div>

                <div className="h-9 w-9 rounded-xl bg-obsidian-950 border border-white/[0.08] flex items-center justify-center text-zinc-400 group-hover:text-white transition">
                  <Scissors className="h-4 w-4" />
                </div>
              </div>

              <div className="text-xs text-zinc-300 leading-relaxed bg-obsidian-950/80 p-3 rounded-xl border border-white/[0.05]">
                <div className="text-[10px] uppercase font-bold text-zinc-500">Core Specialty:</div>
                <div className="mt-0.5 font-medium">{staff.specialty}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-obsidian-950/60 border border-white/[0.04]">
                  <span className="text-[10px] text-zinc-400 block">Commission</span>
                  <span className="font-mono font-bold text-emerald-400">50.00%</span>
                </div>
                <div className="p-2.5 rounded-xl bg-obsidian-950/60 border border-white/[0.04]">
                  <span className="text-[10px] text-zinc-400 block">Active Load</span>
                  <span className="font-mono font-bold text-white">{staff.active_dogs_count} Dogs</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 text-xs">
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                <Smartphone className="h-3 w-3 text-emerald-400" /> Mobile Companion Active
              </span>

              {staff.role !== 'owner' && (
                <button
                  type="button"
                  onClick={() => handleRemoveStaff(staff.id)}
                  className="p-1.5 text-zinc-500 hover:text-red-400 transition"
                  title="Remove staff member"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sales & Competitive Positioning Intelligence Banner */}
      <div className="rounded-3xl border border-white/[0.1] bg-obsidian-900 p-6 sm:p-8 space-y-6">
        <div className="border-b border-white/[0.08] pb-4">
          <div className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
            Enterprise Moat & Market Dominance Intelligence
          </div>
          <h3 className="text-xl font-bold text-white mt-1">
            Pawtrackr Architecture vs Legacy Incumbents (MoeGo / Gingr / DaySmart)
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Predictable SaaS pricing ($119–$149/mo/location) backed by unassailable mathematical guarantees.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-2xl border border-white/[0.08] bg-obsidian-950 space-y-2">
            <div className="font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> $0.00 Drawer Variance Moat
            </div>
            <p className="text-zinc-300 text-[11px] leading-relaxed">
              Integer-cent math engine (<code className="text-zinc-200">pos-math.ts</code>) eliminates the floating-point arithmetic drift inherent in legacy web apps.
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-white/[0.08] bg-obsidian-950 space-y-2">
            <div className="font-bold text-periwinkle-300 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Database btree_gist Exclusion
            </div>
            <p className="text-zinc-300 text-[11px] leading-relaxed">
              Double-bookings are physically impossible at the PostgreSQL level, even under concurrent high-latency mobile conditions.
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-white/[0.08] bg-obsidian-950 space-y-2">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Smart Triage & Absence Shield
            </div>
            <p className="text-zinc-300 text-[11px] leading-relaxed">
              When a groomer calls out sick, AI matching reassigns bite-risk and senior pets to qualified stylists with 1-tap batch notifications.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
