/**
 * client/src/hooks/use-usage.ts
 *
 * React hook for accessing the current user's usage limits.
 *
 * CURRENT STATE: Returns default anonymous usage (no limits enforced).
 *
 * TO CONNECT SUPABASE:
 *   - No changes needed here once GET /api/usage returns real data.
 *   - The hook fetches from the server which will read Supabase daily_usage.
 *   - Optionally, replace the fetch with a direct Supabase query if you prefer
 *     client-side queries with RLS.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchUsageState } from "@/services/usageService";
import type { UsageState } from "@/services/usageService";

interface UseUsageResult {
  usage: UsageState | null;
  isLoading: boolean;
  refetch: () => void;
}

export function useUsage(): UseUsageResult {
  const { data, isLoading, refetch } = useQuery<UsageState>({
    queryKey: ["/api/usage"],
    queryFn: fetchUsageState,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    usage: data ?? null,
    isLoading,
    refetch,
  };
}
