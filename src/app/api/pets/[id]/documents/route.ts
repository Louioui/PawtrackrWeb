import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  sanitizeStoragePath,
  validateDocumentUploadInput,
} from '@/lib/media-and-documents';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireActiveStaffSession(req, 'Pet documents view');
  if (!auth.ok) return auth.response;

  const { id: petId } = await params;
  if (!uuidPattern.test(petId)) {
    return noStoreJson({ error: 'Valid pet UUID is required.' }, 400);
  }

  // Verify pet belongs to the caller's salon
  const { data: pet, error: petError } = await auth.ctx.supabase
    .from('pets')
    .select('id, name, breed, rabies_verified, client_id')
    .eq('id', petId)
    .eq('business_id', auth.ctx.membership.business_id)
    .maybeSingle();

  if (petError || !pet) {
    return noStoreJson({ error: 'Pet not found.' }, 404);
  }

  // Query documents
  const { data: documents, error: docError } = await auth.ctx.supabase
    .from('pet_documents')
    .select('*')
    .eq('pet_id', petId)
    .eq('business_id', auth.ctx.membership.business_id)
    .order('created_at', { ascending: false });

  if (docError) {
    return noStoreJson({ error: 'Failed to retrieve pet documents.' }, 502);
  }

  // Generate 15-minute signed URLs for each document
  const docsWithSignedUrls = await Promise.all(
    (documents || []).map(async (doc) => {
      try {
        const { data: signedData } = await auth.ctx.supabase.storage
          .from('pet-documents')
          .createSignedUrl(doc.file_path, DEFAULT_SIGNED_URL_TTL_SECONDS);

        return {
          ...doc,
          signed_url: signedData?.signedUrl || null,
        };
      } catch {
        return {
          ...doc,
          signed_url: null,
        };
      }
    })
  );

  return noStoreJson(
    {
      ok: true,
      pet: {
        id: pet.id,
        name: pet.name,
        breed: pet.breed,
        rabies_verified: pet.rabies_verified,
        client_id: pet.client_id,
      },
      documents: docsWithSignedUrls,
    },
    200
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireActiveStaffSession(req, 'Pet document upload');
  if (!auth.ok) return auth.response;

  const { id: petId } = await params;
  if (!uuidPattern.test(petId)) {
    return noStoreJson({ error: 'Valid pet UUID is required.' }, 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: 'A valid JSON body is required.' }, 400);
  }

  const validation = validateDocumentUploadInput(body);
  if (!validation.valid || !validation.payload) {
    return noStoreJson({ error: validation.error }, 422);
  }

  const { payload } = validation;
  if (payload.petId !== petId) {
    return noStoreJson({ error: 'Pet ID in path does not match payload.' }, 422);
  }

  // Validate file path tenant isolation
  const sanitized = sanitizeStoragePath(auth.ctx.membership.business_id, payload.filePath);
  if (!sanitized.valid || !sanitized.path) {
    return noStoreJson({ error: sanitized.error || 'Invalid file path.' }, 403);
  }

  // Ensure pet belongs to salon
  const { data: pet, error: petErr } = await auth.ctx.supabase
    .from('pets')
    .select('id, client_id')
    .eq('id', petId)
    .eq('business_id', auth.ctx.membership.business_id)
    .maybeSingle();

  if (petErr || !pet) {
    return noStoreJson({ error: 'Pet not found.' }, 404);
  }

  if (pet.client_id !== payload.clientId) {
    return noStoreJson({ error: 'Client ID does not match pet owner.' }, 422);
  }

  // Insert document record
  const { data: doc, error: insertError } = await auth.ctx.supabase
    .from('pet_documents')
    .insert({
      business_id: auth.ctx.membership.business_id,
      pet_id: petId,
      client_id: payload.clientId,
      document_type: payload.documentType,
      file_path: sanitized.path,
      file_name: payload.fileName,
      file_size_bytes: payload.fileSizeBytes || null,
      mime_type: payload.mimeType,
      status: 'uploaded',
    })
    .select('*')
    .single();

  if (insertError || !doc) {
    return noStoreJson({ error: insertError?.message || 'Failed to save document.' }, 502);
  }

  // Record audit log
  await auth.ctx.supabase.from('workflow_events').insert({
    business_id: auth.ctx.membership.business_id,
    workflow_id: 'WF20',
    event_type: 'document.uploaded',
    source_record_type: 'pet_documents',
    source_record_id: doc.id,
    source_version: 1,
    actor_user_id: auth.ctx.user.id,
    actor_role: auth.ctx.membership.role,
    previous_state: null,
    new_state: 'uploaded',
    reason: `Staff uploaded ${payload.documentType} document: ${payload.fileName}`,
    metadata: {
      pet_id: petId,
      client_id: payload.clientId,
      document_type: payload.documentType,
      file_name: payload.fileName,
    },
  });

  return noStoreJson(
    {
      ok: true,
      document: doc,
      message: 'Document uploaded successfully.',
    },
    201
  );
}
