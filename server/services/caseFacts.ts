/**
 * server/services/caseFacts.ts
 *
 * Case Facts layer — structured facts extracted for a specific case.
 * Stored in Replit PostgreSQL (Drizzle), additive alongside Supabase documents.
 *
 * Priority in resolveFromCaseFacts:
 *   1. user_confirmed facts            ← highest authority (source = "user_confirmed")
 *   2. document-derived case_facts     ← verbatim extraction from uploaded docs
 *   3. documents.analysis_json         ← Supabase document store (caller-level fallback)
 *   4. case_memory                     ← user-saved notes (caller-level fallback)
 *   5. LLM fallback
 *
 * Conflict rules:
 *   - Single user_confirmed value → use it; suppress all document conflicts.
 *   - Multiple conflicting user_confirmed values → still surface as conflict.
 *   - No user_confirmed → check document facts for conflicts.
 */

import { db } from "../db";
import { caseFacts } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export type FactConfidence = "high" | "medium" | "low";

export interface CaseFactRow {
  id: number;
  caseId: string;
  userId: string;
  factType: string;
  value: string;
  source: string;
  sourceName: string | null;
  confidence: FactConfidence;
  createdAt: Date;
  updatedAt: Date;
}

export interface FactConflict {
  factType: string;
  values: Array<{ value: string; sourceName: string | null; confidence: FactConfidence }>;
}

function mapRow(r: any): CaseFactRow {
  return {
    id: r.id,
    caseId: r.caseId ?? r.case_id,
    userId: r.userId ?? r.user_id,
    factType: r.factType ?? r.fact_type,
    value: r.value,
    source: r.source,
    sourceName: r.sourceName ?? r.source_name ?? null,
    confidence: (r.confidence ?? "medium") as FactConfidence,
    createdAt: r.createdAt ?? r.created_at ?? new Date(),
    updatedAt: r.updatedAt ?? r.updated_at ?? new Date(),
  };
}

const CONFIDENCE_RANK: Record<FactConfidence, number> = { high: 2, medium: 1, low: 0 };

function higherConfidence(a: FactConfidence, b: FactConfidence): FactConfidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

/**
 * Retrieve all facts for a case, optionally limited to one factType.
 * Ordered newest-first so callers get the most recently updated fact first.
 */
export async function getCaseFacts(
  caseId: string,
  userId: string,
  factType?: string,
): Promise<CaseFactRow[]> {
  try {
    const conditions = [eq(caseFacts.caseId, caseId), eq(caseFacts.userId, userId)];
    if (factType) conditions.push(eq(caseFacts.factType, factType));

    const rows = await db
      .select()
      .from(caseFacts)
      .where(and(...conditions))
      .orderBy(desc(caseFacts.updatedAt));

    return rows.map(mapRow);
  } catch (err) {
    console.error("[caseFacts] getCaseFacts error:", err);
    return [];
  }
}

/**
 * Upsert a single fact into case_facts.
 *
 * Uniqueness key: (caseId, userId, factType, value).
 * - Same value exists  → bump updatedAt; upgrade confidence if new source is stronger.
 * - Different value    → insert new row (triggers conflict detection for callers).
 */
export async function upsertCaseFact(
  caseId: string,
  userId: string,
  factType: string,
  value: string,
  source: string,
  sourceName: string | null,
  confidence: FactConfidence = "medium",
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(caseFacts)
      .where(
        and(
          eq(caseFacts.caseId, caseId),
          eq(caseFacts.userId, userId),
          eq(caseFacts.factType, factType),
          eq(caseFacts.value, value),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const newConf = higherConfidence(confidence, existing[0].confidence as FactConfidence);
      await db
        .update(caseFacts)
        .set({ confidence: newConf, updatedAt: new Date(), sourceName: sourceName ?? existing[0].sourceName })
        .where(eq(caseFacts.id, existing[0].id));
    } else {
      await db.insert(caseFacts).values({
        caseId, userId, factType, factKey: factType, value, source,
        sourceName, confidence,
        createdAt: new Date(), updatedAt: new Date(),
      });
    }
  } catch (err) {
    console.error("[caseFacts] upsertCaseFact error:", err);
  }
}

