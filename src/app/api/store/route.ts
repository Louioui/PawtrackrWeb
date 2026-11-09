import { NextRequest, NextResponse } from 'next/server';
import { readServerLedger, writeServerLedger } from '@/lib/server-db';
import { requireLocalDemoApi } from '@/lib/demo-boundary';
import { asDemoStorePatch, demoStorePatchError } from '@/lib/demo-store-validation';

export async function GET(req: NextRequest) {
  const blocked = requireLocalDemoApi();
  if (blocked) return blocked;
  const businessId = req.nextUrl.searchParams.get('business_id');
  const ledger = readServerLedger();

  if (businessId !== null) {
    if (!businessId) return NextResponse.json({ error: 'business_id is required.' }, { status: 400 });
    return NextResponse.json({
      ok: true,
      business_id: businessId,
      store: {
        configs: Object.hasOwn(ledger.configs, businessId)
          ? { [businessId]: ledger.configs[businessId] }
          : {},
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
  const blocked = requireLocalDemoApi();
  if (blocked) return blocked;
  try {
    const ifMatch = req.headers.get('if-match');
    if (!ifMatch || !/^\d+$/.test(ifMatch) || !Number.isSafeInteger(Number(ifMatch))) {
      return NextResponse.json({ error: 'A current demo ledger revision is required.' }, { status: 428 });
    }
    const body: unknown = await req.json();
    const validationError = demoStorePatchError(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const current = readServerLedger();
    if (current.updatedAt !== Number(ifMatch)) {
      return NextResponse.json({ error: 'Demo ledger changed. Local edits were not applied.', currentRevision: current.updatedAt }, { status: 409 });
    }
    const updated = writeServerLedger(asDemoStorePatch(body));

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
