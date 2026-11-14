export type ApiRateLimitPolicy = {
  id:
    | 'public-booking-write'
    | 'public-booking-manage'
    | 'public-availability'
    | 'waitlist-claim'
    | 'sovereign-admin'
    | 'onboarding'
    | 'payment-intent'
    | 'billing-checkout'
    | 'api';
  limit: number;
  windowMs: number;
  duration: '1 m' | '10 m';
};

export type ApiRateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

const oneMinute = 60_000;
const tenMinutes = 10 * oneMinute;

export function apiRateLimitPolicy(pathname: string, method: string): ApiRateLimitPolicy | null {
  if (!pathname.startsWith('/api/')) return null;
  // Stripe webhooks share egress IPs across all tenants and are verified via HMAC + DB event_id nonce.
  if (pathname === '/api/webhooks/stripe') {
    return null;
  }
  if (pathname === '/api/public/bookings' && method === 'POST') {
    return { id: 'public-booking-write', limit: 8, windowMs: tenMinutes, duration: '10 m' };
  }
  if (pathname.startsWith('/api/public/bookings/manage')) {
    return { id: 'public-booking-manage', limit: 20, windowMs: tenMinutes, duration: '10 m' };
  }
  if (pathname === '/api/public/availability' && method === 'GET') {
    return { id: 'public-availability', limit: 120, windowMs: oneMinute, duration: '1 m' };
  }
  if (pathname.startsWith('/api/waitlist/offers/')) {
    return { id: 'waitlist-claim', limit: 15, windowMs: tenMinutes, duration: '10 m' };
  }
  if (pathname === '/api/admin/sovereign-matrix') {
    return { id: 'sovereign-admin', limit: 20, windowMs: tenMinutes, duration: '10 m' };
  }
  if (pathname === '/api/onboarding') {
    return { id: 'onboarding', limit: 12, windowMs: tenMinutes, duration: '10 m' };
  }
  if (pathname === '/api/payments/intent') {
    return { id: 'payment-intent', limit: 30, windowMs: oneMinute, duration: '1 m' };
  }
  if (pathname === '/api/billing/create-checkout') {
    return { id: 'billing-checkout', limit: 10, windowMs: tenMinutes, duration: '10 m' };
  }
  return { id: 'api', limit: 180, windowMs: oneMinute, duration: '1 m' };
}

type LocalRecord = { count: number; windowStart: number; windowMs: number };

/**
 * Per-process fallback for local development and a temporary Redis outage.
 * It is deliberately bounded so spoofed identifiers cannot grow edge memory
 * without limit. Production releases still require distributed credentials.
 */
export class BoundedLocalRateLimiter {
  private readonly records = new Map<string, LocalRecord>();
  private readonly maxIdentifiers: number;

  constructor(maxIdentifiers = 10_000) {
    if (!Number.isInteger(maxIdentifiers) || maxIdentifiers < 1) {
      throw new Error('maxIdentifiers must be a positive integer');
    }
    this.maxIdentifiers = maxIdentifiers;
  }

  limit(identifier: string, policy: ApiRateLimitPolicy, now = Date.now()): ApiRateLimitResult {
    const key = `${policy.id}:${identifier}`;
    let record = this.records.get(key);
    if (!record || now - record.windowStart >= policy.windowMs) {
      this.makeRoom(now);
      record = { count: 1, windowStart: now, windowMs: policy.windowMs };
      this.records.delete(key);
      this.records.set(key, record);
    } else {
      record.count = Math.min(record.count + 1, policy.limit + 1);
    }
    return {
      success: record.count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - record.count),
      reset: record.windowStart + policy.windowMs,
    };
  }

  size() {
    return this.records.size;
  }

  private makeRoom(now: number) {
    if (this.records.size < this.maxIdentifiers) return;
    for (const [key, record] of this.records) {
      if (now - record.windowStart >= record.windowMs) this.records.delete(key);
    }
    while (this.records.size >= this.maxIdentifiers) {
      const oldest = this.records.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.records.delete(oldest);
    }
  }
}
