'use client';

import React, { useEffect, useState } from 'react';
import {
  BatteryCharging,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  Droplets,
  ExternalLink,
  Fuel,
  Key,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  RefreshCw,
  Sliders,
  Sparkles,
  Truck,
  Users,
  Zap,
} from 'lucide-react';
import { LiveWorkspaceShell } from '@/components/LiveWorkspaceShell';
import {
  CurbsideStatus,
  formatCurbsideSms,
  formatVanTelemetryStatus,
  calculateRouteMetrics,
  FleetStop,
  VanTelemetry,
} from '@/lib/live-fleet';

export default function LiveFleetPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vans, setVans] = useState<VanTelemetry[]>([]);
  const [selectedVanId, setSelectedVanId] = useState<string>('');
  const [stops, setStops] = useState<FleetStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals & Drawers
  const [telemetryModalOpen, setTelemetryModalOpen] = useState(false);
  const [smsModalStop, setSmsModalStop] = useState<FleetStop | null>(null);
  const [smsCopied, setSmsCopied] = useState(false);
  const [advancingVisitId, setAdvancingVisitId] = useState<string | null>(null);
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [isSubmittingTelemetry, setIsSubmittingTelemetry] = useState(false);
  const [telemetryForm, setTelemetryForm] = useState({
    battery_pct: 85,
    water_tank_pct: 80,
    gray_water_pct: 20,
    odometer_miles: 14500,
  });

  const fetchFleetData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/fleet/dispatch?date=${selectedDate}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error || 'Failed to load fleet dispatch data');
        setLoading(false);
        return;
      }
      const data = await res.json();
      const rawVans = Array.isArray(data.vans) ? data.vans : [];
      const mappedVans: VanTelemetry[] = rawVans.map((v: Record<string, unknown>) => ({
        stationId: String(v.id || ''),
        stationName: String(v.name || 'Mobile Van'),
        licensePlate: v.license_plate ? String(v.license_plate) : undefined,
        batteryPct: Number(v.battery_pct ?? 100),
        waterTankPct: Number(v.water_tank_pct ?? 100),
        grayWaterPct: Number(v.gray_water_pct ?? 0),
        odometerMiles: v.odometer_miles ? Number(v.odometer_miles) : undefined,
        currentLat: v.current_lat ? Number(v.current_lat) : undefined,
        currentLng: v.current_lng ? Number(v.current_lng) : undefined,
        lastTelemetryAt: v.last_telemetry_at ? String(v.last_telemetry_at) : undefined,
      }));

      setVans(mappedVans);
      if (mappedVans.length > 0 && !selectedVanId) {
        setSelectedVanId(mappedVans[0].stationId);
      }

      const rawStops = Array.isArray(data.stops) ? data.stops : [];
      const mappedStops: FleetStop[] = rawStops.map((s: Record<string, unknown>, idx: number) => {
        const client = (s.client as Record<string, unknown>) || {};
        const pet = (s.pet as Record<string, unknown>) || {};
        return {
          id: String(s.id || ''),
          visitId: String(s.id || ''),
          stopSequence: Number(s.stop_sequence ?? idx + 1),
          clientName: String(client.name || 'Client'),
          clientPhone: String(client.phone || ''),
          curbsideAddress: String(s.curbside_address || client.address || 'Address on file'),
          gateCode: s.gate_code ? String(s.gate_code) : undefined,
          petName: String(pet.name || 'Pet'),
          petBreed: String(pet.breed || 'Mixed Breed'),
          servicePackage: String(s.service_package || 'Service Package'),
          curbsideStatus: (String(s.curbside_status || 'scheduled')) as CurbsideStatus,
          scheduledTime: String(s.scheduled_time || ''),
          driveMinutesFromPrev: Number(s.drive_minutes_from_prev || 0),
          milesFromPrev: Number(s.miles_from_prev || 0),
        };
      });

      setStops(mappedStops);
    } catch {
      setErrorMsg('Network error loading fleet data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFleetData();
  }, [selectedDate]);

  const activeVan = vans.find((v) => v.stationId === selectedVanId) || vans[0];
  const telemetryHealth = activeVan
    ? formatVanTelemetryStatus({
        batteryPct: activeVan.batteryPct,
        waterTankPct: activeVan.waterTankPct,
        grayWaterPct: activeVan.grayWaterPct,
      })
    : null;

  const routeMetrics = calculateRouteMetrics(stops);

  const handleAdvanceStatus = async (visitId: string, nextStatus: CurbsideStatus) => {
    setFleetError(null);
    setAdvancingVisitId(visitId);
    try {
      const res = await fetch(`/api/fleet/stops/${visitId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_status: nextStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFleetError(`Stop transition error: ${err.error || 'Failed'}`);
        return;
      }
      await fetchFleetData();
    } catch {
      setFleetError('Network error advancing stop status');
    } finally {
      setAdvancingVisitId(null);
    }
  };

  const handleUpdateTelemetry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVan || isSubmittingTelemetry) return;

    setFleetError(null);
    setIsSubmittingTelemetry(true);
    try {
      const res = await fetch('/api/fleet/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: activeVan.stationId,
          battery_pct: telemetryForm.battery_pct,
          water_tank_pct: telemetryForm.water_tank_pct,
          gray_water_pct: telemetryForm.gray_water_pct,
          odometer_miles: telemetryForm.odometer_miles,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFleetError(`Telemetry update error: ${err.error || 'Failed'}`);
        return;
      }
      setTelemetryModalOpen(false);
      await fetchFleetData();
    } catch {
      setFleetError('Network error updating telemetry');
    } finally {
      setIsSubmittingTelemetry(false);
    }
  };

  return (
    <LiveWorkspaceShell salonName="Pawtrackr Mobile Fleet">
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-between rounded-xl bg-gradient-to-br from-[#8B95FF]/20 to-purple-500/20 border border-[#8B95FF]/30 p-2 text-[#8B95FF]">
                <Truck className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Mobile Van & Hybrid Fleet Dispatch
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                    Live Telemetry
                  </span>
                </h1>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Curbside arrival tracking, fresh/gray water telemetry, and route stop sequencing (WF22).
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-[#13111A] px-3 py-1.5 text-xs font-medium text-white shadow-inner focus:border-[#8B95FF] focus:outline-none"
            />
            <button
              onClick={fetchFleetData}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#181524] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-[#201C30] transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {(errorMsg || fleetError) && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300 flex items-center justify-between">
            <span>{errorMsg || fleetError}</span>
            {fleetError && (
              <button
                type="button"
                onClick={() => setFleetError(null)}
                className="text-amber-400 hover:text-white ml-2"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Telemetry & Route KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#13111A]/80 p-4 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>Selected Mobile Unit</span>
              <Truck className="h-4 w-4 text-[#8B95FF]" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-bold text-white">
                {activeVan ? activeVan.stationName : 'No Active Vans'}
              </span>
              {activeVan?.licensePlate && (
                <span className="text-[11px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                  {activeVan.licensePlate}
                </span>
              )}
            </div>
            {activeVan && (
              <button
                onClick={() => {
                  setTelemetryForm({
                    battery_pct: activeVan.batteryPct,
                    water_tank_pct: activeVan.waterTankPct,
                    gray_water_pct: activeVan.grayWaterPct,
                    odometer_miles: activeVan.odometerMiles || 14500,
                  });
                  setTelemetryModalOpen(true);
                }}
                className="mt-3 text-[11px] font-medium text-[#8B95FF] hover:underline flex items-center gap-1"
              >
                <Sliders className="h-3 w-3" /> Adjust Telemetry
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#13111A]/80 p-4 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>Battery Reserve</span>
              <BatteryCharging className={`h-4 w-4 ${telemetryHealth?.batteryStatus === 'critical' ? 'text-rose-400' : 'text-emerald-400'}`} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{activeVan ? `${activeVan.batteryPct}%` : '—'}</span>
              <span className={`text-xs font-semibold ${telemetryHealth?.batteryStatus === 'critical' ? 'text-rose-400' : telemetryHealth?.batteryStatus === 'warning' ? 'text-amber-400' : 'text-emerald-400'}`}>
                {telemetryHealth?.batteryStatus.toUpperCase() || 'OK'}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full ${telemetryHealth?.batteryStatus === 'critical' ? 'bg-rose-500' : telemetryHealth?.batteryStatus === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${activeVan?.batteryPct || 0}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#13111A]/80 p-4 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>Fresh Water Tank</span>
              <Droplets className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{activeVan ? `${activeVan.waterTankPct}%` : '—'}</span>
              <span className="text-xs text-zinc-400">capacity</span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500"
                style={{ width: `${activeVan?.waterTankPct || 0}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#13111A]/80 p-4 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>Route Progress</span>
              <Navigation className="h-4 w-4 text-[#8B95FF]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">
                {routeMetrics.completedStops} / {routeMetrics.totalStops}
              </span>
              <span className="text-xs text-zinc-400">stops done</span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              {routeMetrics.totalMiles} mi total • ~{routeMetrics.totalDriveMinutes} min drive
            </p>
          </div>
        </div>

        {/* Warning Banner if telemetry degraded */}
        {telemetryHealth && telemetryHealth.warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-xs text-amber-200">
            <Zap className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">Van Telemetry Advisory</p>
              <ul className="mt-1 list-disc list-inside space-y-0.5 text-zinc-300">
                {telemetryHealth.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Curbside Route Sequence */}
        <div className="rounded-2xl border border-white/10 bg-[#13111A]/80 p-5 shadow-2xl backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Navigation className="h-4 w-4 text-[#8B95FF]" />
                Scheduled Curbside Stops ({stops.length})
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Stops progress through geofenced state transitions: En Route → Arrived → Curbside Active → Completed.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-zinc-500">Loading curbside stops...</div>
          ) : stops.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-white/10 rounded-xl">
              No stops scheduled for {selectedDate}. Use the live calendar to schedule mobile visits.
            </div>
          ) : (
            <div className="space-y-3">
              {stops.map((stop, idx) => {
                const isCompleted = stop.curbsideStatus === 'completed';
                const isActive = stop.curbsideStatus === 'curbside_active';
                const isEnRoute = stop.curbsideStatus === 'en_route';
                const isArrived = stop.curbsideStatus === 'arrived';

                return (
                  <div
                    key={stop.id}
                    className={`rounded-xl border p-4 transition ${
                      isActive
                        ? 'border-[#8B95FF]/50 bg-[#8B95FF]/5 shadow-lg shadow-[#8B95FF]/5'
                        : isCompleted
                        ? 'border-white/5 bg-white/[0.02] opacity-75'
                        : 'border-white/10 bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: Sequence & Client Info */}
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white">
                          #{stop.stopSequence}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white text-sm">{stop.clientName}</span>
                            <span className="text-xs text-zinc-400">• {stop.petName} ({stop.petBreed})</span>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                              isCompleted
                                ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                                : isActive
                                ? 'bg-[#8B95FF]/20 text-[#8B95FF] border-[#8B95FF]/30 animate-pulse'
                                : isArrived
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : isEnRoute
                                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                                : 'bg-white/5 text-zinc-300 border-white/10'
                            }`}>
                              {stop.curbsideStatus.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                            <span className="flex items-center gap-1 text-zinc-300">
                              <MapPin className="h-3 w-3 text-rose-400" />
                              {stop.curbsideAddress}
                            </span>
                            {stop.gateCode && (
                              <span className="flex items-center gap-1 font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                <Key className="h-3 w-3" /> Gate: {stop.gateCode}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {stop.clientPhone}
                            </span>
                            <span className="flex items-center gap-1 text-zinc-400">
                              <Clock className="h-3 w-3" /> {stop.servicePackage}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Curbside Action Controls */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => {
                            setSmsModalStop(stop);
                            setSmsCopied(false);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[#181524] px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-[#201C30]"
                          title="Generate and copy curbside SMS update"
                        >
                          <MessageSquare className="h-3 w-3 text-[#8B95FF]" /> SMS
                        </button>

                        {stop.curbsideStatus === 'scheduled' && (
                          <button
                            disabled={advancingVisitId === stop.visitId}
                            onClick={() => handleAdvanceStatus(stop.visitId, 'en_route')}
                            className={`inline-flex items-center gap-1 rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 transition shadow-lg shadow-cyan-600/20 ${
                              advancingVisitId === stop.visitId ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            <Navigation className="h-3.5 w-3.5" /> {advancingVisitId === stop.visitId ? 'Updating...' : 'En Route'}
                          </button>
                        )}

                        {stop.curbsideStatus === 'en_route' && (
                          <button
                            disabled={advancingVisitId === stop.visitId}
                            onClick={() => handleAdvanceStatus(stop.visitId, 'arrived')}
                            className={`inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-600/20 ${
                              advancingVisitId === stop.visitId ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            <MapPin className="h-3.5 w-3.5" /> {advancingVisitId === stop.visitId ? 'Updating...' : 'Arrived Curbside'}
                          </button>
                        )}

                        {stop.curbsideStatus === 'arrived' && (
                          <button
                            disabled={advancingVisitId === stop.visitId}
                            onClick={() => handleAdvanceStatus(stop.visitId, 'curbside_active')}
                            className={`inline-flex items-center gap-1 rounded-xl bg-[#8B95FF] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#9FA8FF] transition shadow-lg shadow-[#8B95FF]/20 ${
                              advancingVisitId === stop.visitId ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            <Zap className="h-3.5 w-3.5" /> {advancingVisitId === stop.visitId ? 'Updating...' : 'Start Curbside Groom'}
                          </button>
                        )}

                        {stop.curbsideStatus === 'curbside_active' && (
                          <button
                            disabled={advancingVisitId === stop.visitId}
                            onClick={() => handleAdvanceStatus(stop.visitId, 'completed')}
                            className={`inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-600/20 ${
                              advancingVisitId === stop.visitId ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> {advancingVisitId === stop.visitId ? 'Updating...' : 'Complete Stop'}
                          </button>
                        )}

                        {isCompleted && (
                          <span className="text-xs text-zinc-500 italic flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Finished
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Telemetry Updater Modal */}
        {telemetryModalOpen && activeVan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#13111A] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-[#8B95FF]" />
                  Telemetry Ping: {activeVan.stationName}
                </h3>
                <button
                  type="button"
                  aria-label="Close telemetry dialog"
                  onClick={() => setTelemetryModalOpen(false)}
                  className="text-xs text-zinc-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-periwinkle-500"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateTelemetry} className="space-y-3 text-xs">
                <div>
                  <label htmlFor="telemetry-battery" className="block text-zinc-400 mb-1">Battery Level (%)</label>
                  <input
                    id="telemetry-battery"
                    type="number"
                    min="0"
                    max="100"
                    value={telemetryForm.battery_pct}
                    onChange={(e) =>
                      setTelemetryForm({ ...telemetryForm, battery_pct: parseInt(e.target.value) || 0 })
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2 text-white"
                  />
                </div>

                <div>
                  <label htmlFor="telemetry-water-tank" className="block text-zinc-400 mb-1">Fresh Water Tank (%)</label>
                  <input
                    id="telemetry-water-tank"
                    type="number"
                    min="0"
                    max="100"
                    value={telemetryForm.water_tank_pct}
                    onChange={(e) =>
                      setTelemetryForm({ ...telemetryForm, water_tank_pct: parseInt(e.target.value) || 0 })
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2 text-white"
                  />
                </div>

                <div>
                  <label htmlFor="telemetry-gray-water" className="block text-zinc-400 mb-1">Gray Water Tank (%)</label>
                  <input
                    id="telemetry-gray-water"
                    type="number"
                    min="0"
                    max="100"
                    value={telemetryForm.gray_water_pct}
                    onChange={(e) =>
                      setTelemetryForm({ ...telemetryForm, gray_water_pct: parseInt(e.target.value) || 0 })
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2 text-white"
                  />
                </div>

                <div>
                  <label htmlFor="telemetry-odometer" className="block text-zinc-400 mb-1">Odometer Reading (Miles)</label>
                  <input
                    id="telemetry-odometer"
                    type="number"
                    value={telemetryForm.odometer_miles}
                    onChange={(e) =>
                      setTelemetryForm({ ...telemetryForm, odometer_miles: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2 text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setTelemetryModalOpen(false)}
                    className="rounded-xl border border-white/10 px-3 py-1.5 text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingTelemetry}
                    className={`rounded-xl bg-[#8B95FF] px-4 py-1.5 font-semibold text-black hover:bg-[#9FA8FF] ${
                      isSubmittingTelemetry ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isSubmittingTelemetry ? 'Broadcasting...' : 'Broadcast Ping'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SMS Preview Copy Modal */}
        {smsModalStop && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#13111A] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[#8B95FF]" />
                  Curbside Notification Text
                </h3>
                <button onClick={() => setSmsModalStop(null)} className="text-xs text-zinc-400 hover:text-white">
                  ✕
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-zinc-200 font-mono leading-relaxed">
                {formatCurbsideSms(
                  smsModalStop.clientName,
                  smsModalStop.petName,
                  smsModalStop.curbsideStatus,
                  smsModalStop.driveMinutesFromPrev || 15
                )}
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-[11px] text-zinc-400">Recipient: {smsModalStop.clientPhone}</span>
                <button
                  onClick={() => {
                    const text = formatCurbsideSms(
                      smsModalStop.clientName,
                      smsModalStop.petName,
                      smsModalStop.curbsideStatus,
                      smsModalStop.driveMinutesFromPrev || 15
                    );
                    navigator.clipboard.writeText(text);
                    setSmsCopied(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B95FF] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#9FA8FF]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {smsCopied ? 'Copied to Clipboard!' : 'Copy SMS Text'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LiveWorkspaceShell>
  );
}
