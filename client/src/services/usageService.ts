/**
 * client/src/services/usageService.ts
 *
 * Fetches the current user's usage state from the server.
 * The server reads from Supabase daily_usage / usage_limits table.
 */

import { getAccessToken } from "@/lib/tokenStore";

export type Tier = "anonymous" | "free" | "pro";
export const USAGE_QUERY_KEY = ["/api/usage"] as const;

export const FREE_TIER_QUESTION_LIMIT = 10;
export const GUEST_QUESTION_LIMIT = 3;
const GUEST_FINGERPRINT_KEY = "custody-atlas:guest-fingerprint";
const GUEST_QUESTION_COUNT_KEY = "custody-atlas:guest-questions";
const LAST_KNOWN_USAGE_KEY = "custody-atlas:last-known-usage";

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

let lastKnownUsageState: UsageState | null = null;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeUsageState(data: Partial<UsageState>): UsageState {
  const questionsLimit = data.questionsLimit ?? null;
  const documentsLimit = data.documentsLimit ?? null;
  const questionsUsed = data.questionsUsed ?? 0;
  const documentsUsed = data.documentsUsed ?? 0;

  return {
    isAuthenticated: data.isAuthenticated ?? false,
    tier: data.tier ?? "anonymous",
    questionsUsed,
    questionsLimit,
    documentsUsed,
    documentsLimit,
    isAtQuestionLimit:
      typeof data.isAtQuestionLimit === "boolean"
        ? data.isAtQuestionLimit
        : questionsLimit !== null && questionsUsed >= questionsLimit,
    isAtDocumentLimit:
      typeof data.isAtDocumentLimit === "boolean"
        ? data.isAtDocumentLimit
        : documentsLimit !== null && documentsUsed >= documentsLimit,
  };
}

export function getLastKnownUsageState(): UsageState | null {
  if (lastKnownUsageState) return lastKnownUsageState;
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(LAST_KNOWN_USAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UsageState>;
    lastKnownUsageState = normalizeUsageState(parsed);
    return lastKnownUsageState;
  } catch {
    return null;
  }
}

function writeLastKnownUsage(state: UsageState): UsageState {
  lastKnownUsageState = state;
  if (canUseStorage()) {
    window.localStorage.setItem(LAST_KNOWN_USAGE_KEY, JSON.stringify(state));
  }
  return state;
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

export function clearGuestUsageState(): void {
  if (!canUseStorage()) {
    lastKnownUsageState = null;
    return;
  }

  window.localStorage.removeItem(GUEST_FINGERPRINT_KEY);
  window.localStorage.removeItem(GUEST_QUESTION_COUNT_KEY);

  if (!lastKnownUsageState || !lastKnownUsageState.isAuthenticated) {
    lastKnownUsageState = null;
    window.localStorage.removeItem(LAST_KNOWN_USAGE_KEY);
  }
}

export async function fetchUsageState(): Promise<UsageState> {
  try {
    const token = getAccessToken();
    const res = await fetch("/api/usage", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return getLastKnownUsageState() ?? DEFAULT_USAGE;
    const data = await res.json();
    if (!data.isAuthenticated) {
      const questionsUsed = getGuestQuestionsUsed();
      return writeLastKnownUsage({
        isAuthenticated: false,
        tier: "anonymous",
        questionsUsed,
        questionsLimit: GUEST_QUESTION_LIMIT,
        documentsUsed: 0,
        documentsLimit: null,
        isAtQuestionLimit: questionsUsed >= GUEST_QUESTION_LIMIT,
        isAtDocumentLimit: false,
      });
    }
    return writeLastKnownUsage(normalizeUsageState({
      isAuthenticated: data.isAuthenticated ?? false,
      tier: data.tier ?? "anonymous",
      questionsUsed: data.questionsUsed ?? 0,
      questionsLimit: data.questionsLimit ?? null,
      documentsUsed: data.documentsUsed ?? 0,
      documentsLimit: data.documentsLimit ?? null,
    }));
  } catch {
    return getLastKnownUsageState() ?? DEFAULT_USAGE;
  }
}
