import { NextRequest } from 'next/server';
import { anonymizeClientRecord } from '@/lib/adversarial-guardrails';
import { appendWorkflowEvent, noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GDPR / CCPA Right-to-be-Forgotten Cryptographic Pseudonymization Endpoint.
 * Purges personal identifiers while preserving immutable fiscal & transaction ledger integrity.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireActiveStaffSession(req, 'Client GDPR anonymization', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  const { id: clientId } = await params;
  if (!uuidPattern.test(clientId)) {
    return noStoreJson({ error: 'Valid client UUID is required.' }, 400);
  }

  const businessId = auth.ctx.membership.business_id;
  const salt = process.env.PAWTRACKR_GDPR_SALT || `pawtrackr_gdpr_${businessId}`;
  const anonymized = anonymizeClientRecord(clientId, salt);

  const { data: updated, error: updateError } = await auth.ctx.supabase
    .from('clients')
    .update({
      name: anonymized.name,
      email: anonymized.email,
      phone: 'REDACTED',
      address: null,
      notes: anonymized.notes,
    })
    .eq('id', clientId)
    .eq('business_id', businessId)
    .select('id, name, email, phone, address, notes')
    .maybeSingle();

  if (updateError) {
    return noStoreJson({ error: 'Could not anonymize client record.' }, 502);
  }
  if (!updated) {
    return noStoreJson({ error: 'Client not found in this salon.' }, 404);
  }

  // Redact free-form identifying pet notes while preserving safety behavior_tags
  await auth.ctx.supabase
    .from('pets')
    .update({
      behavior_notes: 'Owner PII redacted per GDPR/CCPA request.',
    })
    .eq('client_id', clientId)
    .eq('business_id', businessId);

  await appendWorkflowEvent(auth.ctx, {
    workflow_id: 'WF34',
    event_type: 'client.anonymized',
    source_record_type: 'client',
    source_record_id: clientId,
    reason: 'Client exercised GDPR/CCPA Right to be Forgotten.',
    metadata: {
      anonymized_email: anonymized.email,
      anonymized_at: anonymized.anonymized_at,
    },
  });

  return noStoreJson(
    {
      ok: true,
      anonymized: {
        ...anonymized,
        phone: updated.phone,
      },
    },
    200,
  );
}
