import { useQuery } from "@tanstack/react-query";
import { apiRequestRaw } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-auth";

export const DISPLAY_NAME_SKIP_SESSION_KEY = "custody-atlas:display-name-skip";
export const DISPLAY_NAME_SKIP_UNTIL_KEY = "custody-atlas:display-name-skip-until";
const DISPLAY_NAME_SKIP_DAYS = 14;

function displayNameSkipSessionKey(userId?: string | null): string {
  if (!userId) return DISPLAY_NAME_SKIP_SESSION_KEY;
  return `${DISPLAY_NAME_SKIP_SESSION_KEY}:${userId}`;
}

function displayNameSkipUntilKey(userId?: string | null): string {
  if (!userId) return DISPLAY_NAME_SKIP_UNTIL_KEY;
  return `${DISPLAY_NAME_SKIP_UNTIL_KEY}:${userId}`;
}

export interface UserProfile {
  id: string;
  displayName: string | null;
}

export function firstNameFromDisplayName(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim().split(/\s+/)[0] ?? "";
}

export function getDisplayNameSkipUntil(userId?: string | null): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(displayNameSkipUntilKey(userId));
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) ? ts : null;
}

export function skipDisplayNamePromptForAWhile(userId?: string | null): void {
  if (typeof window === "undefined") return;
  const until = Date.now() + DISPLAY_NAME_SKIP_DAYS * 24 * 60 * 60 * 1000;
  window.localStorage.setItem(displayNameSkipUntilKey(userId), String(until));
}

export function getDisplayNamePromptSuppressionState(userId?: string | null): {
  suppressed: boolean;
  hasSessionSkip: boolean;
  localSkipUntil: number | null;
  hasActiveLocalSkip: boolean;
} {
  if (typeof window === "undefined") return { suppressed: false, hasSessionSkip: false, localSkipUntil: null, hasActiveLocalSkip: false };
  const hasSessionSkip = window.sessionStorage.getItem(displayNameSkipSessionKey(userId)) === "1";
  const localSkipUntil = getDisplayNameSkipUntil(userId);
  const hasActiveLocalSkip = Boolean(localSkipUntil && Date.now() < localSkipUntil);

  if (localSkipUntil && !hasActiveLocalSkip) {
    window.localStorage.removeItem(displayNameSkipUntilKey(userId));
  }

  return {
    suppressed: hasSessionSkip || hasActiveLocalSkip,
    hasSessionSkip,
    localSkipUntil,
    hasActiveLocalSkip,
  };
}

export function shouldSuppressDisplayNamePrompt(userId?: string | null): boolean {
  return getDisplayNamePromptSuppressionState(userId).suppressed;
}

export function setDisplayNameSkipForSession(userId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(displayNameSkipSessionKey(userId), "1");
}

export function clearDisplayNameSessionSkip(userId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(displayNameSkipSessionKey(userId));
}

export function useUserProfile() {
  const { user } = useCurrentUser();

  return useQuery<UserProfile | null>({
    queryKey: ["/api/user-profile", user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/user-profile");
      if (!res.ok) return null;
      const json = await res.json() as { id: string; displayName?: string | null; display_name?: string | null };
      return {
        id: json.id,
        displayName: json.displayName ?? json.display_name ?? null,
      };
    },
    staleTime: 30_000,
  });
}
