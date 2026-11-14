import { NextRequest } from 'next/server';
import { generateSignedShortLink } from '@/lib/adversarial-guardrails';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { formatItemizedReceipt } from '@/lib/live-pos';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // WF06: Itemized receipt gate (only settled payments receive receipts)
  const auth = await requireActiveStaffSession(req, 'Receipt retrieval');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return noStoreJson({ error: 'Valid transaction UUID is required.' }, 400);
  }

  const businessId = auth.ctx.membership.business_id;

  const { data: tx, error: txError } = await auth.ctx.supabase
    .from('transactions')
    .select(`
      id,
      business_id,
      amount,
      subtotal,
      discount,
      tax,
      tip,
      payment_method,
      settlement_status,
      settled_at,
      created_at,
      visits (
        id,
        service_package,
        scheduled_time,
        status,
        pets ( name ),
        clients ( name )
      ),
      businesses (
        name,
        slug
      )
    `)
    .eq('business_id', businessId)
    .eq('id', id)
    .maybeSingle();

  if (txError || !tx) {
    return noStoreJson({ error: 'Transaction not found.' }, 404);
  }

  if (tx.settlement_status !== 'settled' && tx.settlement_status !== 'refunded') {
    return noStoreJson(
      {
        error: `Itemized receipts are only issued for settled payments (current status: ${tx.settlement_status}).`,
        code: 'RECEIPT_UNSETTLED',
      },
      409,
    );
  }

  const visitData = tx.visits as unknown as {
    id: string;
    service_package: string;
    scheduled_time?: string;
    status: string;
    pets?: { name: string } | null;
    clients?: { name: string } | null;
  } | null;

  const businessData = tx.businesses as unknown as {
    name: string;
  } | null;

  const receipt = formatItemizedReceipt({
    transaction: {
      id: tx.id,
      amount: Number(tx.amount),
      subtotal: Number(tx.subtotal),
      discount: Number(tx.discount),
      tax: Number(tx.tax),
      tip: Number(tx.tip),
      payment_method: tx.payment_method,
      settlement_status: tx.settlement_status,
      settled_at: tx.settled_at,
      created_at: tx.created_at,
    },
    visit: {
      id: visitData?.id || '',
      service_package: visitData?.service_package || 'Service Groom',
      pet_name: visitData?.pets?.name || 'Pet',
      client_name: visitData?.clients?.name || 'Guest',
      scheduled_time: visitData?.scheduled_time,
      status: visitData?.status || '',
    },
    salon: {
      name: businessData?.name || 'Pawtrackr Salon',
    },
  });

  const signingSecret =
    process.env.PAWTRACKR_RECEIPT_SIGNING_SECRET || `pawtrackr_receipt_${businessId}`;
  const signedShareUrl = generateSignedShortLink({
    domain: 'app.pawtrackr.live',
    path: `/r/${tx.id}`,
    salonId: businessId,
    visitId: visitData?.id || tx.id,
    expiresInSeconds: 30 * 86_400,
    secretKey: signingSecret,
  });

  return noStoreJson({ ok: true, receipt, signedShareUrl }, 200);
}
