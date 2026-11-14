import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { appendWorkflowEvent, noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  // WF01: Digital Liability Waiver Intake & Tablet Signing
  const auth = await requireActiveStaffSession(req, 'Digital waivers', ['owner', 'manager', 'front_desk']);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const clientId = typeof body.client_id === 'string' && uuidPattern.test(body.client_id) ? body.client_id : null;
  const petId = typeof body.pet_id === 'string' && uuidPattern.test(body.pet_id) ? body.pet_id : null;
  const visitId = typeof body.visit_id === 'string' && uuidPattern.test(body.visit_id) ? body.visit_id : null;

  if (!clientId || !petId) {
    return noStoreJson({ error: 'Valid client_id and pet_id are required.' }, 400);
  }

  const signerName = typeof body.signer_name === 'string' ? body.signer_name.trim().slice(0, 120) : '';
  if (!signerName) {
    return noStoreJson({ error: 'Signer name is required.' }, 400);
  }

  const agreed = Boolean(body.agreed);
  if (!agreed) {
    return noStoreJson({ error: 'Terms must be agreed to sign the waiver.' }, 400);
  }

  const businessId = auth.ctx.membership.business_id;

  // Verify client_id and pet_id belong to this tenant (cross-tenant IDOR prevention)
  const [{ data: clientRow }, { data: petRow }] = await Promise.all([
    auth.ctx.supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('business_id', businessId)
      .maybeSingle(),
    auth.ctx.supabase
      .from('pets')
      .select('id, client_id')
      .eq('id', petId)
      .eq('business_id', businessId)
      .maybeSingle(),
  ]);

  if (!clientRow || !petRow || petRow.client_id !== clientId) {
    return noStoreJson({ error: 'Client or pet record not found for this salon.' }, 404);
  }

  const termsText =
    typeof body.agreed_terms_text === 'string' && body.agreed_terms_text.trim()
      ? body.agreed_terms_text.trim().slice(0, 4000)
      : 'Standard Pawtrackr Salon Liability Agreement: Client authorizes standard grooming procedures, matted coat care, and emergency veterinary intervention if medically required.';

  const waiverTypes = Array.isArray(body.waiver_types) && body.waiver_types.every((t) => typeof t === 'string')
    ? (body.waiver_types as string[]).slice(0, 12).map((t) => t.slice(0, 64))
    : ['matted_coat', 'general_care'];

  if (typeof body.signature_data_url === 'string' && body.signature_data_url.length > 250_000) {
    return noStoreJson({ error: 'Signature image payload exceeds 250KB maximum.' }, 413);
  }

  const escapedSigner = signerName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const signatureDataUrl =
    typeof body.signature_data_url === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(body.signature_data_url)
      ? body.signature_data_url
      : `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg"><text y="20">${escapedSigner}</text></svg>`)}`;

  const hashContent = `${auth.ctx.membership.business_id}:${clientId}:${petId}:${signerName}:${new Date().toISOString()}`;
  const verificationHash = createHash('sha256').update(hashContent).digest('hex');

  const { data: waiver, error: waiverError } = await auth.ctx.supabase
    .from('digital_waivers')
    .insert({
      business_id: auth.ctx.membership.business_id,
      client_id: clientId,
      pet_id: petId,
      visit_id: visitId,
      waiver_types: waiverTypes,
      agreed_terms_text: termsText,
      signer_name: signerName,
      signature_data_url: signatureDataUrl,
      verification_hash: verificationHash,
    })
    .select('id, business_id, client_id, pet_id, visit_id, signer_name, signed_at, verification_hash')
    .single();

  if (waiverError || !waiver) {
    return noStoreJson({ error: 'Digital waiver could not be created.' }, 502);
  }

  // If a visit_id was supplied, update the visit record
  if (visitId) {
    await auth.ctx.supabase
      .from('visits')
      .update({
        waiver_id: waiver.id,
        waiver_status: 'verified',
      })
      .eq('id', visitId)
      .eq('business_id', auth.ctx.membership.business_id);
  }

  await appendWorkflowEvent(auth.ctx, {
    workflow_id: 'WF01',
    event_type: 'waiver.signed',
    source_record_type: 'digital_waiver',
    source_record_id: waiver.id,
    metadata: {
      client_id: clientId,
      pet_id: petId,
      visit_id: visitId,
      signer_name: signerName,
      verification_hash: verificationHash,
    },
  });

  return noStoreJson(
    {
      ok: true,
      waiver,
      message: 'Digital waiver recorded and verified.',
    },
    201,
  );
}
