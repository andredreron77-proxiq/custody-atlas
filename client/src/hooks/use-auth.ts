/**
 * client/src/hooks/use-auth.ts
 *
 * React hook for the current authenticated user.
 * Subscribes to Supabase auth state changes so the UI reacts
 * to login / logout events instantly.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { setAccessToken } from "@/lib/tokenStore";
import type { AuthUser } from "@/services/authService";

interface UseAuthResult {
  user: AuthUser | null;
  isLoading: boolean;
}

export function useCurrentUser(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Resolve initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAccessToken(session?.access_token ?? null);
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? null,
          displayName:
            session.user.user_metadata?.full_name ??
            session.user.user_metadata?.name ??
            null,
          tier: "free",
          avatarUrl: session.user.user_metadata?.avatar_url ?? null,
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    // Subscribe to future auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAccessToken(session?.access_token ?? null);
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email ?? null,
            displayName:
              session.user.user_metadata?.full_name ??
              session.user.user_metadata?.name ??
              null,
            tier: "free",
            avatarUrl: session.user.user_metadata?.avatar_url ?? null,
          });
        } else {
          setUser(null);
        }
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return { user, isLoading };
}
