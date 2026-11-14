import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOCUMENT_TYPES,
  formatDocumentTypeLabel,
  isDocumentExpired,
  MAX_DOCUMENT_SIZE_BYTES,
  sanitizeStoragePath,
  validateDocumentUploadInput,
  validateDocumentVerificationInput,
} from '../src/lib/media-and-documents.ts';
import { parseCustomerBookingDetails } from '../src/lib/customer-portal.ts';

const SAMPLE_BIZ_ID = '11111111-1111-4111-8111-111111111111';
const SAMPLE_PET_ID = '22222222-2222-4222-8222-222222222222';
const SAMPLE_CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const SAMPLE_DOC_ID = '44444444-4444-4444-8444-444444444444';

test('sanitizeStoragePath enforces tenant folder isolation and prevents traversal', () => {
  // Valid path under business folder
  const valid = sanitizeStoragePath(
    SAMPLE_BIZ_ID,
    `${SAMPLE_BIZ_ID}/pets/rabies_cert_2026.pdf`
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.path, `${SAMPLE_BIZ_ID}/pets/rabies_cert_2026.pdf`);

  // Path from different tenant
  const foreignTenant = sanitizeStoragePath(
    SAMPLE_BIZ_ID,
    '99999999-9999-4999-8999-999999999999/pets/rabies.pdf'
  );
  assert.equal(foreignTenant.valid, false);
  assert.match(foreignTenant.error || '', /tenant isolation/i);

  // Path traversal attacks
  assert.equal(
    sanitizeStoragePath(SAMPLE_BIZ_ID, `${SAMPLE_BIZ_ID}/../other/file.pdf`).valid,
    false
  );
  assert.equal(
    sanitizeStoragePath(SAMPLE_BIZ_ID, `/${SAMPLE_BIZ_ID}/file.pdf`).valid,
    false
  );
  assert.equal(
    sanitizeStoragePath(SAMPLE_BIZ_ID, `${SAMPLE_BIZ_ID}//file.pdf`).valid,
    false
  );

  // Missing filename
  assert.equal(sanitizeStoragePath(SAMPLE_BIZ_ID, SAMPLE_BIZ_ID).valid, false);
  assert.equal(sanitizeStoragePath(SAMPLE_BIZ_ID, '').valid, false);
});

