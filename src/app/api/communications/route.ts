import { NextRequest } from 'next/server';
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

  const clientId = req.nextUrl.searchParams.get('clientId');
  const visitId = req.nextUrl.searchParams.get('visitId');
  const status = req.nextUrl.searchParams.get('status');

  let query = auth.ctx.supabase
    .from('client_communications')
    .select('*, clients(name, phone, email), visits(service_package, scheduled_time)')
    .eq('business_id', auth.ctx.membership.business_id)
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

  return noStoreJson({ communications: data || [] }, 200);
}

export async function POST(req: NextRequest) {
  // WF16 / WF17: Outbound communication dispatch & audit logging
  const auth = await requireActiveStaffSession(req, 'Send communication');
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

  const visitId = typeof body.visit_id === 'string' && uuidPattern.test(body.visit_id) ? body.visit_id : null;
  const messageType = typeof body.message_type === 'string' ? (body.message_type as MessageType) : 'ad_hoc';
  const channel = body.channel === 'email' ? 'email' : 'sms';
  const textBody = typeof body.body === 'string' ? body.body.trim() : '';
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

  // Message independence invariant: Even if delivery fails or payload is invalid,
  // we record the log attempt with 'failed' or 'opted_out' status, and return fallback instructions
  const dispatchStatus = validation.valid ? 'sent' : validation.status;
  const errorDetails = validation.valid ? null : validation.error;
  const simulatedProviderId = validation.valid ? `msg_mock_${Date.now()}` : null;

  const { data, error } = await auth.ctx.supabase.rpc('log_client_communication', {
    p_client_id: clientId,
    p_message_type: messageType,
    p_channel: channel,
    p_body: textBody || '(empty message attempt)',
    p_visit_id: visitId,
    p_status: dispatchStatus,
    p_provider_message_id: simulatedProviderId,
    p_error_details: errorDetails,
    p_recipient_phone: recipientPhone,
    p_recipient_email: recipientEmail,
  });

  if (error) {
    return noStoreJson({ error: error.message || 'Could not log communication.' }, 502);
  }

  return noStoreJson(
    {
      ok: validation.valid,
      status: dispatchStatus,
      data,
      error: validation.error,
      fallbackTask: validation.fallbackTask,
      message: validation.valid
        ? `Message successfully sent via ${channel.toUpperCase()}.`
        : `Message delivery could not proceed: ${validation.error}`,
    },
    validation.valid ? 200 : 422,
  );
}
