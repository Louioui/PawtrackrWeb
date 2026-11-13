import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const allowedStages = new Set([
  'checked_in',
  'bathing',
  'drying',
  'styling',
  'quality_check',
  'ready',
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // WF09: Station task card & stage progression
  const auth = await requireActiveStaffSession(req, 'Visit stage progression', [
    'owner',
    'manager',
    'senior_groomer',
    'groomer',
    'bather',
  ]);
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

  const action = typeof body.action === 'string' ? body.action : 'advance_stage';

  // Action 1: Acknowledge safety notes
  if (action === 'acknowledge_safety') {
    const { data, error } = await auth.ctx.supabase.rpc('acknowledge_safety_notes', {
      p_visit_id: id,
    });

    if (error) {
      const status = error.code?.startsWith('PW') ? 400 : 502;
      return noStoreJson({ error: error.message || 'Could not acknowledge safety notes.' }, status);
    }

    return noStoreJson(
      {
        ok: true,
        visit: data,
        message: 'Safety notes acknowledged. Floor work may proceed (WF09).',
      },
      200,
    );
  }

  // Action 2: Advance floor stage
  if (action === 'advance_stage') {
    const targetStage = typeof body.target_stage === 'string' ? body.target_stage.trim() : '';
    if (!allowedStages.has(targetStage)) {
      return noStoreJson(
        {
          error: `Invalid target stage '${targetStage}'. Must be one of: ${Array.from(allowedStages).join(', ')}`,
        },
        400,
      );
    }

    const careNote =
      typeof body.care_note === 'string' && body.care_note.trim()
        ? body.care_note.trim().slice(0, 500)
        : null;

    const clientVersion =
      typeof body.client_version === 'number' && Number.isInteger(body.client_version) && body.client_version >= 1
        ? body.client_version
        : null;

    if (clientVersion === null) {
      return noStoreJson(
        {
          error: 'client_version integer >= 1 is required for optimistic concurrency control (WF09).',
        },
        400,
      );
    }

    const { data, error } = await auth.ctx.supabase.rpc('advance_visit_stage', {
      p_visit_id: id,
      p_target_stage: targetStage,
      p_care_note: careNote,
      p_client_version: clientVersion,
    });

    if (error) {
      // Version conflict: 409 Conflict
      if (error.code === 'PW029') {
        return noStoreJson(
          {
            error:
              'Record conflict: this visit was updated by another team member. Please refresh to view the latest state.',
            code: 'VERSION_MISMATCH',
          },
          409,
        );
      }

      // Domain violation: 400 Bad Request
      const status = error.code?.startsWith('PW') ? 400 : 502;
      return noStoreJson(
        {
          error: error.message || 'Could not advance visit stage.',
          code: error.code,
        },
        status,
      );
    }

    return noStoreJson(
      {
        ok: true,
        visit: data,
        message: `Visit stage successfully advanced to ${targetStage}.`,
      },
      200,
    );
  }

  return noStoreJson({ error: `Unknown action '${action}'.` }, 400);
}
