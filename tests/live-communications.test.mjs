import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileDailyRegister,
  canPublishReportCard,
  validateReportCardInput,
  formatReportCardSummary,
  getBreedCoatCycle,
  computeNextRecallDate,
  buildClientCareProfile,
  validateCommunicationPayload,
  TERMINAL_CLOSEOUT_STATUSES,
} from '../src/lib/live-communications.ts';

test('TERMINAL_CLOSEOUT_STATUSES includes all completed, cancelled, and exception-resolved states', () => {
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('completed'), true);
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('cancelled'), true);
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('no_show'), true);
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('partly_completed'), true);
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('released_unpaid'), true);
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('refunded'), true);
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('refused'), true);

  // In-service states must NOT be terminal
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('bathing'), false);
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('styling'), false);
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('ready'), false);
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('paid'), false);
  assert.equal(TERMINAL_CLOSEOUT_STATUSES.has('checked_in'), false);
});

test('reconcileDailyRegister blocks closeout when visits are in-service or unreleased', () => {
  const visits = [
    { id: 'v1', status: 'completed', clientName: 'Alice', petName: 'Barkley', totalAmountCents: 6500 },
    { id: 'v2', status: 'ready', clientName: 'Bob', petName: 'Luna', totalAmountCents: 8500 },
  ];
  const txs = [
    { id: 't1', paymentMethod: 'cash', amountCents: 6500, status: 'completed', settlementStatus: 'settled' },
  ];

  const result = reconcileDailyRegister('2026-11-13', 6500, null, visits, txs);
  assert.equal(result.canClose, false);
  assert.equal(result.unresolvedVisits.length, 1);
  assert.equal(result.unresolvedVisits[0].id, 'v2');
  assert.match(result.blockingReason, /1 visit\(s\) remain open/);
});

test('reconcileDailyRegister blocks closeout when cash variance has no explanation note', () => {
  const visits = [
    { id: 'v1', status: 'completed', clientName: 'Alice', petName: 'Barkley', totalAmountCents: 5000 },
  ];
  const txs = [
    { id: 't1', paymentMethod: 'cash', amountCents: 5000, status: 'completed', settlementStatus: 'settled' },
  ];

  // Counted $60 vs expected $50 (+$10 variance) with no reason
  const result = reconcileDailyRegister('2026-11-13', 6000, '   ', visits, txs);
  assert.equal(result.canClose, false);
  assert.equal(result.expectedCashCents, 5000);
  assert.equal(result.varianceCents, 1000);
  assert.equal(result.requiresVarianceReason, true);
  assert.equal(result.hasValidVarianceReason, false);
  assert.match(result.blockingReason, /mandatory explanation reason is required/);
});

test('reconcileDailyRegister permits closeout when variance has valid reason note', () => {
  const visits = [
    { id: 'v1', status: 'completed', clientName: 'Alice', petName: 'Barkley', totalAmountCents: 5000 },
  ];
  const txs = [
    { id: 't1', paymentMethod: 'cash', amountCents: 5000, status: 'completed', settlementStatus: 'settled' },
  ];

  const result = reconcileDailyRegister(
    '2026-11-13',
    6000,
    '$10 cash tip left by client at pickup',
    visits,
    txs
  );
  assert.equal(result.canClose, true);
  assert.equal(result.varianceCents, 1000);
  assert.equal(result.hasValidVarianceReason, true);
  assert.equal(result.blockingReason, undefined);
});

test('reconcileDailyRegister handles zero-variance clean closeout without explanation note', () => {
  const visits = [
    { id: 'v1', status: 'completed', clientName: 'Alice', petName: 'Barkley', totalAmountCents: 10000 },
    { id: 'v2', status: 'cancelled', clientName: 'Charlie', petName: 'Max', totalAmountCents: 0 },
  ];
  const txs = [
    { id: 't1', paymentMethod: 'cash', amountCents: 10000, status: 'completed', settlementStatus: 'settled' },
    { id: 't2', paymentMethod: 'card', amountCents: 5000, status: 'completed', settlementStatus: 'settled' },
  ];

  const result = reconcileDailyRegister('2026-11-13', 10000, null, visits, txs);
  assert.equal(result.canClose, true);
  assert.equal(result.expectedCashCents, 10000);
  assert.equal(result.varianceCents, 0);
  assert.equal(result.hasVariance, false);
  assert.equal(result.requiresVarianceReason, false);
});

test('canPublishReportCard enforces stage gates strictly', () => {
  assert.equal(canPublishReportCard('booked'), false);
  assert.equal(canPublishReportCard('checked_in'), false);
  assert.equal(canPublishReportCard('bathing'), false);
  assert.equal(canPublishReportCard('drying'), false);
  assert.equal(canPublishReportCard('styling'), false);

  assert.equal(canPublishReportCard('ready'), true);
  assert.equal(canPublishReportCard('paid'), true);
  assert.equal(canPublishReportCard('partly_completed'), true);
  assert.equal(canPublishReportCard('completed'), true);
});

test('validateReportCardInput rejects invalid coat conditions and malformed tags', () => {
  assert.equal(validateReportCardInput(null).valid, false);
  assert.equal(validateReportCardInput({}).valid, false);
  assert.equal(validateReportCardInput({ coatCondition: 'unknown_condition' }).valid, false);
  assert.equal(validateReportCardInput({ coatCondition: 'good', behaviorTags: 'not-an-array' }).valid, false);

  const valid = validateReportCardInput({
    coatCondition: 'excellent',
    behaviorTags: ['calm', 'cooperative'],
  });
  assert.equal(valid.valid, true);
});

