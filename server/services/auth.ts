/**
 * server/services/auth.ts
 *
 * Supabase-backed authentication service.
 * Verifies Bearer JWTs using the admin client.
 */

import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export type UserTier = "free" | "pro";

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
 * Retrieve the tier for an authenticated user from user_profiles.
 * Falls back to "free" if the record is missing.
 */
export async function getUserTier(userId: string): Promise<UserTier> {
  if (!supabaseAdmin) return "free";
  try {
    const { data } = await supabaseAdmin
      .from("user_profiles")
      .select("tier")
      .eq("user_id", userId)
      .single();
    return (data?.tier as UserTier) ?? "free";
  } catch {
    return "free";
  }
}
