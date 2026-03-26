/**
 * server/services/caseActions.ts
 *
 * Case Actions — deterministically generated to-do items derived from case_facts.
 *
 * Generation rules (deterministic, no LLM):
 *   hearing_date present             → prepare_for_hearing
 *   court_name present, no address   → confirm_courthouse_location
 *   court_name present, address too  → note_courthouse_address
 *   case_number present              → organize_case_documents
 *   judge_name present               → research_judge_requirements
 *
 * Deduplication: only one "open" action per (case_id, user_id, action_type).
 * Completed/dismissed rows are kept as history.
 *
 * Urgency: computed at query time from the case hearing_date fact.
 *   overdue  — hearing date is in the past
 *   urgent   — 0–3 days away
 *   soon     — 4–7 days away
 *   normal   — more than 7 days away, or no hearing_date available
 *
 * All open actions inherit the hearing urgency because the hearing is the deadline
 * for everything in the case.
 */

import { db } from "../db";
import { caseActions } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

/* ── Types ────────────────────────────────────────────────────────────────── */

export type UrgencyLevel = "overdue" | "urgent" | "soon" | "normal";

const URGENCY_RANK: Record<UrgencyLevel, number> = {
  overdue: 0,
  urgent:  1,
  soon:    2,
  normal:  3,
};

export interface CaseActionRow {
  id: number;
  caseId: string;
  userId: string;
  actionType: string;
  title: string;
  description: string;
  status: "open" | "completed" | "dismissed";
  createdAt: Date;
}

export interface EnrichedCaseActionRow extends CaseActionRow {
  urgency: UrgencyLevel;
  daysUntilHearing: number | null;
}

/* ── Urgency helpers ──────────────────────────────────────────────────────── */

/**
 * Parse a hearing date string and compute urgency + days until hearing.
 * Handles ISO dates ("2025-09-14"), US long form ("September 14, 2025"),
 * and other formats recognized by `new Date()`.
 */
export function computeUrgency(hearingDateStr: string | null): {
  urgency: UrgencyLevel;
  daysUntilHearing: number | null;
} {
  if (!hearingDateStr) return { urgency: "normal", daysUntilHearing: null };

  const parsed = new Date(hearingDateStr);
  if (isNaN(parsed.getTime())) {
    console.warn(`[caseActions] Could not parse hearing_date: "${hearingDateStr}"`);
    return { urgency: "normal", daysUntilHearing: null };
  }

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const hearingMidnight = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const diffDays = Math.floor(
    (hearingMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24),
  );

  let urgency: UrgencyLevel;
  if (diffDays < 0)      urgency = "overdue";
  else if (diffDays <= 3) urgency = "urgent";
  else if (diffDays <= 7) urgency = "soon";
  else                    urgency = "normal";

  return { urgency, daysUntilHearing: diffDays };
}

/**
 * Attach urgency + daysUntilHearing to each action, then sort by urgency rank
 * (overdue → urgent → soon → normal) and then by newest first within same urgency.
 *
 * All open actions inherit the hearing urgency — the hearing is the deadline for
 * every pre-court task. This makes ALL items feel appropriately time-pressured
 * when the hearing is approaching.
 */
