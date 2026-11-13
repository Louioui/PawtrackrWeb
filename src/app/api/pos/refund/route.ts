import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { roundToCents } from '@/lib/live-pos';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  // WF15: Dispute & refund processing (restricted to owner and manager)
  const auth = await requireActiveStaffSession(req, 'Refund processing', [
    'owner',
    'manager',
  ]);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
  if (!uuidPattern.test(transactionId)) {
    return noStoreJson({ error: 'Valid transaction UUID is required.' }, 400);
  }

  const amount = roundToCents(Number(body.amount) || 0);
  if (amount <= 0) {
    return noStoreJson({ error: 'Refund amount must be greater than zero.' }, 422);
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10) {
    return noStoreJson(
      { error: 'A mandatory explanation reason (min 10 characters) is required (WF15).', code: 'PW046' },
      422
    );
  }

  const { data, error } = await auth.ctx.supabase.rpc('process_visit_refund', {
    p_transaction_id: transactionId,
    p_amount: amount,
    p_reason: reason,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === 'PW045') return noStoreJson({ error: error.message, code: 'PW045' }, 403);
    if (code === 'PW046') return noStoreJson({ error: error.message, code: 'PW046' }, 422);
    if (code === 'PW028') return noStoreJson({ error: error.message, code: 'PW028' }, 404);
    return noStoreJson({ error: error.message || 'Failed to process refund.' }, 500);
  }

  return noStoreJson({ ok: true, refund: data }, 200);
}
