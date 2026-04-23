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
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { addLegalDisclaimer, analyzeUserSignals, buildAdaptiveSystemPrompt } from "./lib/adaptiveIntelligence";
import { analyzeCaseStrength, type CaseStrengthReport } from "./lib/caseStrength";
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
import { buildDuplicateFingerprints, classifyDuplicate, type DuplicateDecisionType } from "./lib/documentDuplicateIntake";
import { decideCaseAssignment, type AssignmentCandidate } from "./lib/documentCaseAssignment";
import { extractSignalsFromDocument } from "./lib/extractSignals";
import { generateProactiveInsights } from "./lib/proactiveIntelligence";
import { alertImpactWhyThisMatters, eventWhyThisMatters } from "./lib/caseDashboardInterpretation";
import { computeCaseRiskScore, hasConflictingTimelineEvents } from "./lib/caseRiskScoring";
import { requireAuth, requireAdmin } from "./services/auth";
import {
  listAdminUsers,
  findAdminUserByEmail,
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
import { getDocuments, getDocumentsByCase, getDocumentById, updateDocumentType, updateDocumentAnalysis, updateDocumentLifecycleStatuses, createDocumentSignedUrl, deleteDocument, findDuplicateDocument, ensureDocumentCaseAssociation, getDocumentCaseIds, getDocumentIntegrity, getDocumentCaseAssignmentView, setDocumentCaseAssignment, setDocumentCaseSuggestion, saveDocumentWithDuplicateOutcome, getAllDocumentsForUser, findDocumentByIntakeTextHash, recordUploadIntakeAttempt, type DocumentType, type SavedDocument } from "./services/documents";
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
  ALLOWED_ACTIONS,
  applyAlertAction,
  reconcileCaseAlerts,
  type AlertDraft,
  type AlertType,
} from "./services/caseAlerts";
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
import { generateCaseIntelligence } from "./services/caseIntelligence";
import {
  createThread,
  appendMessage,
  getThread,
  listThreads,
  getRecentMessages,
} from "./services/threads";
import {
  deleteSignalsForCase,
  dismissSignalForUser,
  listSignalsForCase,
  listSignalsForDocument,
  replaceDocumentSignals,
} from "./services/signals";
import {
  cacheResources,
  getCachedResources,
  getEmptyResourcesResponse,
  normalizeResourcesResponse,
  type ResourcesResponse,
} from "./services/resources";
import {
  createCheckoutSession,
  createPortalSession,
  handleWebhookEvent,
} from "./services/billing";
import {
  getDefaultUserPreferences,
  getUserPreferences,
  resetUserPreferences,
  resolveEffectivePreferences,
  setUserPreferences,
  updateDetectedPreferences,
} from "./services/userPreferences";
import {
  maybePublishQuestion,
  getPublicQuestionsByState,
  getPublicQuestionBySlug,
  getRelatedQuestions,
  TOPIC_LABELS,
} from "./services/publicQuestions";
import { getUserProfile, setDisplayName, setWelcomeDismissed, resetOnboardingState, setProfileJurisdiction } from "./services/userProfile";
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
import type { CaseTimelineEvent } from "./services/caseTimeline";

const asString = (v: unknown): string => Array.isArray(v) ? (typeof v[0] === "string" ? v[0] : "") : typeof v === "string" ? v : "";

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

type DocumentDuplicateKind = "exact" | "semantic" | "likely" | "new";

function normalizeText(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function buildCaseStrengthSourceSignature(
  documents: SavedDocument[],
  signals: Array<{ id: string; title: string; detail: string; dueDate?: string }>,
): string {
  const digest = createHash("sha256");
  digest.update(JSON.stringify({
    documents: documents.map((doc) => ({
      id: doc.id,
      createdAt: doc.createdAt,
      fileName: doc.fileName,
      summary: typeof doc.analysisJson?.summary === "string" ? doc.analysisJson.summary : null,
      extractedTextLength: doc.extractedText.length,
    })),
    signals: signals.map((signal) => ({
      id: signal.id,
      title: signal.title,
      detail: signal.detail,
      dueDate: signal.dueDate ?? null,
    })),
  }));
  return digest.digest("hex");
}

function hasOverlap(a: unknown, b: unknown): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function normalizeFileNameStem(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getFileExtension(name: string): string {
  const trimmed = String(name || "").trim();
  const idx = trimmed.lastIndexOf(".");
  if (idx <= 0 || idx === trimmed.length - 1) return "";
  return trimmed.slice(idx + 1).toLowerCase();
}

function countWords(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function buildCaseDocumentTextAddendum(
  docs: SavedDocument[],
  stateName: string,
  maxWords = 6000,
): string {
  if (docs.length === 0) return "";

  const recentFirst = [...docs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const sections: string[] = [];
  const trimmedDocs: string[] = [];
  let usedWords = 0;

  for (const doc of recentFirst) {
    const rawText = doc.extractedText.trim();
    if (!rawText) continue;

    const remainingWords = maxWords - usedWords;
    if (remainingWords <= 0) {
      trimmedDocs.push(doc.fileName);
      continue;
    }

    const docWords = rawText.split(/\s+/);
    const includeAll = docWords.length <= remainingWords;
    const includedWords = includeAll ? docWords : docWords.slice(0, remainingWords);
    const includedText = includedWords.join(" ").trim();

    if (!includedText) {
      trimmedDocs.push(doc.fileName);
      continue;
    }

    sections.push(`[${doc.fileName}]: ${includedText}${includeAll ? "" : "\n[Document truncated to fit context window.]"}`);
    usedWords += countWords(includedText);

    if (!includeAll) {
      trimmedDocs.push(doc.fileName);
    }
  }

  if (sections.length === 0) return "";

  const trimmedNote = trimmedDocs.length > 0
    ? `\n\nSome older or longer documents were trimmed to stay within the model context window: ${trimmedDocs.join(", ")}.`
    : "";

  return `

---
ACTUAL CASE DOCUMENT TEXT
The following are the actual case documents for this case. Answer the user's question using these documents specifically, not general legal knowledge.

${sections.join("\n\n")}
${trimmedNote}

RULES FOR CASE DOCUMENT USE:
1. Answer from these documents first whenever they contain relevant information.
2. Cite the document name when you rely on a document-specific fact.
3. Only fall back to general ${stateName} custody law if the documents do not address the question.
4. Do not give a generic answer when the documents contain relevant information.
5. If the documents are silent or incomplete, say so clearly before providing any general guidance.`;
}

function findSimilarWorkspaceDocument(
  docs: SavedDocument[],
  uploadFileName: string,
): SavedDocument | null {
  const stem = normalizeFileNameStem(uploadFileName);
  if (!stem) return null;

  const scored = docs
    .map((doc) => {
      const candidate = normalizeFileNameStem(doc.fileName);
      const exact = candidate === stem;
      const overlap = Boolean(candidate) && (candidate.includes(stem) || stem.includes(candidate));
      const status = getDocumentIntegrity(doc).analysisStatus;
      const analyzedWeight = status === "analyzed" ? 2 : 1;
      const score = (exact ? 4 : overlap ? 2 : 0) + analyzedWeight;
      return { doc, score };
    })
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score || (a.doc.createdAt < b.doc.createdAt ? 1 : -1));

  return scored[0]?.doc ?? null;
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
    if (SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Please upload a PDF, Word document (.docx), JPG, or PNG."));
    }
  },
});

const analyzeUploadMiddleware = (req: any, res: any, next: any) => {
  upload.single("file")(req, res, (err?: any) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "File is too large. Maximum size is 10MB.",
        code: "DOCUMENT_ANALYSIS_PRECONDITION_FAILED",
      });
    }

    const message =
      typeof err?.message === "string" && err.message.trim().length > 0
        ? err.message
        : "Unsupported file type. Please upload a PDF, Word document (.docx), JPG, or PNG.";

    return res.status(400).json({
      error: message,
      code: "DOCUMENT_ANALYSIS_PRECONDITION_FAILED",
    });
  });
};

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

type DashboardAlertKind = AlertType;
type DashboardAlertSeverity = "high" | "medium" | "info";
type DashboardStageKey =
  | "approaching_hearing"
  | "between_pretrial_and_final"
  | "preparing_for_deadlines"
  | "early_intake";
type DashboardTimelineType = "hearing" | "filing" | "deadline" | "order" | "mediation" | "allegation" | "context";
type DashboardTimelineStatus = "past" | "upcoming" | "overdue" | "future";
type DashboardTimelineBucket = "primary" | "secondary";

interface NormalizedDashboardTimelineEvent extends CaseTimelineEvent {
  normalizedType: DashboardTimelineType;
  normalizedLabel: string;
  status: DashboardTimelineStatus;
  bucket: DashboardTimelineBucket;
}

function classifyDashboardTimelineType(event: CaseTimelineEvent): DashboardTimelineType {
  const label = event.label.toLowerCase();
  if (event.type === "hearing" || /\bhearing\b|\btrial\b/.test(label)) return "hearing";
  if (/\bdeadline\b|\bdue\b|\bsubmit\b|\bresponse\b|\bparenting plan\b/.test(label)) return "deadline";
  if (/\bmediation\b|\bsettlement conference\b/.test(label)) return "mediation";
  if (/\border\b|\bjudgment\b|\bdecree\b/.test(label) || event.type === "effective") return "order";
  if (/\ballegation\b|\ballege\b|\bclaim\b|\baccus/.test(label)) return "allegation";
  if (event.type === "filing") return "filing";
  return "context";
}

function normalizeTimelineLabel(event: Pick<CaseTimelineEvent, "label"> & { normalizedType: DashboardTimelineType }): string {
  const label = event.label.toLowerCase();
  if (event.normalizedType === "hearing" && /\bfinal\b/.test(label)) return "Final custody hearing";
  if (event.normalizedType === "hearing" && /\bpretrial\b/.test(label)) return "Pretrial hearing";
  if (event.normalizedType === "hearing") return "Court hearing";
  if (event.normalizedType === "deadline") return "Filing deadline";
  if (event.normalizedType === "order") return "Court order issued";
  if (event.normalizedType === "mediation") return "Mediation session";
  if (event.normalizedType === "filing") return "Court filing";
  if (event.normalizedType === "allegation") return "Allegation noted";
  return "Case context";
}

function timelineSpecificityScore(event: NormalizedDashboardTimelineEvent): number {
  let score = event.label.trim().length;
  if (event.source !== "Case Facts") score += 20;
  if (!/\b(date|event|filing|hearing)\b/i.test(event.label)) score += 40;
  if (event.normalizedLabel === "Final custody hearing") score += 120;
  else if (event.normalizedLabel === "Pretrial hearing") score += 110;
  else if (event.normalizedLabel === "Court hearing") score += 100;
  else if (event.normalizedLabel === "Filing deadline") score += 90;
  else if (event.normalizedLabel === "Court order issued") score += 80;
  else if (event.normalizedLabel === "Mediation session") score += 70;
  const priority: Record<DashboardTimelineType, number> = {
    hearing: 60,
    deadline: 50,
    order: 40,
    mediation: 30,
    filing: 20,
    allegation: 20,
    context: 10,
  };
  score += priority[event.normalizedType];
  return score;
}

function computeTimelineStatus(event: CaseTimelineEvent, normalizedType: DashboardTimelineType): DashboardTimelineStatus {
  if (event.isOverdue) return "overdue";
  if (!event.dateParsed) return event.isPast ? "past" : "future";
  const msPerDay = 86400000;
  const daysAway = Math.ceil((event.dateParsed.getTime() - Date.now()) / msPerDay);
  if (daysAway < 0) {
    if (normalizedType === "hearing" || normalizedType === "deadline" || normalizedType === "mediation") return "overdue";
    return "past";
  }
  if (daysAway <= 30) return "upcoming";
  return "future";
}

function normalizeDashboardTimeline(events: CaseTimelineEvent[]): NormalizedDashboardTimelineEvent[] {
  const enriched = events.map((event) => ({
    ...event,
    normalizedType: classifyDashboardTimelineType(event),
    normalizedLabel: "",
    status: "future" as DashboardTimelineStatus,
    bucket: "secondary" as DashboardTimelineBucket,
  }));
  for (const event of enriched) {
    event.normalizedLabel = normalizeTimelineLabel(event);
    event.status = computeTimelineStatus(event, event.normalizedType);
    event.bucket = ["hearing", "deadline", "filing", "order", "mediation"].includes(event.normalizedType) ? "primary" : "secondary";
  }

  const deduped = new Map<string, NormalizedDashboardTimelineEvent>();
  for (const event of enriched) {
    const dateKey = event.dateParsed ? event.dateParsed.toISOString().slice(0, 10) : event.dateRaw.trim().toLowerCase();
    const key = `${dateKey}:${event.normalizedType}`;
    const existing = deduped.get(key);
    if (!existing || timelineSpecificityScore(event) > timelineSpecificityScore(existing)) {
      deduped.set(key, event);
    }
  }
  return Array.from(deduped.values()).sort((a, b) => {
    const aMs = a.dateParsed?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bMs = b.dateParsed?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aMs - bMs;
  });
}

