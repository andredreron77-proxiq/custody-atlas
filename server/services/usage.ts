/**
 * server/services/usage.ts
 *
 * Supabase-backed usage tracking service.
 * Tracks monthly question and document usage per user in the usage_limits table.
 *
 * Expected usage_limits table schema:
 *   user_id        uuid  NOT NULL (FK → auth.users)
 *   date           date  NOT NULL
 *   billing_period date  NULL/NOT NULL after migration
 *   questions_used int   NOT NULL DEFAULT 0
 *   documents_used int   NOT NULL DEFAULT 0
 *   UNIQUE (user_id, billing_period)
 */

import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
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

export const TIER_LIMITS: Record<"free" | "pro", { questions: number; documents: number }> = {
  free: { questions: 25,  documents: 1 },
  pro:  { questions: 200, documents: 10 },
};

function currentBillingPeriod(): string {
  const billingPeriod = new Date();
  billingPeriod.setDate(1);
  billingPeriod.setHours(0, 0, 0, 0);
  return billingPeriod.toISOString().split("T")[0];
}

/**
 * Fetch current billing-period usage counts for a user from the usage_limits table.
 */
async function getCurrentUsage(userId: string): Promise<{ questionsUsed: number; documentsUsed: number }> {
  if (!supabaseAdmin) return { questionsUsed: 0, documentsUsed: 0 };
  try {
    const { data } = await supabaseAdmin
      .from("usage_limits")
      .select("questions_used, documents_used")
      .eq("user_id", userId)
      .eq("billing_period", currentBillingPeriod())
      .single();
    return {
      questionsUsed: data?.questions_used ?? 0,
      documentsUsed: data?.documents_used ?? 0,
    };
  } catch {
    return { questionsUsed: 0, documentsUsed: 0 };
  }
}

/**
 * Return the full usage state for the requesting user.
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
  const { questionsUsed, documentsUsed } = await getCurrentUsage(user.id);

  return {
    isAuthenticated: true,
    tier,
    questionsUsed,
    questionsLimit: limits.questions,
    documentsUsed,
    documentsLimit: limits.documents,
  };
}

/**
 * Middleware: reject the request if the authenticated user has hit their
 * monthly question limit. Must be placed AFTER requireAuth.
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
  const { questionsUsed } = await getCurrentUsage(user.id);

  if (questionsUsed >= limit) {
    if (tier === "pro") {
      (req as any).usageOverage = {
        overageWarning: true,
        questionsUsed,
        questionsLimit: limit,
      };
      console.warn(`[usage] pro question overage user=${user.id} used=${questionsUsed} limit=${limit}`);
      next();
      return;
    }

    res.status(429).json({
      error: `Monthly question limit of ${limit} reached. Upgrade to Pro for more.`,
      code: "QUESTION_LIMIT_REACHED",
      limit,
      used: questionsUsed,
    });
    return;
  }

  next();
}

/**
 * Middleware: reject the request if the authenticated user has hit their
 * document limit for the current billing period. Must be placed AFTER requireAuth.
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
  const { documentsUsed } = await getCurrentUsage(user.id);

  if (documentsUsed >= limit) {
    res.status(429).json({
      error: `Daily document limit of ${limit} reached. Upgrade to Pro for more.`,
      code: "DOCUMENT_LIMIT_REACHED",
      limit,
      used: documentsUsed,
    });
    return;
  }

  next();
}

/**
 * Increment the question counter for the current user (upsert current billing-period row).
 */
export async function trackQuestion(req: Request): Promise<void> {
  const user = (req as any).user;
  if (!user || !supabaseAdmin) return;
  try {
    const billingPeriodStr = currentBillingPeriod();
    const userId = user.id;
    const { data: existing } = await supabaseAdmin
      .from("usage_limits")
      .select("questions_used")
      .eq("user_id", userId)
      .eq("billing_period", billingPeriodStr)
      .single();

    await supabaseAdmin.from("usage_limits").upsert({
      user_id: userId,
      date: billingPeriodStr,
      billing_period: billingPeriodStr,
      questions_used: (existing?.questions_used ?? 0) + 1,
      documents_used: 0,
    }, { onConflict: "user_id,billing_period" });
  } catch (err) {
    console.error("[usage] trackQuestion error:", err);
  }
}

/**
 * Increment the document counter for the current user (upsert current billing-period row).
 */
export async function trackDocument(req: Request): Promise<void> {
  const user = (req as any).user;
  if (!user || !supabaseAdmin) return;
  try {
    const billingPeriodStr = currentBillingPeriod();
    const { data: existing } = await supabaseAdmin
      .from("usage_limits")
      .select("documents_used")
      .eq("user_id", user.id)
      .eq("billing_period", billingPeriodStr)
      .single();

    await supabaseAdmin.from("usage_limits").upsert({
      user_id: user.id,
      date: billingPeriodStr,
      billing_period: billingPeriodStr,
      questions_used: 0,
      documents_used: (existing?.documents_used ?? 0) + 1,
    }, { onConflict: "user_id,billing_period" });
  } catch (err) {
    console.error("[usage] trackDocument error:", err);
  }
}
