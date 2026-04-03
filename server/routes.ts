import { z } from "zod";
import { resolveUSStateCode } from "@shared/usStates";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { mkdirSync, unlinkSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createHash } from "crypto";
import multer from "multer";
import OpenAI from "openai";
import { extractText, DOCX_MIME, SUPPORTED_MIME_TYPES } from "./documentExtractor";
import { getCustodyLaw, listStates } from "./custody-laws-store";
import { getCountyProcedure } from "./county-procedures-store";
import { buildSystemPrompt, buildUserPrompt, buildComparisonSystemPrompt, buildComparisonUserPrompt } from "./lib/prompts/legalAssistant";
import {
  buildExtractedFactsBlock,
  classifyDocumentQuestion,
  getSafeErrorMessage,
  normalizeDocumentAnalysisPayload,
  validateAnalyzeDocumentGuards,
} from "./lib/documentFlow";
import { buildRetentionWindow } from "./lib/documentRetention";
import { planUploadAssociation } from "./lib/documentIdentity";
import { buildDocumentUploadOutcome } from "./lib/documentUploadOutcome";
import { decideCaseAssignment, type AssignmentCandidate } from "./lib/documentCaseAssignment";
import { requireAuth, requireAdmin } from "./services/auth";
import {
  listAdminUsers,
  setUserTier,
  inviteUser,
  listInviteCodes,
  createInviteCode,
  deactivateInviteCode,
  redeemInviteCode,
} from "./services/adminService";
import {
  getUsageState,
  checkQuestionLimit,
  checkDocumentLimit,
  trackQuestion,
  trackDocument,
} from "./services/usage";
import { saveQuestion } from "./services/questions";
import { saveDocument, getDocuments, getDocumentsByCase, getDocumentById, updateDocumentType, updateDocumentAnalysis, createDocumentSignedUrl, deleteDocument, findDuplicateDocument, ensureDocumentCaseAssociation, getDocumentCaseIds, getDocumentIntegrity, getDocumentCaseAssignmentView, setDocumentCaseAssignment, setDocumentCaseSuggestion, type DocumentType, type SavedDocument } from "./services/documents";
import { buildChunks, createAnalysisRun, getDocumentIntelligenceChunks, replaceDocumentChunks, replaceDocumentDates, replaceDocumentFacts } from "./services/documentIntelligence";
import { upsertFactsFromDocument, resolveFromCaseFacts, getCaseFacts, upsertCaseFact } from "./services/caseFacts";
import { generateActionsFromFacts, getCaseActions, createCaseAction, updateActionStatus, enrichAndSortActions } from "./services/caseActions";
import { deriveCaseTimeline } from "./services/caseTimeline";
import {
  listTimelineEvents,
  createTimelineEvent,
  createTimelineEventIfNotRecentDuplicate,
  deleteTimelineEvent,
} from "./services/timeline";
import {
  createCase,
  createCaseWithDiagnostics,
  listCases,
  getCaseById,
  createConversation,
  listConversations,
  getConversationById,
  listMessages,
  getRecentConversationMessages,
  appendConversationMessage,
  listCaseMemory,
} from "./services/cases";
import {
  createThread,
  appendMessage,
  getThread,
  listThreads,
  getRecentMessages,
} from "./services/threads";
import {
  maybePublishQuestion,
  getPublicQuestionsByState,
  getPublicQuestionBySlug,
  getRelatedQuestions,
  TOPIC_LABELS,
} from "./services/publicQuestions";
import { getUserProfile, setDisplayName } from "./services/userProfile";
import {
  geocodeByCoordinatesSchema,
  geocodeByZipSchema,
  askAIRequestSchema,
  aiLegalResponseSchema,
  documentAnalysisResultSchema,
  documentQARequestSchema,
  documentQAResponseSchema,
  countyProcedureSchema,
  type Jurisdiction,
} from "@shared/schema";
import { classifyDateStatus, type DateStatus } from "@shared/dateStatus";

/** Chat/text model client — routes through the AI Integration proxy when available. */
function getOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  });
}

/**
 * Audio-only client — always uses the real OpenAI API endpoint.
 * The Replit AI Integration proxy does not support the audio API
 * (Whisper transcription, TTS), so these calls must go direct.
 */
function getOpenAIDirectClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  return new OpenAI({ apiKey: key });
}

/** Shared address-component type used by both geocoding helpers. */
type GComponent = { long_name: string; short_name: string; types: string[] };

interface RetroactiveDocReviewItem {
  documentId: string;
  fileName: string;
  status: "suggested" | "unassigned";
  suggestedCaseId: string | null;
  confidenceScore: number | null;
  reason: string;
  signals: {
    caseNumberMatch: boolean;
    courtMatch: boolean;
    partyMatch: boolean;
    jurisdictionMatch: boolean;
    relatedDateMatch: boolean;
  };
}

function normalizeText(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function hasOverlap(a: unknown, b: unknown): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function buildRetroactiveDocReviewItem(
  doc: SavedDocument,
  createdCase: { id: string; title: string; description: string | null; jurisdictionState: string | null },
  caseNumberHint: string | null,
  docs: SavedDocument[],
): RetroactiveDocReviewItem {
  const extractedFacts = (doc.analysisJson?.extracted_facts ?? {}) as Record<string, unknown>;
  const candidateDate = normalizeText(extractedFacts.hearing_date)
    || normalizeText(extractedFacts.filing_date)
    || normalizeText(extractedFacts.effective_date);
  const hasRelatedDateMatch = Boolean(candidateDate) && docs.some((other) => {
    if (other.id === doc.id) return false;
    const otherFacts = (other.analysisJson?.extracted_facts ?? {}) as Record<string, unknown>;
    const otherDate = normalizeText(otherFacts.hearing_date)
      || normalizeText(otherFacts.filing_date)
      || normalizeText(otherFacts.effective_date);
    return Boolean(otherDate) && otherDate === candidateDate;
  });

  const signals = {
    caseNumberMatch: hasOverlap(extractedFacts.case_number, caseNumberHint),
    courtMatch: hasOverlap(extractedFacts.court_name, createdCase.title) || hasOverlap(extractedFacts.court_name, createdCase.description),
    partyMatch:
      hasOverlap(extractedFacts.filing_party, createdCase.title)
      || hasOverlap(extractedFacts.opposing_party, createdCase.title),
    jurisdictionMatch: hasOverlap(extractedFacts.jurisdiction_state, createdCase.jurisdictionState),
    relatedDateMatch: hasRelatedDateMatch,
  };

  let score = 0;
  if (signals.caseNumberMatch) score += 55;
  if (signals.courtMatch) score += 15;
  if (signals.partyMatch) score += 15;
  if (signals.jurisdictionMatch) score += 10;
  if (signals.relatedDateMatch) score += 10;
  score = Math.min(100, score);

  if (score >= 30) {
    return {
      documentId: doc.id,
      fileName: doc.fileName,
      status: "suggested",
      suggestedCaseId: createdCase.id,
      confidenceScore: score,
      reason: "retroactive_signal_match",
      signals,
    };
  }

  return {
    documentId: doc.id,
    fileName: doc.fileName,
    status: "unassigned",
    suggestedCaseId: null,
    confidenceScore: score || null,
    reason: "retroactive_no_confident_match",
    signals,
  };
}

/** Extract jurisdiction fields from a Google geocoding address_components array. */
function extractJurisdictionFields(components: GComponent[]): {
  state: string;
  county: string;
  city: string;
  country: string;
} {
  let state = "";
  let county = "";
  let city = "";
  let country = "";

  for (const c of components) {
    if (c.types.includes("administrative_area_level_1")) state = c.long_name;
    if (c.types.includes("administrative_area_level_2")) {
      // Strip suffix — keep only the proper county name.
      county = c.long_name
        .replace(/ County$/, "")
        .replace(/ Parish$/, "")
        .replace(/ Borough$/, "")
        .replace(/ Municipality$/, "")
        .trim();
    }
    if (c.types.includes("country")) country = c.long_name;
    // City/locality — NEVER used as county (distinct concepts).
    if (!city && c.types.includes("locality"))           city = c.long_name;
    if (!city && c.types.includes("sublocality_level_1")) city = c.long_name;
    if (!city && c.types.includes("postal_town"))        city = c.long_name;
    if (!city && c.types.includes("neighborhood"))       city = c.long_name;
  }

  return { state, county, city, country };
}

/**
 * ZIP-specific geocoding — uses Google's Geocoding API with US restriction and
 * strict exact-ZIP validation to prevent cross-contamination from nearby results.
 *
 * Guarantees:
 *   • Only results that contain the queried ZIP as a `postal_code` component
 *     are accepted — wrong-city / wrong-state results are rejected outright.
 *   • Country is validated as "United States".
 *   • City names are NEVER used as county names.
 *   • If county cannot be determined, `county` is returned as "" — the caller
 *     surfaces a disambiguation UI rather than inventing a name.
 */
async function geocodeByZip(zipCode: string): Promise<Jurisdiction | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured");

  // Normalize: trim whitespace, verify 5 digits before hitting the API.
  const normalizedZip = zipCode.trim();
  if (!/^\d{5}$/.test(normalizedZip)) {
    console.warn(`[geocodeByZip] invalid format: "${zipCode}"`);
    return null;
  }

  // GOOGLE MAPS GEOCODING API — forward geocoding with US component restriction.
  // `components=country:US` prevents the API from returning non-US results.
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(normalizedZip)}` +
    `&components=country:US|postal_code:${encodeURIComponent(normalizedZip)}` +
    `&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Geocoding API request failed: ${response.statusText}`);

  const data = await response.json() as any;
  console.log(`[geocodeByZip] ZIP=${normalizedZip} status=${data.status} results=${data.results?.length ?? 0}`);

  if (data.status === "REQUEST_DENIED") {
    throw new Error(`REQUEST_DENIED: ${data.error_message || "API key may have referrer restrictions"}`);
  }
  if (data.status !== "OK" || !data.results?.length) return null;

  // ── Exact ZIP filtering ──────────────────────────────────────────────────────
  // Accept only results whose postal_code component exactly matches the queried ZIP.
  // This prevents the API from returning a nearby city or a different postal area.
  const exactMatches = (data.results as any[]).filter((r: any) =>
    (r.address_components as GComponent[])?.some(
      (c) => c.types.includes("postal_code") && c.long_name === normalizedZip,
    ),
  );

  console.log(
    `[geocodeByZip] ZIP=${normalizedZip} exactMatches=${exactMatches.length}` +
    (exactMatches.length === 0 ? " — REJECTED (no result contains exact ZIP)" : ""),
  );

  if (exactMatches.length === 0) return null;   // API returned results, but none match the queried ZIP

  // ── Prefer the result that has county (administrative_area_level_2) ──────────
  const withCounty = exactMatches.find((r: any) =>
    (r.address_components as GComponent[])?.some((c) => c.types.includes("administrative_area_level_2")),
  );
  const result = withCounty ?? exactMatches[0];

  const { state, county: forwardCounty, city, country } = extractJurisdictionFields(
    result.address_components as GComponent[],
  );
  // `county` must be `let` so we can update it from the reverse-geocode fallback below.
  let county = forwardCounty;

  // ── Data integrity checks ────────────────────────────────────────────────────
  if (country !== "United States") {
    console.warn(`[geocodeByZip] ZIP=${normalizedZip} REJECTED — country="${country}" is not United States`);
    return null;
  }
  if (!state) {
    console.warn(`[geocodeByZip] ZIP=${normalizedZip} REJECTED — no state in result`);
    return null;
  }

  const geometry = result.geometry?.location as { lat: number; lng: number } | undefined;

  // ── County fallback via reverse geocoding ────────────────────────────────────
  // Some ZIPs (e.g. 30349) span county lines, so the forward geocode result
  // omits administrative_area_level_2.  When this happens, we reverse-geocode
  // the ZIP's center coordinates — every point is in exactly one county, so
  // this gives us the primary county (where most of the ZIP's population is).
  // We set countyIsApproximate=true so the frontend can ask the user to confirm
  // before surfacing county-specific guidance.
  let countyIsApproximate = false;

  if (!county && geometry?.lat !== undefined && geometry?.lng !== undefined) {
    console.log(
      `[geocodeByZip] ZIP=${normalizedZip} — no county from forward geocode; ` +
      `reverse-geocoding center (${geometry.lat}, ${geometry.lng}) to find primary county`,
    );
    try {
      const centerResult = await geocodeByCoordinates(geometry.lat, geometry.lng);
      if (centerResult?.county && centerResult.county !== county) {
        county = centerResult.county;
        countyIsApproximate = true;
        console.log(`[geocodeByZip] ZIP=${normalizedZip} primary county from center-point reverse geocode → "${county}"`);
      }
    } catch (reverseErr) {
      // Non-fatal — we just won't have a county suggestion
      console.warn(`[geocodeByZip] ZIP=${normalizedZip} reverse-geocode failed:`, reverseErr);
    }
  }

  console.log(
    `[geocodeByZip] ZIP=${normalizedZip} resolved → ` +
    `city="${city || "(none)"}" state="${state}" ` +
    `county="${county || "(undetermined)"}" approximate=${countyIsApproximate} ` +
    `addr="${result.formatted_address}"`,
  );

  return {
    state,
    county,                                               // "" only when reverse geocode also failed
    ...(city               ? { city }               : {}),
    ...(countyIsApproximate ? { countyIsApproximate } : {}),
    country,
    formattedAddress: result.formatted_address,
    ...(geometry?.lat !== undefined ? { latitude:  geometry.lat } : {}),
    ...(geometry?.lng !== undefined ? { longitude: geometry.lng } : {}),
  };
}

/**
 * Reverse geocoding — converts GPS coordinates to a jurisdiction.
 * Uses Google's Geocoding API with a latlng lookup; country=US is validated.
 */
async function geocodeByCoordinates(lat: number, lng: number): Promise<Jurisdiction | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured");

  // GOOGLE MAPS GEOCODING API — reverse geocoding.
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Geocoding API request failed: ${response.statusText}`);

  const data = await response.json() as any;
  console.log(`[geocodeByCoordinates] lat=${lat} lng=${lng} status=${data.status} results=${data.results?.length ?? 0}`);

  if (data.status === "REQUEST_DENIED") {
    throw new Error(`REQUEST_DENIED: ${data.error_message || "API key may have referrer restrictions"}`);
  }
  if (data.status !== "OK" || !data.results?.length) return null;

  // Prefer the first result that has county data; fall back to results[0].
  const withCounty = (data.results as any[]).find((r: any) =>
    (r.address_components as GComponent[])?.some((c) => c.types.includes("administrative_area_level_2")),
  );
  const result = withCounty ?? data.results[0];

  const { state, county, city, country } = extractJurisdictionFields(
    result.address_components as GComponent[],
  );

  if (!state) return null;

  const geometry = result.geometry?.location as { lat: number; lng: number } | undefined;

  console.log(
    `[geocodeByCoordinates] lat=${lat} lng=${lng} resolved → ` +
    `city="${city || "(none)"}" state="${state}" county="${county || "(undetermined)"}"`,
  );

  return {
    state,
    county,
    ...(city    ? { city }    : {}),
    country,
    formattedAddress: result.formatted_address,
    latitude:  lat,
    longitude: lng,
  };
}

/* ── Answer Mode: Intent Detection + Deterministic Fact Resolver ─────────── */

type QuestionIntent = "FACT" | "EXPLANATION" | "ACTION";
type FactFieldKey =
  | "document_title" | "document_type" | "court_name" | "court_address"
  | "case_number" | "judge_name" | "hearing_date" | "filing_party" | "opposing_party";

interface IntentResult {
  intent: QuestionIntent;
  factFields: FactFieldKey[];
}

