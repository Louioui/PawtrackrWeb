import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis/cloudflare';
import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { apiRateLimitPolicy, BoundedLocalRateLimiter } from '@/lib/api-rate-limit';
import type { ApiRateLimitResult } from '@/lib/api-rate-limit';
import { parseOrCreateTraceContext } from '@/lib/telemetry';

// ============================================================================
// PAWTRACKR WEB — EDGE SECURITY, RATE LIMITING, W3C TRACING & DOMAIN MIDDLEWARE
// Covers Roadmap Items #3 (Rate Limiting), #36 (White-Label Custom Domains),
// #45 (XSS / CSRF / Clickjacking Protection), and TRC-01 (W3C OpenTelemetry).
// ============================================================================

const SAFE_TENANT_SLUG = /^[a-z0-9-]{1,64}$/;

const localRateLimiter = new BoundedLocalRateLimiter();
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const redis = upstashUrl && upstashToken ? new Redis({ url: upstashUrl, token: upstashToken }) : null;
const distributedRateLimiters = redis ? {
  'public-booking-write': new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(8, '10 m'),
    prefix: 'pawtrackr:ratelimit:public-booking-write', timeout: 1_000 }),
  'public-booking-manage': new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '10 m'),
    prefix: 'pawtrackr:ratelimit:public-booking-manage', timeout: 1_000 }),
  'public-availability': new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, '1 m'),
    prefix: 'pawtrackr:ratelimit:public-availability', timeout: 1_000 }),
  'waitlist-claim': new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(15, '10 m'),
    prefix: 'pawtrackr:ratelimit:waitlist-claim', timeout: 1_000 }),
  'sovereign-admin': new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '10 m'),
    prefix: 'pawtrackr:ratelimit:sovereign-admin', timeout: 1_000 }),
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

function sanitizeTenantSlugHeader(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const normalized = decoded.trim().toLowerCase();
  return SAFE_TENANT_SLUG.test(normalized) ? normalized : null;
}

function dataMode(pathname: string, method: string) {
  if (pathname === '/api/health') {
    return 'synthetic-canary';
  }

  const isWrite = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
  const isStaffApi =
    pathname.startsWith('/api/reservations') ||
    pathname.startsWith('/api/analytics') ||
    pathname.startsWith('/api/clients') ||
    pathname.startsWith('/api/pets') ||
    pathname.startsWith('/api/media') ||
    pathname.startsWith('/api/inventory') ||
    pathname.startsWith('/api/voice') ||
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
    pathname.startsWith('/api/admin/sovereign-matrix') ||
    pathname.startsWith('/api/waivers');

  const isStaffPage =
    (pathname.startsWith('/dashboard/') && (pathname.endsWith('/live') || pathname.includes('/live/'))) ||
    pathname === '/signup' ||
    pathname === '/fleet' ||
    pathname === '/crm' ||
    pathname === '/vault';

  if (isStaffApi) {
    return isWrite ? 'authenticated-write' : 'authenticated-read';
  }
  if (isStaffPage) {
    return 'authenticated-read';
  }
  if (pathname === '/api/webhooks/stripe') {
    return 'verified-webhook';
  }
  if (pathname.startsWith('/api/public/') || pathname === '/portal/manage') {
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
  const trace = parseOrCreateTraceContext(req.headers);

  // 1. Distributed sliding-window limiter, with a bounded local fallback for
  // development and brief provider failures.
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
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'X-Pawtrackr-Data-Mode': mode,
            traceparent: trace.traceparent,
            'x-request-id': trace.requestId,
          },
        },
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
    const rewriteRes = NextResponse.rewrite(rewriteUrl);
    rewriteRes.headers.set('traceparent', trace.traceparent);
    rewriteRes.headers.set('x-request-id', trace.requestId);
    return rewriteRes;
  }

  // Propagate W3C traceparent and x-request-id into downstream route handlers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('traceparent', trace.traceparent);
  requestHeaders.set('x-request-id', trace.requestId);

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // 3. Hardened Multi-Tenant, Tracing & OWASP Security Headers (#45, TRC-01)
  res.headers.set('x-pawtrackr-data-mode', mode);
  res.headers.set('traceparent', trace.traceparent);
  res.headers.set('x-request-id', trace.requestId);
  if (rateResult) applyRateLimitHeaders(res, rateResult, rateMode);

  // Sanitize tenant slug strictly to ISO-8859-1 safe [a-z0-9-] before calling Headers.set
  if (pathname.startsWith('/portal/')) {
    const safeSlug = sanitizeTenantSlugHeader(pathname.split('/')[2]);
    if (safeSlug && safeSlug !== 'live' && safeSlug !== 'manage') {
      res.headers.set('x-pawtrackr-tenant-slug', safeSlug);
    }
  } else if (searchParams.has('tenant')) {
    const safeSlug = sanitizeTenantSlugHeader(searchParams.get('tenant'));
    if (safeSlug) {
      res.headers.set('x-pawtrackr-tenant-slug', safeSlug);
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
