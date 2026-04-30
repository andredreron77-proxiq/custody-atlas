/**
 * Phase 1 CIR audit answers
 *
 * 1. memory_summary snapshot fields by guided flow:
 *    - hearing_prep: hearing_date, hearing_type, top_concern, concern_category,
 *      current_schedule, order_status, recent_changes, representation_status,
 *      child_safety_flag, snapshot_complete, post_snapshot_turn, waypoints_complete
 *    - respond_filing: document_type, opposing_request, response_deadline,
 *      knows_deadline, coparent_relationship, child_safety_flag,
 *      snapshot_complete, post_snapshot_turn, waypoints_complete
 *    - more_time: current_arrangement, order_status, reason_for_more_time,
 *      change_category, coparent_stance, prior_court_involvement,
 *      child_safety_flag, snapshot_complete, post_snapshot_turn, waypoints_complete
 *    - figuring_things_out: situation_summary, order_status, primary_concern,
 *      concern_category, child_safety_flag, snapshot_complete,
 *      post_snapshot_turn, waypoints_complete
 *
 * 2. extracted_facts fields from documents:
 *    document_title, court_name, court_address, case_number, judge_name,
 *    hearing_date, filing_party, opposing_party, plus runtime callers also look
 *    for filing_date, effective_date, responding_party, child_support_amount
 *    when present in analysis_json.extracted_facts.
 *
 * 3. overlap:
 *    - hearing_date appears in both snapshot and document analysis
 *    - document_type appears in guided flow state and document-derived case facts
 *    - order_status / concern-like fields exist only in conversation snapshot
 *    - court_name, case_number, judge_name, filing_party are document-only today
 *
 * 4. case dashboard current reads:
 *    - case dashboard route assembles caseHealth / alerts / timeline from
 *      documents, case actions, timeline, signals, and latest case_memory row
 *    - CaseDashboardPage reads What Matters Now, Recommended Actions, and Key
 *      Dates from a mix of POST /api/cases/:caseId/intelligence and
 *      dashboard.snapshotMemory fallback fields from case_memory
 *    - Case Health currently comes from /api/cases/:caseId/dashboard
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getCaseById } from "./cases";
import { getDocumentsByCase } from "./documents";
import { getCaseActions, type CaseActionRow } from "./caseActions";
import { getGuidedFlowBySituationType } from "../lib/guidedFlows";
import { getRecentConversationMessages } from "./cases";
import OpenAI from "openai";

type FactSource = "conversation" | "document" | "user_edit";
type FactConfidence = "high" | "medium" | "low";

type FactValue = string | boolean | null;

export interface CaseIntelligenceFactRecord {
  value: FactValue;
  source: FactSource;
  source_detail: string;
  confidence: FactConfidence;
  previous_value: FactValue;
  updated_at: string;
}

export interface CaseIntelligenceActionRecord {
  text: string;
  source: "conversation" | "document";
  source_detail: string;
  created_at: string;
}

export interface CaseIntelligenceDocumentAppliedRecord {
  document_id: string;
  file_name: string;
  applied_at: string;
  facts_extracted: string[];
}

export interface CaseIntelligenceDataRecord {
  facts: Record<string, CaseIntelligenceFactRecord>;
  actions: CaseIntelligenceActionRecord[];
  flow_type: string | null;
  snapshot_saved_at: string | null;
  documents_applied: CaseIntelligenceDocumentAppliedRecord[];
}

export interface CaseIntelligenceChangeLogEntry {
  version: number;
  timestamp: string;
  trigger: "snapshot_save" | "document_upload" | "conversation_refresh" | "user_edit";
  changes: Array<{
    field: string;
    old_value: string | null;
    new_value: string | null;
    source: string;
  }>;
}

export interface CaseIntelligenceRow {
  id: string | null;
  case_id: string;
  user_id: string;
  intelligence_data: CaseIntelligenceDataRecord;
  version: number;
  change_log: CaseIntelligenceChangeLogEntry[];
  last_refreshed_at: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface CIRUpdateProposal {
  conversationId: string;
  caseId: string;
  proposedChanges: Array<{
    field: string;
    currentValue: string | null;
    proposedValue: string;
    reason: string;
    confidence: "high" | "medium" | "low";
  }>;
  newActions: Array<{
    text: string;
    reason: string;
  }>;
  createdAt: string;
}

export interface CIRUpdateProposalRow {
  id: string;
  case_id: string;
  user_id: string;
  conversation_id: string;
  proposal_data: CIRUpdateProposal;
  status: "pending" | "accepted" | "rejected" | "partially_accepted" | "auto_applied";
  reviewed_at: string | null;
  created_at: string;
}

const FACT_KEYS = [
  "hearing_date",
  "response_deadline",
  "hearing_type",
  "order_status",
  "document_type",
  "top_concern",
  "concern_category",
  "current_arrangement",
  "opposing_request",
  "coparent_relationship",
  "coparent_stance",
  "representation_status",
  "reason_for_change",
  "prior_court_involvement",
  "situation_summary",
  "child_safety_flag",
  "case_number",
  "court_name",
  "judge_name",
  "filing_party",
  "responding_party",
  "filing_date",
  "effective_date",
  "child_support_amount",
] as const;

type FactKey = typeof FACT_KEYS[number];

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFactKey(value: string): value is FactKey {
  return (FACT_KEYS as readonly string[]).includes(value);
}

function normalizeProposalConfidence(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function parseJsonRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createEmptyFact(updatedAt: string): CaseIntelligenceFactRecord {
  return {
    value: null,
    source: "conversation",
    source_detail: "",
    confidence: "low",
    previous_value: null,
    updated_at: updatedAt,
  };
}

function createBaseIntelligenceData(timestamp: string): CaseIntelligenceDataRecord {
  const facts = Object.fromEntries(
    FACT_KEYS.map((key) => [key, createEmptyFact(timestamp)]),
  ) as Record<string, CaseIntelligenceFactRecord>;

  return {
    facts,
    actions: [],
    flow_type: null,
    snapshot_saved_at: null,
    documents_applied: [],
  };
}

function toSerializableValue(value: FactValue): string | null {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  return null;
}

function sourcePriority(source: FactSource): number {
  if (source === "document") return 3;
  if (source === "user_edit") return 2;
  return 1;
}

function applyFact(args: {
  data: CaseIntelligenceDataRecord;
  key: FactKey;
  value: FactValue;
  source: FactSource;
  sourceDetail: string;
  confidence: FactConfidence;
  updatedAt: string;
}): boolean {
  const { data, key, value, source, sourceDetail, confidence, updatedAt } = args;
  if (value === null || value === undefined || value === "") return false;

  const current = data.facts[key] ?? createEmptyFact(updatedAt);
  const incomingPriority = sourcePriority(source);
  const currentPriority = current.value === null ? 0 : sourcePriority(current.source);

  if (current.value !== null && current.value === value) {
    data.facts[key] = {
      ...current,
      source,
      source_detail: sourceDetail,
      confidence,
      updated_at: updatedAt,
    };
    return false;
  }

  if (incomingPriority < currentPriority) {
    return false;
  }

  data.facts[key] = {
    value,
    source,
    source_detail: sourceDetail,
    confidence,
    previous_value: current.value !== null && current.value !== value ? current.value : current.previous_value,
    updated_at: updatedAt,
  };
  return true;
}

function mapSnapshotField(
  data: CaseIntelligenceDataRecord,
  key: FactKey,
  rawValue: unknown,
  flowType: string,
  updatedAt: string,
): boolean {
  let value: FactValue = null;
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    value = trimmed.length > 0 ? trimmed : null;
  } else if (typeof rawValue === "boolean") {
    value = rawValue;
  }

  return applyFact({
    data,
    key,
    value,
    source: "conversation",
    sourceDetail: `Guided flow: ${flowType}`,
    confidence: "medium",
    updatedAt,
  });
}

function mapDocumentField(
  data: CaseIntelligenceDataRecord,
  key: FactKey,
  rawValue: unknown,
  fileName: string,
  updatedAt: string,
): boolean {
  const value = typeof rawValue === "string" ? rawValue.trim() || null : typeof rawValue === "boolean" ? rawValue : null;
  return applyFact({
    data,
    key,
    value,
    source: "document",
    sourceDetail: `Document: ${fileName}`,
    confidence: "high",
    updatedAt,
  });
}

function diffFacts(
  previous: CaseIntelligenceDataRecord | null,
  next: CaseIntelligenceDataRecord,
): CaseIntelligenceChangeLogEntry["changes"] {
  return FACT_KEYS.flatMap((field) => {
    const oldValue = previous?.facts?.[field]?.value ?? null;
    const newValue = next.facts[field]?.value ?? null;
    if (oldValue === newValue) return [];
    return [{
      field,
      old_value: toSerializableValue(oldValue),
      new_value: toSerializableValue(newValue),
      source: next.facts[field]?.source_detail ?? "",
    }];
  });
}

function parseStoredIntelligenceRow(row: any): CaseIntelligenceRow | null {
  if (!row || !row.case_id || !row.user_id) return null;
  const intelligenceData = parseJsonRecord(row.intelligence_data) as CaseIntelligenceDataRecord | null;
  const changeLog = Array.isArray(row.change_log) ? row.change_log as CaseIntelligenceChangeLogEntry[] : [];
  return {
    id: typeof row.id === "string" ? row.id : null,
    case_id: row.case_id,
    user_id: row.user_id,
    intelligence_data: intelligenceData ?? createBaseIntelligenceData(new Date().toISOString()),
    version: typeof row.version === "number" ? row.version : 1,
    change_log: changeLog,
    last_refreshed_at: typeof row.last_refreshed_at === "string" ? row.last_refreshed_at : new Date().toISOString(),
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function parseStoredProposalRow(row: any): CIRUpdateProposalRow | null {
  if (!row || typeof row.id !== "string" || typeof row.case_id !== "string" || typeof row.user_id !== "string" || typeof row.conversation_id !== "string") {
    return null;
  }
  const proposal = parseJsonRecord(row.proposal_data);
  if (!proposal) return null;

  const proposedChanges = Array.isArray(proposal.proposedChanges)
    ? proposal.proposedChanges.filter(isRecord).map((change) => ({
        field: typeof change.field === "string" ? change.field : "",
        currentValue: typeof change.currentValue === "string" ? change.currentValue : null,
        proposedValue: typeof change.proposedValue === "string" ? change.proposedValue : "",
        reason: typeof change.reason === "string" ? change.reason : "",
        confidence: normalizeProposalConfidence(change.confidence),
      })).filter((change) => change.field && change.proposedValue)
    : [];

  const newActions = Array.isArray(proposal.newActions)
    ? proposal.newActions.filter(isRecord).map((action) => ({
        text: typeof action.text === "string" ? action.text : "",
        reason: typeof action.reason === "string" ? action.reason : "",
      })).filter((action) => action.text)
    : [];

  return {
    id: row.id,
    case_id: row.case_id,
    user_id: row.user_id,
    conversation_id: row.conversation_id,
    proposal_data: {
      conversationId: typeof proposal.conversationId === "string" ? proposal.conversationId : row.conversation_id,
      caseId: typeof proposal.caseId === "string" ? proposal.caseId : row.case_id,
      proposedChanges,
      newActions,
      createdAt: typeof proposal.createdAt === "string" ? proposal.createdAt : row.created_at,
    },
    status:
      row.status === "accepted" || row.status === "rejected" || row.status === "partially_accepted" || row.status === "auto_applied"
        ? row.status
        : "pending",
    reviewed_at: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

async function getStoredCaseIntelligence(caseId: string, userId: string): Promise<CaseIntelligenceRow | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("case_intelligence")
    .select("id, case_id, user_id, intelligence_data, version, change_log, last_refreshed_at, created_at, updated_at")
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return parseStoredIntelligenceRow(data);
}

export async function getLatestPendingCIRProposal(
  caseId: string,
  userId: string,
): Promise<CIRUpdateProposalRow | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("cir_update_proposals")
    .select("id, case_id, user_id, conversation_id, proposal_data, status, reviewed_at, created_at")
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return parseStoredProposalRow(data);
}

export async function getLatestCIRProposalForConversation(
  conversationId: string,
  userId: string,
): Promise<CIRUpdateProposalRow | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("cir_update_proposals")
    .select("id, case_id, user_id, conversation_id, proposal_data, status, reviewed_at, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return parseStoredProposalRow(data);
}

export async function listCIRHistory(
  caseId: string,
  userId: string,
): Promise<CaseIntelligenceChangeLogEntry[]> {
  const record = await getStoredCaseIntelligence(caseId, userId);
  return [...(record?.change_log ?? [])].reverse();
}

async function buildCaseIntelligenceRecord(args: {
  caseId: string;
  userId: string;
  trigger: CaseIntelligenceChangeLogEntry["trigger"];
  existing: CaseIntelligenceRow | null;
}): Promise<CaseIntelligenceRow> {
  const timestamp = new Date().toISOString();
  const caseRecord = await getCaseById(args.caseId, args.userId);
  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  const [documents, caseActions, latestSnapshotRow] = await Promise.all([
    getDocumentsByCase(args.caseId, args.userId),
    getCaseActions(args.caseId, args.userId),
    supabaseAdmin
      ?.from("case_memory")
      .select("case_id, memory_summary, key_open_questions, key_risks, last_refreshed_at, updated_at")
      .eq("case_id", args.caseId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((result) => result.data ?? null),
  ]);

  const nextData = createBaseIntelligenceData(timestamp);
  const normalizedFlow = getGuidedFlowBySituationType(caseRecord.situationType)?.situationType ?? caseRecord.situationType ?? null;
  nextData.flow_type = normalizedFlow;

  const snapshotPayload = parseJsonRecord(latestSnapshotRow?.memory_summary);
  const snapshotState = isRecord(snapshotPayload?.snapshotState) ? snapshotPayload.snapshotState : null;
  nextData.snapshot_saved_at = typeof snapshotPayload?.savedAt === "string" ? snapshotPayload.savedAt : null;

  if (snapshotState && normalizedFlow) {
    if (normalizedFlow === "hearing_prep") {
      mapSnapshotField(nextData, "hearing_date", snapshotState.hearing_date, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "hearing_type", snapshotState.hearing_type, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "top_concern", snapshotState.top_concern, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "concern_category", snapshotState.concern_category, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "current_arrangement", snapshotState.current_schedule, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "order_status", snapshotState.order_status, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "representation_status", snapshotState.representation_status, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "child_safety_flag", snapshotState.child_safety_flag, normalizedFlow, timestamp);
    } else if (normalizedFlow === "respond_filing") {
      mapSnapshotField(nextData, "document_type", snapshotState.document_type, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "opposing_request", snapshotState.opposing_request, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "response_deadline", snapshotState.response_deadline, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "coparent_relationship", snapshotState.coparent_relationship, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "child_safety_flag", snapshotState.child_safety_flag, normalizedFlow, timestamp);
    } else if (normalizedFlow === "more_time") {
      mapSnapshotField(nextData, "current_arrangement", snapshotState.current_arrangement, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "order_status", snapshotState.order_status, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "reason_for_change", snapshotState.reason_for_more_time, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "concern_category", snapshotState.change_category, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "coparent_stance", snapshotState.coparent_stance, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "prior_court_involvement", snapshotState.prior_court_involvement, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "child_safety_flag", snapshotState.child_safety_flag, normalizedFlow, timestamp);
    } else if (normalizedFlow === "figuring_things_out") {
      mapSnapshotField(nextData, "situation_summary", snapshotState.situation_summary, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "order_status", snapshotState.order_status, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "top_concern", snapshotState.primary_concern, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "concern_category", snapshotState.concern_category, normalizedFlow, timestamp);
      mapSnapshotField(nextData, "child_safety_flag", snapshotState.child_safety_flag, normalizedFlow, timestamp);
    }
  }

  const snapshotActions = Array.isArray(snapshotPayload?.actions)
    ? snapshotPayload.actions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  nextData.actions.push(
    ...snapshotActions.map((text) => ({
      text,
      source: "conversation" as const,
      source_detail: `Guided flow: ${normalizedFlow ?? "unknown"}`,
      created_at: nextData.snapshot_saved_at ?? timestamp,
    })),
  );

  const sortedDocuments = [...documents].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const doc of sortedDocuments) {
    const extractedFacts = isRecord(doc.analysisJson?.extracted_facts)
      ? doc.analysisJson.extracted_facts as Record<string, unknown>
      : {};
    const appliedKeys: string[] = [];

    const mappings: Array<[FactKey, unknown]> = [
      ["hearing_date", extractedFacts.hearing_date],
      ["filing_date", extractedFacts.filing_date],
      ["effective_date", extractedFacts.effective_date],
      ["case_number", extractedFacts.case_number],
      ["court_name", extractedFacts.court_name],
      ["judge_name", extractedFacts.judge_name],
      ["filing_party", extractedFacts.filing_party],
      ["responding_party", extractedFacts.responding_party ?? extractedFacts.opposing_party],
      ["child_support_amount", extractedFacts.child_support_amount],
      ["document_type", typeof doc.analysisJson?.document_type === "string" ? doc.analysisJson.document_type : null],
    ];

    for (const [factKey, rawValue] of mappings) {
      if (mapDocumentField(nextData, factKey, rawValue, doc.fileName, doc.createdAt)) {
        appliedKeys.push(factKey);
      }
    }

    if (appliedKeys.length > 0) {
      nextData.documents_applied.push({
        document_id: doc.id,
        file_name: doc.fileName,
        applied_at: doc.createdAt,
        facts_extracted: appliedKeys,
      });
    }
  }

  const openDocumentActions = caseActions.filter((action: CaseActionRow) => action.status === "open");
  nextData.actions.push(
    ...openDocumentActions.map((action: CaseActionRow) => ({
      text: action.description?.trim() || action.title.trim(),
      source: "document" as const,
      source_detail: `Case action: ${action.title.trim()}`,
      created_at: new Date(action.createdAt).toISOString(),
    })),
  );

  const nextVersion = args.existing ? args.existing.version + 1 : 1;
  const changes = diffFacts(args.existing?.intelligence_data ?? null, nextData);
  const nextChangeLog = [
    ...(args.existing?.change_log ?? []),
    {
      version: nextVersion,
      timestamp,
      trigger: args.trigger,
      changes,
    },
  ];

  return {
    id: args.existing?.id ?? null,
    case_id: args.caseId,
    user_id: args.userId,
    intelligence_data: nextData,
    version: nextVersion,
    change_log: nextChangeLog,
    last_refreshed_at: timestamp,
    created_at: args.existing?.created_at ?? timestamp,
    updated_at: timestamp,
  };
}

export async function populateCaseIntelligence(
  caseId: string,
  userId: string,
): Promise<CaseIntelligenceRow> {
  const existing = await getStoredCaseIntelligence(caseId, userId);
  if (existing) return existing;
  return refreshCaseIntelligence(caseId, userId, "snapshot_save");
}

export async function analyzeConversationForCIRUpdates(
  conversationId: string,
  caseId: string,
  userId: string,
): Promise<CIRUpdateProposal | null> {
  console.log(`[CIR] Loading current CIR for case ${caseId}`);
  const currentCIR = await populateCaseIntelligence(caseId, userId);
  console.log(`[CIR] Loading messages for conversation ${conversationId}`);
  const recentMessages = await getRecentConversationMessages(conversationId, 20);

  if (recentMessages.length === 0) return null;

  const conversationMessages = recentMessages
    .map((message) => `${message.role.toUpperCase()}: ${message.messageText}`)
    .join("\n");

  console.log("[CIR] Calling gpt-4o-mini for analysis...");
  const completion = await getOpenAIClient().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are analyzing a custody support conversation to identify new factual information the user shared that differs from or adds to their existing case record.\n\n" +
          "Current case record (CIR):\n" +
          `${JSON.stringify(currentCIR.intelligence_data.facts, null, 2)}\n\n` +
          "Conversation messages:\n" +
          `${conversationMessages}\n\n` +
          "Return ONLY a JSON object with this structure:\n" +
          "{\n" +
          '  "has_changes": boolean,\n' +
          '  "proposed_changes": [\n' +
          "    {\n" +
          '      "field": string,\n' +
          '      "current_value": string | null,\n' +
          '      "proposed_value": string,\n' +
          '      "reason": string,\n' +
          '      "confidence": "high" | "medium" | "low"\n' +
          "    }\n" +
          "  ],\n" +
          '  "new_actions": [\n' +
          "    {\n" +
          '      "text": string,\n' +
          '      "reason": string\n' +
          "    }\n" +
          "  ]\n" +
          "}\n\n" +
          "Only include fields where the user explicitly stated something new or different. Do not infer. Do not include fields where the user confirmed existing information. If nothing changed, return has_changes: false with empty arrays.",
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 900,
    temperature: 0.2,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  console.log("[CIR] Raw response:", raw ?? null);
  if (!raw) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const hasChanges = parsed.has_changes === true;
  console.log("[CIR] has_changes:", hasChanges);
  if (!hasChanges) return null;

  const proposedChanges = Array.isArray(parsed.proposed_changes)
    ? parsed.proposed_changes.filter(isRecord).map((change) => ({
        field: typeof change.field === "string" ? change.field : "",
        currentValue: typeof change.current_value === "string" ? change.current_value : null,
        proposedValue: typeof change.proposed_value === "string" ? change.proposed_value.trim() : "",
        reason: typeof change.reason === "string" ? change.reason.trim() : "",
        confidence: normalizeProposalConfidence(change.confidence),
      }))
      .filter((change) => isFactKey(change.field) && change.proposedValue.length > 0 && change.reason.length > 0)
    : [];

  const newActions = Array.isArray(parsed.new_actions)
    ? parsed.new_actions.filter(isRecord).map((action) => ({
        text: typeof action.text === "string" ? action.text.trim() : "",
        reason: typeof action.reason === "string" ? action.reason.trim() : "",
      })).filter((action) => action.text.length > 0)
    : [];

  console.log("[CIR] proposed_changes count:", proposedChanges.length);
  if (proposedChanges.length === 0 && newActions.length === 0) return null;

  return {
    conversationId,
    caseId,
    proposedChanges,
    newActions,
    createdAt: new Date().toISOString(),
  };
}

export async function storeCIRProposal(
  proposal: CIRUpdateProposal,
  userId: string,
  status: CIRUpdateProposalRow["status"] = "pending",
): Promise<CIRUpdateProposalRow | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("cir_update_proposals")
    .insert({
      case_id: proposal.caseId,
      user_id: userId,
      conversation_id: proposal.conversationId,
      proposal_data: proposal,
      status,
      reviewed_at: status === "pending" ? null : new Date().toISOString(),
    })
    .select("id, case_id, user_id, conversation_id, proposal_data, status, reviewed_at, created_at")
    .single();

  if (error || !data) {
    console.error("[CIR] Failed to insert cir_update_proposals row:", error);
    throw new Error(error?.message ?? "Failed to store CIR proposal.");
  }

  return parseStoredProposalRow(data);
}

export async function applyCIRProposal(
  proposalId: string,
  userId: string,
  acceptedFields: string[],
  acceptedActions: boolean,
): Promise<CaseIntelligenceRow> {
  if (!supabaseAdmin) {
    throw new Error("Case intelligence storage is unavailable.");
  }

  const { data, error } = await supabaseAdmin
    .from("cir_update_proposals")
    .select("id, case_id, user_id, conversation_id, proposal_data, status, reviewed_at, created_at")
    .eq("id", proposalId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Proposal not found.");
  }

  const proposalRow = parseStoredProposalRow(data);
  if (!proposalRow) {
    throw new Error("Proposal is invalid.");
  }

  const current = await populateCaseIntelligence(proposalRow.case_id, userId);
  const nextData: CaseIntelligenceDataRecord = JSON.parse(JSON.stringify(current.intelligence_data)) as CaseIntelligenceDataRecord;
  const acceptedFieldSet = new Set(acceptedFields.filter(isFactKey));
  const changes: CaseIntelligenceChangeLogEntry["changes"] = [];
  const now = new Date().toISOString();

  for (const change of proposalRow.proposal_data.proposedChanges) {
    if (!acceptedFieldSet.has(change.field as FactKey)) continue;
    const factKey = change.field as FactKey;
    const currentFact = nextData.facts[factKey] ?? createEmptyFact(now);
    const oldValue = currentFact.value;
    nextData.facts[factKey] = {
      value: change.proposedValue,
      source: "conversation",
      source_detail: `Conversation refresh: ${proposalRow.conversation_id}`,
      confidence: change.confidence,
      previous_value: oldValue,
      updated_at: now,
    };
    changes.push({
      field: factKey,
      old_value: toSerializableValue(oldValue),
      new_value: change.proposedValue,
      source: `Conversation refresh: ${proposalRow.conversation_id}`,
    });
  }

  if (acceptedActions) {
    nextData.actions.push(
      ...proposalRow.proposal_data.newActions.map((action) => ({
        text: action.text,
        source: "conversation" as const,
        source_detail: `Conversation refresh: ${proposalRow.conversation_id}`,
        created_at: now,
      })),
    );
  }

  const nextVersion = current.version + 1;
  const nextChangeLog = [
    ...current.change_log,
    {
      version: nextVersion,
      timestamp: now,
      trigger: "conversation_refresh" as const,
      changes,
    },
  ];

  const { data: updatedCir, error: cirError } = await supabaseAdmin
    .from("case_intelligence")
    .upsert({
      case_id: current.case_id,
      user_id: current.user_id,
      intelligence_data: nextData,
      version: nextVersion,
      change_log: nextChangeLog,
      last_refreshed_at: now,
    }, { onConflict: "case_id" })
    .select("id, case_id, user_id, intelligence_data, version, change_log, last_refreshed_at, created_at, updated_at")
    .single();

  if (cirError || !updatedCir) {
    throw new Error(cirError?.message ?? "Failed to update case intelligence.");
  }

  const acceptedCount = changes.length;
  const totalCount = proposalRow.proposal_data.proposedChanges.length;
  const nextStatus: CIRUpdateProposalRow["status"] =
    acceptedCount === 0 && !acceptedActions
      ? "rejected"
      : acceptedCount === totalCount
        ? "accepted"
        : "partially_accepted";

  const { error: proposalError } = await supabaseAdmin
    .from("cir_update_proposals")
    .update({
      status: nextStatus,
      reviewed_at: now,
    })
    .eq("id", proposalId)
    .eq("user_id", userId);

  if (proposalError) {
    throw new Error(proposalError.message);
  }

  return parseStoredIntelligenceRow(updatedCir) ?? current;
}

export async function runConversationCIRAnalysisWorkflow(args: {
  conversationId: string;
  caseId: string;
  userId: string;
  autoUpdateCir: boolean;
}): Promise<{
  hasChanges: boolean;
  autoApplied: boolean;
  proposal: CIRUpdateProposalRow | null;
  updatedCIR?: CaseIntelligenceRow;
}> {
  const proposal = await analyzeConversationForCIRUpdates(args.conversationId, args.caseId, args.userId);
  if (!proposal) {
    return { hasChanges: false, autoApplied: false, proposal: null };
  }

  const stored = await storeCIRProposal(proposal, args.userId, args.autoUpdateCir ? "auto_applied" : "pending");
  if (!stored) {
    return { hasChanges: false, autoApplied: false, proposal: null };
  }

  if (!args.autoUpdateCir) {
    return { hasChanges: true, autoApplied: false, proposal: stored };
  }

  const updatedCIR = await applyCIRProposal(
    stored.id,
    args.userId,
    stored.proposal_data.proposedChanges.map((change) => change.field),
    stored.proposal_data.newActions.length > 0,
  );

  if (supabaseAdmin) {
    await supabaseAdmin
      .from("cir_update_proposals")
      .update({ status: "auto_applied", reviewed_at: new Date().toISOString() })
      .eq("id", stored.id)
      .eq("user_id", args.userId);
  }

  return { hasChanges: true, autoApplied: true, proposal: stored, updatedCIR };
}

export async function refreshCaseIntelligence(
  caseId: string,
  userId: string,
  trigger: CaseIntelligenceChangeLogEntry["trigger"] = "conversation_refresh",
): Promise<CaseIntelligenceRow> {
  if (!supabaseAdmin) {
    throw new Error("Case intelligence storage is unavailable.");
  }

  const existing = await getStoredCaseIntelligence(caseId, userId);
  const nextRecord = await buildCaseIntelligenceRecord({
    caseId,
    userId,
    trigger,
    existing,
  });

  const payload = {
    case_id: nextRecord.case_id,
    user_id: nextRecord.user_id,
    intelligence_data: nextRecord.intelligence_data,
    version: nextRecord.version,
    change_log: nextRecord.change_log,
    last_refreshed_at: nextRecord.last_refreshed_at,
  };

  const { data, error } = await supabaseAdmin
    .from("case_intelligence")
    .upsert(payload, { onConflict: "case_id" })
    .select("id, case_id, user_id, intelligence_data, version, change_log, last_refreshed_at, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to persist case intelligence.");
  }

  return parseStoredIntelligenceRow(data) ?? nextRecord;
}
