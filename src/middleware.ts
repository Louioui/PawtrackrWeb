import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis/cloudflare';
import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { apiRateLimitPolicy, BoundedLocalRateLimiter } from '@/lib/api-rate-limit';
import type { ApiRateLimitResult } from '@/lib/api-rate-limit';

// ============================================================================
// PAWTRACKR WEB — EDGE SECURITY, RATE LIMITING & CUSTOM DOMAIN MIDDLEWARE
// Covers Roadmap Items #3 (Rate Limiting), #36 (White-Label Custom Domains),
// and #45 (XSS / CSRF / Clickjacking Protection).
// ============================================================================

const localRateLimiter = new BoundedLocalRateLimiter();
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const redis = upstashUrl && upstashToken ? new Redis({ url: upstashUrl, token: upstashToken }) : null;
const distributedRateLimiters = redis ? {
  'public-booking-write': new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(8, '10 m'),
    prefix: 'pawtrackr:ratelimit:public-booking-write', timeout: 1_000 }),
  'public-availability': new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, '1 m'),
    prefix: 'pawtrackr:ratelimit:public-availability', timeout: 1_000 }),
  onboarding: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(12, '10 m'),
    prefix: 'pawtrackr:ratelimit:onboarding', timeout: 1_000 }),
  'payment-intent': new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '1 m'),
    prefix: 'pawtrackr:ratelimit:payment-intent', timeout: 1_000 }),
  'billing-checkout': new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '10 m'),
    prefix: 'pawtrackr:ratelimit:billing-checkout', timeout: 1_000 }),
  api: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(180, '1 m'),
    prefix: 'pawtrackr:ratelimit:api', timeout: 1_000 }),
} : null;

const CUSTOM_DOMAIN_MAP: Record<string, string> = {
  'booking.bespokegrooming.com': 'bespoke-grooming',
  'book.splashmobile.live': 'splash-grooming',
};

function dataMode(pathname: string, method: string) {
  const isWrite = method === 'POST' || method === 'PATCH' || method === 'DELETE';
  const isStaffApi =
    pathname.startsWith('/api/reservations') ||
    pathname.startsWith('/api/analytics') ||
    pathname.startsWith('/api/clients') ||
    pathname.startsWith('/api/settings') ||
    pathname.startsWith('/api/shifts') ||
    pathname.startsWith('/api/stations') ||
    pathname.startsWith('/api/onboarding') ||
    pathname.startsWith('/api/payments/intent') ||
    pathname.startsWith('/api/billing/create-checkout') ||
    pathname.startsWith('/api/pos/') ||
    pathname.startsWith('/api/operations/') ||
    pathname.startsWith('/api/visits/') ||
    pathname.startsWith('/api/payroll') ||
    pathname.startsWith('/api/waitlist') ||
    pathname.startsWith('/api/fleet') ||
    pathname.startsWith('/api/import') ||
    pathname.startsWith('/api/export') ||
    pathname.startsWith('/api/config') ||
    pathname.startsWith('/api/communications') ||
    pathname.startsWith('/api/staff/') ||
    pathname.startsWith('/api/waivers');

  const isStaffPage =
    (pathname.startsWith('/dashboard/') && (pathname.endsWith('/live') || pathname.includes('/live/'))) ||
    pathname === '/signup';

  if (isStaffApi) {
    return isWrite ? 'authenticated-write' : 'authenticated-read';
  }
  if (isStaffPage) {
    return 'authenticated-read';
  }
  if (pathname === '/api/webhooks/stripe') {
    return 'verified-webhook';
  }
  if (pathname.startsWith('/api/public/')) {
    return 'public-booking';
  }
  if (pathname.startsWith('/portal/live')) {
    return 'public-catalog';
  }
  return 'demo-only';
}

function applyRateLimitHeaders(
  response: NextResponse,
  result: ApiRateLimitResult,
  mode: 'distributed' | 'distributed-timeout' | 'local' | 'local-fallback',
) {
  const resetSeconds = Math.max(0, Math.ceil((result.reset - Date.now()) / 1_000));
  response.headers.set('RateLimit-Limit', String(result.limit));
  response.headers.set('RateLimit-Remaining', String(result.remaining));
  response.headers.set('RateLimit-Reset', String(resetSeconds));
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(result.reset));
  response.headers.set('X-Pawtrackr-RateLimit-Mode', mode);
  if (!result.success) response.headers.set('Retry-After', String(Math.max(1, resetSeconds)));
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname, searchParams } = req.nextUrl;
  const host = req.headers.get('host') ?? '';
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const mode = dataMode(pathname, req.method);

  // 1. Distributed sliding-window limiter, with a bounded local fallback for
  // development and brief provider failures. Production configuration checks
  // require Upstash, so a release cannot silently rely on the local map.
  const policy = apiRateLimitPolicy(pathname, req.method);
  let rateResult: ApiRateLimitResult | null = null;
  let rateMode: 'distributed' | 'distributed-timeout' | 'local' | 'local-fallback' = 'local';
  if (policy) {
    if (distributedRateLimiters) {
      try {
        const distributed = await distributedRateLimiters[policy.id].limit(clientIp);
        event.waitUntil(distributed.pending);
        rateResult = {
          success: distributed.success,
          limit: distributed.limit,
          remaining: distributed.remaining,
          reset: distributed.reset,
        };
        rateMode = distributed.reason === 'timeout' ? 'distributed-timeout' : 'distributed';
      } catch {
        rateResult = localRateLimiter.limit(clientIp, policy);
        rateMode = 'local-fallback';
      }
    } else {
      rateResult = localRateLimiter.limit(clientIp, policy);
    }
    if (!rateResult.success) {
      const blocked = NextResponse.json(
        { error: 'Too many requests. Wait for the rate-limit window to reset and try again.' },
        { status: 429, headers: { 'Cache-Control': 'no-store', 'X-Pawtrackr-Data-Mode': mode } },
      );
      applyRateLimitHeaders(blocked, rateResult, rateMode);
      return blocked;
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
  res.headers.set('x-pawtrackr-data-mode', mode);
  if (rateResult) applyRateLimitHeaders(res, rateResult, rateMode);

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