test('formatReportCardSummary produces clear pet parent summaries', () => {
  const summary = formatReportCardSummary('Milo', 'Sarah Jenkins', {
    coatCondition: 'sensitive_skin',
    behaviorTags: ['nervous_feet', 'gentle'],
    careNotes: 'Used soothing aloe & oatmeal wash.',
    recommendations: 'Brush with slicker brush every 3 days.',
  });

  assert.match(summary, /Report Card for Milo/);
  assert.match(summary, /Sarah Jenkins/);
  assert.match(summary, /SENSITIVE SKIN/);
  assert.match(summary, /nervous_feet, gentle/);
  assert.match(summary, /aloe & oatmeal/);
});

test('getBreedCoatCycle classifies maintenance frequency accurately', () => {
  assert.equal(getBreedCoatCycle('Standard Poodle').cycleWeeks, 4);
  assert.equal(getBreedCoatCycle('Mini Goldendoodle').cycleWeeks, 4);
  assert.equal(getBreedCoatCycle('Bichon Frise').cycleWeeks, 4);

  assert.equal(getBreedCoatCycle('Labrador Retriever').cycleWeeks, 8);
  assert.equal(getBreedCoatCycle('French Bulldog').cycleWeeks, 8);
  assert.equal(getBreedCoatCycle('Pitbull Terrier').cycleWeeks, 8);

  assert.equal(getBreedCoatCycle('Golden Retriever').cycleWeeks, 6);
  assert.equal(getBreedCoatCycle('German Shepherd').cycleWeeks, 6);
  assert.equal(getBreedCoatCycle(null).cycleWeeks, 6);
});

test('computeNextRecallDate advances date according to coat cycle', () => {
  const recall = computeNextRecallDate('2026-11-01', 'Goldendoodle');
  assert.equal(recall.cycleWeeks, 4);
  // 4 weeks = 28 days -> 2026-11-29
  assert.equal(recall.recallDate, '2026-11-29');

  const labRecall = computeNextRecallDate('2026-11-01', 'Labrador');
  assert.equal(labRecall.cycleWeeks, 8);
  // 8 weeks = 56 days -> 2026-12-27
  assert.equal(labRecall.recallDate, '2026-12-27');
});

test('buildClientCareProfile aggregates lifetime spend and flags safety/coat alerts', () => {
  const client = { id: 'c1', name: 'Diana Prince', phone: '555-0188', email: 'diana@example.test' };
  const pets = [
    { id: 'p1', name: 'Zeus', breed: 'Goldendoodle' },
    { id: 'p2', name: 'Ares', breed: 'Boxer' },
  ];
  const visits = [
    {
      visitId: 'v1',
      date: '2026-10-01',
      status: 'completed',
      totalCents: 9500,
      servicePackage: 'Full Groom',
      coatCondition: 'matted',
      behaviorTags: ['wiggly'],
    },
    {
      visitId: 'v2',
      date: '2026-11-01',
      status: 'completed',
      totalCents: 10500,
      servicePackage: 'Full Groom & De-shed',
      coatCondition: 'good',
      incidentType: 'skin_tear',
      incidentSeverity: 'minor',
    },
  ];

  const profile = buildClientCareProfile(client, pets, visits);
  assert.equal(profile.totalVisits, 2);
  assert.equal(profile.completedVisits, 2);
  assert.equal(profile.lifetimeSpendCents, 20000);
  assert.equal(profile.averageSpendCents, 10000);

  // Safety alerts
  assert.equal(profile.safetyAlerts.length, 2);
  assert.match(profile.safetyAlerts[0], /Prior incident reported/);
  assert.match(profile.safetyAlerts[1], /History of severe coat matting/);

  // Pet recalls
  assert.equal(profile.pets.length, 2);
  assert.equal(profile.pets[0].recommendedRecallWeeks, 4);
  assert.equal(profile.pets[1].recommendedRecallWeeks, 8);
});

test('validateCommunicationPayload validates channels and provides fallback tasks on failure', () => {
  // Opted out
  const optedOut = validateCommunicationPayload({
    clientId: 'c1',
    messageType: 'reminder_24h',
    channel: 'sms',
    body: 'Appointment tomorrow',
    optedOut: true,
  });
  assert.equal(optedOut.valid, false);
  assert.equal(optedOut.status, 'opted_out');
  assert.match(optedOut.fallbackTask, /Contact client manually/);

  // Missing phone on SMS
  const missingPhone = validateCommunicationPayload({
    clientId: 'c1',
    messageType: 'ready_for_pickup',
    channel: 'sms',
    body: 'Pet is ready',
    recipientPhone: '',
  });
  assert.equal(missingPhone.valid, false);
  assert.equal(missingPhone.status, 'failed');
  assert.match(missingPhone.fallbackTask, /Call pet parent directly/);

  // Valid SMS
  const validSms = validateCommunicationPayload({
    clientId: 'c1',
    messageType: 'ready_for_pickup',
    channel: 'sms',
    body: 'Pet is ready',
    recipientPhone: '555-0123',
  });
  assert.equal(validSms.valid, true);
  assert.equal(validSms.status, 'sent');
});
