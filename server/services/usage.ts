/**
 * server/services/usage.ts
 *
 * Supabase-backed usage tracking service.
 * Tracks daily question and document usage per user in the usage_limits table.
 *
 * Expected usage_limits table schema:
 *   user_id        uuid  NOT NULL (FK → auth.users)
 *   date           date  NOT NULL
 *   questions_used int   NOT NULL DEFAULT 0
 *   documents_used int   NOT NULL DEFAULT 0
 *   PRIMARY KEY (user_id, date)
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
  free: { questions: 5,  documents: 1 },
  pro:  { questions: 25, documents: 10 },
};

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Fetch today's usage counts for a user from the usage_limits table.
 */
async function getTodayUsage(userId: string): Promise<{ questionsUsed: number; documentsUsed: number }> {
  if (!supabaseAdmin) return { questionsUsed: 0, documentsUsed: 0 };
  try {
    const { data } = await supabaseAdmin
      .from("usage_limits")
      .select("questions_used, documents_used")
      .eq("user_id", userId)
      .eq("date", todayDate())
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
  const { questionsUsed, documentsUsed } = await getTodayUsage(user.id);

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
 * daily question limit. Must be placed AFTER requireAuth.
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
  const { questionsUsed } = await getTodayUsage(user.id);

  if (questionsUsed >= limit) {
    res.status(429).json({
      error: `Daily question limit of ${limit} reached. Upgrade to Pro for more.`,
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
 * daily document limit. Must be placed AFTER requireAuth.
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
  const { documentsUsed } = await getTodayUsage(user.id);

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
 * Increment the question counter for the current user (upsert today's row).
 */
export async function trackQuestion(req: Request): Promise<void> {
  const user = (req as any).user;
  if (!user || !supabaseAdmin) return;
  try {
    const today = todayDate();
    const { data: existing } = await supabaseAdmin
      .from("usage_limits")
      .select("questions_used")
      .eq("user_id", user.id)
      .eq("date", today)
      .single();

    await supabaseAdmin.from("usage_limits").upsert({
      user_id: user.id,
      date: today,
      questions_used: (existing?.questions_used ?? 0) + 1,
      documents_used: 0,
    }, { onConflict: "user_id,date" });
  } catch (err) {
    console.error("[usage] trackQuestion error:", err);
  }
}

/**
 * Increment the document counter for the current user (upsert today's row).
 */
export async function trackDocument(req: Request): Promise<void> {
  const user = (req as any).user;
  if (!user || !supabaseAdmin) return;
  try {
    const today = todayDate();
    const { data: existing } = await supabaseAdmin
      .from("usage_limits")
      .select("documents_used")
      .eq("user_id", user.id)
      .eq("date", today)
      .single();

    await supabaseAdmin.from("usage_limits").upsert({
      user_id: user.id,
      date: today,
      questions_used: 0,
      documents_used: (existing?.documents_used ?? 0) + 1,
    }, { onConflict: "user_id,date" });
  } catch (err) {
    console.error("[usage] trackDocument error:", err);
  }
}
