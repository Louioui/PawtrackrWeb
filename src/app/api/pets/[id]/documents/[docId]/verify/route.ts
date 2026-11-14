import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import { validateDocumentVerificationInput } from '@/lib/media-and-documents';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const auth = await requireActiveStaffSession(req, 'Pet document verification');
  if (!auth.ok) return auth.response;

  const { id: petId, docId } = await params;
  if (!uuidPattern.test(petId) || !uuidPattern.test(docId)) {
    return noStoreJson({ error: 'Valid pet and document UUIDs are required.' }, 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const validation = validateDocumentVerificationInput({
    ...(typeof body === 'object' && body !== null ? body : {}),
    documentId: docId,
  });

  if (!validation.valid || !validation.payload) {
    return noStoreJson({ error: validation.error }, 422);
  }

  const { payload } = validation;

  // Call the atomic verify_pet_document RPC
  const { data, error } = await auth.ctx.supabase.rpc('verify_pet_document', {
    p_document_id: docId,
    p_status: payload.status,
    p_expires_at: payload.expiresAt || null,
    p_notes: payload.notes || null,
  });

  if (error) {
    const code = error.code === 'PW028' ? 404 : error.code === 'PW021' ? 422 : 502;
    return noStoreJson({ error: error.message || 'Verification failed.' }, code);
  }

  return noStoreJson(
    {
      ok: true,
      data,
      message: `Document successfully marked as ${payload.status}.`,
    },
    200
  );
}
