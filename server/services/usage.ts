/**
 * server/services/usage.ts
 *
 * Provider-agnostic usage-limit service.
 *
 * CURRENT STATE: Routes gated by requireAuth will never reach usage checks
 * because unauthenticated requests are rejected first. This module defines
 * the interface so it can be wired to a real backend (e.g. Supabase row counts,
 * Redis counters, or a usage table) with no changes to route handlers.
 *
 * TO CONNECT SUPABASE:
 *   - In trackQuestion / trackDocument, upsert a row in a `daily_usage` table
 *     keyed by (user_id, date).
 *   - In checkQuestionLimit / checkDocumentLimit, query that table and compare
 *     against the tier limits.
 *   - In getUsageState, join user_profiles to get tier + today's counts.
 */

import type { Request, Response, NextFunction } from "express";
import { getCurrentUser, getUserTier } from "./auth";

export type Tier = "anonymous" | "free" | "pro";

export interface UsageState {
  isAuthenticated: boolean;
  tier: Tier;
  questionsUsed: number;
  questionsLimit: number | null;
  documentsUsed: number;
  documentsLimit: number | null;
}

export const TIER_LIMITS: Record<"free" | "pro", { questions: number | null; documents: number | null }> = {
  free:  { questions: 10, documents: 3 },
  pro:   { questions: null, documents: null },
};

/**
 * Return the current usage state for the requesting user.
 * Used by GET /api/usage.
 *
 * Supabase slot: query daily_usage table for today's counts.
 */
export async function getUsageState(req: Request): Promise<UsageState> {
  const user = await getCurrentUser(req);

  if (!user) {
    return {
      isAuthenticated: false,
      tier: "anonymous",
      questionsUsed: 0,
      questionsLimit: null,
      documentsUsed: 0,
      documentsLimit: null,
    };
  }

  const tier = await getUserTier(user.id);
  const limits = TIER_LIMITS[tier];

  return {
    isAuthenticated: true,
    tier,
    questionsUsed: 0,
    questionsLimit: limits.questions,
    documentsUsed: 0,
    documentsLimit: limits.documents,
  };
}

/**
 * Middleware: reject the request if the authenticated user is at their
 * daily question limit. Must be placed AFTER requireAuth.
 *
 * Supabase slot: query daily_usage table, compare to tier limits.
 */
export async function checkQuestionLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: "Authentication required.", code: "UNAUTHENTICATED" });
    return;
  }

  const tier = await getUserTier(user.id);
  const limit = TIER_LIMITS[tier].questions;

  if (limit === null) {
    next();
    return;
  }

  const used = 0;
  if (used >= limit) {
    res.status(429).json({
      error: `Daily question limit of ${limit} reached. Upgrade to Pro for unlimited questions.`,
      code: "QUESTION_LIMIT_REACHED",
      limit,
      used,
    });
    return;
  }

  next();
}

/**
 * Middleware: reject the request if the authenticated user is at their
 * daily document limit. Must be placed AFTER requireAuth.
 *
 * Supabase slot: same as checkQuestionLimit but for document counts.
 */
export async function checkDocumentLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: "Authentication required.", code: "UNAUTHENTICATED" });
    return;
  }

  const tier = await getUserTier(user.id);
  const limit = TIER_LIMITS[tier].documents;

  if (limit === null) {
    next();
    return;
  }

  const used = 0;
  if (used >= limit) {
    res.status(429).json({
      error: `Daily document limit of ${limit} reached. Upgrade to Pro for more.`,
      code: "DOCUMENT_LIMIT_REACHED",
      limit,
      used,
    });
    return;
  }

  next();
}

/**
 * Increment the question counter for the current user after a successful response.
 *
 * Supabase slot:
 *   await supabase.from("daily_usage")
 *     .upsert({ user_id, date: today, questions_used: supabase.rpc("increment", ...) })
 */
export async function trackQuestion(_req: Request): Promise<void> {
  // no-op until Supabase usage table is wired
}

/**
 * Increment the document counter for the current user after a successful response.
 *
 * Supabase slot: same pattern as trackQuestion but for documents_used column.
 */
export async function trackDocument(_req: Request): Promise<void> {
  // no-op until Supabase usage table is wired
}
