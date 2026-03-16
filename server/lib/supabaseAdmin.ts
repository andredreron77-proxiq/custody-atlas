/**
 * server/lib/supabaseAdmin.ts
 *
 * Supabase admin client for server-side operations.
 * Uses the SERVICE_ROLE_KEY — never expose this on the client.
 *
 * Required environment variables:
 *   VITE_SUPABASE_URL         — your project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key from Supabase → Settings → API
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createAdminClient(): SupabaseClient | null {
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "[Supabase] Admin client not configured. " +
      "Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable auth."
    );
    return null;
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const supabaseAdmin = createAdminClient();