/**
 * Upsert all non-null extracted_facts from a document analysis result.
 * Each field gets confidence="high" (verbatim extraction).
 */
export async function upsertFactsFromDocument(
  caseId: string,
  userId: string,
  documentId: string,
  documentName: string,
  extractedFacts: Record<string, string | null | undefined>,
  documentType?: string | null,
): Promise<number> {
  const ops: Promise<void>[] = [];

  for (const [factType, value] of Object.entries(extractedFacts)) {
    if (!value || typeof value !== "string" || !value.trim()) continue;
    ops.push(upsertCaseFact(caseId, userId, factType, value.trim(), documentId, documentName, "high"));
  }
  if (documentType?.trim()) {
    ops.push(upsertCaseFact(caseId, userId, "document_type", documentType.trim(), documentId, documentName, "high"));
  }

  await Promise.all(ops);
  if (ops.length > 0) {
    console.log(`[caseFacts] Upserted ${ops.length} facts from "${documentName}" → case ${caseId.slice(0, 8)}`);
  }
  return ops.length;
}

/**
 * Resolve a fact for a specific fact type.
 *
 * Priority:
 *   1. user_confirmed rows (source === "user_confirmed") — highest authority
 *   2. document-derived rows — ranked by confidence (high > medium > low)
 *
 * Returns:
 *   { kind: "found", ... }    — single unambiguous value
 *   { kind: "conflict", ... } — multiple distinct values that can't be resolved
 *   null                      — no facts stored for this type
 */
export async function resolveFromCaseFacts(
  caseId: string,
  userId: string,
  factType: string,
): Promise<
  | { kind: "found"; value: string; sourceName: string | null; confidence: FactConfidence; userConfirmed: boolean }
  | { kind: "conflict"; values: Array<{ value: string; sourceName: string | null; confidence: FactConfidence; userConfirmed: boolean }> }
  | null
> {
  const rows = await getCaseFacts(caseId, userId, factType);
  if (rows.length === 0) return null;

  // ── Priority 1: user_confirmed rows ──────────────────────────────────────
  const confirmedRows = rows.filter((r) => r.source === "user_confirmed");
  if (confirmedRows.length > 0) {
    const confirmedValues = new Set(confirmedRows.map((r) => r.value));
    if (confirmedValues.size === 1) {
      // Single confirmed value wins — even if document facts disagree
      const best = confirmedRows[0];
      console.log(
        `[resolver] user_confirmed priority: type="${factType}" value="${best.value.slice(0, 50)}" case=${caseId.slice(0, 8)}`,
      );
      return { kind: "found", value: best.value, sourceName: best.sourceName, confidence: "high", userConfirmed: true };
    }
    // Multiple conflicting user_confirmed values — still a conflict, surface all of them
    console.log(
      `[resolver] user_confirmed CONFLICT: type="${factType}" ${confirmedValues.size} values case=${caseId.slice(0, 8)}`,
    );
    return {
      kind: "conflict",
      values: confirmedRows.map((r) => ({ value: r.value, sourceName: r.sourceName, confidence: r.confidence, userConfirmed: true })),
    };
  }

  // ── Priority 2: document-derived rows ────────────────────────────────────
  const uniqueValues = new Set(rows.map((r) => r.value));
  if (uniqueValues.size === 1) {
    // All documents agree — pick the highest-confidence row
    const best = rows.reduce((a, b) =>
      CONFIDENCE_RANK[a.confidence] >= CONFIDENCE_RANK[b.confidence] ? a : b,
    );
    console.log(
      `[resolver] document fact: type="${factType}" value="${best.value.slice(0, 50)}" confidence=${best.confidence} case=${caseId.slice(0, 8)}`,
    );
    return { kind: "found", value: best.value, sourceName: best.sourceName, confidence: best.confidence, userConfirmed: false };
  }

  // Conflict: multiple distinct values across documents
  console.log(
    `[resolver] document CONFLICT: type="${factType}" ${uniqueValues.size} values case=${caseId.slice(0, 8)}`,
  );
  return {
    kind: "conflict",
    values: rows.map((r) => ({ value: r.value, sourceName: r.sourceName, confidence: r.confidence, userConfirmed: false })),
  };
}
