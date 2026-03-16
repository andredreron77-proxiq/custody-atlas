/**
 * client/src/services/usageService.ts
 *
 * Provider-agnostic usage state service.
 *
 * CURRENT STATE: fetchUsageState calls GET /api/usage which returns anonymous
 * state (no limits enforced) since no auth provider is connected yet.
 *
 * TO CONNECT SUPABASE:
 *   - After auth is wired, GET /api/usage will read real counts from the
 *     Supabase daily_usage table and return accurate limit data.
 *   - No changes to this file are needed — the API contract stays the same.
 */

export type Tier = "anonymous" | "free" | "pro";

export interface UsageState {
  isAuthenticated: boolean;
  tier: Tier;
  questionsUsed: number;
  questionsLimit: number | null;
  documentsUsed: number;
  documentsLimit: number | null;
  isAtQuestionLimit: boolean;
  isAtDocumentLimit: boolean;
}

const DEFAULT_USAGE: UsageState = {
  isAuthenticated: false,
  tier: "anonymous",
  questionsUsed: 0,
  questionsLimit: null,
  documentsUsed: 0,
  documentsLimit: null,
  isAtQuestionLimit: false,
  isAtDocumentLimit: false,
};

/**
 * Fetch the current user's usage state from the server.
 * Returns a sensible default if the request fails.
 */
export async function fetchUsageState(): Promise<UsageState> {
  try {
    const res = await fetch("/api/usage", { credentials: "include" });
    if (!res.ok) return DEFAULT_USAGE;
    const data = await res.json();
    return {
      isAuthenticated: data.isAuthenticated ?? false,
      tier: data.tier ?? "anonymous",
      questionsUsed: data.questionsUsed ?? 0,
      questionsLimit: data.questionsLimit ?? null,
      documentsUsed: data.documentsUsed ?? 0,
      documentsLimit: data.documentsLimit ?? null,
      isAtQuestionLimit:
        data.questionsLimit !== null &&
        data.questionsUsed >= data.questionsLimit,
      isAtDocumentLimit:
        data.documentsLimit !== null &&
        data.documentsUsed >= data.documentsLimit,
    };
  } catch {
    return DEFAULT_USAGE;
  }
}