interface ResolvedFact {
  value: string;
  field: FactFieldKey;
  fieldLabel: string;
  sourceDocument: string;
  sourceType: "extracted_facts" | "case_memory";
}

const FACT_FIELD_LABELS: Record<FactFieldKey, string> = {
  document_title: "Document Title",
  document_type:  "Document Type",
  court_name:     "Court Name",
  court_address:  "Court Address",
  case_number:    "Case Number",
  judge_name:     "Judge",
  hearing_date:   "Hearing Date",
  filing_party:   "Filing Party",
  opposing_party: "Opposing Party",
};

/**
 * Classify user question into FACT / ACTION / EXPLANATION.
 * FACT: asking for a specific extractable value (case number, judge, date, etc.)
 * ACTION: asking what to do or how to do something
 * EXPLANATION: general legal question (default)
 */
function detectIntent(question: string): IntentResult {
  const q = question.toLowerCase().trim();

  const factRules: Array<{ pattern: RegExp; fields: FactFieldKey[] }> = [
    { pattern: /\bcase\s+number\b|\bdocket\s+number\b|\bcase\s+#\b/,                              fields: ["case_number"] },
    { pattern: /\bcourt\s+address\b|\bcourtroom\s+address\b|\baddress\s+of\s+the\s+court\b/,      fields: ["court_address"] },
    { pattern: /\bcourt\s+(name|house|location)\b|\bwhich\s+court(house)?\b/,                     fields: ["court_name", "court_address"] },
    { pattern: /\bwhere\s+(do\s+i\s+go|is\s+the\s+court|is\s+my\s+hearing)\b/,                   fields: ["court_name", "court_address"] },
    { pattern: /\bjudge'?s?\s+name\b|\bwho\s+is\s+the\s+judge\b/,                                fields: ["judge_name"] },
    { pattern: /\bhearing\s+(date|time)\b|\bwhen\s+is\s+(my|the)\s+hearing\b/,                   fields: ["hearing_date"] },
    { pattern: /\bfiling\s+party\b|\bpetitioner'?s?\s+name\b|\bwho\s+filed\b/,                   fields: ["filing_party"] },
    { pattern: /\brespondent'?s?\s+name\b|\bopposing\s+party\b/,                                  fields: ["opposing_party"] },
    { pattern: /\b(name|title)\s+of\s+(this\s+)?document\b|\bdocument\s+(name|title)\b|\bname\s+of\s+this\s+document\b/, fields: ["document_title"] },
    { pattern: /\b(type|kind)\s+of\s+(this\s+)?document\b|\bwhat\s+(kind|type)\s+of\s+document\b/, fields: ["document_type"] },
  ];

  for (const rule of factRules) {
    if (rule.pattern.test(q)) {
      return { intent: "FACT", factFields: rule.fields };
    }
  }

  const actionPatterns = [
    /\bhow\s+do\s+i\b/,
    /\bwhat\s+(should|can|do)\s+i\s+do\b/,
    /\bsteps\s+to\b/,
    /\bhow\s+to\s+(file|respond|appeal|modify|request|get)\b/,
    /\bwhat\s+are\s+my\s+(rights|options|choices)\b/,
    /\bwhat\s+happens\s+(if|next|when)\b/,
    /\bcan\s+i\s+(file|request|appeal|modify|ask)\b/,
  ];
  if (actionPatterns.some((p) => p.test(q))) {
    return { intent: "ACTION", factFields: [] };
  }

  return { intent: "EXPLANATION", factFields: [] };
}

type FactResolverResult =
  | { kind: "found"; fact: ResolvedFact & { userConfirmed?: boolean } }
  | { kind: "conflict"; values: Array<{ value: string; sourceName: string | null; confidence: string; userConfirmed?: boolean }> };

/**
 * Attempt to resolve a FACT question without calling the LLM.
 *
 * Priority order:
 *   1. case_facts table (Drizzle/PG)  — conflict detection enabled
 *   2. documents.analysis_json        — Supabase extracted_facts
 *   3. case_memory                    — user-saved notes
 *
 * Returns:
 *   { kind: "found", fact }      — single resolved value, return directly
 *   { kind: "conflict", values } — multiple contradicting values found
 *   null                         — nothing found, fall through to LLM
 */
async function resolveFactDeterministically(
  factFields: FactFieldKey[],
  documents: Array<{ fileName: string; docType: string; analysisJson: Record<string, unknown> }>,
  caseMemories: Array<{ content: string; memoryType: string }>,
  caseId?: string,
  userId?: string,
): Promise<FactResolverResult | null> {
  // 1. case_facts table — primary source, conflict-aware
  if (caseId && userId) {
    for (const field of factFields) {
      const result = await resolveFromCaseFacts(caseId, userId, field);
      if (!result) continue;

      if (result.kind === "conflict") {
        console.log(`[resolver] Conflict detected for field="${field}" in case ${caseId.slice(0, 8)}: ${result.values.length} values`);
        return { kind: "conflict", values: result.values };
      }

      // found — promote to ResolvedFact, preserving userConfirmed flag
      return {
        kind: "found",
        fact: {
          value: result.value,
          field,
          fieldLabel: FACT_FIELD_LABELS[field],
          sourceDocument: result.sourceName ?? (result.userConfirmed ? "Confirmed by you" : "case facts"),
          sourceType: "extracted_facts",
          userConfirmed: result.userConfirmed,
        },
      };
    }
  }

  // 2. Extracted document facts — verbatim from document analysis_json
  for (const doc of documents.slice(0, 5)) {
    for (const field of factFields) {
      let value: string | null = null;
      if (field === "document_type") {
        const dt = (doc.analysisJson as any)?.document_type as string | undefined;
        if (dt) value = dt;
      } else {
        const ef = (doc.analysisJson as any)?.extracted_facts;
        if (ef?.[field]) value = String(ef[field]);
      }
      if (value) {
        return {
          kind: "found",
          fact: { value, field, fieldLabel: FACT_FIELD_LABELS[field], sourceDocument: doc.fileName, sourceType: "extracted_facts" },
        };
      }
    }
  }

  // 3. Case memory — user-saved notes (keyword heuristic)
  for (const mem of caseMemories) {
    for (const field of factFields) {
      const label = FACT_FIELD_LABELS[field].toLowerCase();
      if (mem.content.toLowerCase().includes(label)) {
        return {
          kind: "found",
          fact: { value: mem.content, field, fieldLabel: FACT_FIELD_LABELS[field], sourceDocument: `case memory (${mem.memoryType})`, sourceType: "case_memory" },
        };
      }
    }
  }

  return null;
}

/** Build a direct-fact AILegalResponse object — no LLM involved. */
function buildFactResponse(resolved: ResolvedFact & { userConfirmed?: boolean }): Record<string, unknown> {
  const sourceLabel = resolved.userConfirmed ? "Confirmed by you" : resolved.sourceDocument;
  return {
    summary: `${resolved.fieldLabel}: ${resolved.value}`,
    key_points: [
      `${resolved.fieldLabel}: ${resolved.value}`,
      `Source: "${sourceLabel}"`,
    ],
    questions_to_ask_attorney: [],
    cautions: resolved.field === "court_address"
      ? ["Always verify the court address with an official source before appearing — addresses can change."]
      : [],
    disclaimer: resolved.userConfirmed
      ? "This value was confirmed by you as the system of record."
      : "This information was extracted directly from your uploaded document. Verify with the original before relying on it.",
    intent: "FACT",
    factSource: sourceLabel,
    factField: resolved.fieldLabel,
    factValue: resolved.value,
    factTypeKey: resolved.field,
    factUserConfirmed: resolved.userConfirmed ?? false,
  };
}

/** Build a "not found" FACT response telling the user what was checked. */
function buildFactNotFoundResponse(
  factFields: FactFieldKey[],
  docCount: number,
): Record<string, unknown> {
  const fieldLabels = factFields.map((f) => FACT_FIELD_LABELS[f]).join(" / ");
  let summary: string;
  const keyPoints: string[] = [];

  if (docCount === 0) {
    summary = `I couldn't find the ${fieldLabels} because no documents have been uploaded yet.`;
    keyPoints.push(
      "No documents have been uploaded to your Workspace.",
      `To find your ${fieldLabels}, upload your custody order, court notice, or other relevant document using the Document Analysis feature.`,
      "After uploading, Atlas can extract the exact value directly from the document text.",
    );
  } else {
    summary = `I searched ${docCount} uploaded document${docCount > 1 ? "s" : ""} but couldn't find the ${fieldLabels}.`;
    keyPoints.push(
      `Checked ${docCount} document(s) — the ${fieldLabels} was not clearly present in any of them.`,
      "This may mean the document uses a non-standard format, or the field appears on a page that wasn't fully captured.",
      "Try re-uploading the specific page, or check the original document directly.",
    );
  }

  return {
    summary,
    key_points: keyPoints,
    questions_to_ask_attorney: [],
    cautions: ["Do not rely on memory for court names, addresses, or case numbers — always verify with the official document."],
    disclaimer: "Always verify court and case information directly with the court clerk or your attorney.",
    intent: "FACT",
    factSource: null,
    factField: fieldLabels,
  };
}

/** Build a conflict FACT response when multiple contradicting values are found. */
function buildConflictResponse(
  conflict: { values: Array<{ value: string; sourceName: string | null; confidence: string; userConfirmed?: boolean }> },
  factFields: FactFieldKey[],
): Record<string, unknown> {
  const fieldLabels = factFields.map((f) => FACT_FIELD_LABELS[f]).join(" / ");
  const uniqueValues = [...new Map(conflict.values.map((v) => [v.value, v])).values()];
  const valueLines = uniqueValues.map(
    (v, i) => {
      const sourceTag = v.userConfirmed ? "confirmed by you" : v.sourceName ? `from "${v.sourceName}"` : "unknown source";
      return `${i + 1}. "${v.value}" — ${sourceTag} (${v.confidence} confidence)`;
    },
  );
  return {
    summary: `I found ${uniqueValues.length} conflicting values for ${fieldLabels} across your documents.`,
    key_points: [
      `${fieldLabels} appears differently in different documents:`,
      ...valueLines,
      "Tap \"Confirm\" next to the correct value to set it as the system of record.",
    ],
    questions_to_ask_attorney: [
      `Which ${fieldLabels} is the correct one: ${uniqueValues.map((v) => `"${v.value}"`).join(" or ")}?`,
    ],
    cautions: [
      "Do not assume either value is correct — documents may be superseded, amended, or mislabeled.",
      "Contact the court clerk or your attorney to confirm the authoritative value.",
    ],
    disclaimer: "This information was extracted from your uploaded documents. Always verify with the original documents and your attorney.",
    intent: "FACT",
    factSource: null,
    factField: fieldLabels,
    factConflict: true,
    factTypeKey: factFields[0] ?? null,
    conflictOptions: uniqueValues.map((v) => ({
      value: v.value,
      sourceName: v.sourceName,
      userConfirmed: v.userConfirmed ?? false,
      factTypeKey: factFields[0] ?? null,
    })),
  };
}

/**
 * Compile a human-readable fact sheet from user documents for LLM injection
 * (used only when deterministic resolution fails and we fall through to the LLM).
 */
function buildDocumentFactsText(documents: Array<{ fileName: string; docType: string; analysisJson: Record<string, unknown> }>): string {
  const blocks: string[] = [];
  for (const doc of documents.slice(0, 5)) {
    const ef = (doc.analysisJson as any)?.extracted_facts;
    if (!ef) continue;
    const lines: string[] = [`Document: "${doc.fileName}"`];
    if (ef.document_title)  lines.push(`  Title: ${ef.document_title}`);
    if (ef.case_number)     lines.push(`  Case Number: ${ef.case_number}`);
    if (ef.court_name)      lines.push(`  Court: ${ef.court_name}`);
    if (ef.court_address)   lines.push(`  Court Address: ${ef.court_address}`);
    if (ef.judge_name)      lines.push(`  Judge: ${ef.judge_name}`);
    if (ef.hearing_date)    lines.push(`  Hearing Date: ${ef.hearing_date}`);
    if (ef.filing_party)    lines.push(`  Filing Party: ${ef.filing_party}`);
    if (ef.opposing_party)  lines.push(`  Opposing Party: ${ef.opposing_party}`);
    if (lines.length > 1) blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

const UPLOADS_DIR = join(process.cwd(), "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Please upload a PDF, JPG, or PNG."));
    }
  },
});

function resolveRetentionTierFromRequest(req: any): "free" | "pro" | "attorney_firm" {
  const tier = String(req?.user?.tier ?? "free").toLowerCase();
  if (tier === "attorney" || tier === "firm" || tier === "attorney_firm") return "attorney_firm";
  if (tier === "pro") return "pro";
  return "free";
}

// Memory storage for audio uploads (Whisper transcription)
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — OpenAI Whisper max
});

