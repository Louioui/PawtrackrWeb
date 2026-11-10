'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StaffSignInCard } from '@/components/StaffSignInCard';
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Delete,
  Globe,
  Heart,
  KeyRound,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  BUSINESSES,
  CLIENTS as INITIAL_CLIENTS,
  PETS as INITIAL_PETS,
  TENANT_BESPOKE_ID,
} from '@/lib/mock-tenant-data';
import { suggestSalonSlug } from '@/lib/onboarding';
import {
  DemoUserSession,
  clearDemoSession,
  flushPendingDemoStore,
  getStoreBusinesses,
  getStoreStaff,
  loadDemoSession,
  loadUniversalStore,
  provisionDemoClientAndPet,
  provisionDemoSalon,
  saveDemoSession,
  subscribeDemoSession,
  subscribeUniversalStore,
} from '@/lib/realtime-store';
import { BehaviorAuraBadge } from '@/components/BehaviorAuraBadge';
import type {
  BehaviorTag,
  Business,
  Client,
  Pet,
  ServicePackage,
  SubscriptionPlan,
} from '@/types/database';

const PIN_MAP: Record<
  string,
  { staffId: string; name: string; role: string; businessId: string }
> = {
  '1010': {
    staffId: 'st-101',
    name: 'Elena Vance',
    role: 'Owner • Master Stylist',
    businessId: TENANT_BESPOKE_ID,
  },
  '2020': {
    staffId: 'st-102',
    name: 'Julian Kwon',
    role: 'Senior Groomer',
    businessId: TENANT_BESPOKE_ID,
  },
  '3030': {
    staffId: 'st-103',
    name: 'Sora Takahashi',
    role: 'Fear-Free Senior Specialist',
    businessId: TENANT_BESPOKE_ID,
  },
  '4040': {
    staffId: 'st-104',
    name: 'Maya Lin',
    role: 'Front Desk POS Concierge',
    businessId: TENANT_BESPOKE_ID,
  },
};

const ALL_BEHAVIOR_TAGS: BehaviorTag[] = [
  'extra_care',
  'matted',
  'anxious',
  'senior',
  'heart_murmur',
  'cage_reactive',
  'biter',
];

const STARTER_PACKAGES: ServicePackage[] = [
  {
    id: 'pkg-starter-1',
    name: 'Signature Full Breed Groom & Spa Bath',
    description:
      'Warm hydro-massage bath, velocity fluff dry, full breed haircut, ear cleanse, sanitary trim, and nail buff.',
    price: 130,
    durationMinutes: 90,
    badge: 'Most Popular',
  },
  {
    id: 'pkg-starter-2',
    name: 'Luxury Bath, Deshed & Tidy Trim',
    description:
      'Deep coat oxygenation bath, undercoat blowout, face/feet/sanitary tidy trim, and organic blueberry facial.',
    price: 88,
    durationMinutes: 60,
  },
  {
    id: 'pkg-starter-3',
    name: 'Puppy First Gentle Sanctuary Groom',
    description:
      'Calm acoustic introduction for puppies under 6 months: warm bath, gentle towel & low-air dry, eye clear, and nail tip buff.',
    price: 68,
    durationMinutes: 60,
    badge: 'Fear-Free',
  },
];

export default function AccountAndWorkspaceHubPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'owner' | 'client' | 'pin'>('owner');
  const [ownerSubMode, setOwnerSubMode] = useState<'create' | 'signin'>('create');
  const [clientSubMode, setClientSubMode] = useState<'create' | 'signin'>('create');

  // Hydrated store state
  const [businesses, setBusinesses] = useState<Business[]>(BUSINESSES);
  const [clients, setClients] = useState<Client[]>(INITIAL_CLIENTS);
  const [pets, setPets] = useState<Pet[]>(INITIAL_PETS);
  const [activeSession, setActiveSession] = useState<DemoUserSession | null>(null);

  useEffect(() => {
    const syncStore = () => {
      const store = loadUniversalStore();
      setBusinesses(getStoreBusinesses(store.configs));
      setClients(store.clients);
      setPets(store.pets);
    };
    syncStore();
    setActiveSession(loadDemoSession());

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const modeParam = params.get('mode');
      if (tabParam === 'client' || tabParam === 'pin' || tabParam === 'owner') {
        setActiveTab(tabParam);
      }
      if (modeParam === 'signin' || modeParam === 'create') {
        setOwnerSubMode(modeParam);
        setClientSubMode(modeParam);
      }
    }

    const unsubStore = subscribeUniversalStore((updated) => {
      setBusinesses(getStoreBusinesses(updated.configs));
      setClients(updated.clients);
      setPets(updated.pets);
    });
    const unsubSession = subscribeDemoSession(setActiveSession);
    return () => {
      unsubStore();
      unsubSession();
    };
  }, []);

  // ==========================================================================
  // TAB 1: SALON OWNER SIGN-IN & 3-STEP BUSINESS ONBOARDING WIZARD
  // ==========================================================================
  const [selectedExistingBizId, setSelectedExistingBizId] = useState<string>(
    BUSINESSES[0].id
  );
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [ownerName, setOwnerName] = useState<string>('Jordan Avery');
  const [ownerEmail, setOwnerEmail] = useState<string>('jordan@velvetpawstudio.com');
  const [salonName, setSalonName] = useState<string>('Velvet Paw Grooming Studio');
  const [salonSlug, setSalonSlug] = useState<string>('velvet-paw-studio');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState<boolean>(false);
  const [salonPlan, setSalonPlan] = useState<SubscriptionPlan>('salon_pro');
  const [cityState, setCityState] = useState<string>('Austin, TX');
  const [streetAddress, setStreetAddress] = useState<string>(
    '1204 South Congress Ave, Austin, TX 78704'
  );
  const [salonPhone, setSalonPhone] = useState<string>('(512) 555-0192');
  const [salonTagline, setSalonTagline] = useState<string>(
    'Calm One-on-One Coat Styling & Holistic Hydro-Spa'
  );

  // Step 2: Hours, Tax & Packages
  const [openTime, setOpenTime] = useState<string>('08:30');
  const [closeTime, setCloseTime] = useState<string>('18:00');
  const [taxRate, setTaxRate] = useState<string>('8.25');
  const [loyaltyPts, setLoyaltyPts] = useState<string>('2');
  const [wizardPackages, setWizardPackages] =
    useState<ServicePackage[]>(STARTER_PACKAGES);
  const [draftPkgName, setDraftPkgName] = useState<string>('');
  const [draftPkgPrice, setDraftPkgPrice] = useState<string>('115');
  const [draftPkgDuration, setDraftPkgDuration] = useState<string>('75');

  // Step 3: Team & Launch
  const [ownerSpecialty, setOwnerSpecialty] = useState<string>(
    'Founder • Master Scissor & Doodle Specialist'
  );
  const [secondGroomerName, setSecondGroomerName] = useState<string>('Taylor Brooks');
  const [secondGroomerSpecialty, setSecondGroomerSpecialty] = useState<string>(
    'Double-Coat Deshed & Senior Comfort Stylist'
  );
  const [createdSalonResult, setCreatedSalonResult] = useState<{
    business: Business;
    ownerName: string;
  } | null>(null);
  const [ownerFormError, setOwnerFormError] = useState<string | null>(null);

  const handleAddWizardPackage = () => {
    const price = Number(draftPkgPrice);
    const duration = Number(draftPkgDuration);
    if (!draftPkgName.trim() || !Number.isFinite(price) || price < 0 || !Number.isInteger(duration) || duration < 15) {
      setOwnerFormError('Enter a service name, valid price, and duration (at least 15 minutes).');
      return;
    }
    setWizardPackages((prev) => [
      ...prev,
      {
        id: `pkg-wiz-${Date.now().toString(36)}`,
        name: draftPkgName.trim(),
        description:
          'Custom grooming package with warm bath, velocity fluff dry, and breed-tailored finish.',
        price,
        durationMinutes: duration,
        badge: 'Custom',
      },
    ]);
    setDraftPkgName('');
    setOwnerFormError(null);
  };

  const handleLaunchNewSalon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salonName.trim() || !ownerName.trim() || !ownerEmail.trim()) {
      setOwnerFormError('Please enter your name, work email, and salon name.');
      return;
    }
    if (wizardPackages.length === 0) {
      setOwnerFormError('Please include at least one service package.');
      return;
    }
    setOwnerFormError(null);
    const provisioned = provisionDemoSalon({
      salonName,
      slug: salonSlug || suggestSalonSlug(salonName),
      tagline: salonTagline,
      address: streetAddress,
      cityState,
      phone: salonPhone,
      ownerName,
      ownerEmail,
      ownerSpecialty,
      secondGroomerName,
      secondGroomerSpecialty,
      plan: salonPlan,
      taxRate: Number(taxRate) || 8.25,
      loyaltyPointsPerDollar: Number(loyaltyPts) || 2,
      openTime,
      closeTime,
      packages: wizardPackages,
      addons: [],
    });
    await flushPendingDemoStore();
    setCreatedSalonResult({
      business: provisioned.business,
      ownerName: provisioned.session.name,
    });
  };

  const handleExistingSalonSignIn = (biz: Business) => {
    const store = loadUniversalStore();
    const staff = getStoreStaff(store.configs, biz.id);
    const lead = staff[0];
    saveDemoSession({
      role: 'owner',
      name: lead?.name ?? 'Salon Owner',
      email: biz.owner_email,
      businessId: biz.id,
      businessSlug: biz.slug,
      businessName: biz.name,
      staffId: lead?.id,
      staffSpecialty: lead?.specialty,
    });
    router.push('/dashboard');
  };

  // ==========================================================================
  // TAB 2: PET PARENT (CLIENT) SIGN-IN & ACCOUNT CREATION
  // ==========================================================================
  const [clientHomeBizId, setClientHomeBizId] = useState<string>(BUSINESSES[0].id);
  const [newParentName, setNewParentName] = useState<string>('Olivia & Ethan Park');
  const [newParentEmail, setNewParentEmail] = useState<string>('olivia.park@icloud.com');
  const [newParentPhone, setNewParentPhone] = useState<string>('(415) 741-9920');
  const [newParentAddress, setNewParentAddress] = useState<string>(
    '650 Fillmore St, San Francisco, CA'
  );
  const [newPetName, setNewPetName] = useState<string>('biscuit');
  const [newPetBreed, setNewPetBreed] = useState<string>('Mini Cavapoo');
  const [newPetWeight, setNewPetWeight] = useState<string>('18.4');
  const [newPetAge, setNewPetAge] = useState<string>('2');
  const [newPetCoat, setNewPetCoat] = useState<string>('Soft Wavy Fleece');
  const [newPetTags, setNewPetTags] = useState<BehaviorTag[]>(['extra_care']);
  const [newPetNotes, setNewPetNotes] = useState<string>(
    'Sweet temperament; prefers gentle dryer around ears and loves blueberry facial.'
  );
  const [createdClientResult, setCreatedClientResult] = useState<{
    client: Client;
    pet: Pet;
    business: Business;
  } | null>(null);
  const [clientFormError, setClientFormError] = useState<string | null>(null);

  const toggleNewPetTag = (tag: BehaviorTag) => {
    setNewPetTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleCreateClientAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const weightNum = Number(newPetWeight);
    if (
      !newParentName.trim() ||
      !newParentEmail.trim() ||
      !newPetName.trim() ||
      !newPetBreed.trim() ||
      !Number.isFinite(weightNum) ||
      weightNum < 1 ||
      weightNum > 300
    ) {
      setClientFormError(
        'Please complete your contact details, pet name, breed, and valid weight (1–300 lbs).'
      );
      return;
    }
    setClientFormError(null);
    const provisioned = provisionDemoClientAndPet({
      businessId: clientHomeBizId,
      clientName: newParentName,
      clientEmail: newParentEmail,
      clientPhone: newParentPhone,
      clientAddress: newParentAddress,
      petName: newPetName.charAt(0).toUpperCase() + newPetName.slice(1),
      petBreed: newPetBreed,
      petWeightLbs: weightNum,
      petAgeYears: Number(newPetAge) || 2,
      petCoatType: newPetCoat,
      behaviorTags: newPetTags,
      behaviorNotes: newPetNotes,
    });
    await flushPendingDemoStore();
    setCreatedClientResult({
      client: provisioned.client,
      pet: provisioned.pet,
      business: provisioned.business,
    });
  };

  const handleExistingClientSignIn = (client: Client) => {
    const biz =
      businesses.find((b) => b.id === client.business_id) ?? businesses[0];
    const primaryPet = pets.find(
      (p) => p.client_id === client.id && p.business_id === client.business_id
    );
    saveDemoSession({
      role: 'client',
      name: client.name,
      email: client.email,
      businessId: biz.id,
      businessSlug: biz.slug,
      businessName: biz.name,
      clientId: client.id,
      petId: primaryPet?.id,
    });
    router.push(`/client/${client.id}`);
  };

  // ==========================================================================
  // TAB 3: STAFF STATION PIN PAD
  // ==========================================================================
  const [pinCode, setPinCode] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [unlockedStaff, setUnlockedStaff] = useState<{
    name: string;
    role: string;
  } | null>(null);

  const unlockWithPin = (pin: string) => {
    const matched = PIN_MAP[pin];
    if (matched) {
      const biz =
        businesses.find((b) => b.id === matched.businessId) ?? BUSINESSES[0];
      saveDemoSession({
        role: 'staff',
        name: matched.name,
        email: `${matched.name.toLowerCase().replace(/\s+/g, '.')}@${biz.slug}.live`,
        businessId: biz.id,
        businessSlug: biz.slug,
        businessName: biz.name,
        staffId: matched.staffId,
        staffSpecialty: matched.role,
      });
      setUnlockedStaff({ name: matched.name, role: matched.role });
      setTimeout(() => {
        router.push('/dashboard');
      }, 650);
    } else {
      setPinError('Invalid Groomer PIN. Try 1010, 2020, 3030, or 4040.');
      setTimeout(() => setPinCode(''), 700);
    }
  };

  const handleDigitPress = (digit: string) => {
    setPinError(null);
    if (pinCode.length >= 4) return;
    const nextPin = pinCode + digit;
    setPinCode(nextPin);
    if (nextPin.length === 4) {
      unlockWithPin(nextPin);
    }
  };

  const selectedExistingBiz = useMemo(
    () =>
      businesses.find((b) => b.id === selectedExistingBizId) ?? businesses[0],
    [businesses, selectedExistingBizId]
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-periwinkle-500/35 bg-periwinkle-500/10 px-3.5 py-1 text-xs font-semibold text-periwinkle-300">
          <Sparkles className="h-3.5 w-3.5" />
          Pawtrackr Workspace & Account Hub
        </span>
        <h1 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">
          Sign In or Set Up Your Account
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
          Test the complete Pawtrackr experience from every side: launch and
          configure a grooming business, create a pet parent account to book and
          track care, or unlock an in-salon groomer station.
        </p>
      </div>

      {/* Real Supabase Auth sign-in for staff, with clearly labeled sample shortcuts */}
      <StaffSignInCard />

      {/* Active Session Status Bar */}
      {activeSession && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-5 py-3.5 text-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <span className="font-bold text-white">
                Signed in as {activeSession.name}
              </span>{' '}
              <span className="text-emerald-300">
                ({activeSession.role === 'owner'
                  ? 'Salon Owner'
                  : activeSession.role === 'staff'
                  ? 'Salon Team'
                  : 'Pet Parent'}{' '}
                • {activeSession.businessName})
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeSession.role === 'client' && activeSession.clientId ? (
              <>
                <Link
                  href={`/client/${activeSession.clientId}`}
                  className="rounded-xl bg-emerald-500 px-3.5 py-1.5 font-bold text-obsidian-950 hover:bg-emerald-400"
                >
                  Open My Pet Portal →
                </Link>
                <Link
                  href={`/portal/${activeSession.businessSlug}`}
                  className="rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-1.5 font-semibold text-white hover:bg-obsidian-800"
                >
                  Book Appointment
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  className="rounded-xl bg-emerald-500 px-3.5 py-1.5 font-bold text-obsidian-950 hover:bg-emerald-400"
                >
                  Open Salon Workspace →
                </Link>
                <Link
                  href={`/portal/${activeSession.businessSlug}`}
                  className="rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-1.5 font-semibold text-white hover:bg-obsidian-800"
                >
                  View Booking Page
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => clearDemoSession()}
              className="inline-flex items-center gap-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-zinc-300 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* Main 3-Role Switcher */}
      <div
        role="tablist"
        aria-label="Choose account type"
        className="mt-8 grid grid-cols-1 gap-2 rounded-2xl border border-white/[0.09] bg-obsidian-900 p-2 sm:grid-cols-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'owner'}
          onClick={() => setActiveTab('owner')}
          className={`flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-xs font-bold transition ${
            activeTab === 'owner'
              ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
              : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>1. Salon Owner & Business Setup</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'client'}
          onClick={() => setActiveTab('client')}
          className={`flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-xs font-bold transition ${
            activeTab === 'client'
              ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
              : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
          }`}
        >
          <Heart className="h-4 w-4" />
          <span>2. Pet Parent (Client) Account</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pin'}
          onClick={() => setActiveTab('pin')}
          className={`flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-xs font-bold transition ${
            activeTab === 'pin'
              ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
              : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
          }`}
        >
          <KeyRound className="h-4 w-4" />
          <span>3. Groomer & Front-Desk PIN</span>
        </button>
      </div>

      {/* ====================================================================
          PANEL 1: SALON OWNER & BUSINESS SETUP
      ==================================================================== */}
      {activeTab === 'owner' && (
        <div className="mt-6 rounded-3xl border border-white/[0.1] bg-obsidian-800/95 p-6 shadow-2xl sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
                For Grooming Salons & Mobile Vans
              </span>
              <h2 className="mt-1 text-2xl font-extrabold text-white">
                {ownerSubMode === 'create'
                  ? 'Set Up Your Salon Business'
                  : 'Sign In to an Existing Salon'}
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                {ownerSubMode === 'create'
                  ? 'Create your business profile, configure services and hours, and launch your live booking page and POS schedule.'
                  : 'Choose a pre-configured or custom salon workspace to open the Command Center.'}
              </p>
            </div>

            <div className="flex rounded-xl border border-white/[0.1] bg-obsidian-900 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setOwnerSubMode('create');
                  setCreatedSalonResult(null);
                }}
                className={`rounded-lg px-3.5 py-2 transition ${
                  ownerSubMode === 'create'
                    ? 'bg-periwinkle-500 text-obsidian-950 font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Create New Salon
              </button>
              <button
                type="button"
                onClick={() => setOwnerSubMode('signin')}
                className={`rounded-lg px-3.5 py-2 transition ${
                  ownerSubMode === 'signin'
                    ? 'bg-periwinkle-500 text-obsidian-950 font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Sign In to Existing Salon
              </button>
            </div>
          </div>

          {ownerSubMode === 'signin' ? (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {businesses.map((biz) => {
                  const selected = biz.id === selectedExistingBiz.id;
                  return (
                    <div
                      key={biz.id}
                      onClick={() => setSelectedExistingBizId(biz.id)}
                      className={`cursor-pointer rounded-2xl border p-5 transition ${
                        selected
                          ? 'border-periwinkle-500 bg-periwinkle-500/15 shadow-periwinkle-glow'
                          : 'border-white/[0.08] bg-obsidian-900/80 hover:border-white/[0.2]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-periwinkle-300">
                          pawtrackr.live/{biz.slug}
                        </span>
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                          {biz.subscription_plan.replace('_', ' ')}
                        </span>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-white">
                        {biz.name}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-400">
                        {biz.city_state} • {biz.owner_email}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExistingSalonSignIn(biz);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-obsidian-950 hover:bg-emerald-400"
                        >
                          Sign In as Owner <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        <Link
                          href={`/portal/${biz.slug}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.12] bg-obsidian-900 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:text-white"
                        >
                          <Globe className="h-3.5 w-3.5 text-periwinkle-400" />
                          Public Booking Page
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : createdSalonResult ? (
            <div className="mt-6 rounded-3xl border border-emerald-500/40 bg-obsidian-900/90 p-8 text-center shadow-emerald-glow">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-obsidian-950">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <span className="mt-4 inline-block rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-1 font-mono text-xs font-bold text-emerald-300">
                SALON WORKSPACE READY
              </span>
              <h3 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">
                {createdSalonResult.business.name} is Live in Your Demo
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-300">
                Welcome, <strong className="text-white">{createdSalonResult.ownerName}</strong>!
                Your service catalog, operating hours, groomer roster, and a
                sample first appointment are now active across the schedule,
                POS, and public booking portal.
              </p>

              <div className="mx-auto mt-5 max-w-lg rounded-2xl border border-white/[0.08] bg-obsidian-800 px-4 py-3 text-xs text-zinc-300">
                Public Self-Booking Link:{' '}
                <Link
                  href={`/portal/${createdSalonResult.business.slug}`}
                  className="font-mono font-bold text-periwinkle-300 underline"
                >
                  /portal/{createdSalonResult.business.slug}
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-bold text-obsidian-950 shadow-emerald-glow hover:bg-emerald-400"
                >
                  Open Salon Command Center <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={`/portal/${createdSalonResult.business.slug}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-periwinkle-500 px-5 py-3 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400"
                >
                  <Globe className="h-4 w-4" />
                  Test Online Booking Page
                </Link>
                <Link
                  href="/dashboard/settings"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.14] bg-obsidian-800 px-5 py-3 text-xs font-semibold text-white hover:bg-obsidian-700"
                >
                  <Settings className="h-4 w-4 text-periwinkle-300" />
                  Edit Services & Settings
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleLaunchNewSalon} className="mt-6 space-y-6">
              {/* Step Progress Bar */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { step: 1 as const, label: '1. Salon Identity & URL' },
                  { step: 2 as const, label: '2. Hours, Tax & Services' },
                  { step: 3 as const, label: '3. Grooming Team & Launch' },
                ].map((item) => (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => setWizardStep(item.step)}
                    className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${
                      wizardStep === item.step
                        ? 'border-periwinkle-500 bg-periwinkle-500/15 text-white'
                        : wizardStep > item.step
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-white/[0.08] bg-obsidian-900/60 text-zinc-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {ownerFormError && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200"
                >
                  {ownerFormError}
                </p>
              )}

              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Your Full Name (Owner / Manager) *
                      </label>
                      <input
                        type="text"
                        required
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Work Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Salon or Mobile Grooming Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={salonName}
                        onChange={(e) => {
                          setSalonName(e.target.value);
                          if (!slugManuallyEdited) {
                            setSalonSlug(suggestSalonSlug(e.target.value));
                          }
                        }}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Public Booking URL Slug *
                      </label>
                      <div className="mt-1.5 flex items-center overflow-hidden rounded-xl border border-white/[0.14] bg-obsidian-900">
                        <span className="bg-white/[0.04] px-3 py-2.5 font-mono text-xs text-zinc-400">
                          /portal/
                        </span>
                        <input
                          type="text"
                          required
                          value={salonSlug}
                          onChange={(e) => {
                            setSlugManuallyEdited(true);
                            setSalonSlug(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]+/g, '-')
                            );
                          }}
                          className="w-full bg-transparent px-3 py-2.5 font-mono text-xs text-periwinkle-300 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Business Type
                      </label>
                      <select
                        value={salonPlan}
                        onChange={(e) =>
                          setSalonPlan(e.target.value as SubscriptionPlan)
                        }
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                      >
                        <option value="salon_pro">
                          Brick-and-Mortar Grooming Studio
                        </option>
                        <option value="solo_van">
                          Mobile Grooming Van / Fleet
                        </option>
                        <option value="enterprise">
                          Multi-Location Luxury Spa
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        City & State
                      </label>
                      <input
                        type="text"
                        value={cityState}
                        onChange={(e) => setCityState(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Business Phone
                      </label>
                      <input
                        type="text"
                        value={salonPhone}
                        onChange={(e) => setSalonPhone(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Street Address or Service Area
                      </label>
                      <input
                        type="text"
                        value={streetAddress}
                        onChange={(e) => setStreetAddress(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Public Storefront Tagline
                      </label>
                      <input
                        type="text"
                        value={salonTagline}
                        onChange={(e) => setSalonTagline(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="inline-flex items-center gap-2 rounded-xl bg-periwinkle-500 px-5 py-3 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400"
                    >
                      Next: Hours, Tax & Services <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Opening Time
                      </label>
                      <input
                        type="time"
                        value={openTime}
                        onChange={(e) => setOpenTime(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Closing Time
                      </label>
                      <input
                        type="time"
                        value={closeTime}
                        onChange={(e) => setCloseTime(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Sales Tax Rate (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3 py-2 font-mono text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300">
                        Loyalty Pts / $1
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={loyaltyPts}
                        onChange={(e) => setLoyaltyPts(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3 py-2 font-mono text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/75 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
                        Service Packages ({wizardPackages.length})
                      </h3>
                      <span className="text-[11px] text-zinc-400">
                        Shown on your booking page & POS
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {wizardPackages.map((pkg) => (
                        <div
                          key={pkg.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-obsidian-800 px-3.5 py-2.5 text-xs"
                        >
                          <div>
                            <span className="font-bold text-white">
                              {pkg.name}
                            </span>
                            <span className="ml-2 font-mono text-zinc-400">
                              ~{pkg.durationMinutes}m
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-emerald-400">
                              ${pkg.price.toFixed(2)}
                            </span>
                            {wizardPackages.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setWizardPackages((prev) =>
                                    prev.filter((item) => item.id !== pkg.id)
                                  )
                                }
                                className="text-zinc-500 hover:text-rose-400"
                                aria-label={`Remove ${pkg.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <input
                        type="text"
                        placeholder="Add custom service name..."
                        value={draftPkgName}
                        onChange={(e) => setDraftPkgName(e.target.value)}
                        className="rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-xs text-white sm:col-span-2"
                      />
                      <input
                        type="number"
                        placeholder="Price ($)"
                        value={draftPkgPrice}
                        onChange={(e) => setDraftPkgPrice(e.target.value)}
                        className="rounded-xl border border-white/[0.12] bg-obsidian-900 px-3 py-2 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddWizardPackage}
                        className="inline-flex items-center justify-center gap-1 rounded-xl border border-periwinkle-500/40 bg-periwinkle-500/15 px-3 py-2 text-xs font-bold text-periwinkle-200 hover:bg-periwinkle-500/25"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Service
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="rounded-xl border border-white/[0.12] bg-obsidian-900 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white"
                    >
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardStep(3)}
                      className="inline-flex items-center gap-2 rounded-xl bg-periwinkle-500 px-5 py-3 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400"
                    >
                      Next: Grooming Team & Launch <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-periwinkle-500/30 bg-obsidian-900/80 p-4">
                      <span className="text-[11px] font-bold uppercase text-periwinkle-300">
                        Lead Groomer / Owner (#1)
                      </span>
                      <p className="mt-1 text-sm font-bold text-white">
                        {ownerName || 'Salon Owner'}
                      </p>
                      <label className="mt-3 block text-xs text-zinc-400">
                        Grooming Specialty Shown to Clients
                      </label>
                      <input
                        type="text"
                        value={ownerSpecialty}
                        onChange={(e) => setOwnerSpecialty(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 text-xs text-white"
                      />
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
                      <span className="text-[11px] font-bold uppercase text-emerald-300">
                        Second Groomer (Optional)
                      </span>
                      <label className="mt-2 block text-xs text-zinc-400">
                        Groomer Name
                      </label>
                      <input
                        type="text"
                        value={secondGroomerName}
                        onChange={(e) => setSecondGroomerName(e.target.value)}
                        placeholder="Leave blank if solo groomer"
                        className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 text-xs text-white"
                      />
                      <label className="mt-2.5 block text-xs text-zinc-400">
                        Specialty
                      </label>
                      <input
                        type="text"
                        value={secondGroomerSpecialty}
                        onChange={(e) =>
                          setSecondGroomerSpecialty(e.target.value)
                        }
                        className="mt-1 w-full rounded-xl border border-white/[0.12] bg-obsidian-800 px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="rounded-xl border border-white/[0.12] bg-obsidian-900 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white"
                    >
                      ← Back
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-xs font-extrabold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Create Salon & Launch Workspace
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {/* ====================================================================
          PANEL 2: PET PARENT (CLIENT) ACCOUNT & PET PROFILE
      ==================================================================== */}
      {activeTab === 'client' && (
        <div className="mt-6 rounded-3xl border border-white/[0.1] bg-obsidian-800/95 p-6 shadow-2xl sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                For Pet Parents & Clients
              </span>
              <h2 className="mt-1 text-2xl font-extrabold text-white">
                {clientSubMode === 'create'
                  ? 'Create Your Pet Parent Account'
                  : 'Sign In to Your Pet Parent Portal'}
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                {clientSubMode === 'create'
                  ? 'Set up your profile and your dog’s care notes once, then book online and track report cards and weight history.'
                  : 'Select your profile to view your dog’s grooming passport, weight chart, and upcoming appointments.'}
              </p>
            </div>

            <div className="flex rounded-xl border border-white/[0.1] bg-obsidian-900 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setClientSubMode('create');
                  setCreatedClientResult(null);
                }}
                className={`rounded-lg px-3.5 py-2 transition ${
                  clientSubMode === 'create'
                    ? 'bg-emerald-500 text-obsidian-950 font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                New Pet Parent Account
              </button>
              <button
                type="button"
                onClick={() => setClientSubMode('signin')}
                className={`rounded-lg px-3.5 py-2 transition ${
                  clientSubMode === 'signin'
                    ? 'bg-emerald-500 text-obsidian-950 font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Returning Client Sign In
              </button>
            </div>
          </div>

          {clientSubMode === 'signin' ? (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {clients.map((c) => {
                const clientPets = pets.filter(
                  (p) => p.client_id === c.id && p.business_id === c.business_id
                );
                const biz =
                  businesses.find((b) => b.id === c.business_id) ??
                  businesses[0];
                return (
                  <div
                    key={c.id}
                    className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-5"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-periwinkle-300">
                          {biz.name}
                        </span>
                        <span className="font-mono text-emerald-400">
                          {c.loyalty_points} pts
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-lg font-bold text-white">
                        {c.name}
                      </h3>
                      <p className="text-xs text-zinc-400">
                        {c.email} • {c.phone}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {clientPets.map((p) => (
                          <span
                            key={p.id}
                            className="rounded-lg border border-periwinkle-500/30 bg-periwinkle-500/10 px-2.5 py-1 text-xs font-semibold text-white"
                          >
                            🐾 {p.name} ({p.breed}, {p.weight_lbs} lbs)
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.07] pt-3.5">
                      <button
                        type="button"
                        onClick={() => handleExistingClientSignIn(c)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-obsidian-950 hover:bg-emerald-400"
                      >
                        Open Pet Portal <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                      <Link
                        href={`/portal/${biz.slug}`}
                        onClick={() => {
                          saveDemoSession({
                            role: 'client',
                            name: c.name,
                            email: c.email,
                            businessId: biz.id,
                            businessSlug: biz.slug,
                            businessName: biz.name,
                            clientId: c.id,
                            petId: clientPets[0]?.id,
                          });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.12] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:text-white"
                      >
                        <Calendar className="h-3.5 w-3.5 text-periwinkle-400" />
                        Book Visit
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : createdClientResult ? (
            <div className="mt-6 rounded-3xl border border-emerald-500/40 bg-obsidian-900/90 p-8 text-center shadow-emerald-glow">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-obsidian-950">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <span className="mt-4 inline-block rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-1 font-mono text-xs font-bold text-emerald-300">
                PET PARENT PROFILE CREATED
              </span>
              <h3 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">
                Welcome, {createdClientResult.client.name} &{' '}
                {createdClientResult.pet.name}!
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-300">
                Your profile and {createdClientResult.pet.name}&apos;s care
                notes are saved with{' '}
                <strong className="text-white">
                  {createdClientResult.business.name}
                </strong>
                . You can now book an appointment with your details pre-filled
                or open {createdClientResult.pet.name}&apos;s Digital Grooming
                Passport.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  href={`/portal/${createdClientResult.business.slug}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-bold text-obsidian-950 shadow-emerald-glow hover:bg-emerald-400"
                >
                  <Calendar className="h-4 w-4" />
                  Book Appointment for {createdClientResult.pet.name} →
                </Link>
                <Link
                  href={`/client/${createdClientResult.client.id}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-periwinkle-500 px-5 py-3 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400"
                >
                  <Heart className="h-4 w-4" />
                  Open {createdClientResult.pet.name}&apos;s Grooming Passport
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateClientAccount} className="mt-6 space-y-6">
              {clientFormError && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200"
                >
                  {clientFormError}
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Select Your Preferred Salon *
                  </label>
                  <select
                    value={clientHomeBizId}
                    onChange={(e) => setClientHomeBizId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city_state})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Your Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newParentName}
                    onChange={(e) => setNewParentName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={newParentEmail}
                    onChange={(e) => setNewParentEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Mobile Phone *
                  </label>
                  <input
                    type="text"
                    required
                    value={newParentPhone}
                    onChange={(e) => setNewParentPhone(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300">
                    Home Address / Neighborhood
                  </label>
                  <input
                    type="text"
                    value={newParentAddress}
                    onChange={(e) => setNewParentAddress(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-900 px-3.5 py-2.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/70 p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-periwinkle-300">
                  Your Pet’s Profile & Care Preferences
                </h3>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs text-zinc-300">
                      Pet Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newPetName}
                      onChange={(e) => setNewPetName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/[0.14] bg-obsidian-800 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-300">
                      Breed *
                    </label>
                    <input
                      type="text"
                      required
                      value={newPetBreed}
                      onChange={(e) => setNewPetBreed(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/[0.14] bg-obsidian-800 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-300">
                      Weight (lbs) *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="300"
                      required
                      value={newPetWeight}
                      onChange={(e) => setNewPetWeight(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/[0.14] bg-obsidian-800 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-300">
                      Age (Years)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={newPetAge}
                      onChange={(e) => setNewPetAge(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/[0.14] bg-obsidian-800 px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-xs text-zinc-300">
                    Care & Handling Notes (Helps your groomer prepare)
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ALL_BEHAVIOR_TAGS.map((tag) => {
                      const active = newPetTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleNewPetTag(tag)}
                          className={`rounded-xl border p-1 transition ${
                            active
                              ? 'border-periwinkle-500 bg-periwinkle-500/20'
                              : 'border-white/[0.06] opacity-60 hover:opacity-100'
                          }`}
                        >
                          <BehaviorAuraBadge tag={tag} size="xs" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-300">
                    Coat & Comfort Notes for Your Stylist
                  </label>
                  <textarea
                    rows={2}
                    value={newPetNotes}
                    onChange={(e) => setNewPetNotes(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/[0.14] bg-obsidian-800 p-3 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-xs font-extrabold text-obsidian-950 shadow-emerald-glow transition hover:bg-emerald-400"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Create Pet Parent Account & Pet Profile
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ====================================================================
          PANEL 3: STAFF STATION PIN PAD
      ==================================================================== */}
      {activeTab === 'pin' && (
        <div className="mx-auto mt-6 max-w-xl rounded-3xl border border-white/[0.1] bg-obsidian-800/95 p-6 text-center shadow-2xl sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-0.5 text-[11px] font-semibold text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            In-Salon Tablet Station Switcher
          </span>
          <h2 className="mt-3 text-2xl font-extrabold text-white">
            Enter 4-Digit Stylist Station PIN
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Fast groomer and front-desk switching at shared salon tablets.
          </p>

          {/* Quick Staff PIN Reference Chips */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {Object.entries(PIN_MAP).map(([pin, info]) => (
              <button
                key={pin}
                type="button"
                onClick={() => {
                  setPinCode(pin);
                  unlockWithPin(pin);
                }}
                className="rounded-xl border border-white/[0.08] bg-obsidian-900 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-periwinkle-500/50 hover:text-white"
              >
                <span className="font-mono font-bold text-periwinkle-300">
                  {pin}
                </span>{' '}
                • {info.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* 4-Dot PIN Indicator */}
          <div className="my-6 flex justify-center gap-4">
            {[0, 1, 2, 3].map((idx) => {
              const filled = pinCode.length > idx;
              return (
                <div
                  key={idx}
                  className={`h-4 w-4 rounded-full border transition-all ${
                    filled
                      ? 'scale-110 border-periwinkle-400 bg-periwinkle-500 shadow-periwinkle-glow'
                      : 'border-zinc-600 bg-obsidian-900'
                  }`}
                />
              );
            })}
          </div>

          {pinError && (
            <p className="mb-4 text-xs font-semibold text-rose-400">
              {pinError}
            </p>
          )}

          {unlockedStaff && (
            <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 py-2.5 text-xs font-bold text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              Station unlocked: {unlockedStaff.name} ({unlockedStaff.role})
            </div>
          )}

          {/* Tactile Numeric Keypad */}
          <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigitPress(digit)}
                className="flex h-14 items-center justify-center rounded-2xl border border-white/[0.09] bg-obsidian-900 font-mono text-xl font-bold text-white transition hover:border-periwinkle-500/50 hover:bg-obsidian-700 active:scale-95"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPinCode('')}
              className="flex h-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-obsidian-900/60 text-xs font-bold text-zinc-400 hover:text-white"
            >
              CLEAR
            </button>
            <button
              type="button"
              onClick={() => handleDigitPress('0')}
              className="flex h-14 items-center justify-center rounded-2xl border border-white/[0.09] bg-obsidian-900 font-mono text-xl font-bold text-white transition hover:border-periwinkle-500/50 hover:bg-obsidian-700 active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPinCode((prev) => prev.slice(0, -1))}
              className="flex h-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-obsidian-900/60 text-zinc-400 hover:text-white"
            >
              <Delete className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
