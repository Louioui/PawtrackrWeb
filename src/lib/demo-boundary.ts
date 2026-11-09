import { NextResponse } from 'next/server';

/** The disk ledger is a local demo fixture, never a production data API. */
export function requireLocalDemoApi(): NextResponse | null {
  if (process.env.NODE_ENV !== 'production') return null;
  return NextResponse.json(
    { error: 'Demo ledger API is disabled in production until authenticated tenant data access is configured.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
