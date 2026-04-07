/**
 * client/src/services/authService.ts
 *
 * Supabase-backed frontend authentication service.
 */

import { supabase } from "@/lib/supabaseClient";

export type UserTier = "free" | "pro";

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  fullName: string | null;
  authMetadataName: string | null;
  tier: UserTier;
  avatarUrl: string | null;
}

/**
 * Return the currently authenticated user, or null if not signed in.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    return {
      id: user.id,
      email: user.email ?? null,
      displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      fullName: user.user_metadata?.full_name ?? null,
      authMetadataName: user.user_metadata?.name ?? null,
      tier: "free",
      avatarUrl: user.user_metadata?.avatar_url ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Sign in with email and password.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

/**
 * Sign up with email and password.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signUp({ email, password });
  return { error: error?.message ?? null };
}

/**
 * Sign in with Google OAuth.
 * Requires Google provider enabled in Supabase → Authentication → Providers.
 */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/`,
    },
  });
  return { error: error?.message ?? null };
}

/**
 * Send a password reset email.
 * Supabase will email the user a link pointing to /reset-password.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  return { error: error?.message ?? null };
}

/**
 * Set a new password for the currently authenticated user.
 * Call this on the /reset-password page after Supabase has established
 * the recovery session from the link in the email.
 */
export async function updatePassword(
  newPassword: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message ?? null };
}

/**
 * Sign the current user out.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Get the current session's access token for API authorization.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
