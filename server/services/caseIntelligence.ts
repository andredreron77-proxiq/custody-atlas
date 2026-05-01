import OpenAI from "openai";
import type { RawSignal, SignalType } from "../lib/signals";
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

interface CaseIntelligenceRefreshRow extends CaseIntelligenceRecord {
  user_id: string;
  change_log: unknown;
  last_refreshed_at: string;
  version: number | null;
}

interface DocumentFactRow {
  fact_type: string;
  fact_value: string;
}

const CIR_REFRESH_FIELDS = [
  "key_dates_json",
  "risks_json",
  "obligations_json",
  "active_issues_json",
  "what_matters_now_json",
  "actions_json",
] as const;

type CIRRefreshField = typeof CIR_REFRESH_FIELDS[number];

interface CIRRefreshUpdate {
  field: CIRRefreshField;
  value: unknown;
  reason: string;
}

interface CIRRefreshConflict {
  field: string;
  current_value: string | null;
  document_value: string;
  target_column: CIRRefreshField;
  proposed_value: unknown;
  reason: string;
  confidence: "high" | "medium" | "low";
}

interface CIRRefreshLLMResult {
  updates: CIRRefreshUpdate[];
  conflicts: CIRRefreshConflict[];
  confidence_score: number | null;
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

interface SignalRow {
  id: string;
  type: SignalType;
  title: string;
  detail: string;
  due_date: string | null;
  dismissed: boolean | null;
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRefreshField(value: unknown): value is CIRRefreshField {
  return typeof value === "string" && (CIR_REFRESH_FIELDS as readonly string[]).includes(value);
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function parseChangeLog(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function serializeScalar(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function buildDocumentFactMap(rows: DocumentFactRow[]): Record<string, string> {
  const facts: Record<string, string> = {};
  for (const row of rows) {
    const key = row.fact_type.trim();
    const value = row.fact_value.trim();
    if (key && value) facts[key] = value;
  }
  return facts;
}

function normalizeRefreshResult(raw: unknown): CIRRefreshLLMResult {
  const parsed = isRecord(raw) ? raw : {};
  const updates = Array.isArray(parsed.updates)
    ? parsed.updates
        .filter(isRecord)
        .map((entry) => ({
          field: entry.field,
          value: entry.value,
          reason: typeof entry.reason === "string" ? entry.reason.trim() : "",
        }))
        .filter((entry): entry is CIRRefreshUpdate => isRefreshField(entry.field) && entry.reason.length > 0)
    : [];

  const conflicts = Array.isArray(parsed.conflicts)
    ? parsed.conflicts
        .filter(isRecord)
        .map((entry) => ({
          field: typeof entry.field === "string" ? entry.field.trim() : "",
          current_value: typeof entry.current_value === "string" ? entry.current_value : null,
          document_value: typeof entry.document_value === "string" ? entry.document_value.trim() : "",
          target_column: entry.target_column,
          proposed_value: entry.proposed_value,
          reason: typeof entry.reason === "string" ? entry.reason.trim() : "",
          confidence: normalizeConfidence(entry.confidence),
        }))
        .filter(
          (entry): entry is CIRRefreshConflict =>
            entry.field.length > 0 &&
            entry.document_value.length > 0 &&
            entry.reason.length > 0 &&
            isRefreshField(entry.target_column),
        )
    : [];

  const confidence_score =
    typeof parsed.confidence_score === "number" && Number.isFinite(parsed.confidence_score)
      ? Math.max(0, Math.min(1, parsed.confidence_score))
      : null;

  return { updates, conflicts, confidence_score };
}

async function fetchCurrentCaseIntelligence(caseId: string): Promise<CaseIntelligenceRefreshRow | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("case_intelligence")
    .select(`
      id,
      case_id,
      user_id,
      summary,
      active_issues_json,
      key_dates_json,
      obligations_json,
      risks_json,
      actions_json,
      what_matters_now_json,
      missing_information_json,
      source_document_ids_json,
      confidence_score,
      change_log,
      last_refreshed_at,
      version,
      updated_at
    `)
    .eq("case_id", caseId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as CaseIntelligenceRefreshRow | null) ?? null;
}

async function fetchDocumentFactsForRefresh(
  caseId: string,
  documentId: string,
  userId: string,
): Promise<Record<string, string>> {
  if (!supabaseAdmin) return {};

  const { data, error } = await supabaseAdmin
    .from("document_facts")
    .select("fact_type,fact_value")
    .eq("case_id", caseId)
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return buildDocumentFactMap((data ?? []) as DocumentFactRow[]);
}

async function getLatestCaseConversationId(caseId: string, userId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return typeof data?.id === "string" ? data.id : null;
}

async function analyzeDocumentRefresh(args: {
  current: CaseIntelligenceRefreshRow;
  documentFacts: Record<string, string>;
}): Promise<CIRRefreshLLMResult> {
  const snapshot = {
    key_dates_json: args.current.key_dates_json,
    risks_json: args.current.risks_json,
    obligations_json: args.current.obligations_json,
    active_issues_json: args.current.active_issues_json,
    what_matters_now_json: args.current.what_matters_now_json,
    actions_json: args.current.actions_json,
  };

  const completion = await getOpenAIClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You reconcile a custody case intelligence snapshot after a newly processed document.\n" +
          "Document facts are the source of truth when they directly conflict with the existing snapshot.\n" +
          "Only consider these updatable case_intelligence columns: key_dates_json, risks_json, obligations_json, active_issues_json, what_matters_now_json, actions_json.\n" +
          "Return only JSON with this structure:\n" +
          "{\n" +
          '  "updates": [\n' +
          "    {\n" +
          '      "field": "key_dates_json" | "risks_json" | "obligations_json" | "active_issues_json" | "what_matters_now_json" | "actions_json",\n' +
          '      "value": any,\n' +
          '      "reason": string\n' +
          "    }\n" +
          "  ],\n" +
          '  "conflicts": [\n' +
          "    {\n" +
          '      "field": string,\n' +
          '      "current_value": string | null,\n' +
          '      "document_value": string,\n' +
          '      "target_column": "key_dates_json" | "risks_json" | "obligations_json" | "active_issues_json" | "what_matters_now_json" | "actions_json",\n' +
          '      "proposed_value": any,\n' +
          '      "reason": string,\n' +
          '      "confidence": "high" | "medium" | "low"\n' +
          "    }\n" +
          "  ],\n" +
          '  "confidence_score": number | null\n' +
          "}\n" +
          "Rules:\n" +
          "- Include an update only when the new document should change a snapshot column.\n" +
          "- Include a conflict when a document fact contradicts an existing snapshot fact.\n" +
          "- For conflicts, proposed_value must already reflect the document-backed winning state for target_column.\n" +
          "- Do not invent facts not grounded in the provided document facts.\n" +
          "- Do not emit markdown.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            current_snapshot: snapshot,
            new_document_facts: args.documentFacts,
          },
          null,
          2,
        ),
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1200,
    temperature: 0.1,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("No CIR refresh response received.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("CIR refresh response was not valid JSON.");
  }

  return normalizeRefreshResult(parsed);
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

function signalPriority(type: SignalType): number {
  if (type === "urgent") return 0;
  if (type === "risk") return 1;
  if (type === "action") return 2;
  return 3;
}

function toSignalWhatMattersNow(signal: RawSignal): {
  top_priority: string;
  reason: string;
  urgency: "High" | "Medium" | "Low";
} {
  return {
    top_priority: signal.title.trim(),
    reason: shortReason(signal.detail),
    urgency: signal.type === "urgent" ? "High" : signal.type === "risk" ? "Medium" : "Low",
  };
}

async function getPrioritySignalForCase(caseId: string): Promise<RawSignal | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("signals")
    .select("id,type,title,detail,due_date,dismissed")
    .eq("case_id", caseId)
    .order("due_date", { ascending: true });

  if (error) {
    console.error("[caseIntelligence] signals fetch error:", error.message);
    return null;
  }

  const rows = Array.isArray(data) ? data as SignalRow[] : [];
  const top = rows
    .filter((row) => !row.dismissed)
    .filter((row) =>
      typeof row.id === "string" &&
      (row.type === "urgent" || row.type === "risk" || row.type === "action" || row.type === "pattern") &&
      typeof row.title === "string" &&
      typeof row.detail === "string")
    .sort((left, right) => {
      const priorityDiff = signalPriority(left.type) - signalPriority(right.type);
      if (priorityDiff !== 0) return priorityDiff;

      const leftDue = left.due_date ? Date.parse(left.due_date) : Number.MAX_SAFE_INTEGER;
      const rightDue = right.due_date ? Date.parse(right.due_date) : Number.MAX_SAFE_INTEGER;
      if (leftDue !== rightDue) return leftDue - rightDue;

      return left.title.localeCompare(right.title);
    })[0];

  if (!top) return null;

  return {
    id: top.id,
    type: top.type,
    title: top.title,
    detail: top.detail,
    dueDate: top.due_date ?? undefined,
    dismissed: Boolean(top.dismissed),
  };
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

  const prioritySignal = await getPrioritySignalForCase(caseId);

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
  const whatMattersNow = prioritySignal
    ? toSignalWhatMattersNow(prioritySignal)
    : {
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

export async function refreshCaseIntelligenceFromDocument(
  caseId: string,
  documentId: string,
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Case intelligence storage is unavailable.");
  }

  let current = await fetchCurrentCaseIntelligence(caseId);
  if (!current) {
    const seeded = await generateCaseIntelligence(caseId);
    if (!seeded) return;
    current = await fetchCurrentCaseIntelligence(caseId);
    if (!current) return;
  }

  const documentFacts = await fetchDocumentFactsForRefresh(caseId, documentId, current.user_id);
  if (Object.keys(documentFacts).length === 0) {
    return;
  }

  const refresh = await analyzeDocumentRefresh({
    current,
    documentFacts,
  });

  const now = new Date().toISOString();
  const nextVersion = (typeof current.version === "number" ? current.version : 1) + 1;
  const updatesByColumn: Partial<Record<CIRRefreshField, unknown>> = {};

  for (const update of refresh.updates) {
    updatesByColumn[update.field] = update.value;
  }

  for (const conflict of refresh.conflicts) {
    updatesByColumn[conflict.target_column] = conflict.proposed_value;
  }

  const changeLog = parseChangeLog(current.change_log);
  const changes = Object.entries(updatesByColumn).map(([field, value]) => ({
    field,
    old_value: serializeScalar((current as Record<string, unknown>)[field]),
    new_value: serializeScalar(value),
    source: "document_upload",
    document_id: documentId,
  }));

  if (refresh.conflicts.length > 0) {
    const conversationId = await getLatestCaseConversationId(caseId, current.user_id);
    if (!conversationId) {
      throw new Error("Cannot create CIR conflict proposals for document upload because no case conversation exists.");
    }

    const proposalRows = refresh.conflicts.map((conflict) => ({
      case_id: caseId,
      user_id: current.user_id,
      conversation_id: conversationId,
      proposal_data: {
        conversationId,
        caseId,
        proposedChanges: [
          {
            field: conflict.field,
            currentValue: conflict.current_value,
            proposedValue: conflict.document_value,
            reason: conflict.reason,
            confidence: conflict.confidence,
          },
        ],
        newActions: [],
        createdAt: now,
        source: "document_upload",
        documentId,
      },
      status: "pending" as const,
      reviewed_at: null,
    }));

    const { error: proposalError } = await supabaseAdmin
      .from("cir_update_proposals")
      .insert(proposalRows);

    if (proposalError) {
      throw new Error(proposalError.message);
    }
  }

  const nextChangeLog = [
    ...changeLog,
    {
      version: nextVersion,
      timestamp: now,
      trigger: "document_upload",
      source: "document_upload",
      document_id: documentId,
      changes,
    },
  ];

  const updatePayload: Record<string, unknown> = {
    ...updatesByColumn,
    confidence_score: refresh.confidence_score ?? current.confidence_score,
    last_refreshed_at: now,
    updated_at: now,
    version: nextVersion,
    change_log: nextChangeLog,
  };

  const { error: updateError } = await supabaseAdmin
    .from("case_intelligence")
    .update(updatePayload)
    .eq("case_id", caseId)
    .eq("user_id", current.user_id);

  if (updateError) {
    throw new Error(updateError.message);
  }
}
