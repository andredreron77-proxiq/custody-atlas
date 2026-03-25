/**
 * One-time setup script: create invite_codes table in Supabase.
 * Run with: npx tsx server/scripts/createInviteCodesTable.ts
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";

async function main() {
  if (!supabaseAdmin) {
    console.error("supabaseAdmin not configured. Check VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  console.log("Checking if invite_codes table exists...");
  const { error: checkErr } = await supabaseAdmin.from("invite_codes").select("id").limit(1);

  if (!checkErr) {
    console.log("✓ Table already exists. Nothing to do.");
    return;
  }

  console.log("Table missing (", checkErr.message, "). Please run this SQL in your Supabase project's SQL Editor:");
  console.log(`
CREATE TABLE IF NOT EXISTS invite_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  tier        text NOT NULL DEFAULT 'pro',
  max_uses    int,
  uses_count  int NOT NULL DEFAULT 0,
  expires_at  timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
`);
}

main().catch(console.error);
