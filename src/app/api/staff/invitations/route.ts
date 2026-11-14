import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { appendWorkflowEvent, noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { isLiveStaffRole, LiveStaffRole } from '@/lib/workflow-context';

export const dynamic = 'force-dynamic';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  // WF04: Staff Lifecycle & Invitations
  const auth = await requireActiveStaffSession(req, 'Staff invitations', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.ctx.supabase
    .from('staff_invitations')
    .select('id, email, role, invited_name, expires_at, accepted_at, created_at')
    .eq('business_id', auth.ctx.membership.business_id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    return noStoreJson({ error: 'Staff invitations could not be loaded.' }, 502);
  }

  return noStoreJson(
    {
      source: 'supabase_staff_invitations',
      business_id: auth.ctx.membership.business_id,
      invitations: data,
    },
    200,
  );
}

export async function POST(req: NextRequest) {
  // WF04: Owner / Manager invites a new staff member with a specific role
  const auth = await requireActiveStaffSession(req, 'Staff invitations', ['owner', 'manager']);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!emailPattern.test(email)) {
    return noStoreJson({ error: 'A valid email address is required.' }, 400);
  }

  const role = body.role as LiveStaffRole;
  if (!isLiveStaffRole(role)) {
    return noStoreJson({ error: 'A valid staff role is required.' }, 400);
  }

  // Managers cannot invite an owner
  if (auth.ctx.membership.role === 'manager' && role === 'owner') {
    return noStoreJson({ error: 'Managers cannot invite new owners.' }, 403);
  }

  const invitedName = typeof body.name === 'string' ? body.name.trim() : email.split('@')[0];

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invitation, error } = await auth.ctx.supabase
    .from('staff_invitations')
    .insert({
      business_id: auth.ctx.membership.business_id,
      email,
      role,
      invited_name: invitedName,
      token,
      invited_by: auth.ctx.user.id,
      expires_at: expiresAt,
    })
    .select('id, email, role, invited_name, token, expires_at, created_at')
    .single();

  if (error || !invitation) {
    return noStoreJson({ error: error?.message || 'Could not create staff invitation.' }, 502);
  }

  await appendWorkflowEvent(auth.ctx, {
    workflow_id: 'WF04',
    event_type: 'staff.invited',
    source_record_type: 'staff_invitation',
    source_record_id: invitation.id,
    metadata: {
      email,
      role,
      invited_name: invitedName,
      invited_by_role: auth.ctx.membership.role,
    },
  });

  return noStoreJson(
    {
      ok: true,
      invitation,
      message: `Invitation generated for ${invitedName} (${role}). Link valid for 7 days.`,
    },
    201,
  );
}
