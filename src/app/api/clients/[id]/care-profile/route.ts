import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { buildClientCareProfile, type ClientCareVisitSummary } from '@/lib/live-communications';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // WF03, WF38-WF40: Client care profile, historical visit & spend aggregation, safety alerts, recall intervals
  const auth = await requireActiveStaffSession(req, 'Client care profile');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return noStoreJson({ error: 'Valid client UUID is required.' }, 400);
  }

  // 1. Fetch client
  const { data: client, error: clientError } = await auth.ctx.supabase
    .from('clients')
    .select('id, name, phone, email')
    .eq('id', id)
    .eq('business_id', auth.ctx.membership.business_id)
    .maybeSingle();

  if (clientError || !client) {
    return noStoreJson({ error: 'Client not found.' }, 404);
  }

  // 2. Fetch pets
  const { data: pets, error: petsError } = await auth.ctx.supabase
    .from('pets')
    .select('id, name, breed')
    .eq('client_id', id)
    .eq('business_id', auth.ctx.membership.business_id);

  if (petsError) {
    return noStoreJson({ error: 'Error loading client pets.' }, 502);
  }

  // 3. Fetch visits
  const { data: visits, error: visitsError } = await auth.ctx.supabase
    .from('visits')
    .select('id, scheduled_time, status, total_amount, service_package, report_cards(coat_condition, behavior_tags), incident_reports(incident_type, severity)')
    .eq('client_id', id)
    .eq('business_id', auth.ctx.membership.business_id)
    .order('scheduled_time', { ascending: true });

  if (visitsError) {
    return noStoreJson({ error: 'Error loading client visit history.' }, 502);
  }

  const visitSummaries: ClientCareVisitSummary[] = (visits || []).map((v) => {
    const rc = Array.isArray(v.report_cards) ? v.report_cards[0] : v.report_cards;
    const inc = Array.isArray(v.incident_reports) ? v.incident_reports[0] : v.incident_reports;

    return {
      visitId: v.id,
      date: v.scheduled_time,
      status: v.status,
      totalCents: Math.round(Number(v.total_amount || 0) * 100),
      servicePackage: v.service_package || 'Standard Groom',
      coatCondition: rc?.coat_condition,
      behaviorTags: rc?.behavior_tags,
      incidentType: inc?.incident_type,
      incidentSeverity: inc?.severity,
    };
  });

  const profile = buildClientCareProfile(
    client,
    pets || [],
    visitSummaries,
  );

  return noStoreJson({ careProfile: profile }, 200);
}
