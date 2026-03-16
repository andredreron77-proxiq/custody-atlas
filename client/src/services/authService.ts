/**
 * client/src/services/authService.ts
 *
 * Provider-agnostic frontend authentication service.
 *
 * CURRENT STATE: getAuthUser always returns null (no auth provider connected).
 * signIn / signOut are no-ops.
 *
 * TO CONNECT SUPABASE:
 *   1. npm install @supabase/supabase-js
 *   2. Create client/src/lib/supabaseClient.ts:
 *        import { createClient } from "@supabase/supabase-js";
 *        export const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
 *   3. Replace getAuthUser:
 *        const { data: { user } } = await supabase.auth.getUser();
 *        if (!user) return null;
 *        const tier = await fetchUserTier(user.id);
 *        return { id: user.id, email: user.email ?? null, displayName: user.user_metadata?.full_name ?? null, tier, avatarUrl: user.user_metadata?.avatar_url ?? null };
 *   4. Replace signIn:
 *        await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
 *   5. Replace signOut:
 *        await supabase.auth.signOut();
 *   6. Subscribe to auth state changes in your React context:
 *        supabase.auth.onAuthStateChange((_event, session) => { ... });
 */

export type UserTier = "free" | "pro";

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  tier: UserTier;
  avatarUrl: string | null;
}

/**
 * Return the currently authenticated user, or null if not signed in.
 *
 * Supabase slot: see file header.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  return null;
}

/**
 * Begin the sign-in flow (OAuth redirect, magic link, etc.).
 *
 * Supabase slot: supabase.auth.signInWithOAuth({ provider: "google" })
 */
export async function signIn(): Promise<void> {
  // no-op until Supabase is connected
}

/**
 * Sign the current user out.
 *
 * Supabase slot: supabase.auth.signOut()
 */
export async function signOut(): Promise<void> {
  // no-op until Supabase is connected
}

/**
 * Fetch the user's tier from your database.
 * Called internally after resolving the Supabase user.
 *
 * Supabase slot:
 *   const { data } = await supabase.from("user_profiles")
 *     .select("tier").eq("user_id", userId).single();
 *   return (data?.tier as UserTier) ?? "free";
 */
export async function fetchUserTier(_userId: string): Promise<UserTier> {
  return "free";
}
