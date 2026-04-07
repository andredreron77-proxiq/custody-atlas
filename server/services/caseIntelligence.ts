import { supabaseAdmin } from "../lib/supabaseAdmin";
import { generateActionsForRisks } from "./actionGenerator";
import { pickWhatMattersNow, renderSummary } from "./plainEnglish";
import { evaluateRisks, type NormalizedIntelligenceData, type NormalizedIntelligenceDate } from "./riskEngine";

interface CanonicalDocument {
  id: string;
  analysis_json: Record<string, unknown> | null;
  created_at: string;
}

export interface CaseIntelligenceRecord {
  id: string;
  case_id: string;
  summary: string | null;
  active_issues_json: unknown;
  key_dates_json: unknown;
  obligations_json: unknown;
  risks_json: unknown;
  actions_json: unknown;
  what_matters_now_json: unknown;
  missing_information_json: unknown;
  source_document_ids_json: unknown;
  confidence_score: number | null;
  updated_at: string;
}

interface NormalizedContext {
  normalized: NormalizedIntelligenceData;
  sourceDocumentIds: string[];
  docsForRules: Array<{
    id: string;
    createdAt: string;
    summary: string;
    documentType: string;
    extractedFacts: Record<string, unknown>;
    implications: string[];
  }>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function parseDateLike(value: string): string | null {
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return new Date(direct).toISOString();

  const inline = value.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (inline && Number.isFinite(Date.parse(inline[1]))) {
    return new Date(`${inline[1]}T12:00:00.000Z`).toISOString();
  }

  return null;
}

function classifyDateKind(raw: string): "hearing" | "deadline" | "other" {
  const lower = raw.toLowerCase();
  if (lower.includes("hearing") || lower.includes("trial") || lower.includes("court date")) return "hearing";
  if (lower.includes("deadline") || lower.includes("due") || lower.includes("file by") || lower.includes("must file")) return "deadline";
  return "other";
}

function normalizeAnalysis(documents: CanonicalDocument[]): NormalizedContext {
  const facts: Record<string, string[]> = {};
  const keyDates: NormalizedIntelligenceDate[] = [];
  const documentTypes = new Set<string>();
  const implications: string[] = [];

  const docsForRules = documents.map((doc) => {
    const analysis = (doc.analysis_json ?? {}) as Record<string, unknown>;
    const summary = typeof analysis.summary === "string" ? analysis.summary.trim() : "";
    const documentType = typeof analysis.document_type === "string" ? analysis.document_type.trim() : "";
    const extractedFacts = (analysis.extracted_facts ?? {}) as Record<string, unknown>;
    const possibleImplications = toStringArray(analysis.possible_implications);

    if (documentType) documentTypes.add(documentType);
    if (summary) {
      facts.summary = [...(facts.summary ?? []), summary];
    }

    for (const [key, value] of Object.entries(extractedFacts)) {
      if (typeof value !== "string") continue;
      const normalized = value.trim();
      if (!normalized) continue;
      facts[key] = [...(facts[key] ?? []), normalized];
    }

    const rawDates = (Array.isArray(analysis.key_dates) ? analysis.key_dates : [])
      .flatMap((entry) => {
        if (typeof entry === "string") return [entry.trim()];
        if (entry && typeof entry === "object") {
          const obj = entry as Record<string, unknown>;
          const dateLike = typeof obj.date === "string" ? obj.date.trim() : "";
          const label = typeof obj.label === "string" ? obj.label.trim() : "";
          const merged = [label, dateLike].filter(Boolean).join(" - ");
          return merged ? [merged] : [];
        }
        return [];
      })
      .filter(Boolean);

    for (const raw of rawDates) {
      keyDates.push({
        documentId: doc.id,
        raw,
        parsedDate: parseDateLike(raw),
        kind: classifyDateKind(raw),
      });
    }

    implications.push(...possibleImplications);

    return {
      id: doc.id,
      createdAt: doc.created_at,
      summary,
      documentType,
      extractedFacts,
      implications: possibleImplications,
    };
  });

  return {
    normalized: {
      facts,
      keyDates,
      documentTypes: Array.from(documentTypes),
      implications,
    },
    sourceDocumentIds: documents.map((doc) => doc.id),
    docsForRules,
  };
}

export async function generateCaseIntelligence(caseId: string): Promise<CaseIntelligenceRecord | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id,analysis_json,created_at")
    .eq("case_id", caseId)
    .is("duplicate_of_document_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[caseIntelligence] documents fetch error:", error.message);
    return null;
  }

  const docs = (data ?? []) as CanonicalDocument[];
  const normalizedContext = normalizeAnalysis(docs);
  const risks = evaluateRisks({
    normalized: normalizedContext.normalized,
    documents: normalizedContext.docsForRules,
  });
  const actions = generateActionsForRisks(risks);
  const whatMattersNow = pickWhatMattersNow(risks);
  const summary = renderSummary(risks, actions, docs.length);

  const missingInformation = [
    {
      field: "hearing_time",
      note: "Add hearing time if known.",
    },
    {
      field: "courtroom",
      note: "Add courtroom number or location if known.",
    },
  ];

  const payload = {
    case_id: caseId,
    summary,
    active_issues_json: risks,
    key_dates_json: normalizedContext.normalized.keyDates,
    obligations_json: [],
    risks_json: risks,
    actions_json: actions,
    what_matters_now_json: whatMattersNow,
    missing_information_json: missingInformation,
    source_document_ids_json: normalizedContext.sourceDocumentIds,
    confidence_score: docs.length > 0 ? 0.7 : 0.4,
  };

  const { data: saved, error: upsertError } = await supabaseAdmin
    .from("case_intelligence")
    .upsert(payload, { onConflict: "case_id" })
    .select("id,case_id,summary,active_issues_json,key_dates_json,obligations_json,risks_json,actions_json,what_matters_now_json,missing_information_json,source_document_ids_json,confidence_score,updated_at")
    .single();

  if (upsertError) {
    console.error("[caseIntelligence] upsert error:", upsertError.message);
    return null;
  }

  return (saved as CaseIntelligenceRecord) ?? null;
}
