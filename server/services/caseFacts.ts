/**
 * server/services/caseFacts.ts
 *
 * Case Facts layer — structured facts extracted for a specific case.
 * Stored in Replit PostgreSQL (Drizzle), additive alongside Supabase documents.
 *
 * Priority in the fact resolver:
 *   1. case_facts (this table)        ← most reliable, verbatim from docs
 *   2. documents.analysis_json        ← Supabase document store
 *   3. case_memory                    ← user-saved notes
 *   4. LLM fallback
 *
 * Conflict detection: multiple distinct values for the same (caseId + factType)
 * are allowed and surfaced to the user rather than silently picking the first.
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
        caseId, userId, factType, value, source,
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
 * Returns:
 *   { kind: "found", ... }    — single unambiguous value (highest confidence first)
 *   { kind: "conflict", ... } — multiple distinct values exist
 *   null                      — no facts stored for this type
 */
export async function resolveFromCaseFacts(
  caseId: string,
  userId: string,
  factType: string,
): Promise<
  | { kind: "found"; value: string; sourceName: string | null; confidence: FactConfidence }
  | { kind: "conflict"; values: Array<{ value: string; sourceName: string | null; confidence: FactConfidence }> }
  | null
> {
  const rows = await getCaseFacts(caseId, userId, factType);
  if (rows.length === 0) return null;

  const uniqueValues = new Set(rows.map((r) => r.value));

  if (uniqueValues.size === 1) {
    // Same value from possibly multiple sources — take the highest confidence row
    const best = rows.reduce((a, b) =>
      CONFIDENCE_RANK[a.confidence] >= CONFIDENCE_RANK[b.confidence] ? a : b,
    );
    return { kind: "found", value: best.value, sourceName: best.sourceName, confidence: best.confidence };
  }

  // Conflict: multiple distinct values
  return {
    kind: "conflict",
    values: rows.map((r) => ({ value: r.value, sourceName: r.sourceName, confidence: r.confidence })),
  };
}
