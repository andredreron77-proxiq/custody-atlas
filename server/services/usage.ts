/**
 * server/services/usage.ts
 *
 * Supabase-backed usage tracking service.
 * Tracks question and document usage per user in the usage_limits table.
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

export type Tier = "anonymous" | "free" | "pro" | "attorney_firm";

export interface UsageState {
  isAuthenticated: boolean;
  tier: Tier;
  questionsUsed: number;
  questionsLimit: number | null;
  documentsUsed: number;
  documentsLimit: number | null;
  documentQuestionsUsed: number | null;
  documentQuestionsLimit: number | null;
}

export const TIER_LIMITS: Record<"free" | "pro", { questions: number; documents: number }> = {
  free: { questions: 10,  documents: 1 },
  pro:  { questions: 200, documents: 10 },
};

const DOCUMENT_QUESTION_LIMITS: Record<"free" | "pro", number | null> = {
  free: 3,
  pro: null,
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

async function getLifetimeQuestionUsage(userId: string): Promise<number> {
  if (!supabaseAdmin) return 0;
  try {
    const { data } = await supabaseAdmin
      .from("usage_limits")
      .select("questions_used")
      .eq("user_id", userId);

    return (data ?? []).reduce((total, row) => total + (row.questions_used ?? 0), 0);
  } catch {
    return 0;
  }
}

async function getDocumentQuestionUsage(userId: string, documentId: string): Promise<number | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data } = await supabaseAdmin
      .from("documents")
      .select("doc_questions_used")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    return typeof data?.doc_questions_used === "number" ? data.doc_questions_used : 0;
  } catch {
    return null;
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
      documentQuestionsUsed: null,
      documentQuestionsLimit: null,
    };
  }

  const tier = await getUserTier(user.id);
  if (tier === "attorney_firm") {
    return {
      isAuthenticated: true,
      tier: "attorney_firm",
      questionsUsed: 0,
      questionsLimit: null,
      documentsUsed: 0,
      documentsLimit: null,
      documentQuestionsUsed: 0,
      documentQuestionsLimit: null,
    };
  }
  const limits = TIER_LIMITS[tier];
  const documentQuestionsLimit = DOCUMENT_QUESTION_LIMITS[tier];
  const currentUsage = await getCurrentUsage(user.id);
  const { documentsUsed } = currentUsage;
  const questionsUsed = tier === "free"
    ? await getLifetimeQuestionUsage(user.id)
    : currentUsage.questionsUsed;
  const documentId = typeof req.query.documentId === "string" ? req.query.documentId : null;
  const documentQuestionsUsed = documentId
    ? await getDocumentQuestionUsage(user.id, documentId)
    : null;

  return {
    isAuthenticated: true,
    tier,
    questionsUsed,
    questionsLimit: limits.questions,
    documentsUsed,
    documentsLimit: limits.documents,
    documentQuestionsUsed,
    documentQuestionsLimit,
  };
}

/**
 * Middleware: reject the request if the authenticated user has hit their
 * question limit. Anonymous requests pass through; guest caps are
 * enforced client-side via localStorage fingerprinting.
 */
export async function checkQuestionLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = (req as any).user ?? await getCurrentUser(req);
  if (!user) {
    next();
    return;
  }
  (req as any).user = user;

  const tier = await getUserTier(user.id);
  const limit = TIER_LIMITS[tier].questions;
  const questionsUsed = tier === "free"
    ? await getLifetimeQuestionUsage(user.id)
    : (await getCurrentUsage(user.id)).questionsUsed;

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
      error: `Free question limit of ${limit} reached. Upgrade to Pro to continue.`,
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
      .select("questions_used, documents_used")
      .eq("user_id", userId)
      .eq("billing_period", billingPeriodStr)
      .single();

    await supabaseAdmin.from("usage_limits").upsert({
      user_id: userId,
      date: billingPeriodStr,
      billing_period: billingPeriodStr,
      questions_used: (existing?.questions_used ?? 0) + 1,
      documents_used: existing?.documents_used ?? 0,
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
      .select("questions_used, documents_used")
      .eq("user_id", user.id)
      .eq("billing_period", billingPeriodStr)
      .single();

    await supabaseAdmin.from("usage_limits").upsert({
      user_id: user.id,
      date: billingPeriodStr,
      billing_period: billingPeriodStr,
      questions_used: existing?.questions_used ?? 0,
      documents_used: (existing?.documents_used ?? 0) + 1,
    }, { onConflict: "user_id,billing_period" });
  } catch (err) {
    console.error("[usage] trackDocument error:", err);
  }
}
