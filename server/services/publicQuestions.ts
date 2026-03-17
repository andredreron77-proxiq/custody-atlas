/**
 * server/services/publicQuestions.ts
 *
 * Service layer for the public Q&A SEO repository.
 *
 * Questions are stored in the Replit PostgreSQL database (Drizzle).
 * They are automatically generated from successful /api/ask-ai calls
 * that pass the personal-identifier safety check.
 *
 * Slug uniqueness: if the generated slug already exists, a numeric suffix
 * is appended until a unique one is found.
 */

import { db } from "../db";
import { publicQuestionsTable } from "@shared/schema";
import { eq, and, ne, desc, sql } from "drizzle-orm";

/* ── Topic inference ─────────────────────────────────────────────────────── */

const TOPIC_PATTERNS: Array<{ topic: string; patterns: RegExp }> = [
  { topic: "child-support", patterns: /child support|support payment|support order|financial support|pay support/i },
  { topic: "relocation", patterns: /relocat|move away|move out of state|moving with.*child|take.*child.*another state/i },
  { topic: "modification", patterns: /modif|change the order|change custody|change parenting|adjust.*custody/i },
  { topic: "enforcement", patterns: /enforc|violat|contempt|not follow|ignor.*order|disobey/i },
  { topic: "mediation", patterns: /mediat|mediator|settle.*outside|alternative dispute/i },
  { topic: "child-preference", patterns: /child prefer|child.*want|what age.*choose|child choose|child.*wish/i },
  { topic: "parenting-time", patterns: /parenting time|visitation|parenting schedule|time with.*child|overnight.*visit/i },
];

export function inferTopic(questionText: string): string {
  for (const { topic, patterns } of TOPIC_PATTERNS) {
    if (patterns.test(questionText)) return topic;
  }
  return "custody-basics";
}

export const TOPIC_LABELS: Record<string, string> = {
  "child-support": "Child Support",
  "relocation": "Relocation",
  "modification": "Modification",
  "enforcement": "Enforcement",
  "mediation": "Mediation",
  "child-preference": "Child Preference",
  "parenting-time": "Parenting Time",
  "custody-basics": "Custody Basics",
};

/* ── Slug helpers ────────────────────────────────────────────────────────── */

export function buildStateSlug(stateName: string): string {
  return stateName.toLowerCase().replace(/\s+/g, "-");
}

export function generateSlug(questionText: string): string {
  return questionText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .replace(/-+$/, "");
}

async function findUniqueSlug(baseSlug: string): Promise<string> {
  const existing = await db
    .select({ slug: publicQuestionsTable.slug })
    .from(publicQuestionsTable)
    .where(sql`slug LIKE ${baseSlug + "%"}`)
    .execute();

  const slugSet = new Set(existing.map((r) => r.slug));
  if (!slugSet.has(baseSlug)) return baseSlug;

  let i = 2;
  while (slugSet.has(`${baseSlug}-${i}`)) i++;
  return `${baseSlug}-${i}`;
}

/* ── Safety check ────────────────────────────────────────────────────────── */

const UNSAFE_PATTERNS: RegExp[] = [
  /\bmy name is\b/i,
  /\bi am called\b/i,
  /\b(my ex|my husband|my wife|my spouse|my partner)\s+[A-Z][a-z]/,
  /\bcase number\s*[\d-]+/i,
  /\b\d{1,5}\s+[A-Z][a-z]+\s+(st|ave|dr|rd|blvd|ln|ct|way|pkwy)\b/i,
  /\bssn\b|\bsocial security number\b/i,
  /\bmy (full|legal) name\b/i,
  /\bvs\.\s+[A-Z][a-z]+\b/,
  /\bDocket\s*#?\s*[\d-]+/i,
];

export function isSafeToPublish(questionText: string): boolean {
  if (questionText.trim().length < 20) return false;
  return !UNSAFE_PATTERNS.some((p) => p.test(questionText));
}

/* ── SEO metadata generators ─────────────────────────────────────────────── */

function buildSEOTitle(questionText: string, stateName: string): string {
  const q = questionText.replace(/\?$/, "").trim();
  const truncated = q.length > 65 ? q.slice(0, 62) + "..." : q;
  return `${truncated} in ${stateName}? | Custody Atlas`;
}

