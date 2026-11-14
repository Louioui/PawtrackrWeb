'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Truck,
  BatteryCharging,
  Droplets,
  Thermometer,
  Navigation,
  MapPin,
  Clock,
  ShieldCheck,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Radio,
  Layers,
  Sparkles,
} from 'lucide-react';
import { formatCurrency } from '@/lib/pos-math';

interface FleetVan {
  id: string;
  name: string;
  chassis: string;
  driver: string;
  status: 'en_route' | 'on_site' | 'grooming' | 'complete';
  batteryPercent: number;
  freshWaterPercent: number;
  greyWaterPercent: number;
  cabinTempF: number;
  fuelRangeMiles: number;
  currentStopIndex: number;
  lastGpsPing: string;
  coordinates: { lat: number; lng: number };
}

interface FleetStop {
  id: string;
  stopNumber: number;
  clientName: string;
  petName: string;
  breed: string;
  service: string;
  price: number;
  address: string;
  scheduledTime: string;
  status: 'completed' | 'in_progress' | 'en_route' | 'pending';
  etaMinutes: number;
  notes: string;
}

const INITIAL_VANS: FleetVan[] = [
  {
    id: 'van-01',
    name: 'Van 01 — Obsidian Sprinter',
    chassis: 'Mercedes-Benz Sprinter 3500 High-Roof',
    driver: 'Elena Rostova (Lead Stylist)',
    status: 'grooming',
    batteryPercent: 94,
    freshWaterPercent: 82,
    greyWaterPercent: 18,
    cabinTempF: 71,
    fuelRangeMiles: 285,
    currentStopIndex: 2,
    lastGpsPing: '3 seconds ago',
    coordinates: { lat: 34.0195, lng: -118.4912 },
  },
  {
    id: 'van-02',
    name: 'Van 02 — Periwinkle Transit',
    chassis: 'Ford Transit 250 EcoBoost AWD',
    driver: 'Marcus Vance (Master Groomer)',
    status: 'en_route',
    batteryPercent: 88,
    freshWaterPercent: 65,
    greyWaterPercent: 35,
    cabinTempF: 70,
    fuelRangeMiles: 210,
    currentStopIndex: 1,
    lastGpsPing: '8 seconds ago',
    coordinates: { lat: 34.0322, lng: -118.4735 },
  },
];

const INITIAL_STOPS: FleetStop[] = [
  {
    id: 'stp-1',
    stopNumber: 1,
    clientName: 'Grant Mercer',
    petName: 'Rocco',
    breed: 'French Bulldog',
    service: 'Surf-Side Deshed & Warm Hydro Bath',
    price: 135.0,
    address: '910 Montana Ave, Santa Monica, CA',
    scheduledTime: '08:30 AM',
    status: 'completed',
    etaMinutes: 0,
    notes: 'Gate code #4491. Driveway access clear.',
  },
  {
    id: 'stp-2',
    stopNumber: 2,
    clientName: 'Kendra Hollis',
    petName: 'Barnaby',
    breed: 'Goldendoodle',
    service: 'Full Scissor Coat Restoration & Ear Flush',
    price: 185.0,
    address: '1420 17th St, Santa Monica, CA',
    scheduledTime: '10:00 AM',
    status: 'in_progress',
    etaMinutes: 0,
    notes: 'Anxious around hair dryer. Use low-velocity lavender wash.',
  },
  {
    id: 'stp-3',
    stopNumber: 3,
    clientName: 'Julian Sterling',
    petName: 'Bella',
    breed: 'Poodle (Standard)',
    service: 'Royal Teddy Bear Styling & Nail Grind',
    price: 210.0,
    address: '2204 Ocean Park Blvd, Santa Monica, CA',
    scheduledTime: '11:45 AM',
    status: 'en_route',
    etaMinutes: 18,
    notes: 'Double door entry. Ring bell before unlocking van door.',
  },
  {
    id: 'stp-4',
    stopNumber: 4,
    clientName: 'Sarah Lin',
    petName: 'Mochi',
    breed: 'Shiba Inu',
    service: 'Undercoat Blowout & Paw Butter Treatment',
    price: 145.0,
    address: '740 Palisades Beach Rd, Santa Monica, CA',
    scheduledTime: '01:30 PM',
    status: 'pending',
    etaMinutes: 75,
    notes: 'Park along curb; client will provide beach parking pass.',
  },
];

