import { NextRequest, NextResponse } from 'next/server';
import { readServerLedger, writeServerLedger } from '@/lib/server-db';

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('business_id');
  const ledger = readServerLedger();

  if (businessId) {
    return NextResponse.json({
      ok: true,
      business_id: businessId,
      store: {
        configs: ledger.configs,
        clients: ledger.clients.filter((c) => c.business_id === businessId),
        pets: ledger.pets.filter((p) => p.business_id === businessId),
        visits: ledger.visits.filter((v) => v.business_id === businessId),
        transactions: ledger.transactions.filter(
          (t) => t.business_id === businessId
        ),
        updatedAt: ledger.updatedAt,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    store: ledger,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = writeServerLedger({
      ...(body.configs ? { configs: body.configs } : {}),
      ...(body.clients ? { clients: body.clients } : {}),
      ...(body.pets ? { pets: body.pets } : {}),
      ...(body.visits ? { visits: body.visits } : {}),
      ...(body.transactions ? { transactions: body.transactions } : {}),
    });

    return NextResponse.json({
      ok: true,
      store: updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to persist store';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
