/**
 * client/src/hooks/use-auth.ts
 *
 * React hook for the current authenticated user.
 * Subscribes to Supabase auth state changes so the UI reacts
 * to login / logout events instantly.
 *
 * PASSWORD_RECOVERY handling
 * ──────────────────────────
 * When a user clicks a password-reset email link, Supabase fires
 * onAuthStateChange with event = "PASSWORD_RECOVERY" and simultaneously
 * establishes a short-lived recovery session.  Without special handling
 * the hook would treat that session as a normal login and allow the user
 * to enter the app before they have set a new password.
 *
 * Fix: a module-level flag (_recoveryActive) is set to true when
 * PASSWORD_RECOVERY fires.  While the flag is active:
 *  - getSession() initialisation is skipped (user stays null).
 *  - The user is redirected to /reset-password if not already there.
 * The flag is cleared by any subsequent auth event (USER_UPDATED / SIGNED_IN)
 * which fires after the password is successfully changed.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { setAccessToken } from "@/lib/tokenStore";
import type { AuthUser } from "@/services/authService";

/** True while a Supabase recovery session is active (reset-link clicked). */
let _recoveryActive = false;

interface UseAuthResult {
  user: AuthUser | null;
  isLoading: boolean;
}

function buildUser(u: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>["user"]): AuthUser {
  return {
    id: u.id,
    email: u.email ?? null,
    displayName:
      u.user_metadata?.full_name ??
      u.user_metadata?.name ??
      null,
    tier: "free",
    avatarUrl: u.user_metadata?.avatar_url ?? null,
  };
}

export function useCurrentUser(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // ── Auth state subscriber ────────────────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          // A recovery link was clicked.  Block normal session initialisation
          // and route the user to the dedicated reset-password page.
          _recoveryActive = true;
          // Persist a flag across re-renders / navigation for ResetPasswordPage.
          sessionStorage.setItem("custody-atlas:recovery", "1");
          setAccessToken(null);
          setUser(null);
          setIsLoading(false);

          if (!window.location.pathname.endsWith("/reset-password")) {
            window.location.replace("/reset-password");
          }
          return;
        }

        // Any other auth event ends the recovery guard.
        _recoveryActive = false;

        setAccessToken(session?.access_token ?? null);
        if (session?.user) {
          setUser(buildUser(session.user));

          // After a Google OAuth round-trip (SIGNED_IN fires on return),
          // navigate back to the page the user was on before they clicked "Continue with Google".
          if (event === "SIGNED_IN") {
            const returnPath = sessionStorage.getItem("custody-atlas:return-path");
            if (returnPath) {
              sessionStorage.removeItem("custody-atlas:return-path");
              // Use replace to avoid adding the OAuth callback to browser history.
              window.location.replace(returnPath);
            }
          }
        } else {
          setUser(null);
        }
        setIsLoading(false);
      },
    );

    // ── Resolve initial session on mount ─────────────────────────────────
    // Skip if a recovery session is already active (handled above).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (_recoveryActive) {
        // Recovery flow in progress — do not set the user.
        return;
      }
      setAccessToken(session?.access_token ?? null);
      if (session?.user) {
        setUser(buildUser(session.user));
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, isLoading };
}
