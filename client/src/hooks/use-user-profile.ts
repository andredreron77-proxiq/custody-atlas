import { useQuery } from "@tanstack/react-query";
import { apiRequestRaw } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-auth";

export const DISPLAY_NAME_SKIP_SESSION_KEY = "custody-atlas:display-name-skip";
export const DISPLAY_NAME_SKIP_UNTIL_KEY = "custody-atlas:display-name-skip-until";
const DISPLAY_NAME_SKIP_DAYS = 14;

export interface UserProfile {
  id: string;
  displayName: string | null;
}

export function firstNameFromDisplayName(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim().split(/\s+/)[0] ?? "";
}

export function getDisplayNameSkipUntil(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DISPLAY_NAME_SKIP_UNTIL_KEY);
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) ? ts : null;
}

export function skipDisplayNamePromptForAWhile(): void {
  if (typeof window === "undefined") return;
  const until = Date.now() + DISPLAY_NAME_SKIP_DAYS * 24 * 60 * 60 * 1000;
  window.localStorage.setItem(DISPLAY_NAME_SKIP_UNTIL_KEY, String(until));
}

export function shouldSuppressDisplayNamePrompt(): boolean {
  if (typeof window === "undefined") return false;
  if (window.sessionStorage.getItem(DISPLAY_NAME_SKIP_SESSION_KEY) === "1") return true;

  const skipUntil = getDisplayNameSkipUntil();
  if (!skipUntil) return false;
  if (Date.now() < skipUntil) return true;

  window.localStorage.removeItem(DISPLAY_NAME_SKIP_UNTIL_KEY);
  return false;
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