export default function FleetTelemetryPage() {
  const [vans] = useState<FleetVan[]>(INITIAL_VANS);
  const [selectedVanId, setSelectedVanId] = useState<string>('van-01');
  const [stops, setStops] = useState<FleetStop[]>(INITIAL_STOPS);
  const [isOfflineSimulated, setIsOfflineSimulated] = useState<boolean>(false);
  const [pendingOutboxCount, setPendingOutboxCount] = useState<number>(0);
  const [occHash, setOccHash] = useState<string>('sha256:d8f4e29b10');
  const [autoPing, setAutoPing] = useState<number>(3);

  const activeVan = vans.find((v) => v.id === selectedVanId) || vans[0];

  // Simulated GPS heartbeat tick
  useEffect(() => {
    const interval = setInterval(() => {
      setAutoPing((p) => (p > 1 ? p - 1 : 5));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAdvanceStopStatus = (stopId: string) => {
    setStops((prev) =>
      prev.map((s) => {
        if (s.id !== stopId) return s;
        if (s.status === 'en_route') return { ...s, status: 'in_progress', etaMinutes: 0 };
        if (s.status === 'in_progress') return { ...s, status: 'completed' };
        return s;
      })
    );

    if (isOfflineSimulated) {
      setPendingOutboxCount((c) => c + 1);
      setOccHash(`sha256:${Math.random().toString(36).slice(2, 10)}`);
    }
  };

  const handleSyncOutbox = () => {
    setPendingOutboxCount(0);
    setOccHash('sha256:4f810aa72e');
  };

  return (
    <div className="min-h-screen bg-obsidian-950 text-white selection:bg-periwinkle-500/30 selection:text-periwinkle-200">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-obsidian-900/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-periwinkle-500/40 bg-periwinkle-500/15 text-periwinkle-300 shadow-periwinkle-glow">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white sm:text-lg">
                  Fleet Telemetry & Dispatch
                </h1>
                <span className="rounded-md border border-periwinkle-500/30 bg-periwinkle-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-periwinkle-300">
                  MOBILE VAN GPS
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Real-time OBD-II vehicle metrics, freshwater reserves, and offline IndexedDB sync.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Offline PWA Sync Status */}
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-mono transition ${
                isOfflineSimulated
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              }`}
            >
              {isOfflineSimulated ? (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  <span>OFFLINE OUTBOX ({pendingOutboxCount} pending)</span>
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  <span>ONLINE REALTIME ({occHash.slice(0, 15)})</span>
                </>
              )}
            </div>

            <button
              onClick={() => {
                const next = !isOfflineSimulated;
                setIsOfflineSimulated(next);
                if (!next) handleSyncOutbox();
              }}
              className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08]"
            >
              {isOfflineSimulated ? 'Reconnect Network' : 'Simulate Offline'}
            </button>

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
        {/* Van Selector Tabs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {vans.map((van) => {
            const isSelected = van.id === selectedVanId;
            return (
              <button
                key={van.id}
                onClick={() => setSelectedVanId(van.id)}
                className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
                  isSelected
                    ? 'border-periwinkle-500/60 bg-periwinkle-500/10 shadow-periwinkle-glow'
                    : 'border-white/[0.08] bg-obsidian-900/60 hover:border-white/[0.18]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                      isSelected
                        ? 'border-periwinkle-400 bg-periwinkle-500/20 text-periwinkle-300'
                        : 'border-white/[0.1] bg-white/[0.03] text-zinc-400'
                    }`}
                  >
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{van.name}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                        <Radio className="h-2.5 w-2.5 animate-pulse" />
                        Live GPS
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">{van.driver}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono text-xs font-semibold text-zinc-300">
                    Range: {van.fuelRangeMiles} mi
                  </span>
                  <div className="text-[11px] text-zinc-500">{van.lastGpsPing}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Telemetry HUD Gauges */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Auxiliary Inverter
              </span>
              <BatteryCharging className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono">
              <span className="text-2xl font-bold text-white">
                {activeVan.batteryPercent}%
              </span>
              <span className="text-xs text-zinc-400">12.8V Pure Sine</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${activeVan.batteryPercent}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Freshwater Tank
              </span>
              <Droplets className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono">
              <span className="text-2xl font-bold text-white">
                {activeVan.freshWaterPercent}%
              </span>
              <span className="text-xs text-zinc-400">55 / 65 gal</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full bg-cyan-500 transition-all duration-500"
                style={{ width: `${activeVan.freshWaterPercent}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Greywater Holding
              </span>
              <Droplets className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono">
              <span className="text-2xl font-bold text-white">
                {activeVan.greyWaterPercent}%
              </span>
              <span className="text-xs text-zinc-400">12 / 65 gal</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full bg-amber-500 transition-all duration-500"
                style={{ width: `${activeVan.greyWaterPercent}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/70 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Cabin Salon HVAC
              </span>
              <Thermometer className="h-4 w-4 text-periwinkle-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono">
              <span className="text-2xl font-bold text-white">
                {activeVan.cabinTempF}°F
              </span>
              <span className="text-xs text-zinc-400">Locked at 71°</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              Optimal Pet Comfort
            </div>
          </div>
        </div>

        {/* Live Route & Stop Progression Matrix */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Stops List (7 Cols) */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                Route Stop Progression ({stops.length} Visits Scheduled)
              </h2>
              <span className="text-xs text-zinc-400">
                Auto-calculated ETAs based on traffic deltas
              </span>
            </div>

            <div className="space-y-3">
              {stops.map((stop) => {
                const isCurrent = stop.status === 'in_progress';
                const isDone = stop.status === 'completed';
                const isEnRoute = stop.status === 'en_route';

                return (
                  <div
                    key={stop.id}
                    className={`rounded-2xl border p-4 transition ${
                      isCurrent
                        ? 'border-emerald-500/60 bg-emerald-500/10 shadow-emerald-glow'
                        : isEnRoute
                        ? 'border-periwinkle-500/40 bg-periwinkle-500/10'
                        : isDone
                        ? 'border-white/[0.06] bg-obsidian-900/40 opacity-70'
                        : 'border-white/[0.08] bg-obsidian-900/60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                            isDone
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : isCurrent
                              ? 'bg-emerald-500 text-obsidian-950 shadow-emerald-glow'
                              : 'bg-white/[0.06] text-zinc-400'
                          }`}
                        >
                          {isDone ? '✓' : stop.stopNumber}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">
                              {stop.petName} ({stop.breed})
                            </span>
                            <span className="text-xs text-zinc-400">• {stop.clientName}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-300">{stop.service}</p>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400">
                            <MapPin className="h-3 w-3 shrink-0 text-zinc-500" />
                            <span>{stop.address}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-sm font-bold text-periwinkle-300">
                          {formatCurrency(stop.price)}
                        </span>
                        <div className="mt-0.5 font-mono text-[11px] text-zinc-400">
                          {stop.scheduledTime}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
                      <div className="text-[11px] text-zinc-400">
                        {isEnRoute && (
                          <span className="font-semibold text-periwinkle-300">
                            ETA: {stop.etaMinutes} mins • Driving Curbside
                          </span>
                        )}
                        {isCurrent && (
                          <span className="font-semibold text-emerald-400">
                            Hydro-Bath & Styling In Progress
                          </span>
                        )}
                        {isDone && <span className="text-zinc-500">Service Completed</span>}
                        {stop.status === 'pending' && <span>Upcoming queue</span>}
                      </div>

                      <div className="flex items-center gap-2">
                        {isEnRoute && (
                          <button
                            onClick={() => handleAdvanceStopStatus(stop.id)}
                            className="rounded-lg bg-emerald-500 px-3 py-1 font-bold text-obsidian-950 transition hover:bg-emerald-400"
                          >
                            Mark Arrived On-Site
                          </button>
                        )}
                        {isCurrent && (
                          <button
                            onClick={() => handleAdvanceStopStatus(stop.id)}
                            className="rounded-lg bg-emerald-500 px-3 py-1 font-bold text-obsidian-950 transition hover:bg-emerald-400"
                          >
                            Complete & Checkout
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive GPS Telemetry & Outbox Inspector (5 Cols) */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Live Van GPS Map
                </span>
                <span className="flex items-center gap-1 font-mono text-[11px] text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  Ping in {autoPing}s
                </span>
              </div>

              {/* Decorative GPS Vector Grid */}
              <div className="relative mt-3 h-52 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-obsidian-950">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:1.5rem_1.5rem]" />
                {/* Simulated route path */}
                <svg className="absolute inset-0 h-full w-full">
                  <path
                    d="M 40 160 Q 120 120 180 90 T 280 60"
                    fill="none"
                    stroke="#8B95FF"
                    strokeWidth="3"
                    strokeDasharray="4 4"
                  />
                  <circle cx="40" cy="160" r="6" fill="#10B981" />
                  <circle cx="180" cy="90" r="7" fill="#8B95FF" className="animate-pulse" />
                  <circle cx="280" cy="60" r="5" fill="#71717A" />
                </svg>

                <div className="absolute bottom-3 left-3 rounded-lg border border-white/[0.1] bg-obsidian-900/90 px-2.5 py-1 text-[11px] font-mono text-zinc-300">
                  Lat: {activeVan.coordinates.lat.toFixed(4)}, Lng:{' '}
                  {activeVan.coordinates.lng.toFixed(4)}
                </div>
              </div>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Cellular Telemetry Uplink:</span>
                  <span className="font-mono text-white">5G Ultra-Wideband (Dual eSIM)</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>GPS Tracking Device:</span>
                  <span className="font-mono text-white">OBD-II High-Precision Glonass</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Three-Way Merge Engine:</span>
                  <span className="font-mono text-emerald-300">Active (Manager Priority)</span>
                </div>
              </div>
            </div>

            {/* Offline Outbox Inspector Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-periwinkle-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    IndexedDB Local Outbox
                  </span>
                </div>
                <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                  OCC Versioning
                </span>
              </div>

              <p className="mt-2 text-xs text-zinc-400">
                When mobile vans travel through subterranean parking or cellular dead zones,
                all status changes and POS checkouts are cryptographically hashed and saved
                locally.
              </p>

              <div className="mt-3 rounded-xl border border-white/[0.06] bg-obsidian-950 p-3 font-mono text-xs space-y-1.5">
                <div className="flex justify-between text-zinc-400">
                  <span>Outbox Storage Status:</span>
                  <span
                    className={
                      pendingOutboxCount > 0 ? 'text-amber-300 font-bold' : 'text-emerald-300'
                    }
                  >
                    {pendingOutboxCount > 0 ? `${pendingOutboxCount} Pending Flush` : 'Synced to Cloud'}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Hash Invariant:</span>
                  <span className="text-zinc-300">{occHash}</span>
                </div>
              </div>

              {pendingOutboxCount > 0 && (
                <button
                  onClick={handleSyncOutbox}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-periwinkle-500 py-2.5 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow transition hover:bg-periwinkle-400"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Flush & Reconcile Outbox Now
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