function classifyDashboardStage(events: NormalizedDashboardTimelineEvent[], documentCount: number): { key: DashboardStageKey; label: string } {
  const upcoming = events.filter((event) => event.status === "upcoming" || event.status === "future");
  const hearing = upcoming.find((event) => event.normalizedType === "hearing" && event.dateParsed);
  if (hearing?.dateParsed) {
    const daysUntil = Math.ceil((hearing.dateParsed.getTime() - Date.now()) / 86400000);
    if (daysUntil <= 21) {
      return { key: "approaching_hearing", label: "Hearing preparation is active." };
    }
  }

  const pretrialPast = events.some((event) => event.normalizedLabel === "Pretrial hearing" && (event.status === "past" || event.status === "overdue"));
  const finalUpcoming = upcoming.some((event) => event.normalizedLabel === "Final custody hearing");
  if (pretrialPast && finalUpcoming) {
    return { key: "between_pretrial_and_final", label: "Between pretrial and final hearing." };
  }

  const hasUpcomingDeadlines = upcoming.some((event) => event.normalizedType === "deadline" || event.normalizedType === "filing");
  if (hasUpcomingDeadlines) {
    return { key: "preparing_for_deadlines", label: "Preparing for upcoming filings and deadlines." };
  }

  if (documentCount === 0 || events.length < 2) {
    return { key: "early_intake", label: "Early case setup is still in progress." };
  }
  return { key: "preparing_for_deadlines", label: "Focused on the next case milestone." };
}

function normalizeDashboardText(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function extractDashboardDocumentTags(analysisJson: Record<string, unknown>): string[] {
  const extractedFacts = (analysisJson.extracted_facts ?? {}) as Record<string, unknown>;
  const tags: string[] = [];

  if (typeof extractedFacts.hearing_date === "string" && extractedFacts.hearing_date.trim()) {
    tags.push(`deadline: ${extractedFacts.hearing_date.trim()}`);
  }
  if (typeof extractedFacts.case_number === "string" && extractedFacts.case_number.trim()) {
    tags.push(`case #: ${extractedFacts.case_number.trim()}`);
  }

  const alerts = Array.isArray(analysisJson.document_alerts)
    ? analysisJson.document_alerts.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (alerts.length > 0) {
    tags.push(...alerts.slice(0, 2));
  }
  return tags.slice(0, 3);
}

const RESOURCE_HELP_PATTERNS = [
  /who can help/i,
  /find an attorney/i,
  /legal aid/i,
  /free help/i,
  /can't afford/i,
  /cannot afford/i,
  /represent me/i,
  /lawyer/i,
  /child support/i,
  /dfcs/i,
  /dhs/i,
  /government help/i,
  /state program/i,
  /enforcement/i,
] as const;

function shouldSurfaceResources(params: {
  intent: "FACT" | "EXPLANATION" | "ACTION";
  userQuestion: string;
}): boolean {
  if (params.intent === "ACTION") return true;
  return RESOURCE_HELP_PATTERNS.some((pattern) => pattern.test(params.userQuestion));
}

function buildResourcesPrompt(params: { state: string; county: string }): string {
  return [
    "You are a legal aid resource specialist. Return ONLY a valid JSON object with no preamble.",
    "Find real, currently operating legal aid organizations, court self-help centers, and mediation services",
    "for the specified US state and county. Only include organizations you are confident exist.",
    "Never invent organizations. If unsure, return fewer results rather than guessing.",
    "",
    "For government_resources: include the state child support enforcement agency,",
    "Department of Human Services or equivalent state agency, CASA (Court Appointed",
    "Special Advocates) program if present in the county, state bar lawyer referral",
    "service, family court facilitator or self-help coordinator office, and any",
    "state-funded mediation programs run through the court system. These must be",
    "government or government-funded entities. Include phone numbers prominently —",
    "these offices are often more reachable by phone than online.",
    "",
    "Return this exact shape:",
    "{",
    '  "legal_aid": [{ "name": string, "description": string, "url": string, "phone"?: string, "tags": string[] }],',
    '  "government_resources": [{ "name": string, "description": string, "url": string, "phone": string, "tags": string[] }],',
    '  "court_self_help": [{ "name": string, "description": string, "url": string, "phone"?: string, "tags": string[] }],',
    '  "mediation": [{ "name": string, "description": string, "url": string, "phone"?: string, "tags": string[] }]',
    "}",
    "",
    "tags must be from: free, income-qualified, in-person, remote, government, family-law, custody-specialist",
    "Maximum 4 results per category.",
    "",
    `State: ${params.state}`,
    `County: ${params.county}`,
  ].join("\n");
}

function normalizeJurisdictionValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

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

  app.post("/api/billing/create-checkout-session", requireAuth, async (req, res) => {
    const user = (req as any).user as { id: string; email: string | null };
    const parsed = z.object({
      priceId: z.string().min(1),
      plan: z.enum(["monthly", "annual"]),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid billing payload." });
    }

    const monthlyPriceId = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    const annualPriceId = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
    const expectedPriceId = parsed.data.plan === "monthly" ? monthlyPriceId : annualPriceId;
    const clientUrl = process.env.CLIENT_URL ?? req.get("origin") ?? "http://127.0.0.1:5050";

    const priceIdMatches = parsed.data.priceId === expectedPriceId || parsed.data.priceId === parsed.data.plan;
    if (!expectedPriceId || !priceIdMatches) {
      return res.status(400).json({ error: "Invalid Stripe price selected." });
    }

    if (!user.email) {
      return res.status(400).json({ error: "A verified email address is required for billing." });
    }

    try {
      const url = await createCheckoutSession({
        userId: user.id,
        userEmail: user.email,
        priceId: expectedPriceId,
        successUrl: `${clientUrl}/billing/success`,
        cancelUrl: `${clientUrl}/billing/cancel`,
      });
      return res.json({ url });
    } catch (err: any) {
      console.error("[billing] create checkout session error:", err);
      return res.status(500).json({ error: err?.message ?? "Failed to create checkout session." });
    }
  });

  app.post("/api/billing/portal", requireAuth, async (req, res) => {
    const user = (req as any).user as { id: string };
    const clientUrl = process.env.CLIENT_URL ?? req.get("origin") ?? "http://127.0.0.1:5050";

    try {
      const url = await createPortalSession({
        userId: user.id,
        returnUrl: `${clientUrl}/settings`,
      });
      return res.json({ url });
    } catch (err: any) {
      console.error("[billing] create portal session error:", err);
      return res.status(500).json({ error: err?.message ?? "Failed to create billing portal session." });
    }
  });

  app.post("/api/webhooks/stripe", async (req, res) => {
    const signature = asString(req.headers["stripe-signature"]);
    const rawPayload = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.isBuffer(req.rawBody)
        ? (req.rawBody as Buffer)
        : Buffer.from([]);

    if (!signature) {
      return res.status(400).json({ error: "Missing Stripe signature." });
    }

    try {
      await handleWebhookEvent(rawPayload, signature);
      return res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[billing] stripe webhook error:", err);
      return res.status(400).json({ error: err?.message ?? "Invalid Stripe webhook." });
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
      const displayName = parsed.data.displayName.trim();
      const result = await setDisplayName(userId, displayName);
      if (!result.ok) {
        console.error("[user-profile] PATCH display-name save failed", {
          reason: result.reason ?? "UNKNOWN",
          stage: result.stage ?? "unknown",
          supabaseCode: result.error?.code ?? null,
          supabaseMessage: result.error?.message ?? null,
          supabaseDetails: result.error?.details ?? null,
          supabaseHint: result.error?.hint ?? null,
          payload: {
            userId,
            displayNameLength: displayName.length,
          },
        });
        return res.status(500).json({
          error: "We couldn't save your preferred name right now. Please try again in a moment.",
        });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error("[user-profile] PATCH display-name error:", err);
      return res.status(500).json({
        error: "We couldn't save your preferred name right now. Please try again in a moment.",
      });
    }
  });

  app.patch("/api/user-profile/jurisdiction", requireAuth, async (req, res) => {
    try {
      const parsed = z.object({
        state: z.string().trim().min(1).max(80),
        county: z.string().trim().min(1).max(120),
      }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "state and county are required." });
      }

      const userId = (req as any).user?.id as string;
      const result = await setProfileJurisdiction(userId, parsed.data);
      if (!result.ok) {
        console.error("[user-profile] PATCH jurisdiction save failed", {
          reason: result.reason ?? "UNKNOWN",
          supabaseCode: result.error?.code ?? null,
          supabaseMessage: result.error?.message ?? null,
          supabaseDetails: result.error?.details ?? null,
          supabaseHint: result.error?.hint ?? null,
          payload: {
            userId,
            state: parsed.data.state,
            county: parsed.data.county,
          },
        });
        return res.status(500).json({
          error: "We couldn't save your jurisdiction right now. Please try again in a moment.",
        });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("[user-profile] PATCH jurisdiction error:", err);
      return res.status(500).json({
        error: "We couldn't save your jurisdiction right now. Please try again in a moment.",
      });
    }
  });

  app.patch("/api/user-profile/welcome-dismissed", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user?.id as string;
      const result = await setWelcomeDismissed(userId);
      if (!result.ok) {
        console.error("[user-profile] PATCH welcome-dismissed save failed", {
          reason: result.reason ?? "UNKNOWN",
          stage: result.stage ?? "unknown",
          supabaseCode: result.error?.code ?? null,
          supabaseMessage: result.error?.message ?? null,
          supabaseDetails: result.error?.details ?? null,
          supabaseHint: result.error?.hint ?? null,
          payload: { userId },
        });
        return res.status(500).json({
          error: "We couldn't save onboarding progress right now. Please try again in a moment.",
        });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error("[user-profile] PATCH welcome-dismissed error:", err);
      return res.status(500).json({
        error: "We couldn't save onboarding progress right now. Please try again in a moment.",
      });
    }
  });

  app.get("/api/user/preferences", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user?.id as string;
      const prefs = await getUserPreferences(userId);
      return res.json(prefs ?? getDefaultUserPreferences());
    } catch (err) {
      console.error("[user-preferences] GET error:", err);
      return res.status(500).json({ error: "Failed to load communication preferences." });
    }
  });

  app.patch("/api/user/preferences", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as { id: string; tier: "free" | "pro" };
      if (user.tier !== "pro") {
        return res.status(403).json({ error: "Communication preferences are a Pro feature." });
      }

      const parsed = z.object({
        communication_style: z.enum(["simple", "balanced", "professional"]).optional(),
        response_format: z.enum(["bullets", "prose"]).optional(),
        explain_terms: z.enum(["always", "once", "never"]).optional(),
      }).refine(
        (value) => Object.values(value).some((entry) => entry !== undefined),
        { message: "At least one preference must be provided." },
      ).safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid communication preferences.",
          details: parsed.error.issues.map((issue) => issue.message),
        });
      }

      await setUserPreferences(user.id, parsed.data);
      const updated = await getUserPreferences(user.id);
      return res.json(updated ?? getDefaultUserPreferences());
    } catch (err) {
      console.error("[user-preferences] PATCH error:", err);
      return res.status(500).json({ error: "Failed to save communication preferences." });
    }
  });

  app.post("/api/user/preferences/reset", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as { id: string; tier: "free" | "pro" };
      if (user.tier !== "pro") {
        return res.status(403).json({ error: "Communication preferences are a Pro feature." });
      }

      await resetUserPreferences(user.id);
      return res.json({ ok: true, preferences: getDefaultUserPreferences() });
    } catch (err) {
      console.error("[user-preferences] RESET error:", err);
      return res.status(500).json({ error: "Failed to reset communication preferences." });
    }
  });

  app.get("/api/custody-laws/:state", (req, res) => {
    const stateName = asString(req.params.state);
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
   * QA-only route to reset the designated fresh-user onboarding state.
   *
   * Guardrails:
   * - Disabled in production.
   * - Requires QA_RESET_TOKEN via x-qa-reset-token header.
   * - Only allows resetting QA_FRESH_USER_EMAIL.
   */
  app.post("/api/qa/reset-onboarding-user", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found." });
    }

    const configuredToken = process.env.QA_RESET_TOKEN?.trim();
    if (!configuredToken) {
      return res.status(503).json({ error: "QA reset route not configured." });
    }

    const providedToken = (req.header("x-qa-reset-token") ?? "").trim();
    if (!providedToken || providedToken !== configuredToken) {
      return res.status(403).json({ error: "Forbidden." });
    }

    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "email is required." });
    }

    const targetEmail = parsed.data.email.trim().toLowerCase();
    const designatedFreshEmail = process.env.QA_FRESH_USER_EMAIL?.trim().toLowerCase();

    if (!designatedFreshEmail) {
      return res.status(503).json({ error: "QA fresh user email not configured." });
    }
const normalizedTargetEmail = targetEmail.trim().toLowerCase();
const normalizedDesignatedFreshEmail = designatedFreshEmail.trim().toLowerCase();

console.log("targetEmail:", JSON.stringify(normalizedTargetEmail));
console.log("designatedFreshEmail:", JSON.stringify(normalizedDesignatedFreshEmail));

