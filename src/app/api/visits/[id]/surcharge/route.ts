import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { validateSurchargeConsent, roundToCents } from '@/lib/live-pos';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // WF11: Surcharge request & customer consent approval
  const auth = await requireActiveStaffSession(req, 'Surcharge management');
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

  const action = typeof body.action === 'string' ? body.action : 'request';

  if (action === 'request') {
    const amount = roundToCents(Number(body.amount) || 0);
    if (amount <= 0) {
      return noStoreJson({ error: 'Surcharge amount must be greater than zero.' }, 422);
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : 'extra_time';
    const extraTimeMinutes = Math.max(0, Math.floor(Number(body.extraTimeMinutes) || 15));
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null;
    const photoUrl = typeof body.photoUrl === 'string' ? body.photoUrl.trim() : null;

    const { data, error } = await auth.ctx.supabase.rpc('request_visit_surcharge', {
      p_visit_id: id,
      p_amount: amount,
      p_reason: reason,
      p_extra_time_minutes: extraTimeMinutes,
      p_notes: notes,
      p_photo_url: photoUrl,
    });

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === 'PW028') return noStoreJson({ error: error.message, code: 'PW028' }, 404);
      return noStoreJson({ error: error.message || 'Failed to request surcharge.' }, 500);
    }

    return noStoreJson({ ok: true, surcharge: data }, 200);
  }

  if (action === 'resolve') {
    const surchargeId = typeof body.surchargeId === 'string' ? body.surchargeId.trim() : '';
    if (!uuidPattern.test(surchargeId)) {
      return noStoreJson({ error: 'Valid surcharge UUID is required.' }, 400);
    }

    const approved = Boolean(body.approved);
    const clientConsented = Boolean(body.clientConsented);
    const resolutionNote = typeof body.resolutionNote === 'string' ? body.resolutionNote.trim() : null;

    // Enforce consent gate (PW044)
    if (approved && !clientConsented) {
      return noStoreJson(
        { error: 'Cannot apply surcharge without explicit recorded client consent (WF11)', code: 'PW044' },
        422
      );
    }

    const { data, error } = await auth.ctx.supabase.rpc('resolve_visit_surcharge', {
      p_surcharge_id: surchargeId,
      p_approved: approved,
      p_client_consented: clientConsented,
      p_resolution_note: resolutionNote,
    });

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === 'PW044') return noStoreJson({ error: error.message, code: 'PW044' }, 422);
      if (code === 'PW043') return noStoreJson({ error: error.message, code: 'PW043' }, 409);
      if (code === 'PW028') return noStoreJson({ error: error.message, code: 'PW028' }, 404);
      return noStoreJson({ error: error.message || 'Failed to resolve surcharge.' }, 500);
    }

    return noStoreJson({ ok: true, surcharge: data }, 200);
  }

  return noStoreJson({ error: `Unsupported action '${action}'.` }, 400);
}
