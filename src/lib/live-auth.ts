import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isDevicePasskeyRevoked } from './adversarial-guardrails.ts';
import { isLiveStaffRole, LiveStaffRole } from './workflow-context.ts';

export type VerifiedStaffContext = {
  supabase: SupabaseClient;
  user: User;
  membership: {
    id: string;
    business_id: string;
    name: string;
    role: LiveStaffRole;
  };
};

export const noStoreJson = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function requireActiveStaffSession(
  req: NextRequest,
  featureLabel: string,
  allowedRoles?: readonly LiveStaffRole[],
): Promise<{ ok: true; ctx: VerifiedStaffContext } | { ok: false; response: NextResponse }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !url.startsWith('https://')) {
    return { ok: false, response: noStoreJson({ error: `${featureLabel} are not configured.` }, 503) };
  }
  const deviceId = req.headers.get('x-pawtrackr-device-id')?.trim();
  if (deviceId && isDevicePasskeyRevoked(deviceId)) {
    return {
      ok: false,
      response: noStoreJson(
        { error: 'Hardware passkey for this device has been revoked. Contact salon owner.', code: 'DEVICE_REVOKED' },
        403,
      ),
    };
  }
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) {
    return { ok: false, response: noStoreJson({ error: 'A signed-in staff session is required.' }, 401) };
  }

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(match[1]);
  if (authError || !user) {
    return { ok: false, response: noStoreJson({ error: 'The staff session is invalid or expired.' }, 401) };
  }

  const { data: membership, error: membershipError } = await supabase
    .from('staff_members')
    .select('id,business_id,name,role')
    .eq('auth_user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, response: noStoreJson({ error: 'Staff membership could not be checked.' }, 502) };
  }
  if (!membership || !isLiveStaffRole(membership.role)) {
    return { ok: false, response: noStoreJson({ error: 'An active staff membership is required.' }, 403) };
  }
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    return {
      ok: false,
      response: noStoreJson(
        { error: `Your role (${membership.role}) does not have permission for this action.` },
        403,
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      supabase,
      user,
      membership: {
        id: membership.id,
        business_id: membership.business_id,
        name: membership.name,
        role: membership.role,
      },
    },
  };
}

export async function appendWorkflowEvent(
  ctx: VerifiedStaffContext,
  event: {
    workflow_id: string;
    event_type: string;
    source_record_type: string;
    source_record_id: string;
    source_version?: number;
    previous_state?: string | null;
    new_state?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.supabase.from('workflow_events').insert({
    business_id: ctx.membership.business_id,
    workflow_id: event.workflow_id,
    event_type: event.event_type,
    source_record_type: event.source_record_type,
    source_record_id: event.source_record_id,
    source_version: event.source_version ?? 1,
    actor_user_id: ctx.user.id,
    actor_role: ctx.membership.role,
    previous_state: event.previous_state ?? null,
    new_state: event.new_state ?? null,
    reason: event.reason ?? null,
    metadata: event.metadata ?? {},
  });
}