export function enrichAndSortActions(
  actions: CaseActionRow[],
  hearingDate: string | null,
): EnrichedCaseActionRow[] {
  const { urgency: hearingUrgency, daysUntilHearing } = computeUrgency(hearingDate);

  const enriched: EnrichedCaseActionRow[] = actions.map((action) => ({
    ...action,
    urgency: hearingDate ? hearingUrgency : "normal",
    daysUntilHearing,
  }));

  return enriched.sort((a, b) => {
    const rankDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/* ── Row mapper ───────────────────────────────────────────────────────────── */

function mapRow(r: any): CaseActionRow {
  return {
    id:          r.id,
    caseId:      r.caseId ?? r.case_id,
    userId:      r.userId ?? r.user_id,
    actionType:  r.actionType ?? r.action_type,
    title:       r.title,
    description: r.description,
    status:      (r.status ?? "open") as CaseActionRow["status"],
    createdAt:   r.createdAt ?? r.created_at,
  };
}

/* ── CRUD ─────────────────────────────────────────────────────────────────── */

export async function getCaseActions(caseId: string, userId: string): Promise<CaseActionRow[]> {
  try {
    const rows = await db
      .select()
      .from(caseActions)
      .where(and(eq(caseActions.caseId, caseId), eq(caseActions.userId, userId)))
      .orderBy(desc(caseActions.createdAt));
    return rows.map(mapRow);
  } catch (err) {
    console.error("[caseActions] getCaseActions error:", err);
    return [];
  }
}

/**
 * Insert a new action — skipped silently if an open action with the same
 * action_type already exists for this (case_id, user_id).
 * Returns the existing or newly created row.
 */
export async function createCaseAction(
  caseId: string,
  userId: string,
  actionType: string,
  title: string,
  description: string,
): Promise<CaseActionRow | null> {
  try {
    const existing = await db
      .select()
      .from(caseActions)
      .where(
        and(
          eq(caseActions.caseId,    caseId),
          eq(caseActions.userId,    userId),
          eq(caseActions.actionType, actionType),
          eq(caseActions.status,    "open"),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`[caseActions] Dedup: type="${actionType}" already open → case ${caseId.slice(0, 8)}`);
      return mapRow(existing[0]);
    }

    const [row] = await db
      .insert(caseActions)
      .values({ caseId, userId, actionType, title, description, status: "open" })
      .returning();

    console.log(`[caseActions] Created: type="${actionType}" title="${title.slice(0, 55)}" case=${caseId.slice(0, 8)}`);
    return mapRow(row);
  } catch (err) {
    console.error("[caseActions] createCaseAction error:", err);
    return null;
  }
}

/**
 * Mark an action complete or dismissed.
 * Only the owning user can update their own actions.
 */
export async function updateActionStatus(
  actionId: number,
  userId: string,
  status: "completed" | "dismissed",
): Promise<boolean> {
  try {
    await db
      .update(caseActions)
      .set({ status })
      .where(and(eq(caseActions.id, actionId), eq(caseActions.userId, userId)));
    console.log(`[caseActions] Status → ${status}: id=${actionId} user=${userId.slice(0, 8)}`);
    return true;
  } catch (err) {
    console.error("[caseActions] updateActionStatus error:", err);
    return false;
  }
}

/* ── Action generation rules ──────────────────────────────────────────────── */

interface ActionRule {
  type: string;
  title: (facts: Record<string, string>) => string;
  description: string;
  condition: (facts: Record<string, string>) => boolean;
}

const ACTION_RULES: ActionRule[] = [
  {
    type: "prepare_for_hearing",
    title: (f) => `Prepare for your hearing${f.hearing_date ? ` on ${f.hearing_date}` : ""}`,
    description:
      "Review all case documents, organize your evidence, and confirm childcare and transportation arrangements well before your court date.",
    condition: (f) => !!f.hearing_date,
  },
  {
    type: "confirm_courthouse_location",
    title: (f) => `Confirm the location of ${f.court_name ?? "your courthouse"}`,
    description:
      "Verify the exact address, available parking, and security entrance procedures before your first court appearance.",
    condition: (f) => !!f.court_name && !f.court_address,
  },
  {
    type: "note_courthouse_address",
    title: (f) => `Save directions to ${f.court_name ?? "your courthouse"}`,
    description:
      "Your courthouse address is on file. Plan your route in advance and arrive at least 30 minutes early to allow time for security.",
    condition: (f) => !!f.court_name && !!f.court_address,
  },
  {
    type: "organize_case_documents",
    title: (f) => `Organize documents for case ${f.case_number ?? ""}`.trimEnd(),
    description:
      "Create a dedicated folder for all court orders, filings, and correspondence. Bring a full copy to every hearing.",
    condition: (f) => !!f.case_number,
  },
  {
    type: "research_judge_requirements",
    title: (f) => `Review courtroom procedures for Judge ${f.judge_name ?? ""}`.trimEnd(),
    description:
      "Some judges have specific standing orders or courtroom rules. Check the court's website or call the clerk to learn what is expected.",
    condition: (f) => !!f.judge_name,
  },
];

/**
 * Generate actions from a flat dict of known case facts.
 * Safe to call multiple times — deduplication prevents repeat inserts.
 * Returns the count of actions actually inserted (not deduplication skips).
 */
export async function generateActionsFromFacts(
  caseId: string,
  userId: string,
  facts: Record<string, string | null | undefined>,
): Promise<number> {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(facts)) {
    if (v && typeof v === "string" && v.trim()) normalized[k] = v.trim();
  }

  let inserted = 0;
  for (const rule of ACTION_RULES) {
    if (!rule.condition(normalized)) continue;

    const existing = await db
      .select({ id: caseActions.id })
      .from(caseActions)
      .where(
        and(
          eq(caseActions.caseId,    caseId),
          eq(caseActions.userId,    userId),
          eq(caseActions.actionType, rule.type),
          eq(caseActions.status,    "open"),
        ),
      )
      .limit(1);

    if (existing.length > 0) continue; // already open — skip (dedup)

    const title = rule.title(normalized);
    const [row] = await db
      .insert(caseActions)
      .values({ caseId, userId, actionType: rule.type, title, description: rule.description, status: "open" })
      .returning({ id: caseActions.id });

    if (row) {
      console.log(`[caseActions] Generated: type="${rule.type}" title="${title.slice(0, 55)}" case=${caseId.slice(0, 8)}`);
      inserted++;
    }
  }

  if (inserted > 0) {
    console.log(`[caseActions] Total generated: ${inserted} new action(s) for case ${caseId.slice(0, 8)}`);
  }
  return inserted;
}
