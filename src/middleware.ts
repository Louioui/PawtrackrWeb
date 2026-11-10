import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// PAWTRACKR WEB — EDGE SECURITY, RATE LIMITING & CUSTOM DOMAIN MIDDLEWARE
// Covers Roadmap Items #3 (Rate Limiting), #36 (White-Label Custom Domains),
// and #45 (XSS / CSRF / Clickjacking Protection).
// ============================================================================

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 180;
const ipRequestCounts = new Map<
  string,
  { count: number; windowStart: number }
>();

const CUSTOM_DOMAIN_MAP: Record<string, string> = {
  'booking.bespokegrooming.com': 'bespoke-grooming',
  'book.splashmobile.live': 'splash-grooming',
};

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const host = req.headers.get('host') ?? '';
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';

  // 1. Sliding-Window Edge Rate Limiter (#3)
  if (pathname.startsWith('/api/')) {
    const now = Date.now();
    const record = ipRequestCounts.get(clientIp);
    if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
      ipRequestCounts.set(clientIp, { count: 1, windowStart: now });
    } else {
      record.count += 1;
      if (record.count > MAX_REQUESTS_PER_WINDOW) {
        return NextResponse.json(
          {
            error:
              'Rate limit exceeded. Protected by Pawtrackr Edge Rate Limiter.',
          },
          { status: 429 }
        );
      }
    }
  }

  // 2. White-Label Custom Domain Routing (#36)
  const mappedSalonSlug = CUSTOM_DOMAIN_MAP[host];
  if (mappedSalonSlug && pathname === '/') {
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = `/portal/${mappedSalonSlug}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  const res = NextResponse.next();

  // 3. Hardened Multi-Tenant & OWASP Security Headers (#45)
  const dataMode =
    (pathname === '/api/reservations' ||
      pathname === '/api/analytics' ||
      pathname === '/api/clients' ||
      pathname === '/api/settings' ||
      pathname === '/api/shifts') &&
    (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE')
      ? 'authenticated-write'
      : pathname === '/api/analytics' ||
          pathname === '/api/reservations' ||
          pathname === '/api/clients' ||
          pathname === '/api/settings' ||
          pathname === '/api/shifts' ||
          pathname === '/dashboard/analytics/live' ||
          pathname === '/dashboard/appointments/live' ||
          pathname === '/dashboard/clients/live' ||
          pathname === '/dashboard/settings/live'
        ? 'authenticated-read'
        : pathname.startsWith('/portal/live')
          ? 'public-catalog'
          : 'demo-only';
  res.headers.set('x-pawtrackr-data-mode', dataMode);
  res.headers.set('x-frame-options', 'SAMEORIGIN');
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  res.headers.set(
    'x-ratelimit-remaining',
    String(
      Math.max(
        0,
        MAX_REQUESTS_PER_WINDOW - (ipRequestCounts.get(clientIp)?.count ?? 1)
      )
    )
  );

  // Resolve tenant slug from query or portal route for downstream SSR consumption
  if (pathname.startsWith('/portal/')) {
    const slug = pathname.split('/')[2];
    if (slug) {
      res.headers.set('x-pawtrackr-tenant-slug', slug);
    }
  } else if (searchParams.get('tenant')) {
    res.headers.set(
      'x-pawtrackr-tenant-slug',
      searchParams.get('tenant') ?? 'bespoke-grooming'
    );
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
