/**
 * client/src/services/usageService.ts
 *
 * Fetches the current user's usage state from the server.
 * The server reads from Supabase daily_usage / usage_limits table.
 */

import { getAccessToken } from "@/lib/tokenStore";

export type Tier = "anonymous" | "free" | "pro";

export const FREE_TIER_QUESTION_LIMIT = 10;
export const GUEST_QUESTION_LIMIT = 3;
const GUEST_FINGERPRINT_KEY = "custody-atlas:guest-fingerprint";
const GUEST_QUESTION_COUNT_KEY = "custody-atlas:guest-questions-used";

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
  questionsLimit: GUEST_QUESTION_LIMIT,
  documentsUsed: 0,
  documentsLimit: null,
  isAtQuestionLimit: false,
  isAtDocumentLimit: false,
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getGuestFingerprint(): string {
  if (!canUseStorage()) return "guest";
  const existing = window.localStorage.getItem(GUEST_FINGERPRINT_KEY);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(GUEST_FINGERPRINT_KEY, next);
  return next;
}

export function getGuestQuestionsUsed(): number {
  if (!canUseStorage()) return 0;
  getGuestFingerprint();
  const raw = window.localStorage.getItem(GUEST_QUESTION_COUNT_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function incrementGuestQuestionsUsed(): number {
  if (!canUseStorage()) return 0;
  const next = getGuestQuestionsUsed() + 1;
  window.localStorage.setItem(GUEST_QUESTION_COUNT_KEY, String(next));
  return next;
}

export async function fetchUsageState(): Promise<UsageState> {
  try {
    const token = getAccessToken();
    const res = await fetch("/api/usage", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return DEFAULT_USAGE;
    const data = await res.json();
    if (!data.isAuthenticated) {
      const questionsUsed = getGuestQuestionsUsed();
      return {
        isAuthenticated: false,
        tier: "anonymous",
        questionsUsed,
        questionsLimit: GUEST_QUESTION_LIMIT,
        documentsUsed: 0,
        documentsLimit: null,
        isAtQuestionLimit: questionsUsed >= GUEST_QUESTION_LIMIT,
        isAtDocumentLimit: false,
      };
    }
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
