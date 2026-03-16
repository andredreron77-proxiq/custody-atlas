/**
 * client/src/services/usageService.ts
 *
 * Fetches the current user's usage state from the server.
 * The server reads from Supabase daily_usage / usage_limits table.
 */

import { getAccessToken } from "@/lib/tokenStore";

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

export async function fetchUsageState(): Promise<UsageState> {
  try {
    const token = getAccessToken();
    const res = await fetch("/api/usage", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
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
