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

  const monthWord = value.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s*(\d{4})\b/i,
  );
  if (monthWord) {
    const parsed = Date.parse(`${monthWord[1]} ${monthWord[2]}, ${monthWord[3]} UTC`);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }

  const slashDate = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashDate) {
    const month = Number(slashDate[1]);
    const day = Number(slashDate[2]);
    const year = Number(slashDate[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
    }
  }

  const inline = value.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (inline && Number.isFinite(Date.parse(inline[1]))) {
    return new Date(`${inline[1]}T12:00:00.000Z`).toISOString();
  }

  return null;
}

function classifyDateKind(raw: string): "hearing" | "deadline" | "filing" | "service" | "appointment" | "child_birthdate" | "other" {
  const lower = raw.toLowerCase();
  if (lower.includes("hearing") || lower.includes("trial") || lower.includes("court date")) return "hearing";
  if (lower.includes("deadline") || lower.includes("due") || lower.includes("file by") || lower.includes("must file")) return "deadline";
  if (lower.includes("filed") || lower.includes("filing") || lower.includes("petition filed") || lower.includes("motion filed")) return "filing";
  if (lower.includes("served") || lower.includes("service") || lower.includes("served on")) return "service";
  if (lower.includes("appointment") || lower.includes("evaluation") || lower.includes("mediation") || lower.includes("intake")) return "appointment";
  if (lower.includes("birth") || lower.includes("dob") || lower.includes("date of birth") || lower.includes("born")) return "child_birthdate";
  return "other";
}

function makeTopPriorityCardTitle(riskTitle: string): string {
  const normalized = riskTitle.toLowerCase();
  if (normalized.includes("court order") || normalized.includes("duties")) return "Follow the court order";
  if (normalized.includes("hearing")) return "Get ready for your hearing";
  if (normalized.includes("deadline")) return "Finish your deadline tasks";
  if (normalized.includes("motion")) return "Check if you need to respond";
  return riskTitle;
}

function shortReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return "This needs attention right now.";
  const sentenceMatch = trimmed.match(/^[^.!?]*[.!?]?/);
  const sentence = (sentenceMatch?.[0] ?? trimmed).trim();
  return sentence.length <= 120 ? sentence : `${sentence.slice(0, 117).trimEnd()}...`;
}

function deriveObligations(
  risks: Array<{ id: string }>,
  docsForRules: NormalizedContext["docsForRules"],
): Array<{ title: string; description: string; source_document_id: string }> {
  const obligationWords = ["must", "shall", "required", "ordered", "pay", "attend", "submit", "exchange", "complete"];
  const obligationDoc = docsForRules.find((doc) => {
    const sourceText = `${doc.summary} ${doc.implications.join(" ")}`.toLowerCase();
    const typeLooksLikeOrder = doc.documentType.toLowerCase().includes("order")
      || doc.documentType.toLowerCase().includes("judgment")
      || doc.documentType.toLowerCase().includes("decree");
    const hasObligationLanguage = obligationWords.some((word) => sourceText.includes(word));
    return typeLooksLikeOrder || hasObligationLanguage;
  });

  if (!obligationDoc && !risks.some((risk) => risk.id === "court_order_obligations")) return [];

  return [{
    title: "Follow the court order",
    description: "Review the order and make sure you do what it requires.",
    source_document_id: obligationDoc?.id ?? "",
  }];
}

function deriveMissingInformation(
  risks: Array<{ id: string }>,
  keyDates: Array<{ kind: string }>,
): Array<{ field: string; note: string }> {
  const hasHearingRisk = risks.some((risk) => risk.id === "missing_hearing_details" || risk.id === "upcoming_hearing_14_days");
  const hasHearingDate = keyDates.some((date) => date.kind === "hearing");
  if (!hasHearingRisk && !hasHearingDate) return [];

  return [
    {
      field: "hearing_time",
      note: "Add hearing time if known.",
    },
    {
      field: "courtroom",
      note: "Add courtroom number or location if known.",
    },
  ];
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
  const whatMattersNowRaw = pickWhatMattersNow(risks);
  const whatMattersNow = {
    ...whatMattersNowRaw,
    top_priority: makeTopPriorityCardTitle(whatMattersNowRaw.top_priority),
    reason: shortReason(whatMattersNowRaw.reason),
  };
  const summary = renderSummary(risks, actions, docs.length);
  const obligations = deriveObligations(risks, normalizedContext.docsForRules);
  const missingInformation = deriveMissingInformation(risks, normalizedContext.normalized.keyDates);
  const activeIssues = risks.map((risk) => ({
    id: risk.id,
    title: risk.title,
    severity: risk.severity,
  }));

  const payload = {
    case_id: caseId,
    summary,
    active_issues_json: activeIssues,
    key_dates_json: normalizedContext.normalized.keyDates,
    obligations_json: obligations,
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
