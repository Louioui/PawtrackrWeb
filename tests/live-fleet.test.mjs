import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCurbsideTransition,
  formatVanTelemetryStatus,
  calculateRouteMetrics,
  formatCurbsideSms,
} from '../src/lib/live-fleet.ts';
import {
  sanitizeCsvCell,
  parseCompetitorCsv,
} from '../src/lib/live-import-export.ts';

test('Curbside State Machine - valid linear progression (PW071)', () => {
  assert.equal(validateCurbsideTransition('scheduled', 'en_route').allowed, true);
  assert.equal(validateCurbsideTransition('en_route', 'arrived').allowed, true);
  assert.equal(validateCurbsideTransition('arrived', 'curbside_active').allowed, true);
  assert.equal(validateCurbsideTransition('curbside_active', 'completed').allowed, true);
});

test('Curbside State Machine - rejects invalid transition without manager override (PW071)', () => {
  const jumpRes = validateCurbsideTransition('scheduled', 'curbside_active', false);
  assert.equal(jumpRes.allowed, false);
  assert.match(jumpRes.reason || '', /Manager role required/);

  const backwardRes = validateCurbsideTransition('curbside_active', 'en_route', false);
  assert.equal(backwardRes.allowed, false);
});

test('Curbside State Machine - permits manager override for non-linear correction', () => {
  const managerOverride = validateCurbsideTransition('curbside_active', 'arrived', true);
  assert.equal(managerOverride.allowed, true);
  assert.match(managerOverride.reason || '', /Manager override/);
});

test('Van Telemetry Health - threshold evaluation (PW070)', () => {
  // Critical battery
  const critBattery = formatVanTelemetryStatus({ batteryPct: 15, waterTankPct: 80, grayWaterPct: 20 });
  assert.equal(critBattery.batteryStatus, 'critical');
  assert.equal(critBattery.canStartService, false);

  // Critical water
  const critWater = formatVanTelemetryStatus({ batteryPct: 90, waterTankPct: 10, grayWaterPct: 20 });
  assert.equal(critWater.freshWaterStatus, 'critical');
  assert.equal(critWater.canStartService, false);

  // Critical gray water
  const critGray = formatVanTelemetryStatus({ batteryPct: 90, waterTankPct: 80, grayWaterPct: 90 });
  assert.equal(critGray.grayWaterStatus, 'critical');
  assert.equal(critGray.canStartService, false);

  // Healthy van
  const healthy = formatVanTelemetryStatus({ batteryPct: 85, waterTankPct: 75, grayWaterPct: 25 });
  assert.equal(healthy.batteryStatus, 'good');
  assert.equal(healthy.freshWaterStatus, 'good');
  assert.equal(healthy.grayWaterStatus, 'good');
  assert.equal(healthy.canStartService, true);
  assert.equal(healthy.warnings.length, 0);
});

test('Route Metrics - aggregates stops, drive time, and mileage', () => {
  const stops = [
    {
      id: 's1',
      visitId: 'v1',
      stopSequence: 1,
      clientName: 'Alice',
      clientPhone: '555-0101',
      curbsideAddress: '100 Main St',
      petName: 'Bella',
      petBreed: 'Poodle',
      servicePackage: 'Full Groom',
      curbsideStatus: 'completed',
      scheduledTime: '2026-11-13T09:00:00Z',
      driveMinutesFromPrev: 10,
      milesFromPrev: 3.2,
    },
    {
      id: 's2',
      visitId: 'v2',
      stopSequence: 2,
      clientName: 'Bob',
      clientPhone: '555-0102',
      curbsideAddress: '200 Oak Ave',
      petName: 'Milo',
      petBreed: 'Labrador',
      servicePackage: 'Bath & Brush',
      curbsideStatus: 'curbside_active',
      scheduledTime: '2026-11-13T11:00:00Z',
      driveMinutesFromPrev: 15,
      milesFromPrev: 4.8,
    },
  ];

  const metrics = calculateRouteMetrics(stops);
  assert.equal(metrics.totalStops, 2);
  assert.equal(metrics.completedStops, 1);
  assert.equal(metrics.remainingStops, 1);
  assert.equal(metrics.totalDriveMinutes, 25);
  assert.equal(metrics.totalMiles, 8.0);
  assert.equal(metrics.activeStopIndex, 1);
});

test('Curbside SMS - formats professional milestones', () => {
  const sms = formatCurbsideSms('Eleanor Vance', 'Winston', 'en_route', 12);
  assert.match(sms, /Eleanor/);
  assert.match(sms, /Winston/);
  assert.match(sms, /12 minutes/);
});

test('Formula Injection Defense - sanitizes leading triggers (PW075)', () => {
  assert.equal(sanitizeCsvCell('=SUM(A1:A10)'), "'=SUM(A1:A10)");
  assert.equal(sanitizeCsvCell('+12345'), "'+12345");
  assert.equal(sanitizeCsvCell('-500.00'), "'-500.00");
  assert.equal(sanitizeCsvCell('@cmd'), "'@cmd");
  assert.equal(sanitizeCsvCell('\ttext'), "'\ttext");
  assert.equal(sanitizeCsvCell('Normal Text'), 'Normal Text');
  assert.equal(sanitizeCsvCell('123 Main St, Suite 400'), '"123 Main St, Suite 400"');
});

test('Competitor CSV Import - parses rows and tags legacy notes (PW073)', () => {
  const sampleMoeGoCsv = `Client Name,Client Phone,Client Email,Pet Name,Breed,Weight,Notes
Jane Doe,555-987-6543,jane@test.org,Barnaby,Goldendoodle,45.5,High anxiety around dryers
John Smith,555-111-2222,john@test.org,Luna,French Bulldog,28.0,`;

  const existingClients = [{ id: 'c1', name: 'John Smith', phone: '5551112222', email: 'john@test.org' }];

  const res = parseCompetitorCsv(sampleMoeGoCsv, 'moego', existingClients);
  assert.equal(res.totalRows, 2);
  assert.equal(res.validRows.length, 2);
  assert.equal(res.errors.length, 0);

  // Check legacy notes tagging (PW073)
  assert.match(res.validRows[0].legacyNotes || '', /\[LEGACY IMPORT: MOEGO\]/);
  assert.match(res.validRows[0].legacyNotes || '', /High anxiety/);

  // Check duplicate match
  assert.equal(res.duplicateMatches.length, 1);
  assert.equal(res.duplicateMatches[0].matchedClient.name, 'John Smith');
});
