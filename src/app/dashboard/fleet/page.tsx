'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BatteryCharging,
  CheckCircle2,
  Droplets,
  MapPin,
  MessageSquare,
  Navigation,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Thermometer,
  Truck,
  Zap,
} from 'lucide-react';
import { BehaviorAuraBadge } from '@/components/BehaviorAuraBadge';
import { BehaviorTag } from '@/types/database';
import { formatCurrency } from '@/lib/pos-math';

interface VanStop {
  id: string;
  stopNumber: number;
  timeWindow: string;
  driveMinutesFromPrev: number;
  milesFromPrev: number;
  clientName: string;
  phone: string;
  address: string;
  neighborhood: string;
  zipCode: string;
  petName: string;
  breed: string;
  packageName: string;
  price: number;
  behaviorTags: BehaviorTag[];
  status: 'completed' | 'curbside_active' | 'en_route' | 'scheduled';
  etaSmsSent: boolean;
  mapX: number;
  mapY: number;
  gateNote: string;
}

const INITIAL_VAN_STOPS: VanStop[] = [
  {
    id: 'stop-1',
    stopNumber: 1,
    timeWindow: '08:30 AM – 09:45 AM',
    driveMinutesFromPrev: 8,
    milesFromPrev: 2.1,
    clientName: 'Grant Mercer',
    phone: '(310) 409-1198',
    address: '910 Montana Ave, Santa Monica, CA 90403',
    neighborhood: 'North of Montana',
    zipCode: '90403',
    petName: 'Rocco',
    breed: 'French Bulldog',
    packageName: 'Surf-Side Deshed & Warm Hydro Bath',
    price: 133.0,
    behaviorTags: ['biter', 'extra_care'],
    status: 'completed',
    etaSmsSent: true,
    mapX: 145,
    mapY: 95,
    gateNote: 'Park in wide circular driveway; side gate code #4491.',
  },
  {
    id: 'stop-2',
    stopNumber: 2,
    timeWindow: '10:00 AM – 11:30 AM',
    driveMinutesFromPrev: 6,
    milesFromPrev: 1.4,
    clientName: 'Kendra Hollis',
    phone: '(310) 882-4410',
    address: '412 Ocean Ave, Santa Monica, CA 90402',
    neighborhood: 'Palisades Beach Bluff',
    zipCode: '90402',
    petName: 'Malibu',
    breed: 'Golden Retriever',
    packageName: 'Curbside 1-on-1 Full VIP Groom',
    price: 187.0,
    behaviorTags: ['matted'],
    status: 'curbside_active',
    etaSmsSent: true,
    mapX: 285,
    mapY: 165,
    gateNote: 'Cones reserved at curb in front of residence.',
  },
  {
    id: 'stop-3',
    stopNumber: 3,
    timeWindow: '12:00 PM – 01:30 PM',
    driveMinutesFromPrev: 9,
    milesFromPrev: 2.8,
    clientName: 'Julianna Sterling',
    phone: '(310) 774-9021',
    address: '218 S Burlingame Ave, Brentwood, CA 90049',
    neighborhood: 'Brentwood Park',
    zipCode: '90049',
    petName: 'Ollie',
    breed: 'F1b Mini Bernedoodle',
    packageName: 'Curbside 1-on-1 Full VIP Groom',
    price: 195.0,
    behaviorTags: ['anxious', 'extra_care'],
    status: 'scheduled',
    etaSmsSent: false,
    mapX: 475,
    mapY: 120,
    gateNote: 'Quiet street; please text instead of ringing doorbell.',
  },
  {
    id: 'stop-4',
    stopNumber: 4,
    timeWindow: '02:00 PM – 03:30 PM',
    driveMinutesFromPrev: 7,
    milesFromPrev: 1.9,
    clientName: 'Marcus & Elena Vance',
    phone: '(310) 612-8840',
    address: '1340 Abbot Kinney Blvd, Venice, CA 90291',
    neighborhood: 'Venice Art District',
    zipCode: '90291',
    petName: 'Kona',
    breed: 'Australian Labradoodle',
    packageName: 'Curbside 1-on-1 Full VIP Groom',
    price: 185.0,
    behaviorTags: ['senior'],
    status: 'scheduled',
    etaSmsSent: false,
    mapX: 635,
    mapY: 225,
    gateNote: 'Rear carriage house alley access with 30A shore plug.',
  },
];

