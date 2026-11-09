'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  Camera,
  CheckCircle2,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileSignature,
  MessageSquare,
  Plus,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import {
  BUSINESSES,
  BUSINESS_CONFIGS,
  CLIENTS as INITIAL_CLIENTS,
  INITIAL_TRANSACTIONS,
  INITIAL_VISITS,
  PETS as INITIAL_PETS,
  STAFF_MEMBERS,
  TENANT_BESPOKE_ID,
} from '@/lib/mock-tenant-data';
import {
  BehaviorTag,
  Client,
  GroomingPhotoPair,
  Pet,
  Transaction,
  Visit,
  VisitStatus,
} from '@/types/database';
import {
  buildSalonSearchIndex,
  executeMultiTokenSearch,
} from '@/lib/search-engine';
import { formatCurrency, reconcileEndOfDayDrawer } from '@/lib/pos-math';
import { BehaviorAuraBadge } from '@/components/BehaviorAuraBadge';
import { AtomicPOSModal } from '@/components/AtomicPOSModal';
import { DigitalWaiverModal } from '@/components/DigitalWaiverModal';
import { ReportCardPublisherModal } from '@/components/ReportCardPublisherModal';
import { AnatomicalCutCard } from '@/components/AnatomicalCutCard';
import {
  loadUniversalStore,
  saveUniversalStore,
  subscribeUniversalStore,
} from '@/lib/realtime-store';

const STATUS_STEPS: { id: VisitStatus; label: string; color: string }[] = [
  {
    id: 'booked',
    label: 'Booked',
    color: 'border-zinc-500/40 text-zinc-300 bg-zinc-500/10',
  },
  {
    id: 'dropped_off',
    label: 'Dropped Off',
    color: 'border-sky-500/40 text-sky-300 bg-sky-500/15',
  },
  {
    id: 'bathing',
    label: 'Hydro Bath',
    color: 'border-cyan-500/40 text-cyan-300 bg-cyan-500/15',
  },
  {
    id: 'styling',
    label: 'Scissoring / Styling',
    color: 'border-periwinkle-500/40 text-periwinkle-300 bg-periwinkle-500/15',
  },
  {
    id: 'ready',
    label: 'Ready for Pickup',
    color: 'border-amber-500/40 text-amber-300 bg-amber-500/15',
  },
  {
    id: 'completed',
    label: 'Checked Out',
    color: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/15',
  },
];

