/**
 * server/services/auth.ts
 *
 * Supabase-backed authentication service.
 * Verifies Bearer JWTs using the admin client.
 */

import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export type UserTier = "free" | "pro" | "attorney_firm";

export interface AuthUser {
  id: string;
  email: string | null;
  tier: UserTier;
}

/**
 * Extract and verify the current user from the Authorization header.
 * Returns null when no valid token is present or Supabase is not configured.
 */
export async function getCurrentUser(req: Request): Promise<AuthUser | null> {
  if (!supabaseAdmin) return null;

  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  if (!token) return null;

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;

    const tier = await getUserTier(user.id);
    return {
      id: user.id,
      email: user.email ?? null,
      tier,
    };
  } catch {
    return null;
  }
}

/**
 * Express middleware that rejects unauthenticated requests with 401.
 * Attaches the resolved user to req.user for downstream handlers.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({
      error: "Authentication required. Please sign in to use this feature.",
      code: "UNAUTHENTICATED",
    });
    return;
  }
  (req as any).user = user;
  next();
}

/**
 * Express middleware that resolves the current user when possible but never
 * rejects the request. Attaches the resolved user or null to req.user.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await getCurrentUser(req);
  (req as any).user = user;
  next();
}

/**
 * Express middleware that restricts access to the designated admin email.
 * Must be used AFTER requireAuth — assumes (req as any).user is already set.
 * Reads ADMIN_EMAIL from environment variables.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  const user = await getCurrentUser(req);
  console.log("[requireAdmin] ADMIN_EMAIL:", process.env.ADMIN_EMAIL);
  console.log("[requireAdmin] user email:", user?.email);

  // ── Debug logging (temporary) ─────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  console.log("[requireAdmin]", {
    path: req.path,
    hasToken: !!token,
    resolvedEmail: user?.email ?? null,
    adminEmail: adminEmail ?? "(not set)",
    match: user ? (user.email ?? "").toLowerCase() === (adminEmail ?? "") : false,
  });
  // ─────────────────────────────────────────────────────────────────────────

  if (!user) {
    res.status(401).json({ error: "Authentication required.", code: "UNAUTHENTICATED" });
    return;
  }

  if (!adminEmail) {
    res.status(403).json({ error: "Admin access not configured.", code: "FORBIDDEN" });
    return;
  }

  if ((user.email ?? "").toLowerCase() !== adminEmail) {
    res.status(403).json({ error: "Access denied.", code: "FORBIDDEN" });
    return;
  }

  (req as any).user = user;
  next();
}

/**
 * Retrieve the tier for an authenticated user from user_profiles.
 * Falls back to "free" if the record is missing.
 *
 * NOTE: user_profiles uses "id" (not "user_id") as the primary key.
 * The value is the Supabase auth.users UUID — the same ID returned
 * by supabaseAdmin.auth.getUser().
 */
export async function getUserTier(userId: string): Promise<UserTier> {
  if (!supabaseAdmin) return "free";
  try {
    const { data } = await supabaseAdmin
      .from("user_profiles")
      .select("tier")
      .eq("id", userId)
      .single();
    return (data?.tier as UserTier) ?? "free";
  } catch {
    return "free";
  }
}
