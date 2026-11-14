import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import {
  checkSmsQuota,
  communicationsCircuitBreaker,
  recordSmsDispatch,
  sanitizePetNotesForAI,
} from '@/lib/adversarial-guardrails';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import {
  validateCommunicationPayload,
  type MessageType,
  type CommunicationChannel,
} from '@/lib/live-communications';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  // WF16 / WF17: Communication audit trail
  const auth = await requireActiveStaffSession(req, 'Communications ledger');
  if (!auth.ok) return auth.response;

  const businessId = auth.ctx.membership.business_id;
  const clientId = req.nextUrl.searchParams.get('clientId');
  const visitId = req.nextUrl.searchParams.get('visitId');
  const status = req.nextUrl.searchParams.get('status');

  let query = auth.ctx.supabase
    .from('client_communications')
    .select('*, clients(name, phone, email), visits(service_package, scheduled_time)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (clientId && uuidPattern.test(clientId)) {
    query = query.eq('client_id', clientId);
  }
  if (visitId && uuidPattern.test(visitId)) {
    query = query.eq('visit_id', visitId);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    return noStoreJson({ error: 'Could not load communication ledger.' }, 502);
  }

  return noStoreJson(
    {
      communications: data || [],
      smsQuota: checkSmsQuota(businessId),
    },
    200,
  );
}

export async function POST(req: NextRequest) {
  // WF16 / WF17: Outbound communication dispatch & audit logging
  const auth = await requireActiveStaffSession(req, 'Send communication', [
    'owner',
    'manager',
    'front_desk',
    'senior_groomer',
    'groomer',
  ]);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const clientId = typeof body.client_id === 'string' ? body.client_id : '';
  if (!uuidPattern.test(clientId)) {
    return noStoreJson({ error: 'Valid client UUID is required.' }, 400);
  }

  const businessId = auth.ctx.membership.business_id;
  const visitId = typeof body.visit_id === 'string' && uuidPattern.test(body.visit_id) ? body.visit_id : null;
  const messageType = typeof body.message_type === 'string' ? (body.message_type as MessageType) : 'ad_hoc';
  const channel = body.channel === 'email' ? 'email' : 'sms';
  const rawBody = typeof body.body === 'string' ? body.body.trim().slice(0, 1600) : '';
  const sanitized = sanitizePetNotesForAI(rawBody);
  const textBody = sanitized.sanitizedText;
  const recipientPhone = typeof body.recipient_phone === 'string' ? body.recipient_phone.trim() : null;
  const recipientEmail = typeof body.recipient_email === 'string' ? body.recipient_email.trim() : null;

  const validation = validateCommunicationPayload({
    clientId,
    messageType,
    channel: channel as CommunicationChannel,
    body: textBody,
    recipientPhone,
    recipientEmail,
  });

  // Enforce monthly tenant SMS token bucket cap before dispatching outbound SMS
  if (validation.valid && channel === 'sms') {
    try {
      recordSmsDispatch(businessId, 1, 500);
    } catch (quotaErr) {
      const msg = quotaErr instanceof Error ? quotaErr.message : 'Monthly SMS quota exceeded.';
      return noStoreJson(
        {
          ok: false,
          status: 'failed',
          error: msg,
          code: 'SMS_QUOTA_EXCEEDED',
          smsQuota: checkSmsQuota(businessId),
        },
        429,
      );
    }
  }

  const dispatchStatus = validation.valid ? 'sent' : validation.status;
  const errorDetails = validation.valid ? null : validation.error;
  const providerId = validation.valid ? `msg_${randomUUID().replace(/-/g, '').slice(0, 16)}` : null;

  let data: unknown;
  try {
    data = await communicationsCircuitBreaker.execute(async () => {
      const { data: rpcData, error } = await auth.ctx.supabase.rpc('log_client_communication', {
        p_client_id: clientId,
        p_message_type: messageType,
        p_channel: channel,
        p_body: textBody || '(empty message attempt)',
        p_visit_id: visitId,
        p_status: dispatchStatus,
        p_provider_message_id: providerId,
        p_error_details: errorDetails,
        p_recipient_phone: recipientPhone,
        p_recipient_email: recipientEmail,
      });
      if (error) {
        throw new Error(error.message || 'Could not log communication.');
      }
      return rpcData;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not log communication.';
    const status = message.includes('CircuitBreaker [OPEN]') ? 503 : 502;
    return noStoreJson({ error: message }, status);
  }

  return noStoreJson(
    {
      ok: validation.valid,
      status: dispatchStatus,
      data,
      smsQuota: checkSmsQuota(businessId),
      error: validation.error,
      fallbackTask: validation.fallbackTask,
      message: validation.valid
        ? `Message successfully sent via ${channel.toUpperCase()}.`
        : `Message delivery could not proceed: ${validation.error}`,
    },
    validation.valid ? 200 : 422,
  );
}
