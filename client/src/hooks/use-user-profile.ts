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
  fullName: string | null;
  welcomeDismissedAt: string | null;
}

export function firstNameFromDisplayName(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim().split(/\s+/)[0] ?? "";
}

export interface PreferredNameSources {
  profileDisplayName?: string | null;
  profileFullName?: string | null;
  authMetadataName?: string | null;
  authDisplayName?: string | null;
  email?: string | null;
}

function cleanName(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolvePreferredDisplayName({
  profileDisplayName,
  profileFullName,
  authMetadataName,
  authDisplayName,
  email,
}: PreferredNameSources): string | null {
  return (
    cleanName(profileDisplayName) ??
    cleanName(profileFullName) ??
    cleanName(authMetadataName) ??
    cleanName(authDisplayName) ??
    cleanName(email) ??
    null
  );
}

export function resolvePreferredFirstName(sources: PreferredNameSources): string | null {
  const preferred = resolvePreferredDisplayName(sources);
  return firstNameFromDisplayName(preferred) || preferred;
}

export function initialsFromPreferredName(sources: PreferredNameSources): string {
  const preferred = resolvePreferredDisplayName(sources);
  if (!preferred) return "U";
  const parts = preferred.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "U";
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
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
      const json = await res.json() as {
        id: string;
        displayName?: string | null;
        display_name?: string | null;
        fullName?: string | null;
        full_name?: string | null;
        welcomeDismissedAt?: string | null;
        welcome_dismissed_at?: string | null;
      };
      return {
        id: json.id,
        displayName: json.displayName ?? json.display_name ?? null,
        fullName: json.fullName ?? json.full_name ?? null,
        welcomeDismissedAt: json.welcomeDismissedAt ?? json.welcome_dismissed_at ?? null,
      };
    },
    staleTime: 30_000,
  });
}
