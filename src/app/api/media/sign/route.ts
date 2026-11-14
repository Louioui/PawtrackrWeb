import { NextRequest } from 'next/server';
import { noStoreJson, requireActiveStaffSession } from '@/lib/live-auth';
import {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  sanitizeStoragePath,
} from '@/lib/media-and-documents';

export const dynamic = 'force-dynamic';

const ALLOWED_BUCKETS = new Set(['grooming-photos', 'pet-documents']);

export async function GET(req: NextRequest) {
  const auth = await requireActiveStaffSession(req, 'Media signing');
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const bucket = url.searchParams.get('bucket');
  const path = url.searchParams.get('path');

  if (!bucket || !ALLOWED_BUCKETS.has(bucket)) {
    return noStoreJson(
      { error: 'Valid bucket parameter is required (grooming-photos or pet-documents).' },
      400
    );
  }

  if (!path) {
    return noStoreJson({ error: 'Valid path parameter is required.' }, 400);
  }

  const sanitized = sanitizeStoragePath(auth.ctx.membership.business_id, path);
  if (!sanitized.valid || !sanitized.path) {
    return noStoreJson({ error: sanitized.error || 'Invalid storage path.' }, 403);
  }

  const { data, error } = await auth.ctx.supabase.storage
    .from(bucket)
    .createSignedUrl(sanitized.path, DEFAULT_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return noStoreJson(
      { error: error?.message || 'Could not generate signed URL for media.' },
      502
    );
  }

  return noStoreJson(
    {
      ok: true,
      bucket,
      path: sanitized.path,
      signedUrl: data.signedUrl,
      expiresIn: DEFAULT_SIGNED_URL_TTL_SECONDS,
    },
    200
  );
}