// Map UI voice names → real OpenAI TTS voice identifiers
const TTS_VOICE_MAP: Record<string, string> = {
  marin: "nova",
  cedar: "onyx",
  alloy: "alloy",
};
const ALLOWED_TTS_VOICES = new Set(Object.keys(TTS_VOICE_MAP));

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ── Usage state ────────────────────────────────────────────────────────────
  app.get("/api/usage", async (req, res) => {
    try {
      const state = await getUsageState(req);
      res.json(state);
    } catch (err) {
      console.error("Usage state error:", err);
      res.status(500).json({ error: "Could not retrieve usage state." });
    }
  });

  app.post("/api/geocode/coordinates", async (req, res) => {
    try {
      const parsed = geocodeByCoordinatesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid coordinates", details: parsed.error.issues });
      }

      const jurisdiction = await geocodeByCoordinates(parsed.data.lat, parsed.data.lng);
      if (!jurisdiction) {
        return res.status(404).json({
          error: "Could not determine jurisdiction for these coordinates. Please try entering your ZIP code manually.",
        });
      }

      return res.json(jurisdiction);
    } catch (err: any) {
      if (err.message?.includes("GOOGLE_MAPS_API_KEY")) {
        return res.status(503).json({ error: "Geocoding service not configured. Please add a Google Maps API key." });
      }
      if (err.message?.includes("REQUEST_DENIED") || err.message?.includes("referer")) {
        return res.status(503).json({
          error: "Google Maps API key has referrer restrictions. Please remove restrictions in Google Cloud Console.",
        });
      }
      console.error("Geocoding error:", err);
      return res.status(500).json({ error: "Location lookup failed. Please try entering your ZIP code manually." });
    }
  });

  app.post("/api/geocode/zip", async (req, res) => {
    try {
      const parsed = geocodeByZipSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid ZIP code", details: parsed.error.issues });
      }

      const jurisdiction = await geocodeByZip(parsed.data.zipCode);
      if (!jurisdiction) {
        return res.status(404).json({
          error: "We couldn't determine your location from that ZIP code. Please check the ZIP and try again.",
        });
      }

      return res.json(jurisdiction);
    } catch (err: any) {
      if (err.message?.includes("GOOGLE_MAPS_API_KEY")) {
        return res.status(503).json({ error: "Geocoding service not configured. Please add a Google Maps API key." });
      }
      if (err.message?.includes("REQUEST_DENIED")) {
        return res.status(503).json({
          error: "Google Maps API key has referrer restrictions. Please remove restrictions in Google Cloud Console.",
        });
      }
      console.error("[geocode/zip] error:", err);
      return res.status(500).json({ error: "We couldn't determine your location from that ZIP code. Please try again." });
    }
  });

  app.get("/api/user-profile", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user?.id as string;
      const profile = await getUserProfile(userId);
      return res.json(profile);
    } catch (err) {
      console.error("[user-profile] GET error:", err);
      return res.status(500).json({ error: "Failed to load user profile." });
    }
  });

  app.patch("/api/user-profile/display-name", requireAuth, async (req, res) => {
    try {
      const parsed = z.object({ displayName: z.string().min(1).max(80) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "displayName is required." });
      }
      const userId = (req as any).user?.id as string;
      const ok = await setDisplayName(userId, parsed.data.displayName);
      if (!ok) {
        return res.status(500).json({ error: "Failed to save display name." });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error("[user-profile] PATCH display-name error:", err);
      return res.status(500).json({ error: "Failed to save display name." });
    }
  });

  app.get("/api/custody-laws/:state", (req, res) => {
    const stateName = req.params.state;
    const law = getCustodyLaw(stateName);

    if (!law) {
      return res.status(404).json({
        error: `No custody law data available for ${stateName}`,
        availableStates: listStates(),
      });
    }

    return res.json(law);
  });

  app.get("/api/custody-laws", (_req, res) => {
    return res.json({ states: listStates() });
  });

  /**
   * GET /api/county-procedures/:state/:county
   *
   * Returns LOCAL COURT PROCEDURE data for a specific county.
   *
   * This is SEPARATE from /api/custody-laws/:state which returns statewide
   * legal rules.  County procedure data covers court-operational details
   * (court name, filing links, mandatory classes, local mediation programs)
   * that may vary county-by-county even within the same state.
   *
   * Returns 404 when no county record exists — callers must degrade gracefully
   * to displaying state-law-only content.  A 404 here is NORMAL, not an error.
   */
  app.get("/api/county-procedures/:state/:county", (req, res) => {
    const { state, county } = req.params;

    // "general" is the sentinel county used by the map flow.
    // It is never a real county so always return 404.
    if (!state || !county || county.toLowerCase() === "general") {
      return res.status(404).json({ error: "No county procedure data for this location." });
    }

    const procedure = getCountyProcedure(
      decodeURIComponent(state),
      decodeURIComponent(county)
    );

    if (!procedure) {
      return res.status(404).json({
        error: `No county procedure data available for ${county} County, ${state}`,
      });
    }

    const validated = countyProcedureSchema.safeParse(procedure);
    if (!validated.success) {
      console.error("County procedure record failed schema validation:", validated.error.issues);
      return res.status(500).json({ error: "County procedure data is malformed." });
    }

    return res.json(validated.data);
  });

  app.post("/api/ask", requireAuth, checkQuestionLimit, async (req, res) => {
    try {
      // Extend the base schema with optional case context fields
      const extendedAskSchema = askAIRequestSchema.extend({
        caseId: z.string().uuid().optional(),
        conversationId: z.string().uuid().optional(),
      });

      const parsed = extendedAskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parsed.error.issues.map((i) => i.message),
        });
      }

      const { jurisdiction, legalContext, userQuestion, history, caseId, conversationId: incomingConvId, documentId, selectedDocumentIds } = parsed.data;
      const userId = (req as any).user?.id as string | undefined;

      if (!jurisdiction.state || !jurisdiction.county) {
        return res.status(400).json({ error: "Jurisdiction must include both state and county." });
      }

      const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!hasAI) {
        return res.status(503).json({
          error: "AI service not configured. Please connect an OpenAI integration.",
        });
      }

      // ── Case ambiguity protection ────────────────────────────────────────────
      // Never allow /api/ask to run across multiple cases when no caseId is given.
      // - 0 cases: continue in general workspace mode
      // - 1 case : auto-scope to that case (no prompt needed)
      // - 2+ cases with no caseId: require explicit case selection
      let effectiveCaseId = caseId;
      if (userId) {
        const userCases = await listCases(userId, 200);
        if (!effectiveCaseId) {
          if (userCases.length === 1) {
            effectiveCaseId = userCases[0].id;
          } else if (userCases.length > 1) {
            return res.status(200).json({
              type: "case_selection_required",
              message: "Which case are we referring to?",
              cases: userCases.map((c) => ({ id: c.id, name: c.title })),
            });
          }
        }
      }

      // ── Case-aware path ──────────────────────────────────────────────────────
      // When a caseId is provided, we: verify ownership, resolve or create the
      // conversation, load server-side message history, inject case_memory into
      // the system prompt, and persist the exchange after the AI responds.
      // This path is ADDITIVE — the legacy thread path below is fully preserved.
      let activeConversationId: string | undefined;

      if (effectiveCaseId && userId) {
        // 1. Ownership check — server enforces this, never trust client claims
        const caseRecord = await getCaseById(effectiveCaseId, userId);
        if (!caseRecord) {
          console.warn(`[ask] Case not found or unauthorized. caseId=${effectiveCaseId} userId=${userId}`);
          return res.status(403).json({ error: "Case not found or access denied." });
        }

        // 2. Resolve conversation: use the one sent by the client, or create a new one
        if (incomingConvId) {
          const convRecord = await getConversationById(incomingConvId, userId);
          if (!convRecord || convRecord.caseId !== effectiveCaseId) {
            console.warn(`[ask] Conversation mismatch. convId=${incomingConvId} caseId=${effectiveCaseId}`);
            return res.status(403).json({ error: "Conversation not found or does not belong to this case." });
          }
          activeConversationId = incomingConvId;
        } else {
          const newConv = await createConversation(userId, effectiveCaseId, {
            title: userQuestion.slice(0, 120),
            threadType: "general",
            jurisdictionState: jurisdiction.state,
            jurisdictionCounty: jurisdiction.county,
          });
          if (!newConv) {
            console.warn(`[ask] Failed to create conversation for caseId=${effectiveCaseId}`);
            // Non-fatal: fall back to legacy path rather than failing the whole request
          } else {
            activeConversationId = newConv.id;
          }
        }
      }

      // ── Load state law ───────────────────────────────────────────────────────
      const stateLaw = getCustodyLaw(jurisdiction.state);
      const isUnsupportedState = !stateLaw;

      const legalContextText = stateLaw
        ? [
            `CUSTODY STANDARD:\n${stateLaw.custody_standard}`,
            `CUSTODY TYPES:\n${stateLaw.custody_types}`,
            `MODIFICATION RULES:\n${stateLaw.modification_rules}`,
            `RELOCATION RULES:\n${stateLaw.relocation_rules}`,
            `ENFORCEMENT OPTIONS:\n${stateLaw.enforcement_options}`,
            `MEDIATION REQUIREMENTS:\n${stateLaw.mediation_requirements}`,
          ].join("\n\n")
        : legalContext
          ? JSON.stringify(legalContext, null, 2)
          : `No specific custody law data is available for ${jurisdiction.state}. Apply general US family law principles and clearly flag that the user must verify with a local ${jurisdiction.state} attorney.`;

      const openai = getOpenAIClient();

      // ── Build history: prefer server-loaded messages over client-provided history
      let historyTurns: Array<{ role: "user" | "assistant"; content: string }> = [];

      if (activeConversationId) {
        // Case conversation — load from messages table, ignore client history
        const savedMessages = await getRecentConversationMessages(activeConversationId, 16);
        historyTurns = savedMessages.map((m) => ({
          role: m.role,
          content: m.messageText,
        }));
      } else {
        // Legacy path — use client-provided history, capped at 16 turns
        historyTurns = (history ?? [])
          .slice(-16)
          .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));
      }

      // ── Case memory injection ────────────────────────────────────────────────
      // When a case is active, load any saved memory entries and prepend them to
      // the system prompt so Atlas is aware of prior context for this specific case.
      // resolvedCaseMemories is also passed to the deterministic fact resolver below.
      let caseMemoryText = "";
      let resolvedCaseMemories: Array<{ content: string; memoryType: string }> = [];
      if (effectiveCaseId && userId) {
        resolvedCaseMemories = await listCaseMemory(effectiveCaseId, userId);
        if (resolvedCaseMemories.length > 0) {
          caseMemoryText = "\n\n---\nCASE MEMORY (facts saved from prior sessions):\n" +
            resolvedCaseMemories.map((m) => `[${m.memoryType}] ${m.content}`).join("\n");
        }
      }

      // ── Document-scoped context ──────────────────────────────────────────────
      // When documentId is provided, load that document, verify ownership, and
      // build a focused context block injected into the system prompt BEFORE
      // jurisdiction law content.  This is the primary fix for document-scoped Q&A.
      let scopedDocument: SavedDocument | null = null;
      let documentContextAddendum = "";

      if (documentId && userId) {
        scopedDocument = await getDocumentById(documentId, userId);
        if (!scopedDocument) {
          console.warn(`[ask] documentId provided but not found/unauthorized: id=${documentId.slice(0, 8)} userId=${userId}`);
          return res.status(403).json({ error: "Document not found or access denied." });
        }
        if (effectiveCaseId) {
          const docCaseIds = await getDocumentCaseIds(scopedDocument.id, userId);
          if (!docCaseIds.includes(effectiveCaseId)) {
            return res.status(403).json({ error: "Document is not linked to the selected case." });
          }
        }
        const hasText = scopedDocument.extractedText.trim().length > 0;
        const hasAnalysis = Object.keys(scopedDocument.analysisJson).length > 0;
        console.log(
          `[ask] document-scoped: doc="${scopedDocument.fileName}" id=${documentId.slice(0, 8)} hasText=${hasText} hasAnalysis=${hasAnalysis}`,
        );

        const docLines: string[] = [`Document: "${scopedDocument.fileName}" (${scopedDocument.docType})`];
        const ef = (scopedDocument.analysisJson as any)?.extracted_facts;
        if (ef) {
          if (ef.document_title)  docLines.push(`  Title: ${ef.document_title}`);
          if (ef.case_number)     docLines.push(`  Case Number: ${ef.case_number}`);
          if (ef.court_name)      docLines.push(`  Court: ${ef.court_name}`);
          if (ef.court_address)   docLines.push(`  Court Address: ${ef.court_address}`);
          if (ef.judge_name)      docLines.push(`  Judge: ${ef.judge_name}`);
          if (ef.hearing_date)    docLines.push(`  Hearing Date: ${ef.hearing_date}`);
          if (ef.filing_date)     docLines.push(`  Filing Date: ${ef.filing_date}`);
          if (ef.effective_date)  docLines.push(`  Effective Date: ${ef.effective_date}`);
          if (ef.expiration_date) docLines.push(`  Expiration Date: ${ef.expiration_date}`);
          if (ef.filing_party)    docLines.push(`  Filing Party: ${ef.filing_party}`);
          if (ef.opposing_party)  docLines.push(`  Opposing Party: ${ef.opposing_party}`);
        }

        // Include up to 10 000 chars of extracted text — covers date/deadline questions
        const textBlock = scopedDocument.extractedText.slice(0, 10000).trim();

        documentContextAddendum = `

---
DOCUMENT-SCOPED QUESTION
The user is asking about a SPECIFIC uploaded document listed below.
Answer based PRIMARILY on this document. Do NOT fall back to general jurisdiction guidance unless the document is silent on the topic.

${docLines.join("\n")}
${textBlock
  ? `\nFULL DOCUMENT TEXT (first 10 000 characters):\n${textBlock}`
  : "\n[No extracted text available for this document]"}

RULES FOR DOCUMENT-SCOPED QUESTIONS:
1. Treat the document text above as the authoritative source.
2. For date questions (hearing, deadlines, filing, effective, expiration): list EVERY date found in the document with its context — do not summarize.
3. For fact questions: quote the exact value and state which section it appeared in.
4. If the answer is NOT present in this document, say clearly: "I could not find [X] in this specific document." Do not substitute with general guidance.
5. Reference the document by name ("${scopedDocument.fileName}") when citing values.`;
      }

      // ── Intent detection + deterministic fact resolver ───────────────────────
      // FACT questions: attempt to resolve without calling the LLM at all.
      // If resolved → return directly (no hallucination possible).
      // If not resolved → fall through to LLM with injected fact context.
      // ACTION questions: inject action-guidance addendum into system prompt.
      const { intent, factFields } = detectIntent(userQuestion);
      console.log(`[ask] intent="${intent}"${factFields.length ? ` fields=[${factFields.join(",")}]` : ""} documentScoped=${!!scopedDocument}`);

      let intentUserDocs: Awaited<ReturnType<typeof getDocuments>> = [];

      if (intent === "FACT" && userId) {
        // When a document is scoped, use only that document for fact resolution.
        // This ensures FACT answers come from the selected document, not all docs.
        if (scopedDocument) {
          intentUserDocs = [scopedDocument];
        } else {
          const allDocs = effectiveCaseId
            ? await getDocumentsByCase(userId, effectiveCaseId)
            : await getDocuments(userId);
          // If selectedDocumentIds is provided, filter to only those docs.
          // Empty array = no docs selected = skip doc context.
          intentUserDocs = selectedDocumentIds !== undefined
            ? (selectedDocumentIds.length === 0 ? [] : allDocs.filter((d) => selectedDocumentIds.includes(d.id)))
            : allDocs;
        }
        const resolverResult = await resolveFactDeterministically(
          factFields, intentUserDocs, resolvedCaseMemories, effectiveCaseId, userId,
        );

        if (resolverResult) {
          let earlyResponse: Record<string, unknown>;

          if (resolverResult.kind === "found") {
            console.log(`[ask] FACT resolved deterministically: field="${resolverResult.fact.field}" value="${resolverResult.fact.value.slice(0, 60)}" from "${resolverResult.fact.sourceDocument}"`);
            earlyResponse = buildFactResponse(resolverResult.fact);
          } else {
            // conflict
            console.log(`[ask] FACT conflict detected for fields=[${factFields.join(",")}]: ${resolverResult.values.length} distinct values`);
            earlyResponse = buildConflictResponse(resolverResult, factFields);
          }

          await trackQuestion(req);
          if (userId) {
            saveQuestion(userId, {
              jurisdictionState: jurisdiction.state,
              jurisdictionCounty: jurisdiction.county,
              questionText: userQuestion,
              responseJson: earlyResponse,
            }).catch(() => {});
          }
          if (activeConversationId) {
            Promise.all([
              appendConversationMessage(activeConversationId, "user", userQuestion),
              appendConversationMessage(activeConversationId, "assistant", earlyResponse.summary as string, earlyResponse),
            ]).catch((err) => console.error("[ask] Failed to persist deterministic fact messages:", err));
          }

          return res.json({
            ...earlyResponse,
            ...(activeConversationId ? { conversationId: activeConversationId } : {}),
          });
        }

        console.log(`[ask] FACT intent — no deterministic match, falling through to LLM (docs=${intentUserDocs.length})`);
      }

      // ── Load user documents for context injection (non-FACT intents) ────────
      // For FACT intents, intentUserDocs was already loaded above (for the resolver).
      // For EXPLANATION/ACTION intents without a documentId scope, load recent docs now
      // so we can inject a compact summary block into the system prompt.
      let generalDocSummaryAddendum = "";
      let retainedChunkAddendum = "";

      // When selectedDocumentIds is an empty array, the user has deselected all docs —
      // skip general doc context entirely, regardless of intent.
      const noDocsSelected = Array.isArray(selectedDocumentIds) && selectedDocumentIds.length === 0;

      if (intent !== "FACT" && !scopedDocument && !noDocsSelected && userId) {
        const allRecentDocs = await (
          effectiveCaseId
            ? getDocumentsByCase(userId, effectiveCaseId)
            : getDocuments(userId)
        ).catch(() => []);
        // Filter to selected docs if provided; otherwise use all
        const recentDocs = selectedDocumentIds !== undefined && selectedDocumentIds.length > 0
          ? allRecentDocs.filter((d) => selectedDocumentIds.includes(d.id))
          : allRecentDocs;
        if (recentDocs.length > 0) {
          const docSummaries = recentDocs.slice(0, 5).map((doc, i) => {
            const analysis = doc.analysisJson as any;
            const summary = analysis?.summary ? `Summary: ${analysis.summary}` : "";
            const docType = analysis?.document_type ?? doc.docType;
            const ef = analysis?.extracted_facts;
            const facts: string[] = [];
            if (ef?.case_number)  facts.push(`Case #: ${ef.case_number}`);
            if (ef?.court_name)   facts.push(`Court: ${ef.court_name}`);
            if (ef?.hearing_date) facts.push(`Hearing: ${ef.hearing_date}`);
            if (ef?.judge_name)   facts.push(`Judge: ${ef.judge_name}`);
            const factsLine = facts.length > 0 ? `Key facts: ${facts.join(" | ")}` : "";
            const lines = [`${i + 1}. "${doc.fileName}" (${docType})`];
            if (summary) lines.push(`   ${summary}`);
            if (factsLine) lines.push(`   ${factsLine}`);
            return lines.join("\n");
          }).join("\n\n");

          generalDocSummaryAddendum = `

---
USER'S UPLOADED DOCUMENTS (${recentDocs.length} document${recentDocs.length > 1 ? "s" : ""})
The user has uploaded the following custody documents. Reference them when your answer relates to their specific situation.

${docSummaries}

RULES FOR USING THESE DOCUMENTS:
1. If your answer can be informed by the user's specific document(s), reference them by name.
2. Do NOT invent or guess document details not listed above.
3. Suggest the user review their specific document for exact values if needed.
4. If the question seems to be about one of these documents specifically, note that they can select it via "Document scope" for more detailed answers.`;

          const retainedChunks = await getDocumentIntelligenceChunks({
            userId,
            documentIds: recentDocs.map((d) => d.id),
            maxChunks: 18,
          });
          if (retainedChunks.length > 0) {
            const chunkLines = retainedChunks
              .map((chunk) => `- [doc:${chunk.documentId.slice(0, 8)} chunk:${chunk.chunkIndex}] ${chunk.chunkText}`)
              .join("\n");
            retainedChunkAddendum = `

---
RETAINED DOCUMENT INTELLIGENCE (chunk corpus)
Use these persisted chunks as primary evidence when answering fact-specific questions.
${chunkLines}

RULES:
1. Prefer these retained chunks over high-level summaries when they contain relevant detail.
2. If details conflict across chunks/documents, call out the conflict explicitly.
3. Do not invent text that is not present in the chunks.`;
          }
        }
      }

      // ── System prompt addenda based on intent ────────────────────────────────
      let factModeAddendum = "";

      if (intent === "FACT") {
        const factsText = buildDocumentFactsText(intentUserDocs);
        let retainedFactChunks = "";
        if (userId && intentUserDocs.length > 0) {
          const chunks = await getDocumentIntelligenceChunks({
            userId,
            documentIds: intentUserDocs.map((d) => d.id),
            maxChunks: 14,
          });
          if (chunks.length > 0) {
            retainedFactChunks = chunks
              .map((chunk) => `- [doc:${chunk.documentId.slice(0, 8)} chunk:${chunk.chunkIndex}] ${chunk.chunkText}`)
              .join("\n");
          }
        }
        if (factsText) {
          factModeAddendum = `

---
DIRECT FACT MODE
The user is asking for a specific factual value from a legal document.

EXTRACTED FACTS FROM THE USER'S UPLOADED DOCUMENTS:
${factsText}
${retainedFactChunks ? `\n\nRETAINED CHUNKS FROM STORED DOCUMENT INTELLIGENCE:\n${retainedFactChunks}` : ""}

RULES:
1. Answer with the exact value from the documents above. State which document it came from.
2. If the fact is NOT listed: say "I could not find [fact] in your uploaded documents." Do not invent a value.
3. Court addresses must ONLY come from the document — never from general knowledge.`;
        } else {
          factModeAddendum = `

---
DIRECT FACT MODE
The user is asking for a specific factual value (case number, court name, address, hearing date).
No structured facts were found in their uploaded documents.
Do NOT provide a court name, address, case number, or date from general knowledge.
Explain that you cannot provide this without seeing their documents, and suggest uploading via Document Analysis.`;
        }
      } else if (intent === "ACTION") {
        factModeAddendum = `

---
ACTION GUIDANCE MODE
The user is asking what they should do or how to take a specific action. Focus your response on concrete next steps. Keep steps numbered and clear. Distinguish between actions they can take themselves and actions that require an attorney.`;
      }

      const systemPrompt = buildSystemPrompt(jurisdiction.state) + caseMemoryText + documentContextAddendum + generalDocSummaryAddendum + retainedChunkAddendum + factModeAddendum;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...historyTurns,
          {
            role: "user",
            content: buildUserPrompt({
              state: jurisdiction.state,
              county: jurisdiction.county,
              isUnsupportedState,
              legalContextText,
              userQuestion,
            }),
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1400,
        temperature: 0.4,
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        return res.status(500).json({ error: "No response received from AI service." });
      }

      let parsed_response: unknown;
      try {
        parsed_response = JSON.parse(rawContent);
      } catch {
        return res.status(500).json({ error: "AI returned an invalid response format. Please try again." });
      }

      const validated = aiLegalResponseSchema.safeParse(parsed_response);
      if (!validated.success) {
        console.error("AI response failed schema validation:", validated.error.issues);
        return res.status(500).json({ error: "AI response structure was unexpected. Please try again." });
      }

      // ── Persist messages when using a case conversation ──────────────────────
      if (activeConversationId) {
        // Fire-and-forget — do not let persistence failures block the response
        Promise.all([
          appendConversationMessage(activeConversationId, "user", userQuestion),
          appendConversationMessage(
            activeConversationId,
            "assistant",
            validated.data.summary,
            validated.data as unknown as Record<string, unknown>,
          ),
        ]).catch((err) => console.error("[ask] Failed to persist case messages:", err));
      }

      await trackQuestion(req);
      if (userId) {
        saveQuestion(userId, {
          jurisdictionState: jurisdiction.state,
          jurisdictionCounty: jurisdiction.county,
          questionText: userQuestion,
          responseJson: validated.data as Record<string, unknown>,
        }).catch(() => {});
      }

      // Auto-publish safe questions to the public SEO repository (fire-and-forget).
      maybePublishQuestion({
        state: jurisdiction.state,
        county: jurisdiction.county,
        questionText: userQuestion,
        responseJson: validated.data as Record<string, unknown>,
      }).catch((err) => console.error("[publicQuestions] maybePublishQuestion error:", err));

      // Return the AI response, plus intent (always) and conversationId (when case is active)
      // so the client can apply intent-aware rendering and thread subsequent messages.
      return res.json({
        ...validated.data,
        intent,
        ...(activeConversationId ? { conversationId: activeConversationId } : {}),
      });
    } catch (err: any) {
      console.error("Ask AI error:", err);
      return res.status(500).json({ error: "Failed to get AI response. Please try again." });
    }
  });

  app.post("/api/ask-comparison", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        stateA: z.string().min(1),
        stateB: z.string().min(1),
        userQuestion: z.string().min(3, "Question must be at least 3 characters").max(2000),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.issues.map((i) => i.message) });
      }

      const { stateA, stateB, userQuestion } = parsed.data;

      const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!hasAI) {
        return res.status(503).json({ error: "AI service not configured." });
      }

      const buildLawText = (stateName: string) => {
        const law = getCustodyLaw(stateName);
        if (!law) return `No specific data available for ${stateName}. Use general US family law principles.`;
        return [
          `CUSTODY STANDARD:\n${law.custody_standard}`,
          `CUSTODY TYPES:\n${law.custody_types}`,
          `MODIFICATION RULES:\n${law.modification_rules}`,
          `RELOCATION RULES:\n${law.relocation_rules}`,
          `ENFORCEMENT OPTIONS:\n${law.enforcement_options}`,
          `MEDIATION REQUIREMENTS:\n${law.mediation_requirements}`,
        ].join("\n\n");
      };

      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: buildComparisonSystemPrompt(stateA, stateB) },
          {
            role: "user",
            content: buildComparisonUserPrompt({
              stateA,
              stateB,
              lawAText: buildLawText(stateA),
              lawBText: buildLawText(stateB),
              userQuestion,
            }),
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1600,
        temperature: 0.4,
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) return res.status(500).json({ error: "No response from AI service." });

      let parsed_response: unknown;
      try { parsed_response = JSON.parse(rawContent); } catch {
        return res.status(500).json({ error: "AI returned an invalid response format." });
      }

      const validated = aiLegalResponseSchema.safeParse(parsed_response);
      if (!validated.success) {
        console.error("Comparison AI response failed validation:", validated.error.issues);
        return res.status(500).json({ error: "AI response structure was unexpected." });
      }

      return res.json(validated.data);
    } catch (err: any) {
      console.error("Ask comparison error:", err);
      return res.status(500).json({ error: "Failed to get AI comparison response." });
    }
  });

  app.post("/api/analyze-document", requireAuth, checkDocumentLimit, upload.single("file"), async (req, res) => {
    const filePath = req.file?.path;
    try {
      const hasAI = Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
      const isDocx = req.file?.mimetype === DOCX_MIME;
      const hasDocAI = Boolean(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON &&
        process.env.GOOGLE_PROJECT_ID &&
        process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
      );

      const guard = validateAnalyzeDocumentGuards({
        hasFile: Boolean(req.file),
        mimeType: req.file?.mimetype,
        fileSize: req.file?.size,
        hasAiClient: hasAI,
        isDocx,
        hasDocAiConfig: hasDocAI,
      });

      if (!guard.ok) {
        return res.status(guard.status ?? 400).json({
          error: guard.error,
          code: "DOCUMENT_ANALYSIS_PRECONDITION_FAILED",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "No file uploaded. Please attach a PDF, JPG, or PNG.",
          code: "DOCUMENT_ANALYSIS_PRECONDITION_FAILED",
        });
      }

      if (!SUPPORTED_MIME_TYPES.includes(req.file.mimetype)) {
        return res.status(400).json({
          error: "Unsupported file type. Please upload a PDF, Word document (.docx), JPG, or PNG.",
          code: "DOCUMENT_ANALYSIS_PRECONDITION_FAILED",
        });
      }

      const fileBuffer = readFileSync(filePath!);
      let extractedText: string;
      try {
        extractedText = await extractText(fileBuffer, req.file.mimetype);
      } catch (extractErr: any) {
        console.error("Document extraction error:", extractErr);
        return res.status(422).json({
          error: extractErr.message || "Could not extract text from this document. Please ensure the file is readable and not password-protected.",
        });
      }

      if (extractedText.trim().length < 20) {
        return res.status(422).json({
          error: isDocx
            ? "The Word document appears to be blank or contains only images. Please ensure it contains text content."
            : "The document appears to be blank or could not be read. Please upload a clearer image or a text-based PDF.",
        });
      }

      const truncatedText = extractedText.slice(0, 14000);

      // Read optional metadata sent by the client
      const pageCount = parseInt(req.body?.pageCount ?? "1", 10) || 1;
      const sourceType: string = req.body?.sourceType ?? "unknown";
      const isMultiPage = pageCount > 1;

      const systemPrompt = `You are an assistant that analyzes custody-related legal documents and explains them in plain English.

Rules:
- You are NOT a lawyer. Do not give legal advice.
- Explain legal terms in simple, accessible language.
- Be accurate and thorough in identifying key information.
- Always remind users to consult a licensed family law attorney.
- The document text provided may come from a single PDF, a single scanned image, or multiple scanned pages combined in order. Treat the full text as one complete legal document regardless of how many pages were submitted.
- When analyzing multi-page documents, consider the full context across all pages before generating your response. Important information such as signature blocks, effective dates, and final orders often appear on later pages.
- CRITICAL EXTRACTION RULE: For every field in "extracted_facts", return the exact value as it appears in the document text — copy it verbatim. If a value is not clearly and explicitly stated in the document, return null. NEVER guess, infer, or invent a court name, address, case number, judge name, or date.

You MUST respond with valid JSON in exactly this structure:
{
  "document_type": "The type of legal document (e.g., Custody Order, Parenting Plan, Visitation Agreement, Motion to Modify, etc.)",
  "summary": "A 2-4 sentence plain-English summary of what this document is and what it does",
  "important_terms": [
    "IMPORTANT: Each item in this array MUST be a plain text STRING — never an object or nested JSON.",
    "Format each item as: 'Term or Provision: plain-English explanation of what it means.'",
    "Example: 'Legal Custody: This means the right to make major decisions about the child's upbringing, such as schooling and medical care.'",
    "Include 3-6 items total. Every item must be a single string."
  ],
  "key_dates": ["Each item is a plain text string. Example: 'March 15, 2024 – Order effective date'. Empty array if no dates found."],
  "possible_implications": ["Each item is a plain text string explaining what this document means for the people involved. 3-5 items."],
  "questions_to_ask_attorney": ["Each item is a plain text string — a specific question to ask an attorney. 3-5 items."],
  "extracted_facts": {
    "document_title": "The exact title of this document as it appears at the top or heading — null if not clearly stated",
    "court_name": "The full court name exactly as written in the document header or caption (e.g., 'Superior Court of the State of California, County of Los Angeles') — null if not found",
    "court_address": "The full street address of the court as written in the document — null if not found",
    "case_number": "The case or docket number exactly as written (e.g., '24-DR-00123') — null if not found",
    "judge_name": "The judge's or commissioner's name exactly as written — null if not found",
    "hearing_date": "The specific hearing or court date exactly as written (e.g., 'April 15, 2024 at 9:00 AM') — null if not found",
    "filing_party": "The name of the petitioner or filing party exactly as written — null if not found",
    "opposing_party": "The name of the respondent or opposing party exactly as written — null if not found"
  }
}

CRITICAL RULES:
1. Every array value must be a plain string. Do NOT use nested objects inside arrays.
2. In extracted_facts, return verbatim text from the document or null — never guess or invent values.
3. If court_address is not printed in the document, return null even if you know the court's real address.`;

      const pageNote = isMultiPage
        ? `\n\nNote: This text was extracted from a ${pageCount}-page document (source: ${sourceType}). The pages have been combined in their original order. Analyze the full text as one complete document.`
        : "";

      const userPrompt = `Analyze the following custody document text:${pageNote}\n\n${truncatedText}`;

      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.3,
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        return res.status(500).json({ error: "No response received from AI service." });
      }

      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(rawContent);
      } catch {
        return res.status(500).json({ error: "AI returned an invalid response format. Please try again." });
      }

      parsedResponse = normalizeDocumentAnalysisPayload(parsedResponse);

      const validated = documentAnalysisResultSchema.safeParse(parsedResponse);
      if (!validated.success) {
        console.error("Document AI response validation error:", validated.error);
        return res.status(500).json({ error: "AI response structure was unexpected. Please try again." });
      }

      // Save document + optionally populate case_facts if a caseId was provided.
      const docUserId = (req as any).user?.id as string | undefined;
      const requestedCaseId: string | undefined = req.body?.caseId || undefined;
      let docCaseId: string | undefined = requestedCaseId;
      let assignmentDecision: {
        status: "assigned" | "suggested" | "unassigned";
        assignedCaseId: string | null;
        suggestedCaseId: string | null;
        confidenceScore: number | null;
        reason: string;
        autoAssigned: boolean;
      } | null = null;

      if (docUserId && !requestedCaseId) {
        const userCases = await listCases(docUserId);
        if (userCases.length === 0) {
          const extractedFacts = (validated.data.extracted_facts ?? {}) as Record<string, unknown>;
          const newTitle =
            (typeof extractedFacts.case_number === "string" && extractedFacts.case_number.trim())
            || (typeof validated.data.document_type === "string" && validated.data.document_type.trim())
            || "My First Case";
          const stateCodeForAutoCase =
            resolveUSStateCode(typeof req.body?.stateCode === "string" ? req.body.stateCode : null)
            ?? resolveUSStateCode(typeof req.body?.jurisdictionState === "string" ? req.body.jurisdictionState : null)
            ?? "US";
          const created = await createCase(docUserId, {
            title: newTitle.slice(0, 120),
            caseType: "custody",
            stateCode: stateCodeForAutoCase,
          });
          if (created) {
            docCaseId = created.id;
            assignmentDecision = {
              status: "assigned",
              assignedCaseId: created.id,
              suggestedCaseId: null,
              confidenceScore: 100,
              reason: "auto_created_first_case",
              autoAssigned: true,
            };
          }
        } else if (userCases.length === 1) {
          docCaseId = userCases[0].id;
          assignmentDecision = {
            status: "assigned",
            assignedCaseId: userCases[0].id,
            suggestedCaseId: null,
            confidenceScore: 100,
            reason: "single_case_default",
            autoAssigned: true,
          };
        } else {
          const extractedFacts = (validated.data.extracted_facts ?? {}) as Record<string, unknown>;
          const candidates: AssignmentCandidate[] = await Promise.all(
            userCases.map(async (caseRecord) => ({
              caseRecord,
              priorDocuments: await getDocumentsByCase(caseRecord.id, docUserId),
            })),
          );
          const signals = {
            caseNumber: typeof extractedFacts.case_number === "string" ? extractedFacts.case_number : null,
            courtName: typeof extractedFacts.court_name === "string" ? extractedFacts.court_name : null,
            filingParty: typeof extractedFacts.filing_party === "string" ? extractedFacts.filing_party : null,
            opposingParty: typeof extractedFacts.opposing_party === "string" ? extractedFacts.opposing_party : null,
            jurisdictionState: typeof req.body?.jurisdictionState === "string" ? req.body.jurisdictionState : null,
          };
          assignmentDecision = decideCaseAssignment(signals, candidates);
          if (assignmentDecision.status === "assigned" && assignmentDecision.assignedCaseId) {
            docCaseId = assignmentDecision.assignedCaseId;
          } else {
            docCaseId = undefined;
          }
        }
      } else if (requestedCaseId) {
        assignmentDecision = {
          status: "assigned",
          assignedCaseId: requestedCaseId,
          suggestedCaseId: null,
          confidenceScore: 100,
          reason: "user_selected_case",
          autoAssigned: false,
        };
      }

      let savedDocumentId: string | null = null;
      let duplicateUpload = false;
      let duplicateMessage: string | null = null;

      if (docUserId && req.file) {
        const pageCount = parseInt(String(req.body?.pageCount ?? "1"), 10) || 1;
        const documentName = req.file.originalname || "document";
        const retentionTier = resolveRetentionTierFromRequest(req);
        const retentionWindow = buildRetentionWindow(retentionTier);
        const sourceFileSha256 = createHash("sha256")
          .update(readFileSync(req.file.path))
          .digest("hex");
        const analysisWithSourceHash = {
          ...(validated.data as Record<string, unknown>),
          analysis_status: "analyzed",
          source_file_sha256: sourceFileSha256,
          case_assignment: assignmentDecision
            ? {
              status: assignmentDecision.status,
              suggested_case_id: assignmentDecision.suggestedCaseId,
              confidence_score: assignmentDecision.confidenceScore,
              reason: assignmentDecision.reason,
              auto_assigned: assignmentDecision.autoAssigned,
            }
            : undefined,
        };

        // Await the save so we can return the document ID and use it for case_facts population.
        const duplicateDoc = await findDuplicateDocument(docUserId, {
          fileHash: sourceFileSha256,
        });

        const savedDoc = duplicateDoc ?? await saveDocument(docUserId, {
          fileName: documentName,
          storagePath: null,
          caseId: docCaseId ?? null,
          sourceFileSha256,
          retentionTier,
          originalExpiresAt: retentionWindow.originalExpiresAt,
          intelligenceExpiresAt: retentionWindow.intelligenceExpiresAt,
          lifecycleState: "active",
          mimeType: req.file.mimetype,
          pageCount,
          analysisJson: analysisWithSourceHash,
          extractedText: truncatedText,
          docType: "other",
        }).catch(() => null);

        if (savedDoc) {
          const isDuplicateUpload = Boolean(duplicateDoc);
          duplicateUpload = isDuplicateUpload;
          const uploadOutcome = buildDocumentUploadOutcome({
            fileName: documentName,
            isDuplicate: isDuplicateUpload,
          });
          duplicateMessage = uploadOutcome.userMessage;

          const associationPlan = planUploadAssociation({
            canonicalDocumentId: duplicateDoc?.id ?? null,
            existingCaseIds: duplicateDoc
              ? await getDocumentCaseIds(duplicateDoc.id, docUserId)
              : [],
            requestedCaseId: docCaseId ?? null,
          });

          if (docCaseId && associationPlan.linkToRequestedCase) {
            await ensureDocumentCaseAssociation(savedDoc.id, docCaseId, docUserId).catch(() => false);
          }
          if (duplicateDoc) {
            const updated = await updateDocumentAnalysis(savedDoc.id, docUserId, analysisWithSourceHash).catch(() => false);
            if (!updated) {
              console.error("[analyze-document] duplicate analysis update failed");
              return res.status(500).json({
                error: "Document analysis completed, but we could not persist this upload. Please retry.",
                code: "DOCUMENT_PERSISTENCE_FAILED",
              });
            }
          }

          const analysisRunId = await createAnalysisRun({
            documentId: savedDoc.id,
            userId: docUserId,
            caseId: docCaseId ?? null,
            modelName: "gpt-4o",
            promptVersion: "document-analysis-v2",
            analysisJson: analysisWithSourceHash,
            extractedText: truncatedText,
            retentionTier,
            expiresAt: retentionWindow.intelligenceExpiresAt,
          });
          if (analysisRunId) {
            const chunkRows = buildChunks(truncatedText).map((chunk) => ({
              ...chunk,
              documentId: savedDoc.id,
              userId: docUserId,
              caseId: docCaseId ?? null,
              retentionTier,
              expiresAt: retentionWindow.intelligenceExpiresAt,
            }));
            await replaceDocumentChunks(chunkRows);

            const extractedFacts = (validated.data.extracted_facts ?? {}) as Record<string, unknown>;
            await replaceDocumentFacts({
              documentId: savedDoc.id,
              userId: docUserId,
              caseId: docCaseId ?? null,
              extractedFacts,
              retentionTier,
              expiresAt: retentionWindow.intelligenceExpiresAt,
            });
            await replaceDocumentDates({
              documentId: savedDoc.id,
              userId: docUserId,
              caseId: docCaseId ?? null,
              keyDates: Array.isArray(validated.data.key_dates) ? validated.data.key_dates : [],
              retentionTier,
              expiresAt: retentionWindow.intelligenceExpiresAt,
            });
          }
          savedDocumentId = savedDoc.id;

          if (uploadOutcome.shouldTrackUsage) {
            await trackDocument(req);
          }

          // Legacy timeline logging disabled for analyze uploads.
          // Workspace activity now uses canonical document records as source of truth.

          // If the request was tied to a case, upsert extracted_facts into case_facts,
          // then trigger deterministic action generation (fire-and-forget).
          if (docCaseId && validated.data.extracted_facts) {
            const factsDict = validated.data.extracted_facts as Record<string, string | null>;
            const docType = validated.data.document_type as string | null | undefined;
            upsertFactsFromDocument(
              docCaseId, docUserId, savedDoc.id, documentName, factsDict, docType,
            ).then(() => {
              const merged: Record<string, string | null | undefined> = { ...factsDict };
              if (docType) merged.document_type = docType;
              return generateActionsFromFacts(docCaseId, docUserId!, merged);
            }).catch((err) => console.error("[analyze-document] post-upsert action generation error:", err));
          }
        }
      }

      if (docUserId && req.file && !savedDocumentId) {
        console.error("[analyze-document] persistence failure: analysis succeeded but document row was not saved");
        return res.status(500).json({
          error: "Document analysis completed, but we could not persist this upload. Please retry.",
          code: "DOCUMENT_PERSISTENCE_FAILED",
        });
      }

      return res.json({
        ...validated.data,
        extractedText: truncatedText,
        documentId: savedDocumentId,
        caseAssignment: assignmentDecision ?? {
          status: docCaseId ? "assigned" : "unassigned",
          assignedCaseId: docCaseId ?? null,
          suggestedCaseId: null,
          confidenceScore: null,
          reason: docCaseId ? "requested_case" : "no_case_match",
          autoAssigned: false,
        },
        dedupe: {
          isDuplicate: duplicateUpload,
          message: duplicateMessage,
        },
      });
    } catch (err: any) {
      const docUserId = (req as any).user?.id as string | undefined;
      const docCaseId: string | undefined = req.body?.caseId || undefined;
      if (docUserId && req.file) {
        const pageCount = parseInt(String(req.body?.pageCount ?? "1"), 10) || 1;
        const retentionTier = resolveRetentionTierFromRequest(req);
        const retentionWindow = buildRetentionWindow(retentionTier);
        await saveDocument(docUserId, {
          fileName: req.file.originalname || "document",
          storagePath: null,
          caseId: docCaseId ?? null,
          sourceFileSha256: null,
          retentionTier,
          originalExpiresAt: retentionWindow.originalExpiresAt,
          intelligenceExpiresAt: retentionWindow.intelligenceExpiresAt,
          lifecycleState: "active",
          mimeType: req.file.mimetype,
          pageCount,
          analysisJson: {
            analysis_status: "failed",
            error: getSafeErrorMessage(err, "Document analysis failed"),
          },
          extractedText: "",
          docType: "other",
        }).catch(() => null);
      }
      console.error("Document analysis error:", err);
      return res.status(500).json({
        error: "We couldn't analyze that document right now. Please try again.",
        details: getSafeErrorMessage(err, "Failed to analyze document. Please try again."),
        code: "DOCUMENT_ANALYSIS_FAILED",
      });
    } finally {
      if (filePath) {
        try { unlinkSync(filePath); } catch {}
      }
    }
  });

  // ── Document Follow-up Q&A ─────────────────────────────────────────────────
  app.post("/api/ask-document", requireAuth, async (req, res) => {
    try {
      const parsed = documentQARequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parsed.error.issues.map((i) => i.message),
        });
      }

      const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!hasAI) {
        return res.status(503).json({ error: "AI service not configured." });
      }

      const { documentAnalysis, extractedText, jurisdiction, userQuestion, history } = parsed.data;

      const jurisdictionLine = jurisdiction?.state
        ? `The user is located in ${jurisdiction.state}${jurisdiction.county ? `, ${jurisdiction.county} County` : ""}${jurisdiction.country ? `, ${jurisdiction.country}` : ""}.`
        : "No specific jurisdiction was provided.";

      const extractedFactsBlock = buildExtractedFactsBlock(documentAnalysis);

      // Detect if this is a direct fact question so we can sharpen the answer posture
      const docFactQuestion = classifyDocumentQuestion(userQuestion) === "fact";

      const systemPrompt = `You are a child custody legal information assistant helping users understand a custody-related document they have uploaded.

READING LEVEL:
Write at an 8th-to-10th grade level. Use short sentences and plain everyday words. Avoid legal jargon; if you must use a legal term, explain it in parentheses right away.

ROLE:
- You are NOT a lawyer. Do not give specific legal advice.
- Answer the user's question using the document summary and extracted text as your primary source.
- If the answer is not clearly supported by the document, say so directly ("The document does not specifically address this").
- Use the user's jurisdiction if provided, but focus primarily on the document's content.
- Be concise, accurate, and compassionate.
- Always end with a short disclaimer encouraging verification with a licensed attorney.
${docFactQuestion ? `
FACT QUESTION RULES (this user is asking for a specific value):
- Check the KNOWN FACTS section first. If the value is listed there, state it directly and exactly at the start of your answer.
- State which part of the document it came from (e.g., "According to the case caption in this document...").
- If the fact is NOT found in the document or known facts: say clearly "This document does not state [fact]." Do not guess.
- Never provide a court address or case number from general knowledge.` : ""}

OUTPUT FORMAT:
Respond with valid JSON matching exactly this structure — no markdown fences:
{
  "answer": "2-4 sentences directly answering the question based on the document. Write in plain English.",
  "keyPoints": ["2-4 short bullet points from the document relevant to the answer. Each is a plain string."],
  "documentReferences": ["1-3 specific parts of the document that support the answer, quoted or paraphrased. Each is a plain string. Empty array if none found."],
  "questionsToAskAttorney": ["2-3 specific follow-up questions the user should ask a licensed attorney. Each is a plain string."],
  "caution": "One sentence about something to be careful about regarding this question.",
  "disclaimer": "One short friendly sentence reminding the user this is educational information, not legal advice."
}`;

      const analysisContext = `DOCUMENT TYPE: ${documentAnalysis.document_type}
SUMMARY: ${documentAnalysis.summary}
IMPORTANT TERMS: ${documentAnalysis.important_terms.join(" | ")}
KEY DATES: ${documentAnalysis.key_dates.join(" | ") || "None identified"}
POSSIBLE IMPLICATIONS: ${documentAnalysis.possible_implications.join(" | ")}
${extractedFactsBlock ? `\n${extractedFactsBlock}` : ""}`;

      const rawTextContext = extractedText
        ? `\n\nEXTRACTED DOCUMENT TEXT (first 6000 characters):\n${extractedText.slice(0, 6000)}`
        : "";

      const userPrompt = `${jurisdictionLine}

DOCUMENT ANALYSIS:
${analysisContext}${rawTextContext}

USER QUESTION:
${userQuestion}`;

      // Inject prior Q&A turns so the AI can follow the conversation thread.
      const docHistoryTurns = (history ?? [])
        .slice(-16)
        .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));

      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...docHistoryTurns,
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
        temperature: 0.3,
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        return res.status(500).json({ error: "No response received from AI service." });
      }

      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(rawContent);
      } catch {
        return res.status(500).json({ error: "AI returned an invalid response format. Please try again." });
      }

      const validated = documentQAResponseSchema.safeParse(parsedResponse);
      if (!validated.success) {
        console.error("Document Q&A response validation error:", validated.error);
        return res.status(500).json({ error: "AI response structure was unexpected. Please try again." });
      }

      return res.json(validated.data);
    } catch (err: any) {
      console.error("Document Q&A error:", err);
      return res.status(500).json({
        error: "We couldn't answer that document question right now. Please try again.",
        details: getSafeErrorMessage(err, "Failed to get answer. Please try again."),
        code: "DOCUMENT_QA_FAILED",
      });
    }
  });

  /* ── Speech-to-Text: Whisper transcription ────────────────────────────── */

  /**
   * POST /api/transcribe
   * Accepts a multipart audio file, transcribes it with OpenAI Whisper,
   * and returns { text: string }.
   * Requires authentication (Bearer token).
   */
  app.post("/api/transcribe", requireAuth, audioUpload.single("audio"), async (req, res) => {
    let tmpPath: string | null = null;
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file received." });
      }

      const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!hasAI) {
        return res.status(503).json({ error: "AI service not configured." });
      }

      // Write buffer to a temp file so OpenAI SDK can read it as a stream
      const ext = req.file.originalname?.split(".").pop() || "webm";
      tmpPath = join(tmpdir(), `audio-${Date.now()}.${ext}`);
      writeFileSync(tmpPath, req.file.buffer);

      const openai = getOpenAIDirectClient();
      const { createReadStream } = await import("fs");
      const audioStream = createReadStream(tmpPath) as any;
      // Attach filename so OpenAI can infer the format
      audioStream.path = tmpPath;

      const transcription = await openai.audio.transcriptions.create({
        file: audioStream,
        model: "whisper-1",
        response_format: "json",
      });

      return res.json({ text: transcription.text });
    } catch (err: any) {
      console.error("[transcribe] error:", err);
      return res.status(500).json({ error: err.message || "Transcription failed. Please try again." });
    } finally {
      if (tmpPath) {
        try { unlinkSync(tmpPath); } catch {}
      }
    }
  });

  /* ── Text-to-Speech ────────────────────────────────────────────────────── */

  /**
   * POST /api/tts
   * Accepts { text: string, voice?: "marin" | "cedar" | "alloy" }.
   * Calls OpenAI TTS and streams back audio/mpeg.
   * Voice names are mapped server-side to real OpenAI voice identifiers.
   * Requires authentication.
   */
  app.post("/api/tts", requireAuth, async (req, res) => {
    try {
      const { text, voice: rawVoice = "marin" } = req.body;

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ error: "text is required." });
      }
      if (text.length > 4096) {
        return res.status(400).json({ error: "Text is too long for TTS (max 4096 characters)." });
      }

      const voiceKey = typeof rawVoice === "string" ? rawVoice.toLowerCase() : "marin";
      if (!ALLOWED_TTS_VOICES.has(voiceKey)) {
        return res.status(400).json({ error: `Invalid voice. Choose: ${Array.from(ALLOWED_TTS_VOICES).join(", ")}.` });
      }

      const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!hasAI) {
        return res.status(503).json({ error: "AI service not configured." });
      }

      const openaiVoice = TTS_VOICE_MAP[voiceKey];
      const openai = getOpenAIDirectClient();

      const speechResponse = await openai.audio.speech.create({
        model: "tts-1",
        voice: openaiVoice as any,
        input: text.trim(),
        response_format: "mp3",
      });

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");

      const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
      return res.send(audioBuffer);
    } catch (err: any) {
      console.error("[tts] error:", err);
      return res.status(500).json({ error: err.message || "Text-to-speech failed. Please try again." });
    }
  });

  /* ── Public Q&A SEO routes (no auth required) ─────────────────────────── */

  /**
   * GET /api/public-questions/:stateSlug
   * Returns up to 20 public questions for a given state.
   * Optional query param: ?topic=child-support
   */
  app.get("/api/public-questions/:stateSlug", async (req, res) => {
    try {
      const { stateSlug } = req.params;
      const topic = typeof req.query.topic === "string" ? req.query.topic : undefined;
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const questions = await getPublicQuestionsByState(stateSlug, topic, limit);
      return res.json({ questions, topicLabels: TOPIC_LABELS });
    } catch (err) {
      console.error("[public-questions] list error:", err);
      return res.status(500).json({ error: "Failed to fetch public questions." });
    }
  });

  /**
   * GET /api/public-questions/:stateSlug/:topic/:slug
   * Returns a single public Q&A page and related questions from same state/topic.
   */
  app.get("/api/public-questions/:stateSlug/:topic/:slug", async (req, res) => {
    try {
      const { stateSlug, topic, slug } = req.params;
      const question = await getPublicQuestionBySlug(stateSlug, topic, slug);
      if (!question) return res.status(404).json({ error: "Question not found." });
      const related = await getRelatedQuestions(stateSlug, topic, slug, 4);
      return res.json({ question, related, topicLabels: TOPIC_LABELS });
    } catch (err) {
      console.error("[public-questions] detail error:", err);
      return res.status(500).json({ error: "Failed to fetch question." });
    }
  });

  /* ── Case Workspace ─────────────────────────────────────────────────────── */

  /**
   * GET /api/workspace
   * Returns the authenticated user's recent threads and documents.
   */
  app.get("/api/workspace", requireAuth, async (req, res) => {
    const user = (req as any).user;
    try {
      const [threads, rawDocuments, timelineEvents] = await Promise.all([
        listThreads(user.id, 10),
        getDocuments(user.id),
        listTimelineEvents(user.id),
      ]);
      // Strip internal fields (storagePath, extractedText) from workspace response;
      // expose hasStoragePath flag so the UI can show a broken-file indicator.
      const documents = rawDocuments.map(({ storagePath, extractedText, ...safe }) => {
        const integrity = getDocumentIntegrity(safe);
        const caseAssignment = getDocumentCaseAssignmentView(safe);
        return {
          ...safe,
          caseAssignment,
          hasStoragePath: !!storagePath,
          isAnalysisAvailable: integrity.isAnalysisAvailable,
          analysisStatus: integrity.analysisStatus,
          integrityIssue: integrity.integrityIssue,
        };
      });
      console.info("[trace][workspace-api] documents", documents.map((d) => ({
        id: d.id,
        isAnalysisAvailable: d.isAnalysisAvailable,
        analysisStatus: d.analysisStatus,
      })));
      return res.json({ threads, documents, timelineEvents });
    } catch (err) {
      console.error("[workspace] GET error:", err);
      return res.status(500).json({ error: "Failed to load workspace." });
    }
  });

  /**
   * POST /api/threads
   * Create a new conversation thread. Returns { threadId }.
   */
  app.post("/api/threads", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const schema = z.object({
      threadType: z.enum(["general", "document", "comparison"]).default("general"),
      jurisdictionState: z.string().optional(),
      jurisdictionCounty: z.string().optional(),
      documentId: z.string().uuid().optional(),
      title: z.string().max(200).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid thread payload." });
    }
    try {
      const thread = await createThread(user.id, parsed.data);
      if (!thread) return res.status(503).json({ error: "Thread storage unavailable." });
      return res.status(201).json({ threadId: thread.id, thread });
    } catch (err) {
      console.error("[threads] POST error:", err);
      return res.status(500).json({ error: "Failed to create thread." });
    }
  });

  /**
   * POST /api/threads/:threadId/messages
   * Append a message (user or assistant) to an existing thread.
   */
  app.post("/api/threads/:threadId/messages", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { threadId } = req.params;

    // Verify thread ownership before appending
    const thread = await getThread(threadId, user.id);
    if (!thread) return res.status(404).json({ error: "Thread not found." });

    const schema = z.object({
      role: z.enum(["user", "assistant"]),
      messageText: z.string().min(1).max(10000),
      structuredResponseJson: z.record(z.unknown()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid message payload." });
    }
    try {
      const message = await appendMessage(
        threadId,
        parsed.data.role,
        parsed.data.messageText,
        parsed.data.structuredResponseJson,
      );
      if (!message) return res.status(503).json({ error: "Message storage unavailable." });
      return res.status(201).json({ message });
    } catch (err) {
      console.error("[threads] POST message error:", err);
      return res.status(500).json({ error: "Failed to save message." });
    }
  });

  /**
   * GET /api/threads/:threadId
   * Load a thread and its messages for conversation resume.
   */
  app.get("/api/threads/:threadId", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { threadId } = req.params;
    try {
      const [thread, messages] = await Promise.all([
        getThread(threadId, user.id),
        getRecentMessages(threadId, 50),
      ]);
      if (!thread) return res.status(404).json({ error: "Thread not found." });
      return res.json({ thread, messages });
    } catch (err) {
      console.error("[threads] GET error:", err);
      return res.status(500).json({ error: "Failed to load thread." });
    }
  });

  /* ── Case Timeline ───────────────────────────────────────────────────────── */

  /**
   * GET /api/timeline
   * Returns the authenticated user's timeline events ordered by event date.
   */
  app.get("/api/timeline", requireAuth, async (req, res) => {
    const user = (req as any).user;
    try {
      const events = await listTimelineEvents(user.id);
      return res.json({ events });
    } catch (err) {
      console.error("[timeline] GET error:", err);
      return res.status(500).json({ error: "Failed to load timeline." });
    }
  });

  /**
   * POST /api/timeline
   * Create a new timeline event. Body: { eventDate, description }.
   */
  app.post("/api/timeline", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const schema = z.object({
      eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "eventDate must be YYYY-MM-DD"),
      description: z.string().min(1).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid timeline event payload.", details: parsed.error.flatten() });
    }
    try {
      const event = await createTimelineEventIfNotRecentDuplicate(user.id, parsed.data);
      if (!event) return res.status(503).json({ error: "Timeline storage unavailable." });
      return res.status(201).json({ event });
    } catch (err) {
      console.error("[timeline] POST error:", err);
      return res.status(500).json({ error: "Failed to create timeline event." });
    }
  });

  /**
   * DELETE /api/timeline/:eventId
   * Delete a timeline event owned by the current user.
   */
  app.delete("/api/timeline/:eventId", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { eventId } = req.params;
    try {
      await deleteTimelineEvent(eventId, user.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[timeline] DELETE error:", err);
      return res.status(500).json({ error: "Failed to delete timeline event." });
    }
  });

  /* ── Document type labeling ──────────────────────────────────────────────── */

  /**
   * PATCH /api/documents/:documentId/type
   * Update the document type label. Body: { docType }.
   */

  /**
   * GET /api/documents
   * Return the authenticated user's recent documents (lightweight — no extractedText).
   * Used by the Ask Atlas document picker to let users scope a question to a document.
   */
  app.get("/api/documents", requireAuth, async (req, res) => {
    const user = (req as any).user;
    try {
      const rawDocs = await getDocuments(user.id);
      const documents = rawDocs.map(({ extractedText, storagePath, ...safe }) => {
        const integrity = getDocumentIntegrity(safe);
        const caseAssignment = getDocumentCaseAssignmentView(safe);
        return {
          ...safe,
          caseAssignment,
          hasStoragePath: !!storagePath,
          isAnalysisAvailable: integrity.isAnalysisAvailable,
          analysisStatus: integrity.analysisStatus,
          integrityIssue: integrity.integrityIssue,
          // Include a short summary snippet for the picker label
          summary: ((safe.analysisJson as any)?.summary as string | undefined)?.slice(0, 120) ?? null,
        };
      });
      return res.json({ documents });
    } catch (err) {
      console.error("[documents] GET list error:", err);
      return res.status(500).json({ error: "Failed to load documents." });
    }
  });

  /**
   * POST /api/documents/:documentId/reanalyze
   * Re-run AI analysis on an already-uploaded document using its stored extracted text.
   * Updates the existing document row — does NOT create a duplicate record.
   */
  app.post("/api/documents/:documentId/reanalyze", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { documentId } = req.params;
    try {
      const doc = await getDocumentById(documentId, user.id);
      if (!doc) return res.status(404).json({ error: "Document not found." });

      const truncatedText = doc.extractedText.slice(0, 14000);
      if (truncatedText.trim().length < 20) {
        return res.status(422).json({ error: "This document has no stored text to re-analyze." });
      }

      const systemPrompt = `You are an assistant that analyzes custody-related legal documents and explains them in plain English.

Rules:
- You are NOT a lawyer. Do not give legal advice.
- Explain legal terms in simple, accessible language.
- Be accurate and thorough in identifying key information.
- Always remind users to consult a licensed family law attorney.
- CRITICAL EXTRACTION RULE: For every field in "extracted_facts", return the exact value as it appears in the document text — copy it verbatim. If a value is not clearly and explicitly stated in the document, return null. NEVER guess, infer, or invent a court name, address, case number, judge name, or date.

You MUST respond with valid JSON in exactly this structure:
{
  "document_type": "The type of legal document (e.g., Custody Order, Parenting Plan, Visitation Agreement, Motion to Modify, etc.)",
  "summary": "A 2-4 sentence plain-English summary of what this document is and what it does",
  "important_terms": ["Format each item as: 'Term or Provision: plain-English explanation.' Include 3-6 items. Every item must be a single string."],
  "key_dates": ["Each item is a plain text string. Example: 'March 15, 2024 – Order effective date'. Empty array if no dates found."],
  "possible_implications": ["Each item is a plain text string explaining what this document means for the people involved. 3-5 items."],
  "questions_to_ask_attorney": ["Each item is a plain text string — a specific question to ask an attorney. 3-5 items."],
  "extracted_facts": {
    "document_title": "null if not clearly stated",
    "court_name": "null if not found",
    "court_address": "null if not found",
    "case_number": "null if not found",
    "judge_name": "null if not found",
    "hearing_date": "null if not found",
    "filing_party": "null if not found",
    "opposing_party": "null if not found"
  }
}

CRITICAL RULES:
1. Every array value must be a plain string. Do NOT use nested objects inside arrays.
2. In extracted_facts, return verbatim text from the document or null — never guess or invent values.`;

      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Re-analyze the following custody document text:\n\n${truncatedText}` },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.3,
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        return res.status(500).json({ error: "No response from AI service." });
      }

      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(rawContent);
      } catch {
        return res.status(500).json({ error: "AI returned an invalid response format. Please try again." });
      }

      parsedResponse = normalizeDocumentAnalysisPayload(parsedResponse);

      const validated = documentAnalysisResultSchema.safeParse(parsedResponse);
      if (!validated.success) {
        return res.status(500).json({ error: "AI response structure was unexpected. Please try again." });
      }

      const analysisPayload = {
        ...(validated.data as Record<string, unknown>),
        analysis_status: "analyzed",
      };
      // Update the existing document row — no new row created
      const updated = await updateDocumentAnalysis(documentId, user.id, analysisPayload).catch(() => false);
      if (!updated) {
        return res.status(500).json({
          error: "Re-analysis finished, but we could not persist the result. Please try again.",
          code: "DOCUMENT_PERSISTENCE_FAILED",
        });
      }

      return res.json({ ...validated.data, extractedText: truncatedText, documentId });
    } catch (err: any) {
      console.error("[reanalyze] error:", err);
      return res.status(500).json({
        error: "We couldn't re-analyze that document right now. Please try again.",
        details: getSafeErrorMessage(err, "Failed to re-analyze document. Please try again."),
        code: "DOCUMENT_REANALYSIS_FAILED",
      });
    }
  });

  /**
   * GET /api/documents/:documentId
   * Return a single document's metadata (id, fileName, docType, analysisJson,
   * createdAt) for the authenticated user.  Ownership enforced server-side.
   * Used by AskAIPage to display the document scope indicator.
   */
  app.get("/api/documents/:documentId", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { documentId } = req.params;
    try {
      console.info(`[documents] detail request user=${user.id} documentId=${documentId}`);
      const doc = await getDocumentById(documentId, user.id);
      if (!doc) return res.status(404).json({ error: "Document not found." });
      const integrity = getDocumentIntegrity(doc);
      if (!integrity.isAnalysisAvailable) {
        console.warn("[documents] detail missing-analysis", {
          requestedDocumentId: documentId,
          row: {
            id: doc.id,
            userId: doc.userId,
            caseId: doc.caseId,
            analysisJson: doc.analysisJson,
            fileName: doc.fileName,
            mimeType: doc.mimeType,
            pageCount: doc.pageCount,
            storagePath: doc.storagePath,
            createdAt: doc.createdAt,
          },
          integrity,
        });
      }
      // Return a safe subset — no extractedText (large, not needed by the client here)
      const payload = {
        document: {
          id: doc.id,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          docType: doc.docType,
          pageCount: doc.pageCount,
          caseId: doc.caseId,
          caseAssignment: getDocumentCaseAssignmentView(doc),
          analysisJson: doc.analysisJson,
          createdAt: doc.createdAt,
          // Boolean only — never expose raw storage_path to client
          hasStoragePath: !!doc.storagePath,
          isAnalysisAvailable: integrity.isAnalysisAvailable,
          analysisStatus: integrity.analysisStatus,
          integrityIssue: integrity.integrityIssue,
        },
      };
      console.info(
        `[documents] detail response user=${user.id} requested=${documentId} returned=${payload.document.id} analysisAvailable=${payload.document.isAnalysisAvailable}`,
      );
      return res.json(payload);
    } catch (err) {
      console.error("[documents] GET single error:", err);
      return res.status(500).json({ error: "Failed to load document." });
    }
  });

  /**
   * GET /api/documents/:documentId/view
   * Returns a short-lived (90s) signed URL suitable for opening the file in-browser.
   *
   * Security:
   *   - requireAuth: user must be authenticated
   *   - createDocumentSignedUrl: re-verifies ownership server-side via user_id filter
   *   - Raw storage_path is never returned; only the opaque signed URL is sent
   *   - Signed URL expires in 90 seconds; no permanent access is granted
   */
  app.get("/api/documents/:documentId/view", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { documentId } = req.params;
    try {
      const result = await createDocumentSignedUrl(documentId, user.id, "view");
      if (!result) {
        return res.status(404).json({
          error: "File not available. The original may not have been stored, or it may have been removed.",
        });
      }
      return res.json({
        signedUrl: result.signedUrl,
        expiresInSeconds: result.expiresInSeconds,
        fileName: result.fileName,
        mimeType: result.mimeType,
      });
    } catch (err) {
      console.error(`[documents] view route error doc=${documentId}:`, err);
      return res.status(500).json({ error: "Failed to generate file access URL." });
    }
  });

  /**
   * GET /api/documents/:documentId/download
   * Returns a short-lived (90s) signed URL with Content-Disposition: attachment
   * so the browser triggers a Save dialog rather than an in-tab preview.
   *
   * Security model identical to /view above.
   */
  app.get("/api/documents/:documentId/download", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { documentId } = req.params;
    try {
      const result = await createDocumentSignedUrl(documentId, user.id, "download");
      if (!result) {
        return res.status(404).json({
          error: "File not available. The original may not have been stored, or it may have been removed.",
        });
      }
      return res.json({
        signedUrl: result.signedUrl,
        expiresInSeconds: result.expiresInSeconds,
        fileName: result.fileName,
        mimeType: result.mimeType,
      });
    } catch (err) {
      console.error(`[documents] download route error doc=${documentId}:`, err);
      return res.status(500).json({ error: "Failed to generate download URL." });
    }
  });

  app.patch("/api/documents/:documentId/type", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { documentId } = req.params;
    const schema = z.object({
      docType: z.enum(["custody_order", "communication", "financial", "other"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid docType." });
    }
    try {
      const ok = await updateDocumentType(documentId, user.id, parsed.data.docType as DocumentType);
      if (!ok) return res.status(404).json({ error: "Document not found or update failed." });
      return res.json({ ok: true });
    } catch (err) {
      console.error("[documents] PATCH type error:", err);
      return res.status(500).json({ error: "Failed to update document type." });
    }
  });

  async function patchDocumentCaseAssignment(req: any, res: any) {
    const user = (req as any).user;
    const { documentId } = req.params;
    const schema = z.object({
      caseId: z.string().uuid().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid case assignment payload." });
    }
    try {
      if (parsed.data.caseId) {
        const caseRecord = await getCaseById(parsed.data.caseId, user.id);
        if (!caseRecord) {
          return res.status(404).json({ error: "Case not found." });
        }
      }
      const ok = await setDocumentCaseAssignment(documentId, user.id, parsed.data.caseId);
      if (!ok) return res.status(404).json({ error: "Document not found or update failed." });
      return res.json({ ok: true });
    } catch (err) {
      console.error("[documents] PATCH case-assignment error:", err);
      return res.status(500).json({ error: "Failed to update document case assignment." });
    }
  }

  app.patch("/api/documents/:documentId/case-assignment", requireAuth, patchDocumentCaseAssignment);
  app.patch("/api/documents/:documentId", requireAuth, patchDocumentCaseAssignment);

  /**
   * DELETE /api/documents/:documentId
   *
   * Hard-deletes a document: removes the original file from Supabase Storage
   * and then deletes the DB row (including analysis_json and extracted_text).
   *
   * Security:
   *   - requireAuth: session required; unauthenticated requests rejected
   *   - deleteDocument(): ownership enforced with WHERE user_id = :userId
   *   - Cross-user deletion impossible: returns 404 for documents owned by others
   *
   * Responses:
   *   200  { deleted: true, storageRemoved: boolean }
   *   404  document not found or not owned by this user
   *   500  unexpected server error
   */
  app.delete("/api/documents/:documentId", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { documentId } = req.params;
    try {
      const result = await deleteDocument(documentId, user.id);
      if (!result.success) {
        if (result.reason === "not_found") {
          return res.status(404).json({ error: "Document not found." });
        }
        return res.status(500).json({ error: "Failed to delete document. Please try again." });
      }
      return res.json({ deleted: true, storageRemoved: result.storageRemoved });
    } catch (err) {
      console.error(`[documents] DELETE route error doc=${documentId}:`, err);
      return res.status(500).json({ error: "Failed to delete document." });
    }
  });

  /* ── AI Case Brief ───────────────────────────────────────────────────────── */

  type BriefPriority = {
    title: string;
    reason: string;
    level: "high" | "medium";
    score: number;
  };

  type BriefKeyDate = {
    label: string;
    value: string;
    sourceDocument: string;
    urgency: DateStatus;
  };

  type BriefDocumentSignal = {
    id: string;
    fileName: string;
    docType: string;
    caseId: string | null;
    createdAt: string;
    summary: string;
    keyDates: string[];
    alerts: string[];
    implications: string[];
    extractedFacts: Record<string, string>;
  };

  function asStringList(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }

  function parseDocumentSignals(doc: SavedDocument): BriefDocumentSignal {
    const analysis = (doc.analysisJson ?? {}) as Record<string, unknown>;
    const extractedFactsRaw = (analysis.extracted_facts ?? {}) as Record<string, unknown>;
    const extractedFacts: Record<string, string> = {};

    for (const [k, v] of Object.entries(extractedFactsRaw)) {
      if (typeof v === "string" && v.trim()) extractedFacts[k] = v.trim();
    }

    const summaryValue = analysis.summary;
    const summary = typeof summaryValue === "string"
      ? summaryValue.trim()
      : Array.isArray(summaryValue)
        ? summaryValue.filter((v): v is string => typeof v === "string").join("; ")
        : "";

    const keyDates = asStringList(analysis.key_dates);
    const alerts = [
      ...asStringList(analysis.document_alerts),
      ...asStringList(analysis.alerts),
    ];

    return {
      id: doc.id,
      fileName: doc.fileName,
      docType: doc.docType,
      caseId: doc.caseId ?? null,
      createdAt: doc.createdAt,
      summary,
      keyDates,
      alerts,
      implications: asStringList(analysis.possible_implications),
      extractedFacts,
    };
  }

  function computeDateUrgency(value: string): DateStatus {
    return classifyDateStatus(value);
  }

  function buildPriorities(
    docs: BriefDocumentSignal[],
    missingSignals: string[],
    recentActivityCount: number,
  ): BriefPriority[] {
    const priorities: BriefPriority[] = [];
    const emergencyKeywords = ["emergency", "immediate", "safety", "violence", "restraining", "protective"];

    const upcomingDateCount = docs.flatMap((d) => [...d.keyDates, d.extractedFacts.hearing_date ?? ""])
      .filter(Boolean)
      .filter((dateValue) => {
        const status = computeDateUrgency(dateValue);
        return status === "upcoming" || status === "today";
      })
      .length;

    if (upcomingDateCount > 0) {
      priorities.push({
        title: `Upcoming legal dates (${upcomingDateCount})`,
        reason: "Upcoming hearings and deadlines are most time-sensitive.",
        level: "high",
        score: 100,
      });
    }

    const emergencyCount = docs.reduce((acc, d) => {
      const text = [d.summary, ...d.alerts, ...d.implications].join(" ").toLowerCase();
      if (emergencyKeywords.some((kw) => text.includes(kw))) return acc + 1;
      return acc;
    }, 0);

    if (emergencyCount > 0) {
      priorities.push({
        title: `Emergency/safety language found (${emergencyCount} doc${emergencyCount > 1 ? "s" : ""})`,
        reason: "Potential safety risk signals need immediate review.",
        level: "high",
        score: 95,
      });
    }

    if (missingSignals.length > 0) {
      priorities.push({
        title: `Missing required case elements (${missingSignals.length})`,
        reason: "Missing core facts create filing and preparation risk.",
        level: "high",
        score: 90,
      });
    }

    if (recentActivityCount > 0) {
      priorities.push({
        title: `Recent activity (${recentActivityCount})`,
        reason: "Recent conversations may indicate active case movement.",
        level: "medium",
        score: 60,
      });
    }

    return priorities.sort((a, b) => b.score - a.score).slice(0, 6);
  }

  /**
   * POST /api/workspace/case-brief
   * Generate a structured, scoped case brief from extracted intelligence.
   */
  app.post("/api/workspace/case-brief", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const requestedCaseId = typeof req.body?.caseId === "string" && req.body.caseId.trim().length > 0
      ? req.body.caseId.trim()
      : null;

    try {
      const [allCases, allDocs, threads] = await Promise.all([
        listCases(user.id, 100),
        getDocuments(user.id),
        listThreads(user.id, 20),
      ]);

      const activeCase = requestedCaseId
        ? allCases.find((c) => c.id === requestedCaseId) ?? null
        : null;

      if (requestedCaseId && !activeCase) {
        return res.status(404).json({ error: "Selected case not found." });
      }

      const docs = activeCase
        ? await getDocumentsByCase(activeCase.id, user.id)
        : allDocs.filter((d) => !d.caseId);
      const analyzableDocs = docs.filter((d) => getDocumentIntegrity(d).isAnalysisAvailable);

      const caseDocIdSet = new Set(analyzableDocs.map((d) => d.id));
      const scopedThreads = activeCase
        ? threads.filter((t) => !!t.documentId && caseDocIdSet.has(t.documentId))
        : threads.filter((t) => !t.documentId || allDocs.find((d) => d.id === t.documentId && !d.caseId));

      if (analyzableDocs.length === 0 && scopedThreads.length === 0) {
        return res.status(400).json({
          error: activeCase
            ? "No documents or activity are linked to this case yet."
            : "No unassigned documents or activity found for a workspace brief.",
        });
      }

      const parsedDocs = analyzableDocs.map(parseDocumentSignals);
      const [caseFactsRows, messageChunks] = await Promise.all([
        activeCase ? getCaseFacts(activeCase.id, user.id) : Promise.resolve([]),
        Promise.all(scopedThreads.slice(0, 6).map((t) => getRecentMessages(t.id, 4))),
      ]);

      const keyDates: BriefKeyDate[] = [];
      for (const doc of parsedDocs) {
        for (const dateStr of doc.keyDates.slice(0, 4)) {
          keyDates.push({
            label: "Key date",
            value: dateStr,
            sourceDocument: doc.fileName,
            urgency: computeDateUrgency(dateStr),
          });
        }
        if (doc.extractedFacts.hearing_date) {
          keyDates.push({
            label: "Hearing date",
            value: doc.extractedFacts.hearing_date,
            sourceDocument: doc.fileName,
            urgency: computeDateUrgency(doc.extractedFacts.hearing_date),
          });
        }
      }

      const requiredFactKeys = ["case_number", "court_name", "hearing_date"];
      const missingSignals = requiredFactKeys.filter((key) => {
        const foundInDocs = parsedDocs.some((d) => !!d.extractedFacts[key]);
        const foundInCaseFacts = caseFactsRows.some((f) => f.factType === key && !!f.value);
        return !foundInDocs && !foundInCaseFacts;
      });

      const flattenedMessages = messageChunks.flat();
      const recentActivity = flattenedMessages
        .filter((m) => m.role === "user")
        .slice(-6)
        .map((m) => m.messageText.trim())
        .filter(Boolean);

      const priorities = buildPriorities(parsedDocs, missingSignals, recentActivity.length);

      const evidenceBasis = parsedDocs.map((d) => ({
        documentId: d.id,
        fileName: d.fileName,
        docType: d.docType,
        createdAt: d.createdAt,
        caseId: d.caseId,
        facts: {
          case_number: d.extractedFacts.case_number ?? null,
          court_name: d.extractedFacts.court_name ?? null,
          hearing_date: d.extractedFacts.hearing_date ?? null,
          filing_date: d.extractedFacts.filing_date ?? null,
        },
        alerts: d.alerts,
      }));

      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.25,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You generate concise, high-signal case briefs from structured legal intelligence.
Return JSON only.
Do not include legal disclaimers.
Do not add facts not present in the provided evidence.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              mode: activeCase ? "case" : "general_workspace",
              briefLabel: activeCase ? `Case Brief: ${activeCase.title}` : "General Workspace Brief",
              priorities,
              keyDates,
              missingSignals,
              recentActivity,
              caseFacts: caseFactsRows.map((f) => ({ factType: f.factType, value: f.value, sourceName: f.sourceName })),
              documents: parsedDocs,
              requiredOutputShape: {
                currentSituation: "string",
                whatMattersMost: [{ priority: "string", reason: "string", level: "high|medium" }],
                keyDatesAndDeadlines: [{ date: "string", label: "string", source: "string", urgency: "upcoming|today|past|unknown" }],
                risksWatchItems: ["string"],
                documentInsights: [{ documentId: "string", fileName: "string", insight: "string", whyItMatters: "string" }],
                missingInformationGaps: ["string"],
                recommendedNextActions: ["string"],
              },
            }),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return res.status(500).json({ error: "Failed to parse case brief response." });
      }

      return res.json({
        title: activeCase ? `Case Brief: ${activeCase.title}` : "General Workspace Brief",
        scope: activeCase
          ? { type: "case", caseId: activeCase.id, caseTitle: activeCase.title }
          : { type: "general", caseId: null, caseTitle: null },
        currentSituation: typeof parsed.currentSituation === "string" ? parsed.currentSituation : "No clear case narrative yet.",
        whatMattersMost: Array.isArray(parsed.whatMattersMost) ? parsed.whatMattersMost.slice(0, 6) : priorities.map((p) => ({ priority: p.title, reason: p.reason, level: p.level })),
        keyDatesAndDeadlines: Array.isArray(parsed.keyDatesAndDeadlines) ? parsed.keyDatesAndDeadlines.slice(0, 8) : keyDates.map((k) => ({ date: k.value, label: k.label, source: k.sourceDocument, urgency: k.urgency })),
        risksWatchItems: Array.isArray(parsed.risksWatchItems) ? parsed.risksWatchItems.slice(0, 8) : [],
        documentInsights: Array.isArray(parsed.documentInsights) ? parsed.documentInsights.slice(0, 20) : parsedDocs.map((d) => ({
          documentId: d.id,
          fileName: d.fileName,
          insight: d.summary || `Contains ${Object.keys(d.extractedFacts).length} extracted facts.`,
          whyItMatters: d.extractedFacts.hearing_date
            ? `Contains hearing date (${d.extractedFacts.hearing_date}) for planning.`
            : "Contributes to case evidence context.",
        })),
        missingInformationGaps: Array.isArray(parsed.missingInformationGaps) ? parsed.missingInformationGaps.slice(0, 8) : missingSignals,
        recommendedNextActions: Array.isArray(parsed.recommendedNextActions) ? parsed.recommendedNextActions.slice(0, 8) : [],
        evidenceBasis,
      });
    } catch (err) {
      console.error("[workspace] case-brief error:", err);
      return res.status(500).json({ error: "Failed to generate case brief." });
    }
  });

  /* ════════════════════════════════════════════════════════════════════════
   *  ADMIN ROUTES  —  server-side enforced by requireAdmin middleware
   *  Frontend at /admin — only renders meaningful content for ADMIN_EMAIL
   * ══════════════════════════════════════════════════════════════════════ */

  // GET /api/admin/status — let the client know if the current user is admin
  app.get("/api/admin/status", requireAdmin, async (_req, res) => {
    return res.json({ isAdmin: true });
  });

  // GET /api/admin/users — list all users with tier info
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const users = await listAdminUsers();
    return res.json({ users });
  });

  // PATCH /api/admin/users/:userId/tier — change a user's tier
  app.patch("/api/admin/users/:userId/tier", requireAdmin, async (req, res) => {
    const { userId } = req.params;
    const { tier } = req.body;
    if (!tier || !["free", "pro"].includes(tier)) {
      return res.status(400).json({ error: "tier must be 'free' or 'pro'." });
    }
    const ok = await setUserTier(userId, tier);
    if (!ok) return res.status(500).json({ error: "Failed to update tier." });
    return res.json({ ok: true });
  });

  // POST /api/admin/invite — invite a new user or update existing user's tier
  app.post("/api/admin/invite", requireAdmin, async (req, res) => {
    const { email, tier } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required." });
    }
    if (!tier || !["free", "pro"].includes(tier)) {
      return res.status(400).json({ error: "tier must be 'free' or 'pro'." });
    }
    const result = await inviteUser(email.trim().toLowerCase(), tier);
    if (!result.ok) return res.status(400).json({ error: result.message });
    return res.json({ ok: true, message: result.message });
  });

  // GET /api/admin/invite-codes — list all invite codes
  app.get("/api/admin/invite-codes", requireAdmin, async (_req, res) => {
    const codes = await listInviteCodes();
    return res.json({ codes });
  });

  // POST /api/admin/invite-codes — create a new invite code
  app.post("/api/admin/invite-codes", requireAdmin, async (req, res) => {
    const { tier, maxUses, expiresAt } = req.body;
    if (!tier || !["free", "pro"].includes(tier)) {
      return res.status(400).json({ error: "tier must be 'free' or 'pro'." });
    }
    const code = await createInviteCode({
      tier,
      maxUses: maxUses ?? null,
      expiresAt: expiresAt ?? null,
    });
    if (!code) return res.status(500).json({ error: "Failed to create code." });
    return res.json({ ok: true, code });
  });

  // PATCH /api/admin/invite-codes/:codeId/deactivate — deactivate a code
  app.patch("/api/admin/invite-codes/:codeId/deactivate", requireAdmin, async (req, res) => {
    const { codeId } = req.params;
    const ok = await deactivateInviteCode(codeId);
    if (!ok) return res.status(500).json({ error: "Failed to deactivate code." });
    return res.json({ ok: true });
  });

  /* ════════════════════════════════════════════════════════════════════════
   *  USER-FACING: Code redemption  —  requires auth, not admin
   * ══════════════════════════════════════════════════════════════════════ */

  // POST /api/redeem-code — redeem an invite code to upgrade tier
  app.post("/api/redeem-code", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code is required." });
    }
    const result = await redeemInviteCode(code.trim(), user.id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true, tier: result.tier });
  });

  /* ════════════════════════════════════════════════════════════════════════
   *  CASES — case-based architecture foundation
   * ══════════════════════════════════════════════════════════════════════ */

  /**
   * POST /api/cases
   * Create a new case for the authenticated user.
   */
  app.post("/api/cases", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const schema = z.object({
      title: z.string().min(1).max(200),
      caseType: z.enum(["custody", "child_support", "custody_and_support"]).optional(),
      stateCode: z.string().trim().min(2).max(64).optional(),
      jurisdictionState: z.string().trim().min(2).max(64).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid case payload.", details: parsed.error.flatten() });
    }
    try {
      const resolvedStateCode =
        resolveUSStateCode(parsed.data.stateCode)
        ?? resolveUSStateCode(parsed.data.jurisdictionState)
        ?? "US";
      const existingCases = await listCases(user.id, 2);
      const isFirstCase = existingCases.length === 0;
      const createCaseResult = await createCaseWithDiagnostics(user.id, {
        title: parsed.data.title,
        caseType: parsed.data.caseType ?? "custody",
        status: "active",
        stateCode: resolvedStateCode,
        authToken: req.headers.authorization?.replace("Bearer ", "").trim() ?? null,
      });
      const newCase = createCaseResult.createdCase;
      if (!newCase) {
        const errorId = `case_create_${Date.now().toString(36)}`;
        console.error("[cases] create-case storage failure", {
          errorId,
          userId: user.id,
          requestPayload: {
            title: parsed.data.title,
            caseType: parsed.data.caseType ?? "custody",
            stateCode: resolvedStateCode,
          },
          failure: createCaseResult.failure,
        });
        return res.status(503).json({
          error: "Case storage unavailable.",
          errorId,
        });
      }

      if (!isFirstCase) {
        return res.status(201).json({ case: newCase });
      }

      const allDocs = await getDocuments(user.id);
      const historicalUnassignedDocs = allDocs.filter((doc) => {
        if (doc.caseId) return false;
        const assignment = getDocumentCaseAssignmentView(doc);
        return assignment.status !== "assigned";
      });

      const reviewItems = historicalUnassignedDocs.map((doc) =>
        buildRetroactiveDocReviewItem(
          doc,
          newCase,
          null,
          historicalUnassignedDocs,
        ));

      await Promise.all(reviewItems.map((item) =>
        setDocumentCaseSuggestion(
          item.documentId,
          user.id,
          item.status === "suggested" ? item.suggestedCaseId : null,
          item.confidenceScore,
          item.reason,
        ),
      ));

      const suggestedCount = reviewItems.filter((item) => item.status === "suggested").length;
      return res.status(201).json({
        case: newCase,
        retroactiveDocumentReview: {
          requiresReview: reviewItems.length > 0,
          totalPreExistingDocuments: reviewItems.length,
          suggestedCount,
          unassignedCount: reviewItems.length - suggestedCount,
          items: reviewItems,
        },
      });
    } catch (err) {
      console.error("[cases] POST /api/cases error:", err);
      return res.status(500).json({ error: "Failed to create case." });
    }
  });

  /**
   * GET /api/cases
   * List all cases belonging to the authenticated user.
   */
  app.get("/api/cases", requireAuth, async (req, res) => {
    const user = (req as any).user;
    try {
      const cases = await listCases(user.id);
      return res.json({ cases });
    } catch (err) {
      console.error("[cases] GET /api/cases error:", err);
      return res.status(500).json({ error: "Failed to list cases." });
    }
  });

  /**
   * POST /api/cases/:caseId/conversations
   * Create a new conversation under the specified case.
   */
  app.post("/api/cases/:caseId/conversations", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { caseId } = req.params;
    const schema = z.object({
      title: z.string().max(200).optional(),
      threadType: z.enum(["general", "document", "comparison"]).default("general"),
      jurisdictionState: z.string().optional(),
      jurisdictionCounty: z.string().optional(),
      documentId: z.string().uuid().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid conversation payload." });
    }
    try {
      const conversation = await createConversation(user.id, caseId, parsed.data);
      if (!conversation) return res.status(404).json({ error: "Case not found or storage unavailable." });
      return res.status(201).json({ conversation });
    } catch (err) {
      console.error("[cases] POST conversations error:", err);
      return res.status(500).json({ error: "Failed to create conversation." });
    }
  });

  /**
   * GET /api/cases/:caseId
   * Single case detail — returns the case record owned by the caller.
   */
  app.get("/api/cases/:caseId", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { caseId } = req.params;
    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });
      return res.json({ case: caseRecord });
    } catch (err) {
      console.error("[cases] GET :caseId error:", err);
      return res.status(500).json({ error: "Failed to load case." });
    }
  });

  /**
   * GET /api/cases/:caseId/documents
   * Return documents linked to a specific case.
   * Requires the case_id column on the Supabase documents table.
   * Returns [] (gracefully) if the column does not yet exist.
   */
  app.get("/api/cases/:caseId/documents", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { caseId } = req.params;
    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });
      const documents = await getDocumentsByCase(caseId, user.id);
      return res.json({ documents });
    } catch (err) {
      console.error("[cases] GET documents error:", err);
      return res.status(500).json({ error: "Failed to retrieve documents." });
    }
  });

  /**
   * GET /api/cases/:caseId/conversations
   * List all conversations for the specified case (must be owned by the caller).
   */
  app.get("/api/cases/:caseId/conversations", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { caseId } = req.params;
    try {
      const conversations = await listConversations(caseId, user.id);
      return res.json({ conversations });
    } catch (err) {
      console.error("[cases] GET conversations error:", err);
      return res.status(500).json({ error: "Failed to list conversations." });
    }
  });

  /**
   * GET /api/cases/:caseId/facts
   * Return all stored case_facts rows for the active case.
   * Used by CaseFactsPanel in the UI to show known facts.
   */
  app.get("/api/cases/:caseId/facts", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { caseId } = req.params;
    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });
      const facts = await getCaseFacts(caseId, user.id);
      return res.json({ facts });
    } catch (err) {
      console.error("[cases] GET facts error:", err);
      return res.status(500).json({ error: "Failed to retrieve case facts." });
    }
  });

  /**
   * POST /api/cases/:caseId/facts/confirm
   * User-confirms a specific fact value, inserting a user_confirmed row at highest priority.
   * Body: { fact_type: string; value: string; source_name?: string }
   *
   * Does NOT overwrite document-derived rows — adds a new row with source="user_confirmed"
   * and confidence="high". The resolver will prefer this over all document facts.
   */
  app.post("/api/cases/:caseId/facts/confirm", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { caseId } = req.params;
    const { fact_type, value, source_name } = req.body ?? {};

    if (!fact_type || typeof fact_type !== "string") {
      return res.status(400).json({ error: "fact_type is required." });
    }
    if (!value || typeof value !== "string") {
      return res.status(400).json({ error: "value is required." });
    }

    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });

      await upsertCaseFact(
        caseId,
        user.id,
        fact_type,
        value.trim(),
        "user_confirmed",
        source_name ?? "Confirmed by user",
        "high",
      );

      console.log(
        `[caseFacts] User confirmed: case=${caseId.slice(0, 8)} type=${fact_type} value="${value.trim().slice(0, 60)}"`,
      );

      // After confirmation, refresh actions from full known fact set (fire-and-forget)
      getCaseFacts(caseId, user.id)
        .then((allFacts) => {
          const flatFacts: Record<string, string | null | undefined> = {};
          for (const f of allFacts) flatFacts[f.factType] = f.value;
          return generateActionsFromFacts(caseId, user.id, flatFacts);
        })
        .catch((err) => console.error("[confirm-fact] action generation error:", err));

      return res.json({ success: true, fact_type, value: value.trim(), confidence: "high" });
    } catch (err) {
      console.error("[cases] POST confirm fact error:", err);
      return res.status(500).json({ error: "Failed to confirm fact." });
    }
  });

  /**
   * GET /api/cases/:caseId/actions
   * Return all actions for the case (open + completed), newest first.
   */
  app.get("/api/cases/:caseId/actions", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { caseId } = req.params;
    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });

      // Fetch all stored facts to: (a) extract hearing_date for urgency, (b) re-run generation
      const allFacts = await getCaseFacts(caseId, user.id);

      // Build flat facts dict — prefer user_confirmed for each fact_type
      const factsByType = new Map<string, { value: string; source: string }>();
      for (const f of allFacts) {
        const existing = factsByType.get(f.factType);
        if (!existing || f.source === "user_confirmed") {
          factsByType.set(f.factType, { value: f.value, source: f.source });
        }
      }
      const flatFacts: Record<string, string | null | undefined> = {};
      for (const [type, { value }] of factsByType) flatFacts[type] = value;

      // Fire-and-forget: regenerate actions from current facts (idempotent — dedup inside)
      if (allFacts.length > 0) {
        generateActionsFromFacts(caseId, user.id, flatFacts).catch((err) =>
          console.error("[actions] background generation error:", err),
        );
      }

      // Fetch actions, then enrich with urgency + sort
      const hearingDate = flatFacts.hearing_date ?? null;
      const rawActions = await getCaseActions(caseId, user.id);
      const actions = enrichAndSortActions(rawActions, hearingDate as string | null);

      console.log(
        `[actions] GET case=${caseId.slice(0, 8)} hearing_date="${hearingDate ?? "none"}" ` +
        `total=${rawActions.length} open=${actions.filter((a) => a.status === "open").length}`,
      );

      return res.json({ actions, hearingDate });
    } catch (err) {
      console.error("[cases] GET actions error:", err);
      return res.status(500).json({ error: "Failed to retrieve case actions." });
    }
  });

  /**
   * POST /api/cases/:caseId/actions
   * Manually create an action for a case.
   * Body: { action_type: string; title: string; description: string }
   */
  app.post("/api/cases/:caseId/actions", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { caseId } = req.params;
    const { action_type, title, description } = req.body ?? {};

    if (!action_type || !title || !description) {
      return res.status(400).json({ error: "action_type, title, and description are required." });
    }
    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });
      const action = await createCaseAction(caseId, user.id, action_type, title, description);
      return res.json({ action });
    } catch (err) {
      console.error("[cases] POST action error:", err);
      return res.status(500).json({ error: "Failed to create action." });
    }
  });

  /**
   * GET /api/cases/:caseId/timeline
   *
   * Returns a chronological list of case timeline events derived from:
   *   - Document extracted_facts (hearing_date, filing_date, effective_date)
   *   - Document key_dates[] arrays
   *   - Case facts (hearing_date, filing_date stored in case_facts table)
   *
   * No new database table required — all data is aggregated from existing sources.
   * Events are sorted chronologically with `isNext: true` on the first upcoming event.
   *
   * Ownership: case verified via getCaseById(caseId, user.id).
   */
  app.get("/api/cases/:caseId/timeline", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { caseId } = req.params;
    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });

      const events = await deriveCaseTimeline(caseId, user.id);
      console.log(
        `[timeline] case=${caseId.slice(0, 8)} events=${events.length} ` +
        `upcoming=${events.filter(e => e.isUpcoming).length}`,
      );
      return res.json({ events });
    } catch (err) {
      console.error("[timeline] deriveCaseTimeline error:", err);
      return res.status(500).json({ error: "Failed to derive timeline." });
    }
  });

  /**
   * PATCH /api/case-actions/:actionId
   * Mark an action complete or dismissed.
   * Body: { status: "completed" | "dismissed" }
   */
  app.patch("/api/case-actions/:actionId", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const actionId = parseInt(req.params.actionId, 10);
    const { status } = req.body ?? {};

    if (isNaN(actionId)) return res.status(400).json({ error: "Invalid action ID." });
    if (status !== "completed" && status !== "dismissed") {
      return res.status(400).json({ error: "status must be 'completed' or 'dismissed'." });
    }
    try {
      const ok = await updateActionStatus(actionId, user.id, status);
      if (!ok) return res.status(404).json({ error: "Action not found or permission denied." });
      return res.json({ success: true, status });
    } catch (err) {
      console.error("[cases] PATCH action error:", err);
      return res.status(500).json({ error: "Failed to update action." });
    }
  });

  /**
   * GET /api/conversations/:conversationId/messages
   * List messages for a conversation (caller must own the conversation).
   */
  app.get("/api/conversations/:conversationId/messages", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { conversationId } = req.params;
    try {
      const messages = await listMessages(conversationId, user.id);
      return res.json({ messages });
    } catch (err) {
      console.error("[cases] GET messages error:", err);
      return res.status(500).json({ error: "Failed to list messages." });
    }
  });

  return httpServer;
}
