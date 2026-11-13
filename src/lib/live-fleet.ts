/**
 * Live Fleet Dispatch & Curbside Operations Engine (WF22 / Mobile Fleet)
 *
 * Enforces:
 * - Curbside Stop state machine: scheduled -> en_route -> arrived -> curbside_active -> completed (PW071)
 * - Van telemetry threshold classification (PW070)
 * - Client SMS notification templates for curbside milestones
 * - Route summary metrics (mileage, drive time, stop progression)
 */

export type CurbsideStatus =
  | 'scheduled'
  | 'en_route'
  | 'arrived'
  | 'curbside_active'
  | 'completed'
  | 'cancelled';

export interface VanTelemetry {
  stationId: string;
  stationName: string;
  licensePlate?: string;
  batteryPct: number;
  waterTankPct: number;
  grayWaterPct: number;
  odometerMiles?: number;
  currentLat?: number;
  currentLng?: number;
  lastTelemetryAt?: string;
}

export interface FleetStop {
  id: string;
  visitId: string;
  stopSequence: number;
  clientName: string;
  clientPhone: string;
  curbsideAddress: string;
  gateCode?: string;
  petName: string;
  petBreed: string;
  servicePackage: string;
  curbsideStatus: CurbsideStatus;
  scheduledTime: string;
  driveMinutesFromPrev: number;
  milesFromPrev: number;
}

export interface RouteMetrics {
  totalStops: number;
  completedStops: number;
  remainingStops: number;
  totalDriveMinutes: number;
  totalMiles: number;
  activeStopIndex: number;
}

export interface TelemetryHealth {
  batteryStatus: 'good' | 'warning' | 'critical';
  freshWaterStatus: 'good' | 'warning' | 'critical';
  grayWaterStatus: 'good' | 'warning' | 'critical';
  canStartService: boolean;
  warnings: string[];
}

/**
 * Validates curbside stop transition according to state machine rules (PW071).
 * Forward progressions:
 *   scheduled -> en_route
 *   en_route -> arrived
 *   arrived -> curbside_active
 *   curbside_active -> completed
 * Any backward or arbitrary transition requires manager/owner role.
 */
export function validateCurbsideTransition(
  current: CurbsideStatus,
  next: CurbsideStatus,
  isManager: boolean = false
): { allowed: boolean; reason?: string } {
  if (current === next) {
    return { allowed: false, reason: `Stop is already in state '${current}'` };
  }

  if (next === 'cancelled') {
    return { allowed: true };
  }

  const validProgressions: Record<CurbsideStatus, CurbsideStatus[]> = {
    scheduled: ['en_route'],
    en_route: ['arrived'],
    arrived: ['curbside_active'],
    curbside_active: ['completed'],
    completed: [],
    cancelled: [],
  };

  const allowedNext = validProgressions[current] || [];
  if (allowedNext.includes(next)) {
    return { allowed: true };
  }

  if (isManager) {
    return { allowed: true, reason: 'Manager override permitted non-linear transition' };
  }

  return {
    allowed: false,
    reason: `Invalid transition from '${current}' to '${next}'. Manager role required to override.`,
  };
}

/**
 * Formats polite, professional curbside SMS notifications for pet parents.
 */
export function formatCurbsideSms(
  clientName: string,
  petName: string,
  status: CurbsideStatus,
  etaMinutes?: number
): string {
  const firstName = clientName.split(' ')[0] || 'there';

  switch (status) {
    case 'en_route': {
      const etaText = etaMinutes ? ` We estimate arrival in ~${etaMinutes} minutes.` : '';
      return `Hi ${firstName}! Pawtrackr Mobile is en route for ${petName}'s grooming session.${etaText} Please ensure gates are unlocked and pets are secured inside.`;
    }
    case 'arrived':
      return `Hi ${firstName}, our mobile salon has arrived curbside for ${petName}! We are setting up and will be at your door in just a moment.`;
    case 'curbside_active':
      return `Hi ${firstName}, ${petName}'s grooming session is now underway in our mobile suite! We will text you as soon as styling is finished.`;
    case 'completed':
      return `All done! ${petName} looks fabulous and is ready to head back inside. Please meet us curbside!`;
    default:
      return `Pawtrackr Mobile update for ${petName}: Your appointment is currently marked as ${status}.`;
  }
}

/**
 * Evaluates mobile van resource levels (battery, fresh water, gray water).
 * - Battery: < 20% critical, < 35% warning
 * - Fresh Water: < 15% critical, < 30% warning
 * - Gray Water: > 85% critical, > 70% warning
 */
export function formatVanTelemetryStatus(van: {
  batteryPct: number;
  waterTankPct: number;
  grayWaterPct?: number;
}): TelemetryHealth {
  const batteryPct = Math.max(0, Math.min(100, van.batteryPct));
  const waterTankPct = Math.max(0, Math.min(100, van.waterTankPct));
  const grayWaterPct = Math.max(0, Math.min(100, van.grayWaterPct ?? 0));

  const warnings: string[] = [];

  let batteryStatus: 'good' | 'warning' | 'critical' = 'good';
  if (batteryPct <= 20) {
    batteryStatus = 'critical';
    warnings.push(`Battery critically low (${batteryPct}%). Connect shoreline or generator.`);
  } else if (batteryPct <= 35) {
    batteryStatus = 'warning';
    warnings.push(`Battery low (${batteryPct}%). Monitor power consumption.`);
  }

  let freshWaterStatus: 'good' | 'warning' | 'critical' = 'good';
  if (waterTankPct <= 15) {
    freshWaterStatus = 'critical';
    warnings.push(`Fresh water critically low (${waterTankPct}%). Refill required.`);
  } else if (waterTankPct <= 30) {
    freshWaterStatus = 'warning';
    warnings.push(`Fresh water low (${waterTankPct}%).`);
  }

  let grayWaterStatus: 'good' | 'warning' | 'critical' = 'good';
  if (grayWaterPct >= 85) {
    grayWaterStatus = 'critical';
    warnings.push(`Gray water tank near capacity (${grayWaterPct}%). Dump station required.`);
  } else if (grayWaterPct >= 70) {
    grayWaterStatus = 'warning';
    warnings.push(`Gray water tank filling (${grayWaterPct}%).`);
  }

  const canStartService = batteryStatus !== 'critical' && freshWaterStatus !== 'critical' && grayWaterStatus !== 'critical';

  return {
    batteryStatus,
    freshWaterStatus,
    grayWaterStatus,
    canStartService,
    warnings,
  };
}

/**
 * Aggregates drive time, total mileage, and completed stop metrics for a route sequence.
 */
export function calculateRouteMetrics(stops: FleetStop[]): RouteMetrics {
  const totalStops = stops.length;
  let completedStops = 0;
  let totalDriveMinutes = 0;
  let totalMiles = 0;
  let activeStopIndex = -1;

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    totalDriveMinutes += s.driveMinutesFromPrev || 0;
    totalMiles += Number(s.milesFromPrev || 0);

    if (s.curbsideStatus === 'completed') {
      completedStops++;
    } else if (activeStopIndex === -1 && s.curbsideStatus !== 'cancelled') {
      activeStopIndex = i;
    }
  }

  return {
    totalStops,
    completedStops,
    remainingStops: Math.max(0, totalStops - completedStops),
    totalDriveMinutes,
    totalMiles: Math.round(totalMiles * 10) / 10,
    activeStopIndex: activeStopIndex === -1 ? totalStops : activeStopIndex,
  };
}