test('validateDocumentUploadInput checks types, sizes, and mime types', () => {
  const valid = validateDocumentUploadInput({
    petId: SAMPLE_PET_ID,
    clientId: SAMPLE_CLIENT_ID,
    documentType: 'rabies_certificate',
    filePath: `${SAMPLE_BIZ_ID}/${SAMPLE_PET_ID}/rabies.pdf`,
    fileName: 'rabies_2026.pdf',
    fileSizeBytes: 1024 * 500,
    mimeType: 'application/pdf',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.payload?.documentType, 'rabies_certificate');

  // Disallowed MIME type
  const badMime = validateDocumentUploadInput({
    petId: SAMPLE_PET_ID,
    clientId: SAMPLE_CLIENT_ID,
    documentType: 'rabies_certificate',
    filePath: `${SAMPLE_BIZ_ID}/${SAMPLE_PET_ID}/script.exe`,
    fileName: 'script.exe',
    mimeType: 'application/x-msdownload',
  });
  assert.equal(badMime.valid, false);
  assert.match(badMime.error || '', /Unsupported MIME type/i);

  // Exceeding max size
  const tooLarge = validateDocumentUploadInput({
    petId: SAMPLE_PET_ID,
    clientId: SAMPLE_CLIENT_ID,
    documentType: 'rabies_certificate',
    filePath: `${SAMPLE_BIZ_ID}/${SAMPLE_PET_ID}/huge.pdf`,
    fileName: 'huge.pdf',
    fileSizeBytes: MAX_DOCUMENT_SIZE_BYTES + 1024,
    mimeType: 'application/pdf',
  });
  assert.equal(tooLarge.valid, false);
  assert.match(tooLarge.error || '', /File size must be between/i);

  // Invalid document type
  const badType = validateDocumentUploadInput({
    petId: SAMPLE_PET_ID,
    clientId: SAMPLE_CLIENT_ID,
    documentType: 'unknown_virus',
    filePath: `${SAMPLE_BIZ_ID}/f.pdf`,
    fileName: 'f.pdf',
    mimeType: 'application/pdf',
  });
  assert.equal(badType.valid, false);
  assert.match(badType.error || '', /Invalid document type/i);
});

test('validateDocumentVerificationInput handles status and expiration rules', () => {
  const futureYear = new Date().getFullYear() + 2;
  const futureDate = `${futureYear}-12-31`;

  const valid = validateDocumentVerificationInput({
    documentId: SAMPLE_DOC_ID,
    status: 'verified',
    expiresAt: futureDate,
    notes: 'Verified via Valley Vet phone confirmation',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.payload?.status, 'verified');
  assert.equal(valid.payload?.expiresAt, futureDate);

  // Rejecting past date for verified status
  const pastDate = validateDocumentVerificationInput({
    documentId: SAMPLE_DOC_ID,
    status: 'verified',
    expiresAt: '2020-01-01',
  });
  assert.equal(pastDate.valid, false);
  assert.match(pastDate.error || '', /expiration date in the past/i);

  // Malformed date
  const badDate = validateDocumentVerificationInput({
    documentId: SAMPLE_DOC_ID,
    status: 'verified',
    expiresAt: '12/31/2028',
  });
  assert.equal(badDate.valid, false);
  assert.match(badDate.error || '', /formatted as YYYY-MM-DD/i);

  // Rejection with notes is allowed without future expiry
  const rejected = validateDocumentVerificationInput({
    documentId: SAMPLE_DOC_ID,
    status: 'rejected',
    notes: 'Document blurry; tag number illegible',
  });
  assert.equal(rejected.valid, true);
  assert.equal(rejected.payload?.status, 'rejected');
});

test('isDocumentExpired correctly flags past dates vs future dates', () => {
  assert.equal(isDocumentExpired('2019-05-15'), true);
  assert.equal(isDocumentExpired('2024-01-01'), true);
  assert.equal(isDocumentExpired('2035-12-31'), false);
  assert.equal(isDocumentExpired(null), false);
  assert.equal(isDocumentExpired(undefined), false);
});

test('formatDocumentTypeLabel formats all registered document types', () => {
  for (const docType of DOCUMENT_TYPES) {
    const label = formatDocumentTypeLabel(docType);
    assert.equal(typeof label, 'string');
    assert.ok(label.length > 3);
  }
});

test('parseCustomerBookingDetails parses report card and photos when available', () => {
  const rawBooking = {
    reference: 'A1B2C3D4',
    visit_id: '12345678-1234-4234-8234-123456789abc',
    status: 'ready',
    service: 'Full Groom & Ozone Bath',
    price: 85,
    starts_at: '2026-11-20T10:00:00Z',
    ends_at: '2026-11-20T11:15:00Z',
    duration_minutes: 75,
    time_zone: 'America/New_York',
    salon_name: 'Pawsome Retreat',
    salon_slug: 'pawsome-retreat',
    client_name: 'Jane Doe',
    pet_name: 'Barnaby',
    pet_breed: 'Miniature Poodle',
    can_reschedule: false,
    can_cancel: false,
    report_card: {
      id: '55555555-5555-4555-8555-555555555555',
      coat_condition: 'excellent',
      behavior_tags: ['gentle', 'happy_tail'],
      care_notes: 'Blueberry facial applied, coat hand scissored.',
      recommendations: 'Brush ears daily.',
      photos: [
        {
          url: 'https://example.com/after.jpg',
          caption: 'Fresh Teddy Bear trim',
          stage: 'after',
        },
      ],
      published_at: '2026-11-20T11:20:00Z',
    },
  };

  const parsed = parseCustomerBookingDetails(rawBooking);
  assert.ok(parsed);
  assert.equal(parsed.reference, 'A1B2C3D4');
  assert.equal(parsed.status, 'ready');
  assert.ok(parsed.reportCard);
  assert.equal(parsed.reportCard.coatCondition, 'excellent');
  assert.deepEqual(parsed.reportCard.behaviorTags, ['gentle', 'happy_tail']);
  assert.equal(parsed.reportCard.photos.length, 1);
  assert.equal(parsed.reportCard.photos[0].caption, 'Fresh Teddy Bear trim');
});
