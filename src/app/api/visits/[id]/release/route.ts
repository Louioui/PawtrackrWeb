import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // WF10: Ready queue & pet release
  const auth = await requireActiveStaffSession(req, 'Pet release', ['owner', 'manager', 'front_desk']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return noStoreJson({ error: 'Valid visit UUID is required.' }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const releasedToName = typeof body.released_to_name === 'string' ? body.released_to_name.trim() : '';
  if (!releasedToName) {
    return noStoreJson(
      { error: 'Name of the person collecting the pet is required at release (WF10).' },
      400,
    );
  }

  const unpaidOverride = Boolean(body.unpaid_override);
  const unpaidReason =
    typeof body.unpaid_reason === 'string' && body.unpaid_reason.trim()
      ? body.unpaid_reason.trim().slice(0, 300)
      : null;

  // Unpaid release requires manager or owner approval
  if (unpaidOverride) {
    if (auth.ctx.membership.role !== 'owner' && auth.ctx.membership.role !== 'manager') {
      return noStoreJson(
        {
          error:
            'Front desk staff cannot override unpaid release without recorded manager authorization (WF10).',
        },
        403,
      );
    }

    if (!unpaidReason) {
      return noStoreJson(
        {
          error:
            'A recorded reason is required when releasing a pet before payment is settled (WF10).',
        },
        400,
      );
    }
  }

  const { data, error } = await auth.ctx.supabase.rpc('release_visit', {
    p_visit_id: id,
    p_released_to_name: releasedToName,
    p_unpaid_override: unpaidOverride,
    p_unpaid_reason: unpaidReason,
  });

  if (error) {
    const status = error.code?.startsWith('PW') ? 400 : 502;
    return noStoreJson(
      {
        error: error.message || 'Pet release failed.',
        code: error.code,
      },
      status,
    );
  }

  return noStoreJson(
    {
      ok: true,
      visit: data,
      message: unpaidOverride
        ? `Pet released unpaid with manager override (${unpaidReason}).`
        : 'Pet successfully released to verified collector.',
    },
    200,
  );
}
