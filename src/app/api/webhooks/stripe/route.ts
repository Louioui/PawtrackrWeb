import { NextRequest, NextResponse } from 'next/server';
import { requireLocalDemoApi } from '@/lib/demo-boundary';

export async function POST(req: NextRequest) {
  const blocked = requireLocalDemoApi();
  if (blocked) return blocked;
  return NextResponse.json(
    { error: 'Stripe webhooks are unavailable until verified payment handling is configured.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