if (normalizedTargetEmail !== normalizedDesignatedFreshEmail) {
  return res.status(403).json({ error: "Only the designated QA fresh user can be reset." });
}

    const user = await findAdminUserByEmail(targetEmail);
    if (!user?.id) {
      return res.status(404).json({ error: "Fresh user account not found." });
    }

    const result = await resetOnboardingState(user.id);
    if (!result.ok) {
      console.error("[qa/reset-onboarding-user] failed", {
        reason: result.reason ?? "UNKNOWN",
        supabaseCode: result.error?.code ?? null,
        supabaseMessage: result.error?.message ?? null,
        supabaseDetails: result.error?.details ?? null,
        supabaseHint: result.error?.hint ?? null,
        userId: user.id,
      });
      return res.status(500).json({ error: "Failed to reset fresh user onboarding state." });
    }

    return res.json({
      ok: true,
      reset: {
        email: targetEmail,
        userId: user.id,
        displayName: null,
        welcomeDismissedAt: null,
      },
    });
  });

  app.post("/api/qa/reset-billing", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found." });
    }

    console.log("[qa/reset-billing] called for email:", req.body?.email);

    if (!supabaseAdmin) {
      return res.status(503).json({ error: "Supabase admin client not configured." });
    }

    const configuredToken = process.env.QA_RESET_TOKEN?.trim();
    if (!configuredToken) {
      return res.status(503).json({ error: "QA reset route not configured." });
    }

    const providedToken = (req.header("x-qa-reset-token") ?? "").trim();
    if (!providedToken || providedToken !== configuredToken) {
      return res.status(403).json({ error: "Forbidden." });
    }

    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "email is required." });
    }

    const user = await findAdminUserByEmail(parsed.data.email.trim().toLowerCase());
    if (!user?.id) {
      return res.status(404).json({ error: "User not found." });
    }

    const billingPeriod = new Date();
    billingPeriod.setDate(1);
    billingPeriod.setHours(0, 0, 0, 0);
    const billingPeriodStr = billingPeriod.toISOString().split("T")[0];

    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .upsert({
        id: user.id,
        tier: "free",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        subscription_status: null,
      }, { onConflict: "id" });

    if (profileError) {
      console.error("[qa/reset-billing] profile reset failed", profileError);
      return res.status(500).json({ error: "Failed to reset billing state." });
    }

    const { error: usageError } = await supabaseAdmin
      .from("usage_limits")
      .upsert({
        user_id: user.id,
        date: billingPeriodStr,
        billing_period: billingPeriodStr,
        questions_used: 0,
      }, { onConflict: "user_id,billing_period" });

    if (usageError) {
      console.error("[qa/reset-billing] usage reset failed", usageError);
      return res.status(500).json({ error: "Failed to reset billing usage." });
    }

    console.log("[qa/reset-billing] reset complete, tier set to free");
    return res.json({ success: true });
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
    const state = asString(req.params.state);
    const county = asString(req.params.county);

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

  app.get("/api/resources", requireAuth, async (req, res) => {
    try {
      const state = asString(req.query.state).trim();
      const county = asString(req.query.county).trim();

      if (!state || !county) {
        return res.status(400).json({ error: "state and county are required." });
      }

      const cached = await getCachedResources(state, county);
      if (cached && "government_resources" in cached) {
        return res.json(cached);
      }

      const hasAI = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!hasAI) {
        return res.json(getEmptyResourcesResponse());
      }

      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: buildResourcesPrompt({ state, county }),
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1200,
        temperature: 0.2,
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        return res.json(getEmptyResourcesResponse());
      }

      let parsedResponse: unknown;
      try {
        parsedResponse = JSON.parse(rawContent);
      } catch {
        console.error("[resources] OpenAI returned invalid JSON.");
        return res.json(getEmptyResourcesResponse());
      }

      let normalized: ResourcesResponse;
      try {
        normalized = normalizeResourcesResponse(parsedResponse);
      } catch (error) {
        console.error("[resources] OpenAI resources validation failed:", error);
        return res.json(getEmptyResourcesResponse());
      }

      await cacheResources(state, county, normalized);
      return res.json(normalized);
    } catch (err) {
      console.error("[resources] GET error:", err);
      return res.status(500).json({ error: "Failed to load resources." });
    }
  });

  app.post("/api/resources/attorney-waitlist", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as { id: string; email: string | null };
      const parsed = z.object({
        state: z.string().min(1),
        county: z.string().min(1),
        email: z.string().email().optional(),
      }).safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: "state and county are required." });
      }

      if (!user?.id) {
        return res.status(401).json({ error: "Authenticated user is required." });
      }

      if (!user?.email) {
        return res.status(400).json({ error: "Authenticated user email is required." });
      }

      if (!supabaseAdmin) {
        return res.status(503).json({ error: "Supabase admin client is not configured." });
      }

      const payload = {
        user_id: user.id,
        email: user.email,
        state: parsed.data.state.trim(),
        county: parsed.data.county.trim(),
      };

      const { error } = await supabaseAdmin
        .from("attorney_waitlist")
        .upsert(payload, {
          onConflict: "user_id",
          ignoreDuplicates: false,
        });

      if (error) {
        console.error("[attorney-waitlist] error:", JSON.stringify(error, null, 2));
        return res.status(500).json({ error: "Failed to join attorney waitlist." });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("[attorney-waitlist] error:", JSON.stringify(error, null, 2));
      return res.status(500).json({ error: "Failed to join attorney waitlist." });
    }
  });

  app.post("/api/ask", requireAuth, checkQuestionLimit, async (req, res) => {
    try {
      // Extend the base schema with optional case context fields
      const extendedAskSchema = askAIRequestSchema.extend({
        caseId: z.string().uuid().optional(),
        conversationId: z.string().uuid().optional(),
        useGeneralWorkspace: z.boolean().optional(),
      });

      const parsed = extendedAskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parsed.error.issues.map((i) => i.message),
        });
      }

      const {
        jurisdiction,
        legalContext,
        userQuestion,
        history,
        caseId,
        conversationId: incomingConvId,
        documentId,
        selectedDocumentIds,
      } = parsed.data;
      const useGeneralWorkspace = req.body?.useGeneralWorkspace === true;
      const userId = (req as any).user?.id as string | undefined;
      const usageOverage = (req as any).usageOverage as
        | {
            overageWarning: true;
            questionsUsed: number;
            questionsLimit: number;
          }
        | undefined;
      let effectiveIntent: "FACT" | "EXPLANATION" | "ACTION" = "EXPLANATION";
      let effectiveJurisdiction = { ...jurisdiction };
      let activeCaseRecord: Awaited<ReturnType<typeof getCaseById>> | null = null;
      let jurisdictionMismatchPayload:
        | {
            jurisdictionMismatch: true;
            caseJurisdiction: { state: string; county: string };
            askJurisdiction: { state: string; county: string };
          }
        | null = null;

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
        if (useGeneralWorkspace === true) {
          effectiveCaseId = undefined;
        } else if (!effectiveCaseId) {
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
        activeCaseRecord = await getCaseById(effectiveCaseId, userId);
        if (!activeCaseRecord) {
          console.warn(`[ask] Case not found or unauthorized. caseId=${effectiveCaseId} userId=${userId}`);
          return res.status(403).json({ error: "Case not found or access denied." });
        }

        const caseState = activeCaseRecord.jurisdictionState?.trim();
        const caseCounty = activeCaseRecord.jurisdictionCounty?.trim();
        if (caseState && caseCounty) {
          const sameState = normalizeJurisdictionValue(caseState) === normalizeJurisdictionValue(jurisdiction.state);
          const sameCounty = normalizeJurisdictionValue(caseCounty) === normalizeJurisdictionValue(jurisdiction.county);
          effectiveJurisdiction = {
            ...jurisdiction,
            state: caseState,
            county: caseCounty,
          };
          if (!sameState || !sameCounty) {
            jurisdictionMismatchPayload = {
              jurisdictionMismatch: true,
              caseJurisdiction: { state: caseState, county: caseCounty },
              askJurisdiction: { state: jurisdiction.state, county: jurisdiction.county },
            };
          }
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
            jurisdictionState: effectiveJurisdiction.state,
            jurisdictionCounty: effectiveJurisdiction.county,
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
      const stateLaw = getCustodyLaw(effectiveJurisdiction.state);
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
          : `No specific custody law data is available for ${effectiveJurisdiction.state}. Apply general US family law principles and clearly flag that the user must verify with a local ${effectiveJurisdiction.state} attorney.`;

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
      let contextDocumentsForInsights: SavedDocument[] = [];

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
      effectiveIntent = intent;
      console.log(`[ask] intent="${intent}"${factFields.length ? ` fields=[${factFields.join(",")}]` : ""} documentScoped=${!!scopedDocument}`);

      let intentUserDocs: Awaited<ReturnType<typeof getDocuments>> = [];

      if (intent === "FACT" && userId) {
        // When a document is scoped, use only that document for fact resolution.
        // This ensures FACT answers come from the selected document, not all docs.
        if (scopedDocument) {
          intentUserDocs = [scopedDocument];
        } else {
          const allDocs = effectiveCaseId
            ? await getDocumentsByCase(effectiveCaseId, userId)
            : await getDocuments(userId);
          // If selectedDocumentIds is provided, filter to only those docs.
          // Empty array = no docs selected = skip doc context.
          intentUserDocs = selectedDocumentIds !== undefined
            ? (selectedDocumentIds.length === 0 ? [] : allDocs.filter((d) => selectedDocumentIds.includes(d.id)))
            : allDocs;
        }
        contextDocumentsForInsights = intentUserDocs;
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

        const enrichedEarlyResponse: Record<string, unknown> & { resourcesAvailable: boolean } = {
          ...earlyResponse,
          resourcesAvailable: shouldSurfaceResources({
            intent: effectiveIntent,
            userQuestion,
          }),
          ...(usageOverage ?? {}),
          ...(jurisdictionMismatchPayload ?? {}),
        };

          await trackQuestion(req);
          if (userId) {
            saveQuestion(userId, {
              jurisdictionState: effectiveJurisdiction.state,
              jurisdictionCounty: effectiveJurisdiction.county,
              questionText: userQuestion,
              responseJson: enrichedEarlyResponse,
            }).catch(() => {});
          }
          if (activeConversationId) {
            const earlySummary = typeof enrichedEarlyResponse.summary === "string"
              ? enrichedEarlyResponse.summary
              : "";
            Promise.all([
              appendConversationMessage(activeConversationId, "user", userQuestion),
              appendConversationMessage(activeConversationId, "assistant", earlySummary, enrichedEarlyResponse),
            ]).catch((err) => console.error("[ask] Failed to persist deterministic fact messages:", err));
          }

          return res.json({
            ...enrichedEarlyResponse,
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
      let caseDocumentTextAddendum = "";
      let retainedChunkAddendum = "";

      // When selectedDocumentIds is an empty array, the user has deselected all docs —
      // skip general doc context entirely, regardless of intent.
      const noDocsSelected = Array.isArray(selectedDocumentIds) && selectedDocumentIds.length === 0;

      if (intent !== "FACT" && !scopedDocument && !noDocsSelected && userId) {
        const allRecentDocs = await (
          effectiveCaseId
            ? getDocumentsByCase(effectiveCaseId, userId)
            : getDocuments(userId)
        ).catch(() => []);
        // Filter to selected docs if provided; otherwise use all
        const recentDocs = selectedDocumentIds !== undefined && selectedDocumentIds.length > 0
          ? allRecentDocs.filter((d) => selectedDocumentIds.includes(d.id))
          : allRecentDocs;
        contextDocumentsForInsights = recentDocs;
        if (recentDocs.length > 0) {
          if (effectiveCaseId) {
            caseDocumentTextAddendum = buildCaseDocumentTextAddendum(recentDocs, effectiveJurisdiction.state);
          }
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
      const officialContactAddendum = `

---
OFFICIAL CONTACT INFORMATION RULE
When a user asks for a specific website, phone number, address, or contact information for a government agency, court, or official organization — provide it directly and specifically. Do not describe what the website contains without giving the actual URL. For official government resources (courts, child support agencies, clerk offices, state agencies) you are permitted and expected to provide:
- The actual website URL
- Phone number if known
- Physical address if relevant
Always prefer specific actionable information over general descriptions.
If you are not certain of the exact URL, say so clearly and provide the closest known official source plus suggest they verify.`;
      const caseJurisdictionAddendum = activeCaseRecord?.jurisdictionState && activeCaseRecord?.jurisdictionCounty
        ? `

---
CASE JURISDICTION PRIORITY
This question is about a case in ${activeCaseRecord.jurisdictionCounty}, ${activeCaseRecord.jurisdictionState}.
Answer specifically for that jurisdiction — name the actual courts, agencies, and offices in ${activeCaseRecord.jurisdictionCounty}, ${activeCaseRecord.jurisdictionState}.
Do not give generic statewide answers when county-specific information exists.
Use the case jurisdiction as the primary jurisdiction for this answer, even if the Ask Atlas location differs.`
        : "";

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

      const userSignals = analyzeUserSignals(userQuestion, historyTurns);
      const storedPrefs = userId ? await getUserPreferences(userId) : null;
      const effectivePreferences = storedPrefs
        ? resolveEffectivePreferences(storedPrefs, userSignals)
        : {
            knowledgeLevel: userSignals.knowledgeLevel,
            responseFormat: "bullets" as const,
            explainTerms: userSignals.knowledgeLevel === "beginner",
          };

      const effectiveSignals = {
        ...userSignals,
        knowledgeLevel: effectivePreferences.knowledgeLevel,
        prefersBullets: effectivePreferences.responseFormat === "bullets",
      };

      const baseSystemPrompt =
        buildSystemPrompt(
          effectiveJurisdiction.state,
          effectivePreferences.knowledgeLevel,
        ) +
        `

---
COMMUNICATION PREFERENCES
- Response format: ${effectivePreferences.responseFormat === "prose" ? "Use flowing prose paragraphs unless a numbered process is truly necessary." : "Use organized bullet points when they improve clarity."}
- Explain legal terms: ${effectivePreferences.explainTerms ? "Yes — define legal terms when you use them." : "No — do not define basic legal terms unless the term is unusually technical."}` +
        officialContactAddendum +
        caseJurisdictionAddendum +
        caseMemoryText +
        documentContextAddendum +
        caseDocumentTextAddendum +
        generalDocSummaryAddendum +
        retainedChunkAddendum +
        factModeAddendum;

      const adaptedSystemPrompt = buildAdaptiveSystemPrompt(
        baseSystemPrompt,
        effectiveSignals,
        effectiveJurisdiction,
      );

      if (userId && storedPrefs) {
        updateDetectedPreferences(userId, userSignals, storedPrefs)
          .catch((err) => console.error("preference update error:", err));
      }

      const openAIMessages = [
        { role: "system" as const, content: adaptedSystemPrompt },
        ...historyTurns,
        {
          role: "user" as const,
          content: buildUserPrompt({
            state: effectiveJurisdiction.state,
            county: effectiveJurisdiction.county,
            isUnsupportedState,
            legalContextText,
            userQuestion,
          }),
        },
      ];

      console.log("[ask] OpenAI messages payload:", JSON.stringify(openAIMessages, null, 2));

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: openAIMessages,
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

      const summary = addLegalDisclaimer(validated.data.summary);
      const keyPoints = validated.data.key_points ?? [];
      const proseResponse = typeof validated.data.prose_response === "string"
        ? validated.data.prose_response.trim()
        : "";
      let proactiveInsights: Array<{
        type: "suggested_question" | "contradiction" | "assumption_challenge";
        text: string;
        reason: string;
      }> = [];

      try {
        const responseBodyForInsights = [
          summary,
          proseResponse,
          ...keyPoints,
        ].filter((entry) => typeof entry === "string" && entry.trim().length > 0).join("\n");
        proactiveInsights = await generateProactiveInsights(
          userQuestion,
          responseBodyForInsights,
          contextDocumentsForInsights
            .map((doc) => doc.extractedText || JSON.stringify(doc.analysisJson ?? {}))
            .slice(0, 5),
          historyTurns,
        );
      } catch (err) {
        console.error("[ask] proactive insight generation failed:", err);
      }

      const enrichedResponse = {
        ...validated.data,
        summary,
        ...(proactiveInsights.length > 0 ? { proactive_insights: proactiveInsights } : {}),
        resourcesAvailable: shouldSurfaceResources({
          intent: effectiveIntent,
          userQuestion,
        }),
        ...(usageOverage ?? {}),
        ...(jurisdictionMismatchPayload ?? {}),
      };

      // ── Persist messages when using a case conversation ──────────────────────
      if (activeConversationId) {
        // Fire-and-forget — do not let persistence failures block the response
        Promise.all([
          appendConversationMessage(activeConversationId, "user", userQuestion),
          appendConversationMessage(
            activeConversationId,
            "assistant",
            enrichedResponse.summary,
            enrichedResponse as unknown as Record<string, unknown>,
          ),
        ]).catch((err) => console.error("[ask] Failed to persist case messages:", err));
      }

      await trackQuestion(req);
      if (userId) {
        saveQuestion(userId, {
          jurisdictionState: effectiveJurisdiction.state,
          jurisdictionCounty: effectiveJurisdiction.county,
          questionText: userQuestion,
          responseJson: enrichedResponse as Record<string, unknown>,
        }).catch(() => {});
      }

      // Auto-publish safe questions to the public SEO repository (fire-and-forget).
      maybePublishQuestion({
        state: effectiveJurisdiction.state,
        county: effectiveJurisdiction.county,
        questionText: userQuestion,
        responseJson: enrichedResponse as Record<string, unknown>,
      }).catch((err) => console.error("[publicQuestions] maybePublishQuestion error:", err));

      // Return the AI response, plus intent (always) and conversationId (when case is active)
      // so the client can apply intent-aware rendering and thread subsequent messages.
      return res.json({
        ...enrichedResponse,
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

  app.post("/api/analyze-document", requireAuth, checkDocumentLimit, analyzeUploadMiddleware, async (req, res) => {
    const filePath = req.file?.path;
    const docUserId = (req as any).user?.id as string | undefined;
    const requestedCaseId: string | undefined = req.body?.caseId || undefined;
    const allowDuplicateUpload = String(req.body?.allowDuplicate ?? "").toLowerCase() === "true";
    const uploadMimeType = req.file?.mimetype ?? "unknown";
    const uploadFileName = req.file?.originalname || "document";
    const uploadExtension = getFileExtension(uploadFileName);
    const requestStartedAt = Date.now();
    res.on("finish", () => {
      console.info("[analyze-document] request-finished", {
        uploadFileName,
        uploadMimeType,
        uploadExtension,
        statusCode: res.statusCode,
        durationMs: Date.now() - requestStartedAt,
      });
    });
    const conflictDiagnostics = {
      uploadFileName,
      uploadMimeType,
      uploadExtension,
      duplicateKey: null as string | null,
      fallbackDuplicateKey: null as string | null,
      similarDetectionRan: false,
      similarDocumentFound: false,
      structured409Returned: false,
      parserFailedBeforeConflictHandling: false,
      parserCalled: false,
    };
    console.info("[analyze-document] request-start", {
      uploadFileName,
      uploadMimeType,
      uploadExtension,
      allowDuplicateUpload,
      hasUser: Boolean(docUserId),
      requestedCaseId: requestedCaseId ?? null,
    });
    const buildDuplicateCaseContext = async (documentId: string) => {
      if (!docUserId) {
        return {
          linkedCaseIds: [] as string[],
          linkedCases: [] as Array<{ id: string; title: string }>,
          requestedCaseId: requestedCaseId ?? null,
          requestedCaseTitle: null as string | null,
          isLinkedToRequestedCase: false,
        };
      }

      const [linkedCaseIds, allCases] = await Promise.all([
        getDocumentCaseIds(documentId, docUserId),
        listCases(docUserId).catch(() => []),
      ]);
      const linkedCases = allCases
        .filter((c) => linkedCaseIds.includes(c.id))
        .map((c) => ({ id: c.id, title: c.title }));
      const requestedCaseTitle = requestedCaseId
        ? allCases.find((c) => c.id === requestedCaseId)?.title ?? null
        : null;
      return {
        linkedCaseIds,
        linkedCases,
        requestedCaseId: requestedCaseId ?? null,
        requestedCaseTitle,
        isLinkedToRequestedCase: Boolean(requestedCaseId && linkedCaseIds.includes(requestedCaseId)),
      };
    };
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
        console.warn("[analyze-document] guard-failed", {
          ...conflictDiagnostics,
          guardStatus: guard.status ?? 400,
          guardError: guard.error,
          isDocx,
        });
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
      const sourceFileSha256 = createHash("sha256")
        .update(fileBuffer)
        .digest("hex");
      const duplicateSignatureV1 = createHash("sha256")
        .update(req.file.mimetype ?? "application/octet-stream")
        .update(":")
        .update(String(req.file.size ?? fileBuffer.length))
        .update(":")
        .update(fileBuffer.subarray(0, Math.min(fileBuffer.length, 65536)))
        .digest("hex");
      conflictDiagnostics.duplicateKey = sourceFileSha256;
      conflictDiagnostics.fallbackDuplicateKey = duplicateSignatureV1;

      let extractedText: string;
      try {
        conflictDiagnostics.parserCalled = true;
        console.info("[analyze-document] parser-start", {
          ...conflictDiagnostics,
          parserType: req.file.mimetype === DOCX_MIME ? "mammoth-docx" : "document-ai",
        });
        extractedText = await extractText(fileBuffer, req.file.mimetype);
        console.info("[analyze-document] parser-success", {
          ...conflictDiagnostics,
          extractedChars: extractedText.length,
        });
      } catch (extractErr: any) {
        conflictDiagnostics.parserFailedBeforeConflictHandling = true;
        console.warn("[analyze-document] extraction failed", {
          ...conflictDiagnostics,
          extractionError: extractErr?.message || "unknown",
          stack: extractErr?.stack,
        });
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
      let duplicateDecisionType: DuplicateDecisionType = "NEW_DOCUMENT";
      let duplicateDecisionConfidence: number | null = null;
      let duplicateOfDocumentId: string | null = null;

      if (docUserId && req.file) {
        const fingerprints = buildDuplicateFingerprints({
          fileName: uploadFileName,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size ?? fileBuffer.length,
          sourceKind: typeof req.body?.sourceType === "string" ? req.body.sourceType : "unknown",
          sourceFileHash: sourceFileSha256,
          extractedText: truncatedText,
        });
        const userDocs = await getAllDocumentsForUser(docUserId);
        const intakeDecision = classifyDuplicate(fingerprints, userDocs);
        duplicateDecisionType = intakeDecision.type;
        duplicateDecisionConfidence = intakeDecision.confidence;
        duplicateOfDocumentId = intakeDecision.matchedDocument?.id ?? null;

        if (intakeDecision.type === "SEMANTIC_DUPLICATE" && !intakeDecision.matchedDocument) {
          const semanticMatch = await findDocumentByIntakeTextHash(docUserId, fingerprints.intakeTextHash);
          if (semanticMatch) {
            duplicateOfDocumentId = semanticMatch.id;
          }
        }

        const matched = intakeDecision.matchedDocument;
        const duplicatePayload = matched
          ? {
            type: (
              intakeDecision.type === "EXACT_DUPLICATE" ? "exact"
                : intakeDecision.type === "SEMANTIC_DUPLICATE" ? "semantic"
                  : intakeDecision.type === "LIKELY_DUPLICATE" ? "likely" : "new"
            ) satisfies DocumentDuplicateKind,
            documentId: matched.id,
            existingDocumentId: matched.id,
            fileName: matched.fileName,
            existingDocumentName: matched.fileName,
            fileType: matched.mimeType,
            analysisStatus: getDocumentIntegrity(matched).analysisStatus,
            confidence: intakeDecision.confidence,
            reasons: intakeDecision.reasons,
            ...(await buildDuplicateCaseContext(matched.id)),
          }
          : undefined;

        await recordUploadIntakeAttempt({
          userId: docUserId,
          fileName: uploadFileName,
          normalizedFileName: fingerprints.normalizedFilename,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size ?? fileBuffer.length,
          sourceKind: typeof req.body?.sourceType === "string" ? req.body.sourceType : "unknown",
          fileHash: fingerprints.fileHash,
          intakeTextHash: fingerprints.intakeTextHash,
          intakeTextPreview: fingerprints.intakeTextPreview,
          duplicateDecision: intakeDecision.type,
          duplicateConfidence: intakeDecision.confidence,
          duplicateOfDocumentId,
          allowedActions: {
            canUseExisting: true,
            canUploadAnyway: true,
            canContinueUpload: intakeDecision.type === "LIKELY_DUPLICATE",
          },
          metadata: {
            reasons: intakeDecision.reasons,
          },
        });

        if (!allowDuplicateUpload && intakeDecision.type === "EXACT_DUPLICATE") {
          return res.status(409).json({
            error: "This document already exists in your workspace.",
            details: "View existing or Upload anyway.",
            code: "EXACT_DUPLICATE",
            duplicateDecision: intakeDecision.type,
            duplicate: duplicatePayload,
            options: { canUseExisting: true, canUploadAnyway: true, canReplaceExisting: false, canContinueUpload: false },
            uploadRecorded: false,
          });
        }
        if (!allowDuplicateUpload && intakeDecision.type === "SEMANTIC_DUPLICATE") {
          return res.status(409).json({
            error: "This appears to be the same document already in your workspace, even though the file itself is different.",
            details: "Review existing or Upload anyway.",
            code: "SEMANTIC_DUPLICATE",
            duplicateDecision: intakeDecision.type,
            duplicate: duplicatePayload,
            options: { canUseExisting: true, canUploadAnyway: true, canReplaceExisting: false, canContinueUpload: false },
            uploadRecorded: false,
          });
        }
        if (!allowDuplicateUpload && intakeDecision.type === "LIKELY_DUPLICATE") {
          return res.status(409).json({
            error: "A similar document may already exist in your workspace.",
            details: "Review existing or Continue upload.",
            code: "LIKELY_DUPLICATE",
            duplicateDecision: intakeDecision.type,
            duplicate: duplicatePayload,
            options: { canUseExisting: true, canUploadAnyway: false, canReplaceExisting: false, canContinueUpload: true },
            uploadRecorded: false,
          });
        }
      }

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
      let persistenceErrorDetail: any = null;

      if (docUserId && req.file) {
        const pageCount = parseInt(String(req.body?.pageCount ?? "1"), 10) || 1;
        const documentName = req.file.originalname || "document";
        const retentionTier = resolveRetentionTierFromRequest(req);
        const retentionWindow = buildRetentionWindow(retentionTier);
        const suppressDuplicateMarker = Boolean(docCaseId);
        const analysisWithSourceHash = {
          ...(validated.data as Record<string, unknown>),
          analysis_status: "completed",
          source_file_sha256: sourceFileSha256,
          file_hash: sourceFileSha256,
          normalized_filename: normalizeFileNameStem(documentName),
          file_size_bytes: req.file.size ?? fileBuffer.length,
          source_kind: sourceType,
          intake_text_hash: createHash("sha256").update(truncatedText.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex"),
          intake_text_preview: truncatedText.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500),
          duplicate_signature_v1: duplicateSignatureV1,
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
        const duplicateDoc = allowDuplicateUpload
          ? null
          : await findDuplicateDocument(docUserId, {
            fileHash: sourceFileSha256,
            fallbackSignature: duplicateSignatureV1,
          });
        if (duplicateDoc && !allowDuplicateUpload) {
          const caseContext = await buildDuplicateCaseContext(duplicateDoc.id);
          console.info("[analyze-document] duplicate-check-post-analysis-match", {
            ...conflictDiagnostics,
            duplicateFound: true,
            preventedRowCreation: true,
            matchedDocumentId: duplicateDoc.id,
          });
          return res.status(409).json({
            error: "This document already exists in your workspace.",
            details: "Open the existing document, or choose Upload anyway to keep a separate copy.",
            code: "DOCUMENT_EXACT_DUPLICATE_EXISTS",
            duplicate: {
              type: "exact" satisfies DocumentDuplicateKind,
              documentId: duplicateDoc.id,
              existingDocumentId: duplicateDoc.id,
              fileName: duplicateDoc.fileName,
              existingDocumentName: duplicateDoc.fileName,
              fileType: duplicateDoc.mimeType,
              analysisStatus: getDocumentIntegrity(duplicateDoc).analysisStatus,
              ...caseContext,
            },
            options: {
              canUseExisting: true,
              canUploadAnyway: true,
              canReplaceExisting: false,
            },
            uploadRecorded: false,
          });
        }

        const saveOutcome = duplicateDoc
          ? { status: "duplicate" as const, document: duplicateDoc }
          : await saveDocumentWithDuplicateOutcome(docUserId, {
            fileName: documentName,
            storagePath: null,
            caseId: docCaseId ?? null,
            sourceFileSha256,
            fileHash: sourceFileSha256,
            normalizedFileName: normalizeFileNameStem(documentName),
            fileSizeBytes: req.file.size ?? fileBuffer.length,
            sourceKind: sourceType,
            intakeTextHash: createHash("sha256").update(truncatedText.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex"),
            intakeTextPreview: truncatedText.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500),
            duplicateOfDocumentId: suppressDuplicateMarker || duplicateDecisionType === "NEW_DOCUMENT" ? null : duplicateOfDocumentId,
            duplicateConfidence: suppressDuplicateMarker ? null : duplicateDecisionConfidence,
            retentionTier,
            originalExpiresAt: retentionWindow.originalExpiresAt,
            intelligenceExpiresAt: retentionWindow.intelligenceExpiresAt,
            lifecycleState: "active",
            mimeType: req.file.mimetype,
            pageCount,
            analysisJson: analysisWithSourceHash,
            extractedText: truncatedText,
            docType: "other",
          }).catch((err) => ({
            status: "error" as const,
            error: {
              operation: "saveDocumentWithDuplicateOutcome",
              table: "documents",
              writeMode: "insert" as const,
              code: null,
              message: err instanceof Error ? err.message : "Unknown route-level persistence error",
              details: null,
              hint: null,
              column: null,
              constraint: null,
              isRls: false,
            },
          }));
        const savedDoc = saveOutcome.status === "error" ? null : saveOutcome.document;
        persistenceErrorDetail = saveOutcome.status === "error" ? saveOutcome.error : null;

        if (savedDoc) {
          const isDuplicateUpload = saveOutcome.status === "duplicate";
          duplicateUpload = isDuplicateUpload;
          const uploadOutcome = buildDocumentUploadOutcome({
            fileName: documentName,
            isDuplicate: isDuplicateUpload,
          });
          duplicateMessage = uploadOutcome.userMessage;

          const associationPlan = planUploadAssociation({
            canonicalDocumentId: isDuplicateUpload ? savedDoc.id : null,
            existingCaseIds: isDuplicateUpload
              ? await getDocumentCaseIds(savedDoc.id, docUserId)
              : [],
            requestedCaseId: docCaseId ?? null,
          });

          if (docCaseId && associationPlan.linkToRequestedCase) {
            await ensureDocumentCaseAssociation(savedDoc.id, docCaseId, docUserId).catch(() => false);
          }
          if (isDuplicateUpload) {
            const updated = await updateDocumentAnalysis(savedDoc.id, docUserId, analysisWithSourceHash).catch(() => false);
            if (!updated) {
              console.error("[analyze-document] duplicate analysis update failed", {
                fileName: documentName,
                userId: docUserId,
                analysisCompleted: true,
                operation: "updateDocumentAnalysis",
                table: "documents",
                writeMode: "update",
              });
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

          if (docCaseId) {
            try {
              const signalIntelligence = await extractSignalsFromDocument({
                documentId: savedDoc.id,
                documentText: truncatedText,
              });
              const signalWrite = await replaceDocumentSignals(docCaseId, savedDoc.id, signalIntelligence.signals);
              if (!signalWrite.ok) {
                console.error("[analyze-document] signal persistence failed", {
                  documentId: savedDoc.id,
                  caseId: docCaseId,
                  error: signalWrite.error,
                });
              }
            } catch (signalError) {
              console.error("[analyze-document] signal extraction failed", {
                documentId: savedDoc.id,
                caseId: docCaseId,
                error: signalError,
              });
            }
          }
        }
        if (!savedDoc && saveOutcome.status === "error") {
          const existingDuplicate = await findDuplicateDocument(docUserId, {
            fileHash: sourceFileSha256,
            fallbackSignature: duplicateSignatureV1,
          });
          if (existingDuplicate && !allowDuplicateUpload) {
            const caseContext = await buildDuplicateCaseContext(existingDuplicate.id);
            console.info("[analyze-document] duplicate-check-insert-conflict", {
              ...conflictDiagnostics,
              duplicateFound: true,
              preventedRowCreation: true,
              matchedDocumentId: existingDuplicate.id,
            });
            return res.status(409).json({
              error: "This document already exists in your workspace.",
              details: "Open the existing document, or choose Upload anyway to keep a separate copy.",
              code: "DOCUMENT_EXACT_DUPLICATE_EXISTS",
              duplicate: {
                type: "exact" satisfies DocumentDuplicateKind,
                documentId: existingDuplicate.id,
                existingDocumentId: existingDuplicate.id,
                fileName: existingDuplicate.fileName,
                existingDocumentName: existingDuplicate.fileName,
                fileType: existingDuplicate.mimeType,
                analysisStatus: getDocumentIntegrity(existingDuplicate).analysisStatus,
                ...caseContext,
              },
              options: {
                canUseExisting: true,
                canUploadAnyway: true,
                canReplaceExisting: false,
              },
              uploadRecorded: false,
            });
          }
        }
      }

      if (docUserId && req.file && !savedDocumentId) {
        const errorDetail = persistenceErrorDetail;
        console.error("[analyze-document] persistence failure: analysis succeeded but document row was not saved", {
          fileName: req.file.originalname ?? "document",
          userId: docUserId,
          analysisCompleted: true,
          operation: (errorDetail?.operation as string | undefined) ?? "saveDocumentWithDuplicateOutcome",
          table: (errorDetail?.table as string | undefined) ?? "documents",
          writeMode: (errorDetail?.writeMode as string | undefined) ?? "insert",
          errorCode: (errorDetail?.code as string | undefined) ?? null,
          errorMessage: (errorDetail?.message as string | undefined) ?? null,
          errorDetails: (errorDetail?.details as string | undefined) ?? null,
          errorHint: (errorDetail?.hint as string | undefined) ?? null,
          column: (errorDetail?.column as string | undefined) ?? null,
          constraint: (errorDetail?.constraint as string | undefined) ?? null,
          isRls: (errorDetail?.isRls as boolean | undefined) ?? false,
          supabaseContext: "service_role_admin_client",
        });
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
        duplicateDecision: duplicateDecisionType,
      });
    } catch (err: any) {
      if (docUserId && req.file) {
        console.error("[analyze-document] unhandled error after conflict pre-check", conflictDiagnostics);
      }
      const isDocxUpload = req.file?.mimetype === DOCX_MIME;
      if (isDocxUpload) {
        console.error("[analyze-document] docx-unhandled-error", {
          ...conflictDiagnostics,
          error: err?.message ?? "unknown",
          stack: err?.stack,
        });
      }
      console.error("Document analysis error:", err);
      if (isDocxUpload) {
        return res.status(422).json({
          error: "DOCX analysis is not available yet. Please upload PDF.",
          code: "DOCUMENT_DOCX_NOT_AVAILABLE",
          uploadRecorded: false,
        });
      }
      return res.status(500).json({
        error: "We couldn't analyze that document right now. Please try again.",
        details: getSafeErrorMessage(err, "Failed to analyze document. Please try again."),
        code: "DOCUMENT_ANALYSIS_FAILED",
        uploadRecorded: false,
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
      const stateSlug = asString(req.params.stateSlug);
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
      const stateSlug = asString(req.params.stateSlug);
      const topic = asString(req.params.topic);
      const slug = asString(req.params.slug);
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
      console.info("[trace][workspace-api] raw canonical DB rows", rawDocuments.map((doc) => ({
        id: doc.id,
        file_name: doc.fileName,
        user_id: doc.userId,
        duplicateOfDocumentId: doc.duplicateOfDocumentId ?? null,
        duplicate_of_document_id: doc.duplicateOfDocumentId ?? null,
        canonical: !doc.duplicateOfDocumentId,
      })));
      const canonicalMarkedDocuments = rawDocuments.filter((doc) => !doc.duplicateOfDocumentId);
      if (canonicalMarkedDocuments.length !== rawDocuments.length) {
        console.warn("[trace][workspace-api] filtered duplicate-marked rows from live response", {
          userId: user.id,
          before: rawDocuments.length,
          after: canonicalMarkedDocuments.length,
          removedDocumentIds: rawDocuments
            .filter((doc) => !!doc.duplicateOfDocumentId)
            .map((doc) => doc.id),
        });
      }
      const findIdentityKey = (doc: SavedDocument): string | null => {
        const sourceHash = doc.sourceFileSha256?.trim().toLowerCase() || doc.fileHash?.trim().toLowerCase() || "";
        if (sourceHash) return `source:${sourceHash}`;
        const intakeTextHash = doc.intakeTextHash?.trim().toLowerCase() || "";
        if (intakeTextHash) return `text:${intakeTextHash}`;
        return null;
      };
      const pickPreferredDocument = (a: SavedDocument, b: SavedDocument): SavedDocument => {
        const aIntegrity = getDocumentIntegrity(a);
        const bIntegrity = getDocumentIntegrity(b);
        const scoreA = (aIntegrity.isAnalysisAvailable ? 100 : 0) + (a.caseId ? 10 : 0);
        const scoreB = (bIntegrity.isAnalysisAvailable ? 100 : 0) + (b.caseId ? 10 : 0);
        if (scoreA !== scoreB) return scoreA > scoreB ? a : b;
        return new Date(a.createdAt).getTime() <= new Date(b.createdAt).getTime() ? a : b;
      };
      const canonicalDocumentsByIdentity = new Map<string, SavedDocument>();
      const canonicalDocumentsWithoutIdentity: SavedDocument[] = [];
      for (const doc of canonicalMarkedDocuments) {
        const identityKey = findIdentityKey(doc);
        if (!identityKey) {
          canonicalDocumentsWithoutIdentity.push(doc);
          continue;
        }
        const existing = canonicalDocumentsByIdentity.get(identityKey);
        if (!existing) {
          canonicalDocumentsByIdentity.set(identityKey, doc);
          continue;
        }
        canonicalDocumentsByIdentity.set(identityKey, pickPreferredDocument(existing, doc));
      }
      const normalizeVisibleFileName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, " ");
      const findSummarySignature = (doc: SavedDocument): string => {
        const summary = typeof (doc.analysisJson as Record<string, unknown>)?.summary === "string"
          ? ((doc.analysisJson as Record<string, unknown>).summary as string)
          : "";
        return summary
          .trim()
          .toLowerCase()
          .normalize("NFKC")
          .replace(/[^a-z0-9]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180);
      };
      const findCaseWorkspaceGroupingKey = (doc: SavedDocument): string => `${doc.userId}|${doc.caseId ?? "workspace"}`;
      const buildVisibleFallbackDiagnosticRow = (doc: SavedDocument) => {
        const normalizedFileName = normalizeVisibleFileName(doc.fileName);
        const summarySignature = findSummarySignature(doc);
        return {
          id: doc.id,
          file_name: doc.fileName,
          user_id: doc.userId,
          duplicate_of_document_id: doc.duplicateOfDocumentId ?? null,
          case_workspace_grouping_key: findCaseWorkspaceGroupingKey(doc),
          normalized_filename: normalizedFileName,
          summary_signature: summarySignature,
          source_kind: doc.sourceKind ?? null,
        };
      };
      const canonicalDocumentsByVisibleKey = new Map<string, SavedDocument>();
      const canonicalDocumentsWithoutVisibleKey: SavedDocument[] = [];
      for (const doc of canonicalDocumentsWithoutIdentity) {
        const normalizedName = normalizeVisibleFileName(doc.fileName);
        const summarySignature = findSummarySignature(doc);
        if (!normalizedName || !summarySignature) {
          canonicalDocumentsWithoutVisibleKey.push(doc);
          continue;
        }
        const visibleKey = `${findCaseWorkspaceGroupingKey(doc)}|${normalizedName}|${summarySignature}`;
        const existing = canonicalDocumentsByVisibleKey.get(visibleKey);
        if (!existing) {
          canonicalDocumentsByVisibleKey.set(visibleKey, doc);
          continue;
        }
        canonicalDocumentsByVisibleKey.set(visibleKey, pickPreferredDocument(existing, doc));
      }
      const canonicalFromVisibleKeys = Array.from(canonicalDocumentsByVisibleKey.values());
      const canonicalDocuments = [
        ...Array.from(canonicalDocumentsByIdentity.values()),
        ...canonicalFromVisibleKeys,
        ...canonicalDocumentsWithoutVisibleKey,
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (canonicalFromVisibleKeys.length !== canonicalDocumentsWithoutIdentity.length) {
        const keptVisibleIds = new Set(canonicalFromVisibleKeys.map((doc) => doc.id));
        console.warn("[trace][workspace-api] filtered visible-collision rows lacking identity hash", {
          userId: user.id,
          before: canonicalDocumentsWithoutIdentity.length,
          after: canonicalFromVisibleKeys.length + canonicalDocumentsWithoutVisibleKey.length,
          removedDocumentIds: canonicalDocumentsWithoutIdentity
            .filter((doc) => !keptVisibleIds.has(doc.id) && !!findSummarySignature(doc))
            .map((doc) => doc.id),
        });
      }
      if (canonicalDocuments.length !== canonicalMarkedDocuments.length) {
        const keptIds = new Set(canonicalDocuments.map((doc) => doc.id));
        console.warn("[trace][workspace-api] filtered identity-colliding canonical rows", {
          userId: user.id,
          before: canonicalMarkedDocuments.length,
          after: canonicalDocuments.length,
          removedDocumentIds: canonicalMarkedDocuments
            .filter((doc) => !keptIds.has(doc.id))
            .map((doc) => doc.id),
        });
      }
      const duplicateLookingGroups = new Map<string, SavedDocument[]>();
      for (const doc of canonicalDocuments) {
        const normalizedName = normalizeVisibleFileName(doc.fileName);
        if (!normalizedName) continue;
        const groupKey = `${findCaseWorkspaceGroupingKey(doc)}|${normalizedName}`;
        const rows = duplicateLookingGroups.get(groupKey) ?? [];
        rows.push(doc);
        duplicateLookingGroups.set(groupKey, rows);
      }
      const duplicateLookingRows = Array.from(duplicateLookingGroups.entries())
        .filter(([, rows]) => rows.length > 1)
        .map(([groupKey, rows]) => {
          const diagnostics = rows.map((row) => buildVisibleFallbackDiagnosticRow(row));
          const summarySignatures = Array.from(new Set(diagnostics.map((row) => row.summary_signature)));
          const sourceKinds = Array.from(new Set(diagnostics.map((row) => row.source_kind ?? "unknown")));
          return {
            group_key: groupKey,
            summary_signatures: summarySignatures,
            source_kinds: sourceKinds,
            rows: diagnostics,
            fallback_miss_reason: summarySignatures.length > 1
              ? "summary_signatures_differ"
              : sourceKinds.length > 1
                ? "different_data_sources"
                : "emitted_by_api_workspace",
          };
        });
      if (duplicateLookingRows.length > 0) {
        console.warn("[trace][workspace-api] visible duplicate-looking rows remained after fallback", {
          userId: user.id,
          endpoint: "/api/workspace",
          groups: duplicateLookingRows,
        });
      }
      // Strip internal fields (storagePath, extractedText) from workspace response;
      // expose hasStoragePath flag so the UI can show a broken-file indicator.
      const documents = canonicalDocuments.map(({ storagePath, extractedText, ...safe }) => {
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
      const responseRows = documents.map((d) => ({
        id: d.id,
        file_name: d.fileName,
        duplicate_of_document_id: d.duplicateOfDocumentId ?? null,
      }));
      console.info("[trace][workspace-api] response rows", responseRows);
      const duplicateRowsInResponse = responseRows.filter((row) => !!row.duplicate_of_document_id);
      if (duplicateRowsInResponse.length > 0) {
        console.warn("[trace][workspace-api] duplicate-marked rows reached /api/workspace response", {
          userId: user.id,
          count: duplicateRowsInResponse.length,
          rows: duplicateRowsInResponse,
        });
      }
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
    const threadId = asString(req.params.threadId);

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
    const threadId = asString(req.params.threadId);
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
    const eventId = asString(req.params.eventId);
    try {
      await deleteTimelineEvent(eventId, user.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[timeline] DELETE error:", err);
      return res.status(500).json({ error: "Failed to delete timeline event." });
    }
  });

  app.post("/api/signals/:id/dismiss", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const id = asString(req.params.id);

    try {
      const result = await dismissSignalForUser(id, user.id);
      if (!result.ok) {
        console.error("[signals] dismiss error", {
          signalId: id,
          userId: user.id,
          error: result.error,
        });
        return res.status(500).json({ error: "Failed to dismiss signal." });
      }
      if (result.notFound) {
        return res.status(404).json({ error: "Signal not found." });
      }
      return res.json({ ok: true, id, dismissed: true });
    } catch (error) {
      console.error("[signals] dismiss exception", {
        signalId: id,
        userId: user.id,
        error,
      });
      return res.status(500).json({ error: "Failed to dismiss signal." });
    }
  });

  app.get("/api/signals", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const caseId = typeof req.query.caseId === "string" ? req.query.caseId.trim() : "";
    const documentId = typeof req.query.documentId === "string" ? req.query.documentId.trim() : "";

    if (!caseId && !documentId) {
      return res.status(400).json({ error: "caseId or documentId is required." });
    }

    try {
      const result = caseId
        ? await listSignalsForCase(caseId, user.id)
        : await listSignalsForDocument(documentId, user.id);

      if (!result.ok) {
        console.error("[signals] list error", {
          userId: user.id,
          caseId: caseId || null,
          documentId: documentId || null,
          error: result.error,
        });
        return res.status(500).json({ error: "Failed to load signals." });
      }

      if (result.notFound) {
        return res.status(404).json({ error: "Signal scope not found." });
      }

      return res.json({ signals: result.signals ?? [] });
    } catch (error) {
      console.error("[signals] list exception", {
        userId: user.id,
        caseId: caseId || null,
        documentId: documentId || null,
        error,
      });
      return res.status(500).json({ error: "Failed to load signals." });
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
    const documentId = asString(req.params.documentId);
    try {
      const doc = await getDocumentById(documentId, user.id);
      if (!doc) return res.status(404).json({ error: "Document not found." });

      const truncatedText = doc.extractedText.slice(0, 14000);
      if (truncatedText.trim().length < 20) {
        return res.status(422).json({ error: "This document has no stored text to re-analyze." });
      }
      await updateDocumentLifecycleStatuses(documentId, user.id, {
        ocrStatus: "completed",
        analysisStatus: "pending",
      }).catch(() => false);

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
        analysis_status: "completed",
      };
      // Update the existing document row — no new row created
      const updated = await updateDocumentAnalysis(documentId, user.id, analysisPayload).catch(() => false);
      if (!updated) {
        await updateDocumentLifecycleStatuses(documentId, user.id, { analysisStatus: "failed" }).catch(() => false);
        return res.status(500).json({
          error: "Re-analysis finished, but we could not persist the result. Please try again.",
          code: "DOCUMENT_PERSISTENCE_FAILED",
        });
      }

      return res.json({ ...validated.data, extractedText: truncatedText, documentId });
    } catch (err: any) {
      await updateDocumentLifecycleStatuses(documentId, user.id, { analysisStatus: "failed" }).catch(() => false);
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
    const documentId = asString(req.params.documentId);
    try {
      console.info(`[documents] detail request user=${user.id} documentId=${documentId}`);
      const doc = await getDocumentById(documentId, user.id);
      if (!doc) return res.status(404).json({ error: "Document not found." });
      if (doc.duplicateOfDocumentId) {
        const canonicalDoc = await getDocumentById(doc.duplicateOfDocumentId, user.id);
        return res.status(409).json({
          code: "DOCUMENT_SUPERSEDED",
          error: "This document was merged into another record.",
          document: {
            id: doc.id,
            fileName: doc.fileName,
            duplicateOfDocumentId: doc.duplicateOfDocumentId,
          },
          canonicalDocument: canonicalDoc
            ? {
              id: canonicalDoc.id,
              fileName: canonicalDoc.fileName,
            }
            : null,
        });
      }
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
    const documentId = asString(req.params.documentId);
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
    const documentId = asString(req.params.documentId);
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
    const documentId = asString(req.params.documentId);
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
    const documentId = asString(req.params.documentId);
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
    const documentId = asString(req.params.documentId);
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
    const userId = asString(req.params.userId);
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
    const codeId = asString(req.params.codeId);
    const ok = await deactivateInviteCode(codeId);
    if (!ok) return res.status(500).json({ error: "Failed to deactivate code." });
    return res.json({ ok: true });
  });

  // POST /api/admin/cases/:caseId/refresh-signals — force fresh signal extraction for a case
  app.post("/api/admin/cases/:caseId/refresh-signals", requireAdmin, async (req, res) => {
    const caseId = asString(req.params.caseId);

    if (!supabaseAdmin) {
      return res.status(503).json({ error: "Supabase admin client is not configured." });
    }

    try {
      const { data: caseRow, error: caseError } = await supabaseAdmin
        .from("cases")
        .select("id, title, jurisdiction_state, jurisdiction_county")
        .eq("id", caseId)
        .maybeSingle();

      if (caseError) {
        console.error("[admin] refresh-signals case lookup error:", caseError);
        return res.status(500).json({ error: "Failed to load case." });
      }

      if (!caseRow) {
        return res.status(404).json({ error: "Case not found." });
      }

      const deleted = await deleteSignalsForCase(caseId);
      if (!deleted.ok) {
        console.error("[admin] refresh-signals delete error:", deleted.error);
        return res.status(500).json({ error: "Failed to clear cached signals." });
      }

      const { data: rawDocuments, error: docsError } = await supabaseAdmin
        .from("documents")
        .select("id, case_id, file_name, extracted_text, analysis_json")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });

      if (docsError) {
        console.error("[admin] refresh-signals documents lookup error:", docsError);
        return res.status(500).json({ error: "Failed to load case documents." });
      }

      const documents = Array.isArray(rawDocuments)
        ? rawDocuments.filter((row): row is {
            id: string;
            case_id: string;
            file_name: string | null;
            extracted_text: string | null;
            analysis_json: Record<string, unknown> | null;
          } => typeof row?.id === "string" && typeof row?.case_id === "string")
        : [];

      const refreshedSignals: Array<Record<string, unknown>> = [];
      const refreshedDocuments: Array<{ documentId: string; insertedSignals: number }> = [];

      for (const doc of documents) {
        const extractedText = typeof doc.extracted_text === "string" ? doc.extracted_text.trim() : "";
        if (!extractedText) continue;

        const additionalContext = (() => {
          const summary = typeof doc.analysis_json?.summary === "string" ? doc.analysis_json.summary.trim() : "";
          const fileLabel = typeof doc.file_name === "string" && doc.file_name.trim().length > 0
            ? `Document: ${doc.file_name.trim()}`
            : "";
          return [fileLabel, summary ? `Existing summary: ${summary}` : ""].filter(Boolean).join("\n");
        })();

        const signalIntelligence = await extractSignalsFromDocument({
          documentId: doc.id,
          documentText: extractedText,
          additionalContext: additionalContext || undefined,
        });

        const signalWrite = await replaceDocumentSignals(caseId, doc.id, signalIntelligence.signals);
        if (!signalWrite.ok) {
          console.error("[admin] refresh-signals write error:", {
            caseId,
            documentId: doc.id,
            error: signalWrite.error,
          });
          return res.status(500).json({ error: "Failed to refresh extracted signals." });
        }

        refreshedDocuments.push({
          documentId: doc.id,
          insertedSignals: signalWrite.insertedCount ?? signalIntelligence.signals.length,
        });

        refreshedSignals.push({
          documentId: doc.id,
          primaryPriority: signalIntelligence.primaryPriority,
          risks: signalIntelligence.risks,
          timeline: signalIntelligence.timeline,
          signals: signalIntelligence.signals,
        });
      }

      return res.json({
        ok: true,
        case: {
          id: caseRow.id,
          title: caseRow.title,
          jurisdictionState: caseRow.jurisdiction_state,
          jurisdictionCounty: caseRow.jurisdiction_county,
        },
        deletedCachedSignals: deleted.deletedCount ?? 0,
        refreshedDocuments,
        refreshedSignals,
      });
    } catch (err) {
      console.error("[admin] refresh-signals exception:", err);
      return res.status(500).json({ error: "Failed to refresh signals." });
    }
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
      title: z.string().min(1).max(200).optional(),
      name: z.string().min(1).max(200).optional(),
      caseType: z.enum(["custody", "child_support", "custody_and_support"]).optional(),
      stateCode: z.string().trim().min(2).max(64).optional(),
      jurisdictionState: z.string().trim().min(2).max(64).optional(),
      situation_type: z.string().trim().min(1).max(80).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid case payload.", details: parsed.error.flatten() });
    }
    const caseTitle = parsed.success
      ? (parsed.data.title ?? parsed.data.name)?.trim()
      : "";
    if (!caseTitle) {
      return res.status(400).json({ error: "Invalid case payload.", details: { fieldErrors: { title: ["Case name is required."] } } });
    }
    try {
      const resolvedStateCode =
        resolveUSStateCode(parsed.data.stateCode)
        ?? resolveUSStateCode(parsed.data.jurisdictionState)
        ?? "US";
      const existingCases = await listCases(user.id, 2);
      const isFirstCase = existingCases.length === 0;
      const createCaseResult = await createCaseWithDiagnostics(user.id, {
        title: caseTitle,
        caseType: parsed.data.caseType ?? "custody",
        status: "active",
        stateCode: resolvedStateCode,
        authToken: asString(req.headers.authorization).replace("Bearer ", "").trim() || null,
        description: parsed.data.situation_type
          ? JSON.stringify({ situation_type: parsed.data.situation_type })
          : null,
      });
      const newCase = createCaseResult.createdCase;
      if (!newCase) {
        const errorId = `case_create_${Date.now().toString(36)}`;
        console.error("[cases] create-case storage failure", {
          errorId,
          userId: user.id,
          requestPayload: {
            title: caseTitle,
            caseType: parsed.data.caseType ?? "custody",
            stateCode: resolvedStateCode,
            situationType: parsed.data.situation_type ?? null,
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
    const caseId = asString(req.params.caseId);
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
    const caseId = asString(req.params.caseId);
    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });
      return res.json({ case: caseRecord });
    } catch (err) {
      console.error("[cases] GET :caseId error:", err);
      return res.status(500).json({ error: "Failed to load case." });
    }
  });

  app.get("/api/cases/:caseId/strength", requireAuth, async (req, res) => {
    const user = (req as any).user as { id: string };
    const caseId = asString(req.params.caseId);

    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });

      const [documents, signalResult] = await Promise.all([
        getDocumentsByCase(caseId, user.id),
        listSignalsForCase(caseId, user.id),
      ]);
      const signals = signalResult.signals ?? [];
      const sourceSignature = buildCaseStrengthSourceSignature(documents, signals);

      const cacheQuery = await supabaseAdmin
        ?.from("cases")
        .select("strength_report_json, strength_cached_at")
        .eq("id", caseId)
        .eq("user_id", user.id)
        .maybeSingle();

      const cachedPayload = (cacheQuery?.data?.strength_report_json ?? null) as
        | { sourceSignature?: string; report?: CaseStrengthReport }
        | null;

      if (cachedPayload?.sourceSignature === sourceSignature && cachedPayload.report) {
        return res.json(cachedPayload.report);
      }

      const report = await analyzeCaseStrength(
        documents.map((doc) => doc.extractedText || JSON.stringify(doc.analysisJson ?? {})),
        signals,
        {
          state: caseRecord.jurisdictionState ?? "Georgia",
          county: caseRecord.jurisdictionCounty ?? "Unknown County",
        },
      );

      await supabaseAdmin
        ?.from("cases")
        .update({
          strength_report_json: { sourceSignature, report },
          strength_cached_at: new Date().toISOString(),
        })
        .eq("id", caseId)
        .eq("user_id", user.id);

      return res.json(report);
    } catch (err) {
      console.error("[cases] GET strength error:", err);
      return res.status(500).json({ error: "Failed to analyze case strength." });
    }
  });

  app.post("/api/cases/:caseId/strength/refresh", requireAuth, async (req, res) => {
    const user = (req as any).user as { id: string };
    const caseId = asString(req.params.caseId);

    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });

      const [documents, signalResult] = await Promise.all([
        getDocumentsByCase(caseId, user.id),
        listSignalsForCase(caseId, user.id),
      ]);
      const signals = signalResult.signals ?? [];
      const sourceSignature = buildCaseStrengthSourceSignature(documents, signals);

      const report = await analyzeCaseStrength(
        documents.map((doc) => doc.extractedText || JSON.stringify(doc.analysisJson ?? {})),
        signals,
        {
          state: caseRecord.jurisdictionState ?? "Georgia",
          county: caseRecord.jurisdictionCounty ?? "Unknown County",
        },
      );

      await supabaseAdmin
        ?.from("cases")
        .update({
          strength_report_json: { sourceSignature, report },
          strength_cached_at: new Date().toISOString(),
        })
        .eq("id", caseId)
        .eq("user_id", user.id);

      return res.json(report);
    } catch (err) {
      console.error("[cases] POST strength refresh error:", err);
      return res.status(500).json({ error: "Failed to refresh case strength." });
    }
  });

  /**
   * GET /api/cases/:caseId/dashboard
   * Single aggregated payload for case dashboard UI.
   */
  app.get("/api/cases/:caseId/dashboard", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const caseId = asString(req.params.caseId);
    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });

      const [documents, timelineEvents, actions] = await Promise.all([
        getDocumentsByCase(caseId, user.id),
        deriveCaseTimeline(caseId, user.id),
        getCaseActions(caseId, user.id),
      ]);

      const normalizedTimeline = normalizeDashboardTimeline(timelineEvents);
      const primaryTimeline = normalizedTimeline.filter((event) => event.bucket === "primary");
      const secondaryTimeline = normalizedTimeline.filter((event) => event.bucket === "secondary");
      const visibleTimelineLimit = 10;
      const visibleTimeline = primaryTimeline.slice(0, visibleTimelineLimit);
      const upcomingEvents = primaryTimeline.filter((event) => event.status === "upcoming");
      const overdueEvents = primaryTimeline.filter((event) => event.status === "overdue");

      const openActions = actions
        .filter((action) => action.status === "open")
        .slice(0, 4);
      const stage = classifyDashboardStage(primaryTimeline, documents.length);

      const watchouts: string[] = [];
      if (overdueEvents.length > 0) watchouts.push(`${overdueEvents.length} past-due court item${overdueEvents.length > 1 ? "s require" : " requires"} attention`);
      if (documents.length === 0) watchouts.push("Foundational court documents are missing");
      const missingSummaryDocs = documents.filter((doc) => !getDocumentIntegrity(doc).isAnalysisAvailable);
      if (missingSummaryDocs.length > 0) watchouts.push(`${missingSummaryDocs.length} document${missingSummaryDocs.length > 1 ? "s need" : " needs"} analysis review`);

      const suggestedFocusByStage: Record<DashboardStageKey, string> = {
        approaching_hearing: "Confirm hearing readiness and close outstanding preparation items.",
        between_pretrial_and_final: "Review unresolved motions, pending orders, and final-hearing preparation.",
        preparing_for_deadlines: "Prioritize the next filing deadline and confirm supporting documents are complete.",
        early_intake: "Add core filings and key dates to establish reliable case visibility.",
      };
      const suggestedFocus = suggestedFocusByStage[stage.key];

      const nextKeyItems = (() => {
        const ranked: NormalizedDashboardTimelineEvent[] = [];
        const seen = new Set<string>();
        for (const event of upcomingEvents) {
          const day = event.dateParsed ? event.dateParsed.toISOString().slice(0, 10) : event.dateRaw;
          const group = `${day}:${event.normalizedType === "deadline" ? "hearing_or_deadline" : event.normalizedType}`;
          if (seen.has(group)) continue;
          seen.add(group);
          ranked.push(event);
          if (ranked.length >= 3) break;
        }
        return ranked.map((event) => ({
          date: event.dateRaw,
          label: event.normalizedLabel,
          whyThisMatters: eventWhyThisMatters(event.normalizedType, event.normalizedLabel) ?? undefined,
        }));
      })();

      const postureByStage: Record<DashboardStageKey, string> = {
        approaching_hearing: "This case is active and approaching a hearing.",
        between_pretrial_and_final: "This case is active between major court milestones.",
        preparing_for_deadlines: "This case is active and focused on upcoming deadlines.",
        early_intake: "This case is in early intake and still being organized.",
      };

      const keyDocSignals = [
        { label: "initiating filing", matches: ["petition", "complaint", "application"] },
        { label: "court order", matches: ["order", "judgment", "decree"] },
        { label: "hearing notice", matches: ["notice of hearing", "hearing notice", "hearing"] },
        { label: "motion/response filing", matches: ["motion", "response", "reply"] },
      ];
      const normalizedDocTitles = documents.map((doc) => doc.fileName.toLowerCase());
      const keyDocCoverage = keyDocSignals.map((signal) => ({
        label: signal.label,
        present: normalizedDocTitles.some((title) => signal.matches.some((needle) => title.includes(needle))),
      }));
      const missingKeyDocs = keyDocCoverage.filter((signal) => !signal.present);
      const keyDocsPresentCount = keyDocCoverage.length - missingKeyDocs.length;

      const now = Date.now();
      const upcomingCriticalEvents = primaryTimeline.filter((event) => (
        (event.normalizedType === "hearing" || event.normalizedType === "deadline")
        && (event.status === "upcoming" || event.status === "future")
        && Boolean(event.dateParsed)
      ));
      const nextCriticalDaysAway = upcomingCriticalEvents.reduce<number | null>((closest, event) => {
        if (!event.dateParsed) return closest;
        const daysAway = Math.ceil((event.dateParsed.getTime() - now) / (1000 * 60 * 60 * 24));
        if (daysAway < 0) return closest;
        if (closest === null) return daysAway;
        return Math.min(closest, daysAway);
      }, null);
      const upcomingHearingDays = primaryTimeline.reduce<number | null>((closest, event) => {
        if (event.normalizedType !== "hearing" || !event.dateParsed) return closest;
        const daysAway = Math.ceil((event.dateParsed.getTime() - now) / (1000 * 60 * 60 * 24));
        if (daysAway < 0) return closest;
        if (closest === null) return daysAway;
        return Math.min(closest, daysAway);
      }, null);
      const upcomingDeadlineDays = primaryTimeline.reduce<number | null>((closest, event) => {
        if (event.normalizedType !== "deadline" || !event.dateParsed) return closest;
        const daysAway = Math.ceil((event.dateParsed.getTime() - now) / (1000 * 60 * 60 * 24));
        if (daysAway < 0) return closest;
        if (closest === null) return daysAway;
        return Math.min(closest, daysAway);
      }, null);
      const conflictingTimelineEvents = hasConflictingTimelineEvents(primaryTimeline);
      const activityTimestamps = [
        ...documents.map((doc) => Date.parse(doc.createdAt)),
        ...actions.map((action) => Date.parse(String(action.createdAt))),
      ].filter((value) => Number.isFinite(value));
      const lastActivityTimestamp = activityTimestamps.length > 0 ? Math.max(...activityTimestamps) : null;
      const daysSinceLastActivity = lastActivityTimestamp !== null
        ? Math.floor((now - lastActivityTimestamp) / (1000 * 60 * 60 * 24))
        : null;
      const { riskScore: baseRiskScore, riskLevel: baseRiskLevel } = computeCaseRiskScore({
        hasOverdueItems: overdueEvents.length > 0,
        upcomingHearingDays,
        upcomingDeadlineDays,
        hasMissingKeyDocuments: missingKeyDocs.length > 0,
        hasConflictingTimelineEvents: conflictingTimelineEvents,
        daysSinceLastActivity,
      });
      const riskScore = baseRiskScore;
      const riskLevel = baseRiskLevel;

      const urgency: "Low" | "Medium" | "High" = (() => {
        if (overdueEvents.length > 0) return "High";
        if ((nextCriticalDaysAway !== null && nextCriticalDaysAway <= 7) || missingKeyDocs.length >= 2) return "High";
        if ((nextCriticalDaysAway !== null && nextCriticalDaysAway <= 21) || openActions.length > 0 || missingKeyDocs.length > 0) return "Medium";
        return "Low";
      })();

      const documentCompleteness: "Strong" | "Partial" | "Needs review" = (() => {
        if (documents.length === 0 || keyDocsPresentCount <= 1) return "Needs review";
        if (missingKeyDocs.length === 0) return "Strong";
        return "Partial";
      })();

      const immediateConcern = (() => {
        if (overdueEvents.length > 0) return "A court-related item appears overdue and should be reviewed immediately.";
        if (nextCriticalDaysAway !== null && nextCriticalDaysAway <= 7) return "A hearing or filing deadline is very close and needs immediate preparation.";
        if (missingKeyDocs.length > 0) return "Key case documents appear missing and should be uploaded or verified.";
        if (missingSummaryDocs.length > 0) return "A document appears unanalyzed and should be checked for missing dates or obligations.";
        return "No immediate risks are flagged; continue routine case monitoring.";
      })();

      const snapshotCurrentSituation = normalizedTimeline.length > 0
        ? `This case includes ${primaryTimeline.length} court-related event${primaryTimeline.length > 1 ? "s" : ""}, with ${upcomingEvents.length} upcoming.`
        : "No court-related events have been added yet.";

      const keyPoints = [
        `${documents.length} case document${documents.length === 1 ? "" : "s"} on file.`,
        `${openActions.length} open action${openActions.length === 1 ? "" : "s"} need follow-through.`,
        nextKeyItems[0] ? `Next key date: ${nextKeyItems[0].date} (${nextKeyItems[0].label}).` : "No upcoming key date has been identified.",
        caseRecord.status ? `Case status is ${caseRecord.status}.` : "Case status is not set.",
      ].slice(0, 4);

      const thingsToWatch = [
        overdueEvents.length > 0 ? "Past-due items should be reviewed now." : "No past-due hearing or deadline items.",
        documents.length === 0 ? "Document coverage gap: add foundational filings." : "Document set should be checked for completeness.",
        primaryTimeline.length < 2 ? "Event coverage is thin; verify missing dates." : "Confirm upcoming dates against the latest court notices.",
      ].slice(0, 3);

      const extractedFacts = documents.flatMap((doc) => {
        const ef = (doc.analysisJson?.extracted_facts ?? {}) as Record<string, unknown>;
        const facts: string[] = [];
        if (typeof ef.case_number === "string" && ef.case_number.trim()) facts.push(`Case number: ${ef.case_number.trim()}`);
        if (typeof ef.court_name === "string" && ef.court_name.trim()) facts.push(`Court: ${ef.court_name.trim()}`);
        if (typeof ef.hearing_date === "string" && ef.hearing_date.trim()) facts.push(`Hearing date: ${ef.hearing_date.trim()}`);
        return facts.slice(0, 3);
      }).slice(0, 8);

      const upcomingDeadlineEvent = upcomingEvents.find((event) => event.normalizedType === "deadline" || event.normalizedType === "hearing");
      const alertDrafts: AlertDraft[] = [
        {
          alertKey: "missing_document",
          type: "missing_document",
          title: "Missing document coverage",
          message: documents.length === 0
            ? "No case filings are on file, so deadlines and hearing context are incomplete."
            : "Some key filing coverage appears incomplete for this case.",
          impact: alertImpactWhyThisMatters("missing_document"),
          severity: documents.length === 0 ? "high" : "medium",
          relatedItem: "Case document set",
          recommendedAction: "Upload or link the latest petition, order, or hearing notice.",
          target: { label: "Add document", href: `/upload-document?case=${caseId}`, section: "add_document" },
          shouldBeActive: documents.length === 0 || missingKeyDocs.length > 0,
          autoResolveHighConfidence: (documents.length > 0 && missingKeyDocs.length === 0)
            ? { method: "document", note: "Core filing coverage detected after document upload." }
            : null,
          suggestedResolution: (documents.length > 0 && missingKeyDocs.length > 0)
            ? { confidence: "medium", prompt: "This may resolve your alert. Confirm?", method: "document" }
            : null,
        },
        {
          alertKey: "overdue_event",
          type: "overdue_event",
          title: "Overdue event needs outcome",
          message: overdueEvents[0]
            ? `${overdueEvents[0].normalizedLabel} dated ${overdueEvents[0].dateRaw} requires immediate review.`
            : "No overdue event detected.",
          impact: alertImpactWhyThisMatters("overdue_event"),
          severity: "high",
          relatedItem: overdueEvents[0] ? `${overdueEvents[0].normalizedLabel} (${overdueEvents[0].dateRaw})` : "Timeline",
          recommendedAction: "Add a timeline outcome or upload the related filing.",
          target: { label: "Review timeline", href: `/cases/${caseId}/dashboard#timeline`, section: "timeline" },
          shouldBeActive: overdueEvents.length > 0,
          autoResolveHighConfidence: overdueEvents.length === 0 ? { method: "event", note: "No overdue events remain in the timeline." } : null,
        },
        {
          alertKey: "upcoming_deadline",
          type: "upcoming_deadline",
          title: "Upcoming deadline approaching",
          message: upcomingDeadlineEvent
            ? `${upcomingDeadlineEvent.normalizedLabel} on ${upcomingDeadlineEvent.dateRaw} is approaching.`
            : "No imminent deadline detected.",
          impact: alertImpactWhyThisMatters("upcoming_deadline"),
          severity: "medium",
          relatedItem: upcomingDeadlineEvent ? `${upcomingDeadlineEvent.normalizedLabel} (${upcomingDeadlineEvent.dateRaw})` : "Timeline",
          recommendedAction: "Upload the filing package or add a submission event.",
          target: { label: "Open timeline", href: `/cases/${caseId}/dashboard#timeline`, section: "timeline" },
          shouldBeActive: nextCriticalDaysAway !== null && nextCriticalDaysAway <= 30,
        },
        {
          alertKey: "conflict_detected",
          type: "conflict_detected",
          title: "Conflicting case data detected",
          message: conflictingTimelineEvents
            ? "Timeline events appear to conflict and should be reconciled."
            : "No active conflicts detected.",
          impact: alertImpactWhyThisMatters("conflict_detected"),
          severity: "high",
          relatedItem: "Timeline consistency",
          recommendedAction: "Select the correct event or upload the latest notice.",
          target: { label: "Review timeline", href: `/cases/${caseId}/dashboard#timeline`, section: "timeline" },
          shouldBeActive: conflictingTimelineEvents,
          autoResolveHighConfidence: !conflictingTimelineEvents ? { method: "inferred", note: "Conflicting timeline signals are no longer present." } : null,
        },
        {
          alertKey: "incomplete_case",
          type: "incomplete_case",
          title: "Case profile is incomplete",
          message: "Case record still needs stronger timeline/document coverage for reliable tracking.",
          impact: alertImpactWhyThisMatters("incomplete_case"),
          severity: "medium",
          relatedItem: "Case readiness",
          recommendedAction: "Upload missing documents or ask Atlas for next best evidence.",
          target: { label: "Ask Atlas", href: `/ask?case=${caseId}`, section: "ask_atlas" },
          shouldBeActive: documents.length < 2 || primaryTimeline.length < 2 || missingSummaryDocs.length > 0,
          autoResolveHighConfidence: (documents.length >= 2 && primaryTimeline.length >= 2 && missingSummaryDocs.length === 0)
            ? { method: "inferred", note: "Case coverage appears complete based on current records." }
            : null,
          suggestedResolution: (documents.length >= 1 && primaryTimeline.length >= 1 && (documents.length < 2 || primaryTimeline.length < 2))
            ? { confidence: "medium", prompt: "This may resolve your alert. Confirm?", method: "inferred" }
            : null,
        },
      ];

      const reconciled = await reconcileCaseAlerts(caseId, user.id, alertDrafts);
      for (const transition of reconciled.transitions) {
        if (transition.to === "resolved") {
          await createTimelineEventIfNotRecentDuplicate(user.id, {
            eventDate: new Date().toISOString().slice(0, 10),
            description: `Alert resolved: ${transition.alert.title}`,
          });
        }
        if (transition.to === "reviewed") {
          await createTimelineEventIfNotRecentDuplicate(user.id, {
            eventDate: new Date().toISOString().slice(0, 10),
            description: `Alert reviewed: ${transition.alert.title}`,
          });
        }
      }

      const lifecycleAlerts = reconciled.alerts.filter((alert) => alert.state !== "dismissed");
      const activeLifecycleCount = lifecycleAlerts.filter((alert) => alert.state === "active" || alert.state === "reopened").length;
      const finalRiskScore = Math.min(100, riskScore + (activeLifecycleCount * 7));
      const finalRiskLevel = finalRiskScore >= 80 ? "High" : finalRiskScore >= 60 ? "Elevated" : finalRiskScore >= 35 ? "Moderate" : "Low";
      const finalUrgency: "Low" | "Medium" | "High" = activeLifecycleCount >= 2
        ? "High"
        : activeLifecycleCount > 0 && urgency === "Low"
          ? "Medium"
          : urgency;

      return res.json({
        case: {
          id: caseRecord.id,
          title: caseRecord.title,
          caseType: caseRecord.caseType,
          status: caseRecord.status,
          stateCode: caseRecord.stateCode ?? null,
          countyName: caseRecord.jurisdictionCounty ?? null,
        },
        whatMattersNow: {
          currentStage: normalizeDashboardText(stage.label, "Case stage is not yet clear."),
          stageKey: stage.key,
          nextKeyItems,
          watchouts: watchouts.slice(0, 2),
          suggestedFocus: normalizeDashboardText(
            activeLifecycleCount > 0
              ? `${suggestedFocus} Resolve active alerts to improve case health clarity.`
              : suggestedFocus,
            "Focus on the next filing-critical item.",
          ),
        },
        timeline: primaryTimeline.map((event) => ({
          id: event.id,
          date: event.dateRaw,
          label: event.normalizedLabel,
          type: event.normalizedType,
          status: event.status,
          whyThisMatters: eventWhyThisMatters(event.normalizedType, event.normalizedLabel) ?? undefined,
        })),
        timelineSecondary: secondaryTimeline.map((event) => ({
          id: event.id,
          date: event.dateRaw,
          label: event.normalizedLabel,
          type: event.normalizedType,
          status: event.status,
        })),
        timelineMeta: {
          visibleCount: visibleTimeline.length,
          totalCount: primaryTimeline.length,
          hasMore: primaryTimeline.length > visibleTimeline.length,
          secondaryCount: secondaryTimeline.length,
        },
        documents: documents.map((doc) => ({
          id: doc.id,
          title: doc.fileName,
          status: (doc.analysisJson?.analysis_status as string | undefined) ?? "analyzed",
          tags: extractDashboardDocumentTags(doc.analysisJson ?? {}),
        })),
        caseHealth: {
          currentPosture: postureByStage[stage.key],
          urgency: finalUrgency,
          riskScore: finalRiskScore,
          riskLevel: finalRiskLevel,
          documentCompleteness,
          immediateConcern,
        },
        snapshot: {
          currentSituation: normalizeDashboardText(snapshotCurrentSituation, "No snapshot data available."),
          keyPoints,
          thingsToWatch,
          fullCaseBrief: `${snapshotCurrentSituation} ${normalizeDashboardText(suggestedFocus, "")}`.trim(),
          extractedFacts,
          deepAnalysis: [
            `Upcoming timeline events (30 days): ${upcomingEvents.length}.`,
            `Overdue timeline events: ${overdueEvents.length}.`,
            `Documents requiring analysis attention: ${missingSummaryDocs.length}.`,
          ],
        },
        alerts: lifecycleAlerts.map((alert) => ({
          id: alert.id,
          kind: alert.type,
          title: alert.title,
          message: alert.message,
          impact: alert.impact,
          severity: alert.severity,
          relatedItem: alert.relatedItem,
          recommendedAction: alert.recommendedAction,
          target: alert.target,
          state: alert.state,
          allowedActions: ALLOWED_ACTIONS[alert.type],
          suggestedResolution: alert.suggestedResolution,
          resolution: {
            resolvedByDocumentId: alert.resolvedByDocumentId,
            resolvedByEventId: alert.resolvedByEventId,
            resolvedByUserId: alert.resolvedByUserId,
            resolutionMethod: alert.resolutionMethod,
            resolutionNote: alert.resolutionNote,
          },
        })),
      });
    } catch (err) {
      console.error("[cases] GET dashboard error:", err);
      return res.status(500).json({ error: "Failed to load case dashboard." });
    }
  });

  app.get("/api/cases/:caseId/alerts", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const caseId = asString(req.params.caseId);
    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });
      const { alerts } = await reconcileCaseAlerts(caseId, user.id, []);
      return res.json({ alerts });
    } catch (err) {
      console.error("[cases] GET alerts error:", err);
      return res.status(500).json({ error: "Failed to load case alerts." });
    }
  });

  app.post("/api/cases/:caseId/alerts/:alertId/actions", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const caseId = asString(req.params.caseId);
    const alertId = asString(req.params.alertId);
    const schema = z.object({
      actionId: z.string(),
      resolutionNote: z.string().max(1000).optional(),
      documentId: z.string().uuid().optional(),
      eventId: z.string().optional(),
      confirmSuggested: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid alert action payload." });
    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });
      const result = await applyAlertAction({
        caseId,
        userId: user.id,
        alertId,
        actionId: parsed.data.actionId as any,
        resolutionNote: parsed.data.resolutionNote,
        documentId: parsed.data.documentId,
        eventId: parsed.data.eventId,
        confirmSuggested: parsed.data.confirmSuggested,
      });
      if (!result) return res.status(404).json({ error: "Alert not found or action not allowed." });

      if (result.before.state !== result.after.state) {
        if (result.after.state === "resolved") {
          await createTimelineEventIfNotRecentDuplicate(user.id, {
            eventDate: new Date().toISOString().slice(0, 10),
            description: `Alert resolved: ${result.after.title}`,
          });
        }
        if (result.after.state === "reviewed") {
          await createTimelineEventIfNotRecentDuplicate(user.id, {
            eventDate: new Date().toISOString().slice(0, 10),
            description: `Alert reviewed: ${result.after.title}`,
          });
        }
      }

      return res.json({ alert: result.after });
    } catch (err) {
      console.error("[cases] POST alert action error:", err);
      return res.status(500).json({ error: "Failed to update alert." });
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
    const caseId = asString(req.params.caseId);
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
    const caseId = asString(req.params.caseId);
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
    const caseId = asString(req.params.caseId);
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
    const caseId = asString(req.params.caseId);
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
    const caseId = asString(req.params.caseId);
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
    const caseId = asString(req.params.caseId);
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
    const caseId = asString(req.params.caseId);
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
   * POST /api/cases/:caseId/intelligence
   * Generates and persists a deterministic "What Matters Now" case snapshot.
   */
  app.post("/api/cases/:caseId/intelligence", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const caseId = asString(req.params.caseId);
    try {
      const caseRecord = await getCaseById(caseId, user.id);
      if (!caseRecord) return res.status(404).json({ error: "Case not found." });

      const intelligence = await generateCaseIntelligence(caseId);
      if (!intelligence) {
        return res.status(503).json({ error: "Case intelligence is unavailable right now." });
      }

      return res.json({ intelligence });
    } catch (err) {
      console.error("[case-intelligence] POST generate error:", err);
      return res.status(500).json({ error: "Failed to generate case intelligence." });
    }
  });

  /**
   * PATCH /api/case-actions/:actionId
   * Mark an action complete or dismissed.
   * Body: { status: "completed" | "dismissed" }
   */
  app.patch("/api/case-actions/:actionId", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const actionId = parseInt(asString(req.params.actionId), 10);
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
    const conversationId = asString(req.params.conversationId);
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
