/**
 * server/services/auth.ts
 *
 * Provider-agnostic authentication service.
 *
 * CURRENT STATE: No auth provider is connected. getCurrentUser always returns
 * null and requireAuth always rejects with 401.
 *
 * TO CONNECT SUPABASE:
 *   1. Install @supabase/supabase-js
 *   2. In getCurrentUser, verify the Bearer JWT from the Authorization header
 *      using supabase.auth.getUser(token)
 *   3. Map the Supabase User to AuthUser (id, email, tier)
 *   4. No other files need to change — all callers use this interface.
 */

import type { Request, Response, NextFunction } from "express";

export type UserTier = "free" | "pro";

export interface AuthUser {
  id: string;
  email: string | null;
  tier: UserTier;
}

/**
 * Extract and verify the current user from the request.
 * Returns null when no valid session or token is present.
 *
 * Supabase slot:
 *   const token = req.headers.authorization?.replace("Bearer ", "");
 *   if (!token) return null;
 *   const { data: { user }, error } = await supabase.auth.getUser(token);
 *   if (error || !user) return null;
 *   const tier = await getUserTierFromDb(user.id);
 *   return { id: user.id, email: user.email ?? null, tier };
 */
export async function getCurrentUser(_req: Request): Promise<AuthUser | null> {
  return null;
}

/**
 * Express middleware that rejects unauthenticated requests with 401.
 * Attach the resolved user to req.user for downstream handlers.
 *
 * Usage:
 *   app.post("/api/ask", requireAuth, handler)
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
 * Retrieve the tier for an already-authenticated user.
 * Override this once you have a user_profiles table.
 *
 * Supabase slot:
 *   const { data } = await supabase.from("user_profiles")
 *     .select("tier").eq("user_id", userId).single();
 *   return (data?.tier as UserTier) ?? "free";
 */
export async function getUserTier(_userId: string): Promise<UserTier> {
  return "free";
}
