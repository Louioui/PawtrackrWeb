import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { canPublishReportCard, validateReportCardInput } from '@/lib/live-communications';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireActiveStaffSession(req, 'Report card view');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return noStoreJson({ error: 'Valid visit UUID is required.' }, 400);
  }

  // Fetch visit status and existing report card
  const { data: visit, error: visitError } = await auth.ctx.supabase
    .from('visits')
    .select('id, status, pet_id, client_id, pets(name, breed), clients(name, phone, email)')
    .eq('id', id)
    .eq('business_id', auth.ctx.membership.business_id)
    .maybeSingle();

  if (visitError || !visit) {
    return noStoreJson({ error: 'Visit not found.' }, 404);
  }

  const { data: card, error: cardError } = await auth.ctx.supabase
    .from('report_cards')
    .select('*')
    .eq('visit_id', id)
    .eq('business_id', auth.ctx.membership.business_id)
    .maybeSingle();

  if (cardError) {
    return noStoreJson({ error: 'Error loading report card.' }, 502);
  }

  return noStoreJson(
    {
      visit: {
        id: visit.id,
        status: visit.status,
        canPublish: canPublishReportCard(visit.status),
        pet: visit.pets,
        client: visit.clients,
      },
      reportCard: card || null,
    },
    200,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // WF07: Report card drafting and publishing
  const auth = await requireActiveStaffSession(req, 'Report card authoring');
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

  const action = body.action === 'draft' ? 'draft' : 'publish';
  const coatCondition = typeof body.coatCondition === 'string' ? body.coatCondition : 'good';
  const behaviorTags = Array.isArray(body.behaviorTags) ? body.behaviorTags : [];
  const careNotes = typeof body.careNotes === 'string' ? body.careNotes : null;
  const recommendations = typeof body.recommendations === 'string' ? body.recommendations : null;
  const photos = Array.isArray(body.photos) ? body.photos : [];

  const validation = validateReportCardInput({
    coatCondition,
    behaviorTags,
    careNotes,
    recommendations,
    photos,
  });

  if (!validation.valid) {
    return noStoreJson({ error: validation.error }, 422);
  }

  if (action === 'draft') {
    const { data, error } = await auth.ctx.supabase.rpc('save_report_card_draft', {
      p_visit_id: id,
      p_coat_condition: coatCondition,
      p_behavior_tags: behaviorTags,
      p_care_notes: careNotes,
      p_recommendations: recommendations,
      p_photos: photos,
    });

    if (error) {
      const code = error.code === 'PW028' ? 404 : error.code === 'PW021' ? 422 : 502;
      return noStoreJson({ error: error.message || 'Could not save report card draft.' }, code);
    }

    return noStoreJson({ ok: true, data }, 200);
  }

  // Publish action
  const { data, error } = await auth.ctx.supabase.rpc('publish_report_card', {
    p_visit_id: id,
    p_coat_condition: coatCondition,
    p_behavior_tags: behaviorTags,
    p_care_notes: careNotes,
    p_recommendations: recommendations,
    p_photos: photos,
  });

  if (error) {
    let statusCode = 502;
    if (error.code === 'PW052') statusCode = 409;
    else if (error.code === 'PW021') statusCode = 422;
    else if (error.code === 'PW028') statusCode = 404;

    return noStoreJson({ error: error.message || 'Could not publish report card.' }, statusCode);
  }

  return noStoreJson(
    {
      ok: true,
      data,
      message: 'Report card published and client notification queued.',
    },
    200,
  );
}