export default function MobileVanFleetCommandPage() {
  const [selectedVanId, setSelectedVanId] = useState<'van-1' | 'van-2'>('van-1');
  const [stops, setStops] = useState<VanStop[]>(INITIAL_VAN_STOPS);
  const [activeStopIndex, setActiveStopIndex] = useState<number>(1); // 0..3
  const [isSimulatingGps, setIsSimulatingGps] = useState<boolean>(false);
  const [isOptimized, setIsOptimized] = useState<boolean>(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Interactive Sprinter Telemetry State
  const [batteryPct, setBatteryPct] = useState<number>(92);
  const [freshWaterGal, setFreshWaterGal] = useState<number>(74);
  const [greyWaterGal, setGreyWaterGal] = useState<number>(26);
  const [cabinTempF, setCabinTempF] = useState<number>(68.5);
  const [shorePowerConnected, setShorePowerConnected] =
    useState<boolean>(false);
  const [showParentTrackerModal, setShowParentTrackerModal] =
    useState<boolean>(false);

  const activeStop = stops[activeStopIndex] ?? stops[0];

  // Live GPS Route Simulation Loop
  useEffect(() => {
    if (!isSimulatingGps) return;
    const timer = setInterval(() => {
      setActiveStopIndex((prevIdx) => {
        const nextIdx = (prevIdx + 1) % stops.length;
        setStops((prevStops) =>
          prevStops.map((s, idx) => ({
            ...s,
            status:
              idx < nextIdx
                ? 'completed'
                : idx === nextIdx
                ? 'curbside_active'
                : 'scheduled',
            etaSmsSent: idx <= nextIdx ? true : s.etaSmsSent,
          }))
        );
        setFreshWaterGal((w) => (nextIdx === 0 ? 96 : Math.max(18, w - 16)));
        setGreyWaterGal((g) => (nextIdx === 0 ? 4 : Math.min(82, g + 16)));
        setBatteryPct((b) =>
          shorePowerConnected ? Math.min(100, b + 3) : Math.max(54, b - 4)
        );
        return nextIdx;
      });
    }, 2800);

    return () => clearInterval(timer);
  }, [isSimulatingGps, stops.length, shorePowerConnected]);

  const handleJumpToStop = (index: number) => {
    setActiveStopIndex(index);
    setStops((prev) =>
      prev.map((s, idx) => ({
        ...s,
        status:
          idx < index
            ? 'completed'
            : idx === index
            ? 'curbside_active'
            : 'scheduled',
      }))
    );
  };

  const totalRouteRevenue = stops.reduce((acc, s) => acc + s.price, 0);
  const settledRouteRevenue = stops
    .filter((s) => s.status === 'completed' || s.status === 'curbside_active')
    .reduce((acc, s) => acc + s.price, 0);
  const totalDriveMinutes = stops.reduce(
    (acc, s) => acc + s.driveMinutesFromPrev,
    0
  );
  const totalMiles = stops
    .reduce((acc, s) => acc + s.milesFromPrev, 0)
    .toFixed(1);

  const handleSendCurbsideEta = (stop: VanStop) => {
    setStops((prev) =>
      prev.map((s) =>
        s.id === stop.id
          ? { ...s, etaSmsSent: true, status: 'en_route' }
          : s
      )
    );
    setToastMsg(
      `Curbside ETA SMS sent to ${stop.clientName} (${stop.phone}): "Your Pawtrackr Sprinter Sanctuary is ${stop.driveMinutesFromPrev} mins away from ${stop.address} for ${stop.petName}'s VIP groom! Live GPS Map: pawtrackr.live/track/${selectedVanId}"`
    );
    setTimeout(() => setToastMsg(null), 5500);
  };

  const handleReoptimizeCluster = () => {
    setIsOptimized(true);
    setToastMsg(
      'AI Geographic Zip-Cluster Engine verified optimal coastal route (90403 → 90402 → 90049 → 90291): Saved 42 minutes of deadhead traffic and 11.4 miles today.'
    );
    setTimeout(() => setToastMsg(null), 5000);
  };

  const handleRefillTanks = () => {
    setFreshWaterGal(100);
    setGreyWaterGal(0);
    setBatteryPct(100);
    setToastMsg(
      'Sprinter Utility Reset: 100-Gal Heated Fresh Hydro Tank topped off, Grey Tank flushed, and LiFePO4 inverter bank charged to 100%.'
    );
    setTimeout(() => setToastMsg(null), 4500);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {/* Top Sub-nav */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-obsidian-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-periwinkle-500/40"
        >
          <ArrowLeft className="h-4 w-4 text-periwinkle-400" />
          Back to Salon Command Center
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowParentTrackerModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Preview Client Live Van Tracker (Phone View)
          </button>
          <button
            type="button"
            onClick={() => setIsSimulatingGps((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              isSimulatingGps
                ? 'bg-amber-500 text-obsidian-950'
                : 'bg-emerald-500 text-obsidian-950 shadow-emerald-glow hover:bg-emerald-400'
            }`}
          >
            {isSimulatingGps ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                Pause Live GPS Van Drive
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Simulate Live GPS Van Route
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleReoptimizeCluster}
            className="inline-flex items-center gap-2 rounded-xl bg-periwinkle-500 px-4 py-2 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400"
          >
            <Navigation className="h-3.5 w-3.5" />
            Optimize Zip-Cluster Route
          </button>
        </div>
      </div>

      {/* Live Fleet Dispatch Workspace Banner */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-obsidian-900 to-obsidian-900 p-4 shadow-glass">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            <Truck className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              Mobile Van & Hybrid Fleet Dispatch
              <span className="rounded-full bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                WF22 • Live Telemetry
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Fresh/gray water levels, battery telemetry, curbside arrival state transitions, and automated ETA client SMS notifications.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/fleet/live"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-obsidian-950 hover:bg-cyan-400 transition"
        >
          Open Live Fleet Dispatch →
        </Link>
      </div>

      {toastMsg && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-500/45 bg-emerald-500/15 px-5 py-3.5 text-xs font-medium text-emerald-200 shadow-emerald-glow">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            {toastMsg}
          </span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="ml-4 font-bold text-emerald-300"
          >
            OK
          </button>
        </div>
      )}

      {/* Header + Van Switcher */}
      <div className="glass-card p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-periwinkle-400">
              <Truck className="h-4 w-4" />
              <span>Mobile Grooming Fleet & Curbside Telemetry OS</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white">
              Splash Mobile Van Fleet — Live GPS Route & Sprinter Telemetry
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Zero-deadhead geographic stop clustering, live lithium/water tank
              sensors, and Uber-style driveway ETA tracking across all devices.
            </p>
          </div>

          <div className="flex gap-2 rounded-2xl border border-white/[0.08] bg-obsidian-900 p-1.5">
            {[
              { id: 'van-1' as const, label: 'Sprinter #1 (Marcus • Coastal)' },
              { id: 'van-2' as const, label: 'Sprinter #2 (Chloe • Westside)' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVanId(v.id)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  selectedVanId === v.id
                    ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live Sprinter Sanctuary Telemetry Strip with Interactive Demo Controls */}
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-white/[0.08] pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>LiFePO4 Inverter Battery</span>
              <BatteryCharging className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-extrabold text-emerald-400">
                {batteryPct}%
              </span>
              <button
                type="button"
                onClick={() => setShorePowerConnected((prev) => !prev)}
                className={`rounded px-2 py-0.5 text-[10px] font-bold transition ${
                  shorePowerConnected
                    ? 'bg-emerald-500 text-obsidian-950'
                    : 'bg-white/[0.07] text-zinc-300 hover:bg-white/[0.15]'
                }`}
              >
                {shorePowerConnected
                  ? '⚡ 30A Shore Plug Active'
                  : 'Solar +420W (Tap for 30A)'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Warm Hydro Fresh / Grey</span>
              <Droplets className="h-4 w-4 text-sky-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-extrabold text-white">
                {freshWaterGal}g{' '}
                <span className="text-xs font-normal text-zinc-400">
                  / {greyWaterGal}g grey
                </span>
              </span>
              <button
                type="button"
                onClick={handleRefillTanks}
                className="inline-flex items-center gap-1 rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300 hover:bg-sky-500/30"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                Refill
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-obsidian-900/80 p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Grooming Cabin Climate</span>
              <Thermometer className="h-4 w-4 text-periwinkle-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-extrabold text-white">
                {cabinTempF.toFixed(1)}°F
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setCabinTempF((t) => Math.max(64, Number((t - 1).toFixed(1))))
                  }
                  className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white hover:bg-white/[0.15]"
                >
                  -1°
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCabinTempF((t) => Math.min(73, Number((t + 1).toFixed(1))))
                  }
                  className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white hover:bg-white/[0.15]"
                >
                  +1°
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-periwinkle-500/35 bg-periwinkle-500/10 p-4">
            <div className="flex items-center justify-between text-xs text-periwinkle-300">
              <span>Active Route Yield</span>
              <Zap className="h-4 w-4 text-periwinkle-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-extrabold text-white">
                {formatCurrency(settledRouteRevenue)}
              </span>
              <span className="font-mono text-xs font-bold text-emerald-400">
                / {formatCurrency(totalRouteRevenue)} ({totalMiles} mi)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* INTERACTIVE LIVE GPS VECTOR MAP & CURBSIDE RADAR */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="glass-card overflow-hidden p-5 lg:col-span-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                <h2 className="text-sm font-bold text-white">
                  Live Coastal Zip-Cluster GPS Radar (Click Any Stop Pin to Drive
                  Van)
                </h2>
              </div>
              <p className="text-[11px] text-zinc-400">
                Currently parked at Stop #{activeStop.stopNumber}:{' '}
                <strong className="text-periwinkle-300">
                  {activeStop.address}
                </strong>{' '}
                ({activeStop.petName} • {activeStop.breed})
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {stops.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleJumpToStop(idx)}
                  className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-bold transition ${
                    activeStopIndex === idx
                      ? 'bg-emerald-500 text-obsidian-950 shadow-emerald-glow'
                      : 'border border-white/[0.1] bg-obsidian-900 text-zinc-300 hover:border-periwinkle-500/40'
                  }`}
                >
                  Stop #{s.stopNumber}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive SVG Coastal Map Canvas */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#080B12]">
            <svg
              viewBox="0 0 760 300"
              className="h-72 w-full select-none sm:h-80"
            >
              <defs>
                <linearGradient id="oceanGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0E2238" stopOpacity="0.65" />
                  <stop offset="100%" stopColor="#07111E" stopOpacity="0.95" />
                </linearGradient>
                <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="55%" stopColor="#8B95FF" />
                  <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
              </defs>

              {/* Pacific Ocean Coastline */}
              <path
                d="M 0,190 Q 190,220 360,250 T 760,295 L 0,300 Z"
                fill="url(#oceanGrad)"
              />
              <path
                d="M 0,190 Q 190,220 360,250 T 760,295"
                fill="none"
                stroke="#38BDF8"
                strokeOpacity="0.25"
                strokeWidth="2"
              />
              <text
                x="35"
                y="265"
                fill="#38BDF8"
                fillOpacity="0.45"
                fontSize="11"
                fontFamily="monospace"
                fontWeight="bold"
              >
                PACIFIC COAST HIGHWAY • SANTA MONICA BAY
              </text>

              {/* Subtle Metro Arterial Grid */}
              {[70, 140, 210].map((y) => (
                <line
                  key={`lat-${y}`}
                  x1="0"
                  y1={y}
                  x2="760"
                  y2={y}
                  stroke="#FFFFFF"
                  strokeOpacity="0.04"
                  strokeDasharray="4 6"
                />
              ))}
              {[150, 300, 460, 620].map((x) => (
                <line
                  key={`lng-${x}`}
                  x1={x}
                  y1="0"
                  x2={x}
                  y2="300"
                  stroke="#FFFFFF"
                  strokeOpacity="0.04"
                  strokeDasharray="4 6"
                />
              ))}

              {/* Zip Cluster Zones */}
              {stops.map((stop) => (
                <g key={`zone-${stop.id}`}>
                  <circle
                    cx={stop.mapX}
                    cy={stop.mapY}
                    r="42"
                    fill="#8B95FF"
                    fillOpacity="0.05"
                    stroke="#8B95FF"
                    strokeOpacity="0.16"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={stop.mapX}
                    y={stop.mapY - 48}
                    textAnchor="middle"
                    fill="#A1A1AA"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    ZIP {stop.zipCode} • {stop.neighborhood.toUpperCase()}
                  </text>
                </g>
              ))}

              {/* Optimized Route Polyline */}
              <polyline
                points={stops.map((s) => `${s.mapX},${s.mapY}`).join(' ')}
                fill="none"
                stroke="url(#routeGrad)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Stop Waypoint Nodes */}
              {stops.map((stop, idx) => {
                const isCurrent = idx === activeStopIndex;
                const isDone = idx < activeStopIndex;
                return (
                  <g
                    key={`pin-${stop.id}`}
                    className="cursor-pointer"
                    onClick={() => handleJumpToStop(idx)}
                  >
                    {isCurrent && (
                      <circle
                        cx={stop.mapX}
                        cy={stop.mapY}
                        r="24"
                        fill="#10B981"
                        fillOpacity="0.22"
                      />
                    )}
                    <circle
                      cx={stop.mapX}
                      cy={stop.mapY}
                      r="14"
                      fill={
                        isCurrent
                          ? '#10B981'
                          : isDone
                          ? '#1E293B'
                          : '#110E14'
                      }
                      stroke={
                        isCurrent
                          ? '#A7F3D0'
                          : isDone
                          ? '#10B981'
                          : '#8B95FF'
                      }
                      strokeWidth="2.5"
                    />
                    <text
                      x={stop.mapX}
                      y={stop.mapY + 4}
                      textAnchor="middle"
                      fill={isCurrent ? '#0B090E' : '#FFFFFF'}
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      #{stop.stopNumber}
                    </text>
                    <rect
                      x={stop.mapX - 54}
                      y={stop.mapY + 19}
                      width="108"
                      height="22"
                      rx="6"
                      fill="#0B090E"
                      fillOpacity="0.9"
                      stroke="#FFFFFF"
                      strokeOpacity="0.12"
                    />
                    <text
                      x={stop.mapX}
                      y={stop.mapY + 33}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="10"
                      fontWeight="bold"
                    >
                      {stop.petName} (${stop.price})
                    </text>
                  </g>
                );
              })}

              {/* Active Sprinter Van Live GPS Beacon */}
              <g
                transform={`translate(${activeStop.mapX - 42}, ${
                  activeStop.mapY - 42
                })`}
              >
                <rect
                  x="0"
                  y="0"
                  width="84"
                  height="20"
                  rx="10"
                  fill="#8B95FF"
                />
                <text
                  x="42"
                  y="13"
                  textAnchor="middle"
                  fill="#0B090E"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  🚐 VAN #1 LIVE
                </text>
              </g>
            </svg>
          </div>
        </div>

        {/* Right 4 Cols: Active Curbside Stop Dossier & Gate Instructions */}
        <div className="glass-card flex flex-col justify-between p-5 lg:col-span-4">
          <div>
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Active Driveway Dossier • Stop #{activeStop.stopNumber}
                </span>
                <h3 className="text-lg font-extrabold text-white">
                  {activeStop.petName} ({activeStop.breed})
                </h3>
              </div>
              <span className="rounded-xl bg-periwinkle-500/20 px-2.5 py-1 font-mono text-xs font-bold text-periwinkle-300">
                {formatCurrency(activeStop.price)}
              </span>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="rounded-xl border border-white/[0.08] bg-obsidian-900/80 p-3">
                <div className="text-[11px] font-semibold text-zinc-400">
                  Driveway Address & Gate Access Note
                </div>
                <div className="mt-1 font-bold text-white">
                  {activeStop.address}
                </div>
                <p className="mt-1 text-emerald-300">{activeStop.gateNote}</p>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-zinc-400">
                  Active Pet Safety Auras
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {activeStop.behaviorTags.map((tag) => (
                    <BehaviorAuraBadge key={tag} tag={tag} size="xs" />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.07] bg-obsidian-900/60 p-3">
                <div>
                  <span className="text-[10px] text-zinc-400">Pet Parent</span>
                  <div className="font-bold text-white">
                    {activeStop.clientName}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400">Direct SMS</span>
                  <div className="font-mono text-zinc-200">
                    {activeStop.phone}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2 pt-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={() => handleSendCurbsideEta(activeStop)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-periwinkle-500 py-2.5 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Dispatch &ldquo;{activeStop.driveMinutesFromPrev}m Away&rdquo; ETA
              SMS
            </button>
            <button
              type="button"
              onClick={() => setShowParentTrackerModal(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Open Pet Parent Uber-Style Live View
            </button>
          </div>
        </div>
      </div>

      {/* Curbside Stop Sequence */}
      <div className="mt-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-white">
            Today’s Curbside Sequence ({stops.length} Driveway Stops •{' '}
            {totalDriveMinutes}m Total Drive)
          </h2>
          {isOptimized && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Clustered within 2.8-Mile Radius (42m Traffic Saved)
            </span>
          )}
        </div>

        <div className="space-y-3">
          {stops.map((stop, idx) => {
            const isActive = idx === activeStopIndex;
            const isCompleted = stop.status === 'completed';
            return (
              <div
                key={stop.id}
                onClick={() => handleJumpToStop(idx)}
                className={`cursor-pointer rounded-2xl border p-5 transition-all ${
                  isActive
                    ? 'border-periwinkle-500 bg-obsidian-700/95 shadow-periwinkle-glow'
                    : isCompleted
                    ? 'border-emerald-500/30 bg-obsidian-800/60 opacity-85'
                    : 'border-white/[0.08] bg-obsidian-800/85 hover:border-white/[0.16]'
                }`}
              >
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-mono text-sm font-extrabold ${
                        isActive
                          ? 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow'
                          : isCompleted
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-obsidian-900 text-zinc-300 border border-white/[0.1]'
                      }`}
                    >
                      #{stop.stopNumber}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-periwinkle-300">
                          {stop.timeWindow}
                        </span>
                        <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                          +{stop.driveMinutesFromPrev}m drive (
                          {stop.milesFromPrev} mi)
                        </span>
                        <span className="rounded-full border border-white/[0.1] bg-obsidian-900 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                          {stop.neighborhood}
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-baseline gap-2">
                        <h3 className="text-lg font-extrabold text-white">
                          {stop.petName} ({stop.breed})
                        </h3>
                        <span className="text-xs text-zinc-400">
                          • Parent: {stop.clientName} ({stop.phone})
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-300">
                        <MapPin className="h-3.5 w-3.5 text-periwinkle-400" />
                        <span>{stop.address}</span>
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {stop.behaviorTags.map((tag) => (
                          <BehaviorAuraBadge key={tag} tag={tag} size="xs" />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3 lg:flex-col lg:items-end lg:border-t-0 lg:pt-0">
                    <div className="text-left lg:text-right">
                      <div className="text-xs text-zinc-400">
                        {stop.packageName}
                      </div>
                      <div className="font-mono text-lg font-extrabold text-white">
                        {formatCurrency(stop.price)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendCurbsideEta(stop);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                          stop.etaSmsSent
                            ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                            : 'bg-periwinkle-500 text-obsidian-950 shadow-periwinkle-glow hover:bg-periwinkle-400'
                        }`}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {stop.etaSmsSent
                          ? 'ETA SMS Sent ✓'
                          : `Text "${stop.driveMinutesFromPrev}m Away" ETA`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* UBER-STYLE PET PARENT LIVE CURBSIDE VAN TRACKER PREVIEW MODAL */}
      {showParentTrackerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.15] bg-obsidian-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] bg-obsidian-800 px-5 py-4">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase text-emerald-400">
                  LIVE PET PARENT SMS LINK PREVIEW
                </span>
                <h3 className="text-base font-bold text-white">
                  pawtrackr.live/track/{selectedVanId}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowParentTrackerModal(false)}
                className="rounded-lg border border-white/[0.1] px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
                <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-0.5 text-[11px] font-bold text-obsidian-950">
                  <Truck className="h-3.5 w-3.5" />
                  ARRIVING IN {activeStop.driveMinutesFromPrev} MINUTES
                </div>
                <h4 className="mt-2 text-xl font-extrabold text-white">
                  Marcus is En Route for {activeStop.petName}!
                </h4>
                <p className="mt-1 text-xs text-zinc-300">
                  Destination: {activeStop.address}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                <div className="rounded-xl border border-white/[0.08] bg-obsidian-800 p-3">
                  <div className="text-[10px] text-zinc-400">Cabin Temp</div>
                  <div className="mt-1 font-mono font-bold text-emerald-400">
                    {cabinTempF.toFixed(1)}°F Safe
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-obsidian-800 p-3">
                  <div className="text-[10px] text-zinc-400">Hydro Water</div>
                  <div className="mt-1 font-mono font-bold text-sky-300">
                    UV-Filtered
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-obsidian-800 p-3">
                  <div className="text-[10px] text-zinc-400">1-on-1 Cage</div>
                  <div className="mt-1 font-bold text-periwinkle-300">
                    100% Cage-Free
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-obsidian-800/80 p-3.5 text-xs">
                <div className="font-semibold text-zinc-300">
                  Your Driveway Note on File:
                </div>
                <p className="mt-1 text-emerald-300">{activeStop.gateNote}</p>
              </div>

              <button
                type="button"
                onClick={() => setShowParentTrackerModal(false)}
                className="w-full rounded-xl bg-periwinkle-500 py-3 text-xs font-bold text-obsidian-950 shadow-periwinkle-glow"
              >
                Done Previewing Client Mobile Tracker
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