function buildSEODescription(questionText: string, responseJson: Record<string, unknown>): string {
  const summary = responseJson["summary"];
  if (typeof summary === "string" && summary.length > 20) {
    const trimmed = summary.slice(0, 155);
    return trimmed.length < summary.length ? trimmed + "..." : trimmed;
  }
  return `Learn about ${questionText.slice(0, 100)} — general custody law information from Custody Atlas.`;
}

/* ── Public API ──────────────────────────────────────────────────────────── */

/**
 * Called after a successful /api/ask-ai response.
 * Fire-and-forget — errors are caught and logged but never surface to the user.
 */
export async function maybePublishQuestion(opts: {
  state: string;
  county: string;
  questionText: string;
  responseJson: Record<string, unknown>;
}): Promise<void> {
  const { state, county, questionText, responseJson } = opts;

  if (!isSafeToPublish(questionText)) return;

  const stateSlug = buildStateSlug(state);
  const topic = inferTopic(questionText);
  const baseSlug = generateSlug(questionText);
  const slug = await findUniqueSlug(baseSlug);
  const isStateOnly = !county || county.toLowerCase() === "general";

  await db.insert(publicQuestionsTable).values({
    state,
    stateSlug,
    county: isStateOnly ? "" : county,
    topic,
    slug,
    questionText,
    responseJson,
    seoTitle: buildSEOTitle(questionText, state),
    seoDescription: buildSEODescription(questionText, responseJson),
    isPublic: true,
  });
}

/** List public questions for a state (for state page sidebar). */
export async function getPublicQuestionsByState(
  stateSlug: string,
  topic?: string,
  limit = 5,
) {
  const conditions = [
    eq(publicQuestionsTable.stateSlug, stateSlug),
    eq(publicQuestionsTable.isPublic, true),
    ...(topic ? [eq(publicQuestionsTable.topic, topic)] : []),
  ];

  return db
    .select({
      id: publicQuestionsTable.id,
      state: publicQuestionsTable.state,
      stateSlug: publicQuestionsTable.stateSlug,
      topic: publicQuestionsTable.topic,
      slug: publicQuestionsTable.slug,
      questionText: publicQuestionsTable.questionText,
      seoTitle: publicQuestionsTable.seoTitle,
      seoDescription: publicQuestionsTable.seoDescription,
      createdAt: publicQuestionsTable.createdAt,
    })
    .from(publicQuestionsTable)
    .where(and(...conditions))
    .orderBy(desc(publicQuestionsTable.createdAt))
    .limit(limit)
    .execute();
}

/** Get a single public question by state slug + topic + slug. */
export async function getPublicQuestionBySlug(
  stateSlug: string,
  topic: string,
  slug: string,
) {
  const rows = await db
    .select()
    .from(publicQuestionsTable)
    .where(
      and(
        eq(publicQuestionsTable.stateSlug, stateSlug),
        eq(publicQuestionsTable.topic, topic),
        eq(publicQuestionsTable.slug, slug),
        eq(publicQuestionsTable.isPublic, true),
      ),
    )
    .limit(1)
    .execute();

  return rows[0] ?? null;
}

/** Get related questions from the same state/topic, excluding the current slug. */
export async function getRelatedQuestions(
  stateSlug: string,
  topic: string,
  excludeSlug: string,
  limit = 4,
) {
  return db
    .select({
      id: publicQuestionsTable.id,
      state: publicQuestionsTable.state,
      stateSlug: publicQuestionsTable.stateSlug,
      topic: publicQuestionsTable.topic,
      slug: publicQuestionsTable.slug,
      questionText: publicQuestionsTable.questionText,
      seoTitle: publicQuestionsTable.seoTitle,
    })
    .from(publicQuestionsTable)
    .where(
      and(
        eq(publicQuestionsTable.stateSlug, stateSlug),
        eq(publicQuestionsTable.topic, topic),
        eq(publicQuestionsTable.isPublic, true),
        ne(publicQuestionsTable.slug, excludeSlug),
      ),
    )
    .orderBy(desc(publicQuestionsTable.createdAt))
    .limit(limit)
    .execute();
}
