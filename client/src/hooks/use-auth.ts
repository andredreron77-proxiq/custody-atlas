/**
 * client/src/hooks/use-auth.ts
 *
 * React hook for accessing the current authenticated user.
 *
 * CURRENT STATE: Always returns { user: null, isLoading: false } because no
 * auth provider is connected yet.
 *
 * TO CONNECT SUPABASE:
 *   1. Import the Supabase client:
 *        import { supabase } from "@/lib/supabaseClient";
 *   2. Subscribe to auth state changes in the hook so the UI reacts
 *      to login / logout events:
 *        useEffect(() => {
 *          const { data: { subscription } } = supabase.auth.onAuthStateChange(
 *            (_event, session) => {
 *              setUser(mapSessionToAuthUser(session));
 *              setIsLoading(false);
 *            }
 *          );
 *          return () => subscription.unsubscribe();
 *        }, []);
 *   3. The rest of the app (FeatureGate, Header, etc.) requires no changes
 *      — they already read from this hook.
 */

import { useState, useEffect } from "react";
import { getAuthUser } from "@/services/authService";
import type { AuthUser } from "@/services/authService";

interface UseAuthResult {
  user: AuthUser | null;
  isLoading: boolean;
}

export function useCurrentUser(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAuthUser().then((resolved) => {
      if (!cancelled) {
        setUser(resolved);
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return { user, isLoading };
}
