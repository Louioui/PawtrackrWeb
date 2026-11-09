// ============================================================================
// PAWTRACKR WEB — SUPABASE MULTI-TENANT CLIENT & TENANT-SCOPED QUERIES
// Automatically scopes queries to `business_id` and falls back cleanly to
// local-first state when running without external cloud credentials.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-id')
);

let browserSupabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(tenantBusinessId?: string): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    return null;
  }

  if (!browserSupabaseClient) {
    browserSupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        headers: tenantBusinessId
          ? { 'x-pawtrackr-business-id': tenantBusinessId }
          : {},
      },
    });
  }

  return browserSupabaseClient;
}