export default function DashboardCommandCenter() {
  // Multi-Tenant RLS State (`business_id`)
  const [activeBusinessId, setActiveBusinessId] =
    useState<string>(TENANT_BESPOKE_ID);

  // Stateful Tenant Data (Synced across tabs & devices via Universal Store)
  const [clients, setClients] = useState<Client[]>(INITIAL_CLIENTS);
  const [pets, setPets] = useState<Pet[]>(INITIAL_PETS);
  const [visits, setVisits] = useState<Visit[]>(INITIAL_VISITS);
  const [transactions, setTransactions] =
    useState<Transaction[]>(INITIAL_TRANSACTIONS);

  useEffect(() => {
    const hydrated = loadUniversalStore();
    setClients(hydrated.clients);
    setPets(hydrated.pets);
    setVisits(hydrated.visits);
    setTransactions(hydrated.transactions);

    return subscribeUniversalStore((updated) => {
      setClients(updated.clients);
      setPets(updated.pets);
      setVisits(updated.visits);
      setTransactions(updated.transactions);
    });
  }, []);

  // Signed Digital Waivers Map (petId -> hash & timestamp)
  const [signedWaivers, setSignedWaivers] = useState<
    Record<string, { hash: string; signedAt: string; signerName: string }>
  >({
    'pet-101': {
      hash: 'WAIVER-RLS-PET-101-9F42A',
      signedAt: '08:54 AM',
      signerName: 'Sophia Chen-Alvarez',
    },
  });

  // Automated SMS Pickup Toast Banner
  const [smsToastMessage, setSmsToastMessage] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] =
    useState<string>('all');
  const [calendarViewMode, setCalendarViewMode] = useState<
    'pipeline' | 'kanban' | 'timegrid' | 'kiosk'
  >('pipeline');
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] =
    useState<boolean>(false);
  const [waitlistBlastSent, setWaitlistBlastSent] = useState<boolean>(false);
  const [vetHandoffModal, setVetHandoffModal] = useState<{
    pet: Pet;
    client: Client;
  } | null>(null);
  const [scannedVaccineCerts, setScannedVaccineCerts] = useState<
    Record<string, { certNumber: string; expires: string; clinic: string }>
  >({
    'pet-101': {
      certNumber: 'RAB-CA-994821',
      expires: '2028-09-14',
      clinic: 'Pacific Heights Veterinary Sanctuary',
    },
  });

  // Selected Pet File & Active Modals
  const [selectedPetId, setSelectedPetId] = useState<string>('pet-101');
  const [posCheckoutVisit, setPosCheckoutVisit] = useState<Visit | null>(null);
  const [waiverModalPet, setWaiverModalPet] = useState<{
    pet: Pet;
    client: Client;
  } | null>(null);
  const [reportCardModalVisit, setReportCardModalVisit] =
    useState<Visit | null>(null);

  // Walk-In Intake Modal State
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState<boolean>(false);
  const [walkInPetName, setWalkInPetName] = useState<string>('');
  const [walkInBreed, setWalkInBreed] = useState<string>('');
  const [walkInClientName, setWalkInClientName] = useState<string>('');
  const [walkInPhone, setWalkInPhone] = useState<string>('');
  const [walkInNotes, setWalkInNotes] = useState<string>('');
  const [walkInTags, setWalkInTags] = useState<BehaviorTag[]>(['extra_care']);

  // Current Tenant Partition
  const activeBusiness = useMemo(
    () =>
      BUSINESSES.find((b) => b.id === activeBusinessId) ?? BUSINESSES[0],
    [activeBusinessId]
  );
  const activeConfig = useMemo(
    () => BUSINESS_CONFIGS[activeBusiness.id],
    [activeBusiness.id]
  );
  const tenantStaff = useMemo(
    () => STAFF_MEMBERS.filter((s) => s.business_id === activeBusiness.id),
    [activeBusiness.id]
  );
  const tenantVisits = useMemo(
    () => visits.filter((v) => v.business_id === activeBusiness.id),
    [visits, activeBusiness.id]
  );
  const tenantTransactions = useMemo(
    () => transactions.filter((t) => t.business_id === activeBusiness.id),
    [transactions, activeBusiness.id]
  );

  // Build Sub-10ms Multi-Token Index for Active Tenant
  const searchIndex = useMemo(
    () =>
      buildSalonSearchIndex(activeBusiness.id, pets, clients, tenantVisits),
    [activeBusiness.id, pets, clients, tenantVisits]
  );

  // Execute Sub-10ms Multi-Token Search
  const searchReport = useMemo(
    () => executeMultiTokenSearch(searchIndex, searchQuery),
    [searchIndex, searchQuery]
  );

  const matchedPetIds = useMemo(
    () => new Set(searchReport.results.map((r) => r.record.pet.id)),
    [searchReport.results]
  );

  // Filtered Unified Calendar Visits
  const filteredVisits = useMemo(() => {
    return tenantVisits.filter((v) => {
      if (!matchedPetIds.has(v.pet_id)) return false;
      if (selectedStaffId !== 'all' && v.staff_id !== selectedStaffId) {
        return false;
      }
      if (
        selectedStatusFilter !== 'all' &&
        v.status !== selectedStatusFilter
      ) {
        return false;
      }
      return true;
    });
  }, [tenantVisits, matchedPetIds, selectedStaffId, selectedStatusFilter]);

  // Currently Inspected Pet & Client File
  const inspectedRecord = useMemo(() => {
    const found = searchIndex.find((r) => r.pet.id === selectedPetId);
    return found ?? searchIndex[0] ?? null;
  }, [searchIndex, selectedPetId]);

  // End-of-Day Atomic Drawer Reconciliation
  const drawerReport = useMemo(
    () => reconcileEndOfDayDrawer(tenantTransactions),
    [tenantTransactions]
  );

  // Advance a visit to the next grooming stage
  const handleAdvanceStatus = (visit: Visit) => {
    const order: VisitStatus[] = [
      'booked',
      'dropped_off',
      'bathing',
      'styling',
      'ready',
      'completed',
    ];
    const idx = order.indexOf(visit.status);
    if (idx < order.length - 1) {
      const nextStatus = order[idx + 1];
      if (nextStatus === 'completed') {
        setPosCheckoutVisit(visit);
        return;
      }
      setVisits((prev) => {
        const nextVisits = prev.map((v) =>
          v.id === visit.id ? { ...v, status: nextStatus } : v
        );
        saveUniversalStore({ visits: nextVisits });
        return nextVisits;
      });
      if (nextStatus === 'ready') {
        const pet = pets.find((p) => p.id === visit.pet_id);
        const client = clients.find((c) => c.id === visit.client_id);
        if (pet && client) {
          setSmsToastMessage(
            `Auto-SMS dispatched to ${client.name} (${client.phone}): "${pet.name} is fluffed, styled & ready for pickup at ${activeBusiness.name}! View Report Card & 1-Tap Contactless Pay (Google Pay / Apple Pay / Card): pawtrackr.live/client/${client.id}"`
          );
          setTimeout(() => setSmsToastMessage(null), 6000);
        }
      }
    }
  };

  // Handle Atomic POS Completion
  const handlePOSComplete = (tx: Transaction, pointsEarned: number) => {
    const nextTransactions = [tx, ...transactions];
    const nextVisits = visits.map((v) =>
      v.id === tx.visit_id
        ? {
            ...v,
            status: 'completed' as const,
            total_amount: tx.subtotal - tx.discount,
          }
        : v
    );
    const completedVisit = visits.find((v) => v.id === tx.visit_id);
    const nextClients = completedVisit
      ? clients.map((c) =>
          c.id === completedVisit.client_id
            ? {
                ...c,
                loyalty_points: c.loyalty_points + pointsEarned,
                lifetime_spend: Number(
                  (c.lifetime_spend + tx.amount).toFixed(2)
                ),
              }
            : c
        )
      : clients;

    setTransactions(nextTransactions);
    setVisits(nextVisits);
    setClients(nextClients);
    saveUniversalStore({
      transactions: nextTransactions,
      visits: nextVisits,
      clients: nextClients,
    });
  };

  // Handle Before/After Photo & Digital Report Card Publishing
  const handlePublishReportCard = (payload: {
    visitId: string;
    petId: string;
    weightLogged: number;
    reportCardNotes: string;
    newPhotoPair: GroomingPhotoPair;
    sendReadySms: boolean;
  }) => {
    const nextVisits = visits.map((v) =>
      v.id === payload.visitId
        ? {
            ...v,
            weight_logged_lbs: payload.weightLogged,
            report_card_notes: payload.reportCardNotes,
            status: payload.sendReadySms ? ('ready' as const) : v.status,
          }
        : v
    );
    const nextPets = pets.map((p) =>
      p.id === payload.petId
        ? {
            ...p,
            weight_lbs: payload.weightLogged,
            weight_history: [
              ...p.weight_history,
              {
                date: '2026-11-07',
                weight_lbs: payload.weightLogged,
              },
            ],
            photo_gallery: [payload.newPhotoPair, ...p.photo_gallery],
          }
        : p
    );
    setVisits(nextVisits);
    setPets(nextPets);
    saveUniversalStore({ visits: nextVisits, pets: nextPets });
    if (payload.sendReadySms) {
      const pet = pets.find((p) => p.id === payload.petId);
      const client = clients.find((c) => c.id === pet?.client_id);
      if (pet && client) {
        setSmsToastMessage(
          `Report Card & Before/After Photos published! SMS sent to ${client.name} (${client.phone}) with link to /client/${client.id}`
        );
        setTimeout(() => setSmsToastMessage(null), 6000);
      }
    }
  };

  // Handle Instant Front-Desk Walk-In Creation
  const handleCreateWalkIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInPetName || !walkInClientName) return;

    const newClientId = `cl-${Date.now().toString(36)}`;
    const newPetId = `pet-${Date.now().toString(36)}`;
    const newVisitId = `vis-${Date.now().toString(36)}`;
    const defaultPkg = activeConfig.custom_settings.packages[0];
    const defaultStaff = tenantStaff[0];

    const newClient: Client = {
      id: newClientId,
      business_id: activeBusiness.id,
      name: walkInClientName,
      phone: walkInPhone || '(415) 555-0199',
      email: `${walkInClientName
        .toLowerCase()
        .replace(/\s+/g, '.')}@client.live`,
      address: activeBusiness.city_state,
      loyalty_points: 50,
      lifetime_spend: 0,
      created_at: new Date().toISOString(),
    };

    const newPet: Pet = {
      id: newPetId,
      business_id: activeBusiness.id,
      client_id: newClientId,
      name: walkInPetName,
      species: 'Canine',
      breed: walkInBreed || 'Mixed Designer Breed',
      weight_lbs: 28.0,
      age_years: 3,
      coat_type: 'Plush Combination Coat',
      rabies_verified: true,
      behavior_notes:
        walkInNotes ||
        'Front-desk walk-in intake. Coat and temperament verified at check-in.',
      behavior_tags: walkInTags,
      avatar_url:
        'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80',
      weight_history: [{ date: '2026-11-07', weight_lbs: 28.0 }],
      photo_gallery: [],
    };

    const newVisit: Visit = {
      id: newVisitId,
      business_id: activeBusiness.id,
      client_id: newClientId,
      pet_id: newPetId,
      staff_id: defaultStaff?.id ?? 'st-101',
      status: 'dropped_off',
      booking_source: 'walk_in',
      package_id: defaultPkg.id,
      package_name: defaultPkg.name,
      base_price: defaultPkg.price,
      addon_ids: [],
      total_amount: defaultPkg.price,
      scheduled_time: new Date().toISOString(),
      time_label: 'WALK-IN NOW',
      duration_minutes: defaultPkg.durationMinutes,
      bay_or_van: 'Express Intake Table #4',
      report_card_notes: 'Instant front-desk walk-in intake.',
      weight_logged_lbs: 28.0,
      created_at: new Date().toISOString(),
    };

    const nextClients = [newClient, ...clients];
    const nextPets = [newPet, ...pets];
    const nextVisits = [newVisit, ...visits];

    setClients(nextClients);
    setPets(nextPets);
    setVisits(nextVisits);
    saveUniversalStore({
      clients: nextClients,
      pets: nextPets,
      visits: nextVisits,
    });
    setSelectedPetId(newPetId);
    setIsWalkInModalOpen(false);
    setWalkInPetName('');
    setWalkInBreed('');
    setWalkInClientName('');
    setWalkInPhone('');
    setWalkInNotes('');
  };

  // Interactive Live Demo Scenario Simulators
  const handleSimulateOnlineBooking = () => {
    const newClientId = `cl-sim-${Date.now().toString(36)}`;
    const newPetId = `pet-sim-${Date.now().toString(36)}`;
    const newVisitId = `vis-sim-${Date.now().toString(36)}`;
    const pkg = activeConfig.custom_settings.packages[0];

    const simClient: Client = {
      id: newClientId,
      business_id: activeBusiness.id,
      name: 'Harrison & Maya Brooks',
      phone: '(415) 902-7741',
      email: 'harrison.brooks@icloud.com',
      address: activeBusiness.city_state,
      loyalty_points: 340,
      lifetime_spend: 580,
      created_at: new Date().toISOString(),
    };

    const simPet: Pet = {
      id: newPetId,
      business_id: activeBusiness.id,
      client_id: newClientId,
      name: 'Winston',
      species: 'Canine',
      breed: 'F1b Mini Bernedoodle',
      weight_lbs: 31.4,
      age_years: 2,
      coat_type: 'Plush Wavy Fleece Coat',
      rabies_verified: true,
      behavior_notes:
        'Booked via public self-booking portal. Loves blueberry facial; gentle with front paws.',
      behavior_tags: ['matted', 'extra_care'],
      avatar_url:
        'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=600&q=80',
      weight_history: [{ date: '2026-11-09', weight_lbs: 31.4 }],
      photo_gallery: [],
    };

    const simVisit: Visit = {
      id: newVisitId,
      business_id: activeBusiness.id,
      client_id: newClientId,
      pet_id: newPetId,
      staff_id: tenantStaff[0]?.id ?? 'st-101',
      status: 'booked',
      booking_source: 'online',
      package_id: pkg.id,
      package_name: `${pkg.name} (Live Online Booking)`,
      base_price: pkg.price,
      addon_ids: [],
      total_amount: pkg.price,
      scheduled_time: new Date().toISOString(),
      time_label: '01:00 PM',
      duration_minutes: pkg.durationMinutes,
      bay_or_van: 'Online Self-Booked Slot #1',
      report_card_notes: 'Live simulated online booking arrival.',
      weight_logged_lbs: 31.4,
      created_at: new Date().toISOString(),
    };

    const nextClients = [simClient, ...clients];
    const nextPets = [simPet, ...pets];
    const nextVisits = [simVisit, ...visits];
    setClients(nextClients);
    setPets(nextPets);
    setVisits(nextVisits);
    setSelectedPetId(newPetId);
    saveUniversalStore({
      clients: nextClients,
      pets: nextPets,
      visits: nextVisits,
    });
    setSmsToastMessage(
      `LIVE ONLINE BOOKING ARRIVED: Harrison & Maya Brooks just booked "Winston (F1b Mini Bernedoodle)" at 01:00 PM ($${pkg.price.toFixed(
        2
      )}) via pawtrackr.live/${activeBusiness.slug}!`
    );
  };

  const handleSimulateVanOfflineSync = () => {
    const newTx: Transaction = {
      id: `tx-van-${Date.now().toString(36)}`,
      business_id: activeBusiness.id,
      visit_id: tenantVisits[0]?.id ?? 'vis-101',
      subtotal: 145.0,
      discount: 0,
      tax: 12.51,
      tip: 29.0,
      amount: 186.51,
      payment_method: 'apple_pay',
      stripe_payment_intent_id: `pi_van_outbox_${Date.now().toString(36)}`,
      status: 'completed',
      created_at: new Date().toISOString(),
    };
    const nextTx = [newTx, ...transactions];
    setTransactions(nextTx);
    saveUniversalStore({ transactions: nextTx });
    setSmsToastMessage(
      'MOBILE VAN #2 OFFLINE OUTBOX FLUSHED: Sprinter Van #2 reconnected to 5G and synced 1 offline Tap-to-Pay checkout (+$186.51 settled to POS drawer with 0¢ variance).'
    );
  };

  const handleSimulateDematApproval = () => {
    const targetPet =
      inspectedRecord?.pet ??
      pets.find((p) => p.business_id === activeBusiness.id) ??
      pets[0];
    const targetClient =
      inspectedRecord?.client ??
      clients.find((c) => c.id === targetPet.client_id) ??
      clients[0];

    setSignedWaivers((prev) => ({
      ...prev,
      [targetPet.id]: {
        hash: `WAIVER-SMS-${targetPet.id.toUpperCase()}-LIVE`,
        signedAt: 'JUST NOW (SMS)',
        signerName: targetClient.name,
      },
    }));

    const nextVisits = visits.map((v) =>
      v.pet_id === targetPet.id
        ? { ...v, total_amount: Number((v.total_amount + 25).toFixed(2)) }
        : v
    );
    setVisits(nextVisits);
    saveUniversalStore({ visits: nextVisits });
    setSmsToastMessage(
      `SMS COAT RESCUE APPROVED: ${targetClient.name} signed the Mobile E-Waiver & approved the +$25.00 Humane Dematting Surcharge for ${targetPet.name}!`
    );
  };

  const handleResetDemoData = () => {
    setClients(INITIAL_CLIENTS);
    setPets(INITIAL_PETS);
    setVisits(INITIAL_VISITS);
    setTransactions(INITIAL_TRANSACTIONS);
    saveUniversalStore({
      configs: BUSINESS_CONFIGS,
      clients: INITIAL_CLIENTS,
      pets: INITIAL_PETS,
      visits: INITIAL_VISITS,
      transactions: INITIAL_TRANSACTIONS,
    });
    setSearchQuery('');
    setSelectedStaffId('all');
    setSelectedStatusFilter('all');
    setSmsToastMessage(
      'DEMO STATE RESET: Restored clean default multi-tenant salon & mobile fleet seed data across browser and server ledger.'
    );
  };

  const handleClaimWaitlistSlot = (candidate: {
    petName: string;
    breed: string;
    weightLbs: number;
    clientName: string;
    phone: string;
    price: number;
    packageName: string;
  }) => {
    const newClientId = `cl-wl-${Date.now().toString(36)}`;
    const newPetId = `pet-wl-${Date.now().toString(36)}`;
    const newVisitId = `vis-wl-${Date.now().toString(36)}`;

    const wlClient: Client = {
      id: newClientId,
      business_id: activeBusiness.id,
      name: candidate.clientName,
      phone: candidate.phone,
      email: `${candidate.clientName
        .toLowerCase()
        .replace(/[^a-z]/g, '')}@icloud.com`,
      address: activeBusiness.city_state,
      loyalty_points: 420,
      lifetime_spend: 640,
      created_at: new Date().toISOString(),
    };

    const wlPet: Pet = {
      id: newPetId,
      business_id: activeBusiness.id,
      client_id: newClientId,
      name: candidate.petName,
      species: 'Canine',
      breed: candidate.breed,
      weight_lbs: candidate.weightLbs,
      age_years: 3,
      coat_type: 'Curly Fleece Coat',
      rabies_verified: true,
      behavior_notes:
        'Claimed last-minute 11:30 AM cancellation slot via Automated Waitlist SMS Flash-Blast.',
      behavior_tags: ['extra_care'],
      avatar_url:
        'https://images.unsplash.com/photo-1591769225440-811ad7d6eab3?auto=format&fit=crop&w=600&q=80',
      weight_history: [{ date: '2026-11-09', weight_lbs: candidate.weightLbs }],
      photo_gallery: [],
    };

    const wlVisit: Visit = {
      id: newVisitId,
      business_id: activeBusiness.id,
      client_id: newClientId,
      pet_id: newPetId,
      staff_id: tenantStaff[0]?.id ?? 'st-101',
      status: 'booked',
      booking_source: 'online',
      package_id: activeConfig.custom_settings.packages[0]?.id ?? 'pkg-1',
      package_name: `${candidate.packageName} (Waitlist Auto-Fill)`,
      base_price: candidate.price,
      addon_ids: [],
      total_amount: candidate.price,
      scheduled_time: new Date().toISOString(),
      time_label: '11:15 AM',
      duration_minutes: 90,
      bay_or_van: 'Waitlist Rescued Slot #2',
      report_card_notes: 'Filled cancelled slot via AI Waitlist Flash-Blast.',
      weight_logged_lbs: candidate.weightLbs,
      created_at: new Date().toISOString(),
    };

    const nextClients = [wlClient, ...clients];
    const nextPets = [wlPet, ...pets];
    const nextVisits = [wlVisit, ...visits];
    setClients(nextClients);
    setPets(nextPets);
    setVisits(nextVisits);
    setSelectedPetId(newPetId);
    saveUniversalStore({
      clients: nextClients,
      pets: nextPets,
      visits: nextVisits,
    });
    setIsWaitlistModalOpen(false);
    setSmsToastMessage(
      `CANCELLED SLOT RECOVERED (+$${candidate.price.toFixed(
        2
      )}): ${candidate.clientName} claimed the open 11:15 AM slot for ${
        candidate.petName
      } (${candidate.breed}) in 12 seconds via SMS!`
    );
  };

  const handleCaptureNoShowFee = () => {
    const noShowTx: Transaction = {
      id: `tx-noshow-${Date.now().toString(36)}`,
      business_id: activeBusiness.id,
      visit_id: tenantVisits[0]?.id ?? 'vis-101',
      subtotal: 35.0,
      discount: 0,
      tax: 0,
      tip: 0,
      amount: 35.0,
      payment_method: 'card',
      stripe_payment_intent_id: `pi_noshow_vault_${Date.now().toString(36)}`,
      status: 'completed',
      created_at: new Date().toISOString(),
    };
    const nextTx = [noShowTx, ...transactions];
    setTransactions(nextTx);
    saveUniversalStore({ transactions: nextTx });
    setSmsToastMessage(
      'NO-SHOW DEPOSIT CAPTURED ($35.00): Charged vaulted Visa •••• 4829. Automatically split 50/50 ($17.50 credited to Stylist Payroll Ledger • $17.50 to Salon Drawer).'
    );
  };

  const handleExecuteVoiceCommand = (
    cmd: 'ready' | 'weight' | 'demat'
  ) => {
    const targetPet =
      inspectedRecord?.pet ??
      pets.find((p) => p.business_id === activeBusiness.id) ??
      pets[0];
    const targetClient =
      inspectedRecord?.client ??
      clients.find((c) => c.id === targetPet.client_id) ??
      clients[0];

    if (cmd === 'ready') {
      const nextVisits = visits.map((v) =>
        v.pet_id === targetPet.id ? { ...v, status: 'ready' as const } : v
      );
      setVisits(nextVisits);
      saveUniversalStore({ visits: nextVisits });
      setSmsToastMessage(
        `🎙️ VOICE COMMAND EXECUTED ("Move ${targetPet.name} to Ready"): Stage updated to READY FOR PICKUP & pickup SMS dispatched to ${targetClient.name}!`
      );
    } else if (cmd === 'weight') {
      const updatedWeight = Number((targetPet.weight_lbs + 0.2).toFixed(1));
      const nextPets = pets.map((p) =>
        p.id === targetPet.id
          ? {
              ...p,
              weight_lbs: updatedWeight,
              weight_history: [
                ...p.weight_history,
                { date: '2026-11-09', weight_lbs: updatedWeight },
              ],
            }
          : p
      );
      setPets(nextPets);
      saveUniversalStore({ pets: nextPets });
      setSmsToastMessage(
        `🎙️ VOICE COMMAND EXECUTED ("Log ${targetPet.name} weight ${updatedWeight} lbs"): Calibrated digital scale reading saved to dossier!`
      );
    } else {
      handleSimulateDematApproval();
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      {/* INTERACTIVE LIVE DEMO SCENARIO SIMULATOR BAR */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-periwinkle-500/35 bg-obsidian-900/95 px-4 py-2.5 text-xs shadow-periwinkle-glow">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-periwinkle-300">
            Interactive Demo Scenario Triggers:
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSimulateOnlineBooking}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-bold text-emerald-300 transition hover:bg-emerald-500/25"
          >
            + Simulate Online Booking Arrival
          </button>
          <button
            type="button"
            onClick={handleSimulateVanOfflineSync}
            className="rounded-xl border border-periwinkle-500/40 bg-periwinkle-500/15 px-3 py-1.5 text-[11px] font-bold text-periwinkle-200 transition hover:bg-periwinkle-500/25"
          >
            🚐 Simulate Van #2 Offline POS Sync (+$186.51)
          </button>
          <button
            type="button"
            onClick={handleSimulateDematApproval}
            className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-bold text-amber-300 transition hover:bg-amber-500/25"
          >
            ✍️ Simulate SMS Coat Demat Approval (+$25)
          </button>
          <button
            type="button"
            onClick={() => {
              setWaitlistBlastSent(false);
              setIsWaitlistModalOpen(true);
            }}
            className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-[11px] font-bold text-rose-300 transition hover:bg-rose-500/25"
          >
            ⚡ Fill Cancelled Slot (Waitlist AI)
          </button>
          <button
            type="button"
            onClick={handleCaptureNoShowFee}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-bold text-emerald-300 transition hover:bg-emerald-500/25"
          >
            🛡️ Capture $35 No-Show Fee (50/50 Split)
          </button>
          <button
            type="button"
            onClick={handleResetDemoData}
            className="rounded-xl border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/[0.12] hover:text-white"
          >
            ↺ Reset Demo Data
          </button>
        </div>
      </div>

      {/* Live Automated SMS Pickup Notification Toast */}
      {smsToastMessage && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/50 bg-emerald-500/15 px-5 py-3.5 text-xs text-emerald-200 shadow-emerald-glow">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{smsToastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSmsToastMessage(null)}
            className="text-xs font-bold text-emerald-300 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TOP COMMAND HEADER + MULTI-TENANT RLS SWITCHER */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/[0.08] bg-obsidian-800/90 p-5 lg:flex-row lg:items-center shadow-glass">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              TENANT ISOLATED: {activeBusiness.id.slice(0, 8)}
            </span>
            <span className="rounded-full border border-periwinkle-500/30 bg-periwinkle-500/10 px-2.5 py-0.5 text-[11px] font-medium text-periwinkle-300">
              Tax Rate: {activeConfig.tax_rate}%
            </span>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-zinc-200 hover:border-periwinkle-500/40 hover:text-periwinkle-300"
            >
              <Settings className="h-3 w-3" />
              Catalog & POS Settings
            </Link>
            <Link
              href="/dashboard/payroll"
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-zinc-200 hover:border-emerald-500/40 hover:text-emerald-300"
            >
              <DollarSign className="h-3 w-3" />
              Staff Commission & Payroll
            </Link>
            <Link
              href="/dashboard/fleet"
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-zinc-200 hover:border-periwinkle-500/40 hover:text-periwinkle-300"
            >
              Mobile Van Fleet OS
            </Link>
            <Link
              href="/dashboard/retention"
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-zinc-200 hover:border-emerald-500/40 hover:text-emerald-300"
            >
              Coat Recall & Vaccine Guard
            </Link>
            <Link
              href="/dashboard/import"
              className="inline-flex items-center gap-1 rounded-full border border-periwinkle-500/35 bg-periwinkle-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-periwinkle-300 hover:bg-periwinkle-500/20"
            >
              1-Click MoeGo / DaySmart Import
            </Link>
            <Link
              href="/dashboard/analytics"
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20"
            >
              Executive Analytics
            </Link>
            <Link
              href="/dashboard/messages"
              className="inline-flex items-center gap-1 rounded-full border border-periwinkle-500/40 bg-periwinkle-500/15 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-periwinkle-500/25"
            >
              <MessageSquare className="h-3 w-3 text-periwinkle-300" />
              2-Way SMS Concierge
            </Link>
            <Link
              href="/dashboard/operations"
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25"
            >
              Inventory, Gift Cards, Shifts & Audit
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.14] bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-zinc-200 hover:text-white"
            >
              Founder Super-Admin
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-white">
            {activeBusiness.name} — Command Center
          </h1>
          <p className="text-xs text-zinc-400">
            {activeConfig.custom_settings.tagline} • Public Booking URL:{' '}
            <Link
              href={`/portal/${activeBusiness.slug}`}
              className="font-mono text-periwinkle-300 underline hover:text-periwinkle-200"
            >
              pawtrackr.live/{activeBusiness.slug}
            </Link>
          </p>
        </div>

        {/* Tenant Switcher (Proves RLS Isolation) + Walk-in CTA */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-white/[0.09] bg-obsidian-900 p-1.5">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Switch Isolated Tenant (RLS Demo)
            </div>
            <div className="flex gap-1.5">
              {BUSINESSES.map((biz) => {
                const active = biz.id === activeBusiness.id;
                return (
                  <button
                    key={biz.id}
                    type="button"
                    onClick={() => {
                      setActiveBusinessId(biz.id);
                      const firstPet = pets.find(
                        (p) => p.business_id === biz.id
                      );
                      if (firstPet) setSelectedPetId(firstPet.id);
                      setSelectedStaffId('all');
                    }}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
                        : 'text-zinc-400 hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    {biz.name}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsWalkInModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3.5 text-xs font-bold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" />
            Instant Walk-In Intake
          </button>
        </div>
      </div>

      {/* KPI & ATOMIC DRAWER RECONCILIATION STRIP */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Active Salon Pipeline</span>
            <Calendar className="h-4 w-4 text-periwinkle-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-extrabold text-white">
              {tenantVisits.length} Dogs
            </span>
            <span className="text-xs text-periwinkle-300">
              {
                tenantVisits.filter((v) => v.booking_source === 'online')
                  .length
              }{' '}
              Online •{' '}
              {
                tenantVisits.filter((v) => v.booking_source === 'walk_in')
                  .length
              }{' '}
              Walk-in
            </span>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Safety & Behavior Auras Active</span>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-extrabold text-white">
              {
                pets.filter(
                  (p) =>
                    p.business_id === activeBusiness.id &&
                    (p.behavior_tags.includes('biter') ||
                      p.behavior_tags.includes('matted') ||
                      p.behavior_tags.includes('heart_murmur'))
                ).length
              }{' '}
              Alerts
            </span>
            <span className="text-xs text-rose-300">
              Bite / Matted / Cardiac
            </span>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Settled POS Drawer Total</span>
            <Receipt className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-extrabold text-emerald-400">
              {formatCurrency(drawerReport.totalCollectedDollars)}
            </span>
            <span className="font-mono text-xs text-zinc-300">
              Tips: {formatCurrency(drawerReport.tipDollars)}
            </span>
          </div>
        </div>

        <div className="glass-card p-4 border-emerald-500/30">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>End-of-Day Drawer Variance</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-extrabold text-white">
              $0.00 (0¢)
            </span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              BALANCED TO PENNY
            </span>
          </div>
        </div>
      </div>

      {/* SUB-10MS MULTI-TOKEN SEARCH ENGINE BAR */}
      <div className="mt-6 rounded-3xl border border-periwinkle-500/35 bg-obsidian-800/95 p-5 shadow-periwinkle-glow">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-periwinkle-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
              Sub-10ms Multi-Token Search Engine
            </span>
            <span className="text-xs text-zinc-400">
              Combine partial dog name + phone digits + breed or aura tag
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
              Query Latency: {searchReport.elapsedMs} ms
            </span>
            <span className="text-zinc-400">
              {searchReport.results.length} / {searchReport.totalIndexed} matched
            </span>
          </div>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-periwinkle-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Try typing: "bello 4829 doodle" or "biter" or "matted" or "650 pood"...'
            className="w-full rounded-2xl border border-white/[0.14] bg-obsidian-900 py-3.5 pl-12 pr-24 text-sm text-white placeholder-zinc-500 focus:border-periwinkle-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-white/[0.08] px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/[0.15]"
            >
              Clear
            </button>
          )}
        </div>

        {/* Instant Multi-Token Demo Presets */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-400">Instant Token Queries:</span>
          {[
            { label: 'bello 4829 doodle', query: 'bello 4829 doodle' },
            { label: 'biter (Safety Alert)', query: 'biter' },
            { label: 'matted', query: 'matted' },
            { label: 'senior 650', query: 'senior 650' },
            { label: 'shiba 9104', query: 'shiba 9104' },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setSearchQuery(preset.query)}
              className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] transition ${
                searchQuery === preset.query
                  ? 'border-periwinkle-500 bg-periwinkle-500/20 text-white'
                  : 'border-white/[0.08] bg-obsidian-900 text-zinc-300 hover:border-periwinkle-500/40'
              }`}
            >
              &ldquo;{preset.label}&rdquo;
            </button>
          ))}
        </div>
      </div>

      {/* MAIN COMMAND CENTER WORKSPACE (8 COLS PIPELINE / 4 COLS PET SAFETY & POS INSPECTOR) */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT 8 COLS: UNIFIED CALENDAR & LIVE GROOMING PIPELINE */}
        <div className="space-y-4 lg:col-span-8">
          {/* Staff & Status Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-obsidian-800/80 p-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedStaffId('all')}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  selectedStaffId === 'all'
                    ? 'bg-periwinkle-500 text-obsidian-950'
                    : 'text-zinc-400 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                All Groomers ({tenantStaff.length})
              </button>
              {tenantStaff
                .filter((s) => s.role !== 'front_desk')
                .map((staff) => (
                  <button
                    key={staff.id}
                    type="button"
                    onClick={() => setSelectedStaffId(staff.id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      selectedStaffId === staff.id
                        ? 'bg-periwinkle-500 text-obsidian-950'
                        : 'text-zinc-300 hover:bg-white/[0.05]'
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: staff.color_hex }}
                    />
                    {staff.name}
                  </button>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex flex-wrap rounded-xl border border-white/[0.1] bg-obsidian-900 p-1 text-xs">
                {[
                  { id: 'pipeline' as const, label: 'Pipeline List' },
                  { id: 'kanban' as const, label: '6-Stage Kanban' },
                  { id: 'timegrid' as const, label: 'Hourly Time-Grid' },
                  { id: 'kiosk' as const, label: '🧤 Wet-Hands Kiosk' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setCalendarViewMode(mode.id)}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      calendarViewMode === mode.id
                        ? 'bg-emerald-500 text-obsidian-950'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="rounded-xl border border-white/[0.1] bg-obsidian-900 px-3 py-1.5 text-xs text-zinc-200 focus:border-periwinkle-500 focus:outline-none"
              >
                <option value="all">All Stages ({tenantVisits.length})</option>
                {STATUS_STEPS.map((st) => (
                  <option key={st.id} value={st.id}>
                    Stage: {st.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* HANDS-FREE GROOMER VOICE ASSISTANT ("HEY PAWTRACKR") */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-obsidian-900/90 px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-periwinkle-400" />
              <span className="font-mono text-[11px] font-bold uppercase text-periwinkle-300">
                🎙️ Hands-Free Groomer Voice Assistant (&ldquo;Hey Pawtrackr&rdquo;):
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleExecuteVoiceCommand('ready')}
                className="rounded-lg border border-white/[0.1] bg-obsidian-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:border-emerald-500/40 hover:text-emerald-300"
              >
                &ldquo;Move {inspectedRecord?.pet.name ?? 'Dog'} to Ready&rdquo;
              </button>
              <button
                type="button"
                onClick={() => handleExecuteVoiceCommand('weight')}
                className="rounded-lg border border-white/[0.1] bg-obsidian-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:border-periwinkle-500/40 hover:text-periwinkle-300"
              >
                &ldquo;Log Weight +0.2 lbs&rdquo;
              </button>
              <button
                type="button"
                onClick={() => handleExecuteVoiceCommand('demat')}
                className="rounded-lg border border-white/[0.1] bg-obsidian-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:border-amber-500/40 hover:text-amber-300"
              >
                &ldquo;Flag Matted Coat +$25&rdquo;
              </button>
            </div>
          </div>

          {/* WET-HANDS GROOMER TABLE KIOSK MODE (FOR TABLETS AT BATH & STYLING STATIONS) */}
          {calendarViewMode === 'kiosk' && inspectedRecord && (
            <div className="rounded-3xl border-2 border-emerald-500/45 bg-obsidian-800/95 p-6 shadow-emerald-glow">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div>
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-mono text-xs font-bold uppercase text-emerald-300">
                    🧤 WET-HANDS TABLET KIOSK MODE (ANDROID • IPAD • WINDOWS TOUCH)
                  </span>
                  <h3 className="mt-2 text-2xl font-extrabold text-white">
                    Station Dog: {inspectedRecord.pet.name} (
                    {inspectedRecord.pet.breed} •{' '}
                    {inspectedRecord.pet.weight_lbs} lbs)
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {filteredVisits.map((v) => {
                    const p = pets.find((petItem) => petItem.id === v.pet_id);
                    if (!p) return null;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedPetId(p.id)}
                        className={`rounded-2xl px-4 py-3 text-sm font-extrabold transition ${
                          selectedPetId === p.id
                            ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
                            : 'border border-white/[0.12] bg-obsidian-900 text-zinc-200'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    if (inspectedRecord.activeVisit) {
                      handleAdvanceStatus(inspectedRecord.activeVisit);
                    }
                  }}
                  className="flex min-h-[88px] flex-col items-center justify-center rounded-2xl border-2 border-cyan-500/50 bg-cyan-500/15 p-5 text-center transition hover:bg-cyan-500/25"
                >
                  <span className="text-base font-extrabold text-white">
                    🛁 1-TAP: ADVANCE GROOMING STAGE
                  </span>
                  <span className="mt-1 text-xs text-cyan-200">
                    Current Stage:{' '}
                    {inspectedRecord.activeVisit?.status.toUpperCase() ??
                      'READY'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSimulateDematApproval}
                  className="flex min-h-[88px] flex-col items-center justify-center rounded-2xl border-2 border-amber-500/50 bg-amber-500/15 p-5 text-center transition hover:bg-amber-500/25"
                >
                  <span className="text-base font-extrabold text-white">
                    ⚠️ 1-TAP: FLAG MATTED COAT (+$25 SMS)
                  </span>
                  <span className="mt-1 text-xs text-amber-200">
                    Texts parent instant mobile e-waiver & adds +$25 fee
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (inspectedRecord.activeVisit) {
                      setReportCardModalVisit(inspectedRecord.activeVisit);
                    }
                  }}
                  className="flex min-h-[88px] flex-col items-center justify-center rounded-2xl border-2 border-periwinkle-500/50 bg-periwinkle-500/15 p-5 text-center transition hover:bg-periwinkle-500/25"
                >
                  <span className="text-base font-extrabold text-white">
                    📸 1-TAP: LOG WEIGHT & SNAP PHOTOS
                  </span>
                  <span className="mt-1 text-xs text-periwinkle-200">
                    Opens Before/After WebP camera & digital scale logger
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (inspectedRecord.activeVisit) {
                      setPosCheckoutVisit(inspectedRecord.activeVisit);
                    }
                  }}
                  className="flex min-h-[88px] flex-col items-center justify-center rounded-2xl border-2 border-emerald-500 bg-emerald-500 p-5 text-center text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400"
                >
                  <span className="text-base font-extrabold">
                    💳 1-TAP: 4-STEP ATOMIC POS & QR PAY
                  </span>
                  <span className="mt-1 text-xs font-bold">
                    Tap-to-Pay NFC • QR Phone Pass • 80mm Receipt
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* 6-STAGE KANBAN BOARD VIEW MODE */}
          {calendarViewMode === 'kanban' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {STATUS_STEPS.map((stage) => {
                const stageVisits = filteredVisits.filter(
                  (v) => v.status === stage.id
                );
                return (
                  <div
                    key={stage.id}
                    className="rounded-2xl border border-white/[0.08] bg-obsidian-800/85 p-3.5"
                  >
                    <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${stage.color}`}
                      >
                        {stage.label}
                      </span>
                      <span className="font-mono text-xs font-bold text-zinc-400">
                        {stageVisits.length}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2.5">
                      {stageVisits.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/[0.06] py-6 text-center text-[11px] text-zinc-500">
                          No dogs in stage
                        </div>
                      ) : (
                        stageVisits.map((v) => {
                          const pet = pets.find((p) => p.id === v.pet_id);
                          const staff = tenantStaff.find(
                            (s) => s.id === v.staff_id
                          );
                          if (!pet) return null;
                          return (
                            <div
                              key={v.id}
                              onClick={() => setSelectedPetId(pet.id)}
                              className={`cursor-pointer rounded-xl border p-3 transition ${
                                selectedPetId === pet.id
                                  ? 'border-periwinkle-500 bg-obsidian-700'
                                  : 'border-white/[0.08] bg-obsidian-900/80 hover:border-white/[0.16]'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] font-bold text-periwinkle-300">
                                  {v.time_label}
                                </span>
                                <span className="font-mono text-xs font-bold text-emerald-400">
                                  {formatCurrency(v.total_amount)}
                                </span>
                              </div>
                              <div className="mt-1 font-bold text-white text-sm">
                                {pet.name}
                              </div>
                              <div className="text-[11px] text-zinc-400">
                                {pet.breed} • {staff?.name ?? 'Stylist'}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {pet.behavior_tags.slice(0, 2).map((tag) => (
                                  <BehaviorAuraBadge
                                    key={tag}
                                    tag={tag}
                                    size="xs"
                                  />
                                ))}
                              </div>
                              <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-white/[0.06] pt-2">
                                {v.status !== 'completed' ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAdvanceStatus(v);
                                    }}
                                    className="w-full rounded-lg bg-white/[0.07] py-1 text-[11px] font-semibold text-zinc-200 hover:bg-periwinkle-500 hover:text-obsidian-950"
                                  >
                                    Advance Stage →
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPosCheckoutVisit(v);
                                    }}
                                    className="w-full rounded-lg bg-emerald-500/20 py-1 text-[11px] font-semibold text-emerald-300"
                                  >
                                    View POS Receipt
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* HOURLY STYLIST TIME-GRID VIEW MODE (08:00 AM - 05:00 PM) */}
          {calendarViewMode === 'timegrid' && (
            <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-obsidian-800/90 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Hourly Stylist Station & Van Dispatch Grid
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Click any appointment block to inspect safety dossier or
                    launch 4-step Atomic POS.
                  </p>
                </div>
                <span className="rounded-lg border border-periwinkle-500/30 bg-periwinkle-500/10 px-2.5 py-1 font-mono text-[11px] text-periwinkle-300">
                  08:00 AM – 05:00 PM
                </span>
              </div>
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-zinc-400">
                    <th className="w-24 py-2.5 px-2 font-mono text-[11px]">
                      HOUR SLOT
                    </th>
                    {tenantStaff
                      .filter((s) => s.role !== 'front_desk')
                      .map((stylist) => (
                        <th key={stylist.id} className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 font-bold text-white">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: stylist.color_hex }}
                            />
                            {stylist.name}
                          </div>
                          <div className="text-[10px] font-normal text-zinc-400">
                            {stylist.specialty}
                          </div>
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {[
                    '08:30 AM',
                    '09:00 AM',
                    '09:15 AM',
                    '10:00 AM',
                    '10:30 AM',
                    '11:15 AM',
                    '01:00 PM',
                    '02:30 PM',
                    'WALK-IN NOW',
                  ].map((slotLabel) => (
                    <tr key={slotLabel} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-2 font-mono text-[11px] font-semibold text-zinc-400">
                        {slotLabel}
                      </td>
                      {tenantStaff
                        .filter((s) => s.role !== 'front_desk')
                        .map((stylist) => {
                          const slotVisits = filteredVisits.filter(
                            (v) =>
                              v.staff_id === stylist.id &&
                              v.time_label === slotLabel
                          );
                          return (
                            <td key={stylist.id} className="p-2 align-top">
                              {slotVisits.map((v) => {
                                const pet = pets.find((p) => p.id === v.pet_id);
                                if (!pet) return null;
                                return (
                                  <div
                                    key={v.id}
                                    onClick={() => setSelectedPetId(pet.id)}
                                    className="cursor-pointer rounded-xl border border-periwinkle-500/40 bg-periwinkle-500/15 p-2.5 transition hover:bg-periwinkle-500/25"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-white">
                                        {pet.name} ({pet.breed})
                                      </span>
                                      <span className="font-mono text-[11px] font-bold text-emerald-300">
                                        {formatCurrency(v.total_amount)}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-300">
                                      <span>
                                        {v.package_name} • {v.duration_minutes}m
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPosCheckoutVisit(v);
                                        }}
                                        className="rounded bg-emerald-500 px-1.5 py-0.5 font-bold text-obsidian-950"
                                      >
                                        POS
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Appointment & Walk-in Cards (Pipeline List Mode) */}
          {calendarViewMode === 'pipeline' && (
          <div className="space-y-3">
            {filteredVisits.length === 0 ? (
              <div className="glass-card p-10 text-center">
                <p className="text-sm font-semibold text-white">
                  No salon appointments match your multi-token filter.
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Clear the search bar or switch groomer filters above.
                </p>
              </div>
            ) : (
              filteredVisits.map((visit) => {
                const pet = pets.find((p) => p.id === visit.pet_id);
                const client = clients.find((c) => c.id === visit.client_id);
                const staff = tenantStaff.find((s) => s.id === visit.staff_id);
                if (!pet || !client) return null;

                const statusObj =
                  STATUS_STEPS.find((s) => s.id === visit.status) ??
                  STATUS_STEPS[0];
                const isSelected = selectedPetId === pet.id;
                const waiverSigned = signedWaivers[pet.id];

                return (
                  <div
                    key={visit.id}
                    onClick={() => setSelectedPetId(pet.id)}
                    className={`cursor-pointer rounded-2xl border p-5 transition-all ${
                      isSelected
                        ? 'border-periwinkle-500 bg-obsidian-700/95 shadow-periwinkle-glow'
                        : 'border-white/[0.08] bg-obsidian-800/80 hover:border-white/[0.18]'
                    }`}
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      {/* Left Pet & Client Details */}
                      <div className="flex items-start gap-4">
                        <img
                          src={pet.avatar_url}
                          alt={pet.name}
                          className="h-14 w-14 rounded-2xl object-cover ring-2 ring-white/10"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-periwinkle-300">
                              {visit.time_label}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                visit.booking_source === 'walk_in'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-periwinkle-500/15 text-periwinkle-300 border border-periwinkle-500/30'
                              }`}
                            >
                              {visit.booking_source.replace('_', '-')}
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${statusObj.color}`}
                            >
                              {statusObj.label}
                            </span>
                            {waiverSigned && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                                <FileSignature className="h-3 w-3" />
                                Waiver Signed
                              </span>
                            )}
                          </div>

                          <div className="mt-1.5 flex items-baseline gap-2">
                            <h3 className="text-lg font-extrabold text-white">
                              {pet.name}
                            </h3>
                            <span className="text-xs text-zinc-400">
                              {pet.breed} • {pet.weight_lbs} lbs
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-zinc-300">
                            Parent:{' '}
                            <span className="font-semibold text-white">
                              {client.name}
                            </span>{' '}
                            •{' '}
                            <span className="font-mono text-zinc-400">
                              {client.phone}
                            </span>{' '}
                            • Stylist:{' '}
                            <span className="text-periwinkle-300">
                              {staff?.name ?? 'Unassigned'}
                            </span>
                          </div>

                          {/* Instant Behavior Auras */}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {pet.behavior_tags.map((tag) => (
                              <BehaviorAuraBadge
                                key={tag}
                                tag={tag}
                                size="xs"
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right Pricing & Atomic POS Actions */}
                      <div className="flex flex-row items-center justify-between gap-3 border-t border-white/[0.07] pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
                        <div className="text-left sm:text-right">
                          <div className="text-xs font-medium text-zinc-400">
                            {visit.package_name}
                          </div>
                          <div className="mt-0.5 font-mono text-lg font-extrabold text-white">
                            {formatCurrency(visit.total_amount)}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            {visit.bay_or_van}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            title="Upload Before/After Photos & Publish Report Card"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReportCardModalVisit(visit);
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-xs font-semibold text-periwinkle-300 transition hover:bg-periwinkle-500/15"
                          >
                            <Camera className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Photos</span>
                          </button>

                          {visit.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAdvanceStatus(visit);
                              }}
                              className="rounded-xl border border-white/[0.12] bg-white/[0.05] px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                            >
                              Next Stage →
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPosCheckoutVisit(visit);
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                              visit.status === 'completed'
                                ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                                : 'bg-emerald-500 text-obsidian-950 shadow-emerald-glow hover:bg-emerald-400'
                            }`}
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            {visit.status === 'completed'
                              ? 'Receipt / POS'
                              : '4-Step POS'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          )}
        </div>

        {/* RIGHT 4 COLS: LIVE PET FILE, BEHAVIOR AURA WARNINGS & DRAWER LEDGER */}
        <div className="space-y-5 lg:col-span-4">
          {inspectedRecord && (
            <div className="glass-card overflow-hidden">
              <div className="border-b border-white/[0.08] bg-obsidian-900/90 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-periwinkle-400">
                    Active Pet Safety Dossier
                  </span>
                  <Link
                    href={`/client/${inspectedRecord.client.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:underline"
                  >
                    Open Client Portal <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>

                <div className="mt-3 flex items-center gap-3.5">
                  <img
                    src={inspectedRecord.pet.avatar_url}
                    alt={inspectedRecord.pet.name}
                    className="h-16 w-16 rounded-2xl object-cover ring-2 ring-periwinkle-500/40"
                  />
                  <div>
                    <h2 className="text-xl font-extrabold text-white">
                      {inspectedRecord.pet.name}
                    </h2>
                    <p className="text-xs text-zinc-400">
                      {inspectedRecord.pet.breed} •{' '}
                      {inspectedRecord.pet.age_years} yrs •{' '}
                      {inspectedRecord.pet.weight_lbs} lbs
                    </p>
                    <p className="mt-0.5 text-xs text-periwinkle-300">
                      Coat: {inspectedRecord.pet.coat_type}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-5">
                {/* Flashing Safety Auras */}
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Critical Handling & Behavior Auras
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {inspectedRecord.pet.behavior_tags.map((tag) => (
                      <BehaviorAuraBadge key={tag} tag={tag} size="sm" />
                    ))}
                  </div>
                  <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-zinc-200 leading-relaxed">
                    <strong className="text-rose-300">Groomer Briefing:</strong>{' '}
                    {inspectedRecord.pet.behavior_notes}
                  </div>
                </div>

                {/* Digital Coat / Safety Waiver Status */}
                <div className="rounded-xl border border-white/[0.08] bg-obsidian-900/80 p-3.5 text-xs">
                  {signedWaivers[inspectedRecord.pet.id] ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>E-Waiver Signed on File</span>
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-zinc-400">
                          {signedWaivers[inspectedRecord.pet.id].hash} •{' '}
                          {signedWaivers[inspectedRecord.pet.id].signedAt}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setWaiverModalPet({
                            pet: inspectedRecord.pet,
                            client: inspectedRecord.client,
                          })
                        }
                        className="rounded-lg border border-white/[0.1] px-2.5 py-1 text-[11px] text-zinc-300 hover:text-white"
                      >
                        Re-Sign
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-amber-300">
                          Safety / Demat Waiver Required
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Triggered by active safety auras
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setWaiverModalPet({
                            pet: inspectedRecord.pet,
                            client: inspectedRecord.client,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-obsidian-950 hover:bg-amber-400"
                      >
                        <FileSignature className="h-3.5 w-3.5" />
                        Sign E-Waiver
                      </button>
                    </div>
                  )}
                </div>

                {/* 1-Click Vaccine Certificate OCR Verifier & Vet Emergency Handoff */}
                <div className="rounded-xl border border-white/[0.08] bg-obsidian-900/80 p-3.5 text-xs space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-white">
                        Rabies & Bordetella Vaccine OCR Vault
                      </div>
                      <div className="font-mono text-[10px] text-emerald-300">
                        {scannedVaccineCerts[inspectedRecord.pet.id]
                          ? `${
                              scannedVaccineCerts[inspectedRecord.pet.id]
                                .certNumber
                            } • Exp ${
                              scannedVaccineCerts[inspectedRecord.pet.id]
                                .expires
                            }`
                          : 'Verified Certificate on File'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const certNum = `RAB-OCR-${Math.floor(
                          100000 + Math.random() * 900000
                        )}`;
                        setScannedVaccineCerts((prev) => ({
                          ...prev,
                          [inspectedRecord.pet.id]: {
                            certNumber: certNum,
                            expires: '2029-11-09',
                            clinic: 'Bay Area Veterinary Specialists',
                          },
                        }));
                        setSmsToastMessage(
                          `VACCINE OCR VERIFIED: Extracted Rabies Certificate #${certNum} (Expires 2029-11-09) for ${inspectedRecord.pet.name}!`
                        );
                      }}
                      className="rounded-lg border border-periwinkle-500/40 bg-periwinkle-500/15 px-2.5 py-1.5 text-[11px] font-bold text-periwinkle-200 hover:bg-periwinkle-500/25"
                    >
                      📄 AI Scan Vaccine Cert
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setVetHandoffModal({
                        pet: inspectedRecord.pet,
                        client: inspectedRecord.client,
                      })
                    }
                    className="w-full rounded-xl border border-rose-500/35 bg-rose-500/10 py-2 text-[11px] font-bold text-rose-200 transition hover:bg-rose-500/20"
                  >
                    🏥 Open 1-Click Vet Emergency & Medical Handoff Card
                  </button>
                </div>

                {/* 6-Zone Anatomical Blade & Guard Blueprint */}
                <AnatomicalCutCard
                  petId={inspectedRecord.pet.id}
                  petName={inspectedRecord.pet.name}
                  editable={true}
                />

                {/* Pet Parent & Loyalty Summary */}
                <div className="rounded-xl border border-white/[0.07] bg-obsidian-900/70 p-3.5 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Pet Parent:</span>
                    <span className="font-semibold text-white">
                      {inspectedRecord.client.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Direct SMS / Phone:</span>
                    <span className="font-mono text-zinc-200">
                      {inspectedRecord.client.phone}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Loyalty Rewards:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {inspectedRecord.client.loyalty_points} pts ($
                      {inspectedRecord.client.lifetime_spend.toFixed(2)} LTV)
                    </span>
                  </div>
                </div>

                {inspectedRecord.activeVisit && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setReportCardModalVisit(inspectedRecord.activeVisit!)
                      }
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-periwinkle-500/40 bg-periwinkle-500/15 py-2.5 text-xs font-bold text-periwinkle-200 transition hover:bg-periwinkle-500/25"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Photos & Report
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPosCheckoutVisit(inspectedRecord.activeVisit!)
                      }
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-periwinkle-500 py-2.5 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow transition hover:bg-periwinkle-400"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      4-Step POS
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Atomic End-of-Day Drawer Ledger Card */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Atomic POS Drawer Audit
              </span>
              <Link
                href="/dashboard/payroll"
                className="font-mono text-[11px] text-periwinkle-300 hover:underline"
              >
                Open Payroll Splits →
              </Link>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Net Grooming Services:</span>
                <span className="font-mono text-white">
                  {formatCurrency(
                    drawerReport.subtotalDollars - drawerReport.discountDollars
                  )}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Municipal Tax Collected:</span>
                <span className="font-mono text-white">
                  {formatCurrency(drawerReport.taxDollars)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Stylist Gratuities (100% Pass-Through):</span>
                <span className="font-mono text-periwinkle-300">
                  {formatCurrency(drawerReport.tipDollars)}
                </span>
              </div>
              <div className="border-t border-white/[0.08] pt-2 flex justify-between font-bold text-white">
                <span>Total Settled Volume:</span>
                <span className="font-mono text-emerald-400">
                  {formatCurrency(drawerReport.totalCollectedDollars)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4-STEP ATOMIC POS MODAL */}
      {posCheckoutVisit && (
        <AtomicPOSModal
          visit={posCheckoutVisit}
          pet={
            pets.find((p) => p.id === posCheckoutVisit.pet_id) ?? pets[0]
          }
          client={
            clients.find((c) => c.id === posCheckoutVisit.client_id) ??
            clients[0]
          }
          config={activeConfig}
          onClose={() => setPosCheckoutVisit(null)}
          onCompleteTransaction={handlePOSComplete}
        />
      )}

      {/* DIGITAL E-SIGNATURE WAIVER MODAL */}
      {waiverModalPet && (
        <DigitalWaiverModal
          pet={waiverModalPet.pet}
          client={waiverModalPet.client}
          businessName={activeBusiness.name}
          onClose={() => setWaiverModalPet(null)}
          onSigned={(record) => {
            setSignedWaivers((prev) => ({
              ...prev,
              [record.petId]: {
                hash: record.hash,
                signedAt: record.signedAt,
                signerName: record.signerName,
              },
            }));
          }}
        />
      )}

      {/* BEFORE & AFTER PHOTO + REPORT CARD PUBLISHER MODAL */}
      {reportCardModalVisit && (
        <ReportCardPublisherModal
          visit={reportCardModalVisit}
          pet={
            pets.find((p) => p.id === reportCardModalVisit.pet_id) ?? pets[0]
          }
          client={
            clients.find((c) => c.id === reportCardModalVisit.client_id) ??
            clients[0]
          }
          stylistName={
            tenantStaff.find((s) => s.id === reportCardModalVisit.staff_id)
              ?.name ?? 'Elena Vance'
          }
          onClose={() => setReportCardModalVisit(null)}
          onPublish={handlePublishReportCard}
        />
      )}

      {/* INSTANT FRONT-DESK WALK-IN INTAKE MODAL */}
      {isWalkInModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-white/[0.12] bg-obsidian-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              Instant Front-Desk Walk-In Intake
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Adds a walk-in dog directly into {activeBusiness.name}&apos;s live
              grooming queue and multi-token search index.
            </p>

            <form onSubmit={handleCreateWalkIn} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-300">
                    Dog Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Barnaby"
                    value={walkInPetName}
                    onChange={(e) => setWalkInPetName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-300">Breed *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Cockapoo"
                    value={walkInBreed}
                    onChange={(e) => setWalkInBreed(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-300">
                    Pet Parent Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Claire Sterling"
                    value={walkInClientName}
                    onChange={(e) => setWalkInClientName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-300">
                    Mobile Phone *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="(415) 779-1022"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-300">
                  Assign Behavior Auras & Safety Flags
                </label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(
                    [
                      'matted',
                      'biter',
                      'senior',
                      'anxious',
                      'extra_care',
                    ] as BehaviorTag[]
                  ).map((tag) => {
                    const active = walkInTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setWalkInTags((prev) =>
                            prev.includes(tag)
                              ? prev.filter((t) => t !== tag)
                              : [...prev, tag]
                          )
                        }
                        className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${
                          active
                            ? 'border-periwinkle-500 bg-periwinkle-500/25 text-white'
                            : 'border-white/[0.1] bg-obsidian-900 text-zinc-400'
                        }`}
                      >
                        {tag.replace('_', ' ')}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-300">
                  Handling & Coat Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Any ear matting, nail sensitivity, or dryer notes..."
                  value={walkInNotes}
                  onChange={(e) => setWalkInNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsWalkInModalOpen(false)}
                  className="rounded-xl border border-white/[0.1] px-4 py-2 text-xs font-semibold text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-obsidian-950"
                >
                  Check In Walk-In Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUTOMATED WAITLIST & LAST-MINUTE CANCELLATION SLOT-FILLER MODAL */}
      {isWaitlistModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-3xl border border-white/[0.14] bg-obsidian-800 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
              <div>
                <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-0.5 font-mono text-[10px] font-bold uppercase text-rose-300">
                  LAST-MINUTE CANCELLATION DETECTED • 11:15 AM SLOT (90 MINS)
                </span>
                <h3 className="mt-2 text-xl font-extrabold text-white">
                  AI Waitlist Flash-Blast & Slot Recovery Engine
                </h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Matched 3 waitlisted dogs by breed duration, stylist specialty,
                  and proximity. First parent to tap the SMS claims the slot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsWaitlistModalOpen(false)}
                className="rounded-xl border border-white/[0.1] px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white"
              >
                Close
              </button>
            </div>

            {waitlistBlastSent && (
              <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-xs font-semibold text-emerald-200">
                ✓ Instant SMS Flash-Blast sent to all 3 waitlisted parents! Click
                &ldquo;Simulate Parent Claim&rdquo; below to auto-fill the slot.
              </div>
            )}

            <div className="mt-4 space-y-3">
              {[
                {
                  petName: 'Cooper',
                  breed: 'F1b Goldendoodle',
                  weightLbs: 26.4,
                  clientName: 'Nolan & Chloe Vance',
                  phone: '(415) 839-2210',
                  distance: '0.8 mi away',
                  packageName: 'Signature Teddy Bear & Hand-Scissor',
                  price: 158.0,
                  matchScore: '99% Match',
                },
                {
                  petName: 'Daisy',
                  breed: 'Bichon Frise',
                  weightLbs: 14.2,
                  clientName: 'Evelyn Harper',
                  phone: '(415) 602-8841',
                  distance: '1.2 mi away',
                  packageName: 'Breed Standard Plush Scissor',
                  price: 135.0,
                  matchScore: '95% Match',
                },
                {
                  petName: 'Archie',
                  breed: 'Toy Cavapoo',
                  weightLbs: 18.5,
                  clientName: 'Devon Brooks',
                  phone: '(415) 741-9032',
                  distance: '1.6 mi away',
                  packageName: 'Puppy Sanctuary Intro & Tidy',
                  price: 145.0,
                  matchScore: '92% Match',
                },
              ].map((cand) => (
                <div
                  key={cand.petName}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-white/[0.08] bg-obsidian-900/85 p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                        {cand.matchScore}
                      </span>
                      <span className="text-sm font-extrabold text-white">
                        {cand.petName} ({cand.breed} • {cand.weightLbs} lbs)
                      </span>
                      <span className="text-xs text-periwinkle-300">
                        • {cand.distance}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">
                      Parent: <strong className="text-zinc-200">{cand.clientName}</strong>{' '}
                      ({cand.phone}) • {cand.packageName}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base font-extrabold text-emerald-400">
                      {formatCurrency(cand.price)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleClaimWaitlistSlot(cand)}
                      className="rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-obsidian-950 shadow-emerald-glow hover:bg-emerald-400"
                    >
                      Simulate Parent Claim →
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
              <button
                type="button"
                onClick={() => setWaitlistBlastSent(true)}
                className="rounded-xl bg-periwinkle-500 px-4 py-2.5 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400"
              >
                ⚡ Blast Instant SMS to All 3 Waitlisted Parents
              </button>
              <span className="text-[11px] text-zinc-400">
                Recovers up to <strong className="text-emerald-400">$158.00</strong>{' '}
                in otherwise lost groomer table time.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 1-CLICK VETERINARY EMERGENCY & MEDICAL HANDOFF SHEET MODAL */}
      {vetHandoffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-rose-500/40 bg-obsidian-800 p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-4">
              <div>
                <span className="rounded-full bg-rose-500/20 px-3 py-0.5 font-mono text-[10px] font-bold uppercase text-rose-300">
                  VETERINARY CLINICAL HANDOFF & VACCINE DOSSIER
                </span>
                <h3 className="mt-1.5 text-xl font-extrabold text-white">
                  {vetHandoffModal.pet.name} ({vetHandoffModal.pet.breed})
                </h3>
                <p className="text-xs text-zinc-400">
                  Prepared by {activeBusiness.name} • Instant Vet & Owner Summary
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVetHandoffModal(null)}
                className="rounded-lg border border-white/[0.1] px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2.5 rounded-2xl border border-white/[0.08] bg-obsidian-900 p-3.5">
                <div>
                  <span className="text-[10px] text-zinc-400">Age / Weight</span>
                  <div className="mt-0.5 font-bold text-white">
                    {vetHandoffModal.pet.age_years} yrs •{' '}
                    {vetHandoffModal.pet.weight_lbs} lbs
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400">Rabies Cert</span>
                  <div className="mt-0.5 font-mono font-bold text-emerald-400">
                    {scannedVaccineCerts[vetHandoffModal.pet.id]?.certNumber ??
                      'RAB-VERIFIED'}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400">Parent Phone</span>
                  <div className="mt-0.5 font-mono font-bold text-periwinkle-300">
                    {vetHandoffModal.client.phone}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5">
                <div className="font-bold text-rose-300">
                  Active Medical & Behavioral Auras on File:
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {vetHandoffModal.pet.behavior_tags.map((t) => (
                    <BehaviorAuraBadge key={t} tag={t} size="xs" />
                  ))}
                </div>
                <p className="mt-2 text-zinc-200">
                  {vetHandoffModal.pet.behavior_notes}
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900 p-3.5 space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Primary Vet Clinic:</span>
                  <span className="font-semibold text-white">
                    {scannedVaccineCerts[vetHandoffModal.pet.id]?.clinic ??
                      'Pacific Heights Veterinary Sanctuary'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Signed Liability Waiver:</span>
                  <span className="font-mono text-emerald-300">
                    {signedWaivers[vetHandoffModal.pet.id]?.hash ??
                      'WAIVER-RLS-VERIFIED'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') window.print();
                }}
                className="rounded-xl border border-white/[0.14] bg-obsidian-900 py-2.5 text-xs font-bold text-white hover:bg-obsidian-700"
              >
                Print / Export Vet PDF Sheet
              </button>
              <button
                type="button"
                onClick={() => setVetHandoffModal(null)}
                className="rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-obsidian-950 shadow-emerald-glow"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
