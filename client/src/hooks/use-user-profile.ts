import { useQuery } from "@tanstack/react-query";
import { apiRequestRaw } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-auth";

export const DISPLAY_NAME_SKIP_SESSION_KEY = "custody-atlas:display-name-skip";

export interface UserProfile {
  id: string;
  displayName: string | null;
}

export function firstNameFromDisplayName(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim().split(/\s+/)[0] ?? "";
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
