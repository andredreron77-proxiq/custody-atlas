/**
 * server/services/adminService.ts
 *
 * Admin-only Supabase operations: user management, tier changes,
 * invite flow, and invite code CRUD.
 *
 * All functions require supabaseAdmin (service role key).
 *
 * Required Supabase table:
 *
 *   CREATE TABLE IF NOT EXISTS invite_codes (
 *     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     code        text NOT NULL UNIQUE,
 *     tier        text NOT NULL DEFAULT 'pro',
 *     max_uses    int,
 *     uses_count  int NOT NULL DEFAULT 0,
 *     expires_at  timestamptz,
 *     is_active   boolean NOT NULL DEFAULT true,
 *     created_at  timestamptz NOT NULL DEFAULT now()
 *   );
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";
import type { UserTier } from "./auth";

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface AdminUser {
  id: string;
  email: string | null;
  tier: UserTier;
  createdAt: string;
}

export interface InviteCode {
  id: string;
  code: string;
  tier: UserTier;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

/* ── User management ────────────────────────────────────────────────────── */

/**
 * List all auth users joined with their tier from user_profiles.
 * Fetches up to 1 000 users (the Supabase admin API limit per page).
 */
export async function listAdminUsers(): Promise<AdminUser[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error || !data) return [];

    const { data: profiles } = await supabaseAdmin
      .from("user_profiles")
      .select("id, tier");

    const tierMap: Record<string, UserTier> = {};
    for (const p of profiles ?? []) {
      tierMap[p.id] = (p.tier as UserTier) ?? "free";
    }

    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      tier: tierMap[u.id] ?? "free",
      createdAt: u.created_at,
    }));
  } catch {
    return [];
  }
}

export async function findAdminUserByEmail(email: string): Promise<AdminUser | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error || !data) return null;

    const lowerEmail = email.trim().toLowerCase();
    const matched = data.users.find((u) => (u.email ?? "").toLowerCase() === lowerEmail);
    if (!matched) return null;

    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("tier")
      .eq("id", matched.id)
      .maybeSingle();

    return {
      id: matched.id,
      email: matched.email ?? null,
      tier: (profile?.tier as UserTier) ?? "free",
      createdAt: matched.created_at,
    };
  } catch {
    return null;
  }
}

/**
 * Upsert the tier for a user in user_profiles.
 * Safe to call even when user_profiles does not yet exist for this user.
 */
export async function setUserTier(userId: string, tier: UserTier): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { error } = await supabaseAdmin
      .from("user_profiles")
      .upsert({ id: userId, tier }, { onConflict: "id" });
    return !error;
  } catch {
    return false;
  }
}

/* ── Invite flow ────────────────────────────────────────────────────────── */

/**
 * Invite a user by email with a pre-assigned tier.
 * If the user already exists, updates their tier instead.
 */
export async function inviteUser(
  email: string,
  tier: UserTier,
): Promise<{ ok: boolean; message: string }> {
  if (!supabaseAdmin) return { ok: false, message: "Supabase not configured." };
  try {
    // Check if the user already exists in auth.users
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = existing?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );

    if (existingUser) {
      await setUserTier(existingUser.id, tier);
      return {
        ok: true,
        message: `Tier updated to ${tier} for existing user ${email}.`,
      };
    }

    // Send invite to new user
    const { data: inviteData, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
    if (error || !inviteData?.user) {
      return { ok: false, message: error?.message ?? "Failed to send invite." };
    }

    // Pre-assign tier so it is ready before the user completes signup
    await setUserTier(inviteData.user.id, tier);
    return { ok: true, message: `Invite sent to ${email} with ${tier} tier.` };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "Unexpected error." };
  }
}

/* ── Invite code CRUD ───────────────────────────────────────────────────── */

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `ATLAS-${part(4)}-${part(4)}`;
}

function mapCode(r: any): InviteCode {
  return {
    id: r.id,
    code: r.code,
    tier: (r.tier as UserTier) ?? "pro",
    maxUses: r.max_uses ?? null,
    usesCount: r.uses_count ?? 0,
    expiresAt: r.expires_at ?? null,
    isActive: r.is_active ?? true,
    createdAt: r.created_at,
  };
}

export async function listInviteCodes(): Promise<InviteCode[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("invite_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map(mapCode);
  } catch {
    return [];
  }
}

export async function createInviteCode(opts: {
  tier: UserTier;
  maxUses?: number | null;
  expiresAt?: string | null;
}): Promise<InviteCode | null> {
  if (!supabaseAdmin) return null;
  try {
    const code = generateCode();
    const { data, error } = await supabaseAdmin
      .from("invite_codes")
      .insert({
        code,
        tier: opts.tier,
        max_uses: opts.maxUses ?? null,
        expires_at: opts.expiresAt ?? null,
      })
      .select()
      .single();
    if (error || !data) return null;
    return mapCode(data);
  } catch {
    return null;
  }
}

export async function deactivateInviteCode(codeId: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { error } = await supabaseAdmin
      .from("invite_codes")
      .update({ is_active: false })
      .eq("id", codeId);
    return !error;
  } catch {
    return false;
  }
}

/* ── Code redemption (user-facing) ─────────────────────────────────────── */

export async function redeemInviteCode(
  code: string,
  userId: string,
): Promise<{ ok: boolean; tier?: UserTier; error?: string }> {
  if (!supabaseAdmin) return { ok: false, error: "Service unavailable." };
  try {
    const normalised = code.trim().toUpperCase();
    const { data, error } = await supabaseAdmin
      .from("invite_codes")
      .select("*")
      .eq("code", normalised)
      .single();

    if (error || !data) return { ok: false, error: "Invalid or unknown code." };
    if (!data.is_active) return { ok: false, error: "This code has been deactivated." };
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { ok: false, error: "This code has expired." };
    }
    if (data.max_uses !== null && data.uses_count >= data.max_uses) {
      return { ok: false, error: "This code has reached its maximum number of uses." };
    }

    // Upgrade the user's tier
    await setUserTier(userId, data.tier as UserTier);

    // Increment uses_count atomically (best-effort)
    await supabaseAdmin
      .from("invite_codes")
      .update({ uses_count: data.uses_count + 1 })
      .eq("id", data.id);

    return { ok: true, tier: data.tier as UserTier };
  } catch {
    return { ok: false, error: "Failed to redeem code. Please try again." };
  }
}
