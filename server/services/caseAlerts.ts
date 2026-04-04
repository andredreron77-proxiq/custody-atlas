import { supabaseAdmin } from "../lib/supabaseAdmin";

export type AlertState = "active" | "reviewed" | "resolved" | "dismissed" | "reopened";
export type AlertType = "missing_document" | "overdue_event" | "upcoming_deadline" | "conflict_detected" | "incomplete_case";
export type AlertSeverity = "high" | "medium" | "info";
export type AlertResolutionMethod = "document" | "event" | "user" | "inferred";
export type AlertTargetSection = "timeline" | "document" | "add_document" | "ask_atlas";

export type AlertActionId =
  | "upload_document"
  | "link_existing_document"
  | "mark_not_applicable"
  | "mark_reviewed"
  | "add_outcome_event"
  | "upload_related_document"
  | "mark_resolved"
  | "upload_filing"
  | "add_submission_event"
  | "select_correct_event"
  | "dismiss_duplicate"
  | "upload_latest_notice"
  | "upload_documents"
  | "ask_atlas"
  | "reopen";

export interface AlertTarget {
  label: string;
  href: string;
  section: AlertTargetSection;
}

export interface AlertSuggestedResolution {
  confidence: "medium";
  prompt: string;
  method: AlertResolutionMethod;
  documentId?: string | null;
  eventId?: string | null;
}

export interface CaseAlert {
  id: string;
  caseId: string;
  userId: string;
  alertKey: string;
  type: AlertType;
  state: AlertState;
  title: string;
  message: string;
  impact: string;
  severity: AlertSeverity;
  relatedItem: string;
  recommendedAction: string;
  target: AlertTarget;
  resolutionMethod: AlertResolutionMethod | null;
  resolvedByDocumentId: string | null;
  resolvedByEventId: string | null;
  resolvedByUserId: string | null;
  resolutionNote: string | null;
  suggestedResolution: AlertSuggestedResolution | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertDraft {
  alertKey: string;
  type: AlertType;
  title: string;
  message: string;
  impact: string;
  severity: AlertSeverity;
  relatedItem: string;
  recommendedAction: string;
  target: AlertTarget;
  shouldBeActive: boolean;
  autoResolveHighConfidence?: {
    method: AlertResolutionMethod;
    note: string;
    resolvedByDocumentId?: string | null;
    resolvedByEventId?: string | null;
  } | null;
  suggestedResolution?: AlertSuggestedResolution | null;
}

export const ALLOWED_ACTIONS: Record<AlertType, Array<{ id: AlertActionId; label: string }>> = {
  missing_document: [
    { id: "upload_document", label: "Upload document" },
    { id: "link_existing_document", label: "Link existing document" },
    { id: "mark_not_applicable", label: "Mark not applicable" },
    { id: "mark_reviewed", label: "Mark reviewed" },
  ],
  overdue_event: [
    { id: "add_outcome_event", label: "Add outcome (event)" },
    { id: "upload_related_document", label: "Upload related document" },
    { id: "mark_reviewed", label: "Mark reviewed" },
    { id: "mark_resolved", label: "Mark resolved" },
  ],
  upcoming_deadline: [
    { id: "upload_filing", label: "Upload filing" },
    { id: "add_submission_event", label: "Add submission event" },
    { id: "mark_reviewed", label: "Mark reviewed" },
  ],
  conflict_detected: [
    { id: "select_correct_event", label: "Select correct event" },
    { id: "dismiss_duplicate", label: "Dismiss duplicate" },
    { id: "upload_latest_notice", label: "Upload latest notice" },
    { id: "mark_reviewed", label: "Mark reviewed" },
  ],
  incomplete_case: [
    { id: "upload_documents", label: "Upload documents" },
    { id: "ask_atlas", label: "Ask Atlas" },
    { id: "mark_reviewed", label: "Mark reviewed" },
  ],
};

function mapRow(row: any): CaseAlert {
  return {
    id: row.id,
    caseId: row.case_id,
    userId: row.user_id,
    alertKey: row.alert_key,
    type: row.alert_type,
    state: row.state,
    title: row.title,
    message: row.message,
    impact: row.impact,
    severity: row.severity,
    relatedItem: row.related_item,
    recommendedAction: row.recommended_action,
    target: {
      label: row.target_label,
      href: row.target_href,
      section: row.target_section,
    },
    resolutionMethod: row.resolution_method,
    resolvedByDocumentId: row.resolved_by_document_id,
    resolvedByEventId: row.resolved_by_event_id,
    resolvedByUserId: row.resolved_by_user_id,
    resolutionNote: row.resolution_note,
    suggestedResolution: row.suggested_resolution_json ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCaseAlerts(caseId: string, userId: string): Promise<CaseAlert[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("case_alerts")
      .select("*")
      .eq("case_id", caseId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map(mapRow);
  } catch {
    return [];
  }
}

export async function reconcileCaseAlerts(
  caseId: string,
  userId: string,
  drafts: AlertDraft[],
): Promise<{ alerts: CaseAlert[]; transitions: Array<{ alert: CaseAlert; from: AlertState | null; to: AlertState }> }> {
  if (!supabaseAdmin) return { alerts: [], transitions: [] };

  const existing = await listCaseAlerts(caseId, userId);
  const byKey = new Map(existing.map((a) => [a.alertKey, a]));
  const transitions: Array<{ alert: CaseAlert; from: AlertState | null; to: AlertState }> = [];

  for (const draft of drafts) {
    const prev = byKey.get(draft.alertKey);
    let nextState: AlertState = prev?.state ?? "active";

    if (draft.shouldBeActive) {
      if (!prev) nextState = "active";
      else if (["dismissed", "resolved"].includes(prev.state)) nextState = "reopened";
      else if (prev.state === "reviewed") nextState = "reviewed";
      else nextState = prev.state;
    } else {
      if (!prev) continue;
      if (["active", "reviewed", "reopened"].includes(prev.state)) nextState = "resolved";
    }

    if (draft.autoResolveHighConfidence && draft.shouldBeActive === false) {
      nextState = "resolved";
    }

    const payload: Record<string, unknown> = {
      case_id: caseId,
      user_id: userId,
      alert_key: draft.alertKey,
      alert_type: draft.type,
      state: nextState,
      title: draft.title,
      message: draft.message,
      impact: draft.impact,
      severity: draft.severity,
      related_item: draft.relatedItem,
      recommended_action: draft.recommendedAction,
      target_label: draft.target.label,
      target_href: draft.target.href,
      target_section: draft.target.section,
      suggested_resolution_json: draft.suggestedResolution ?? null,
      updated_at: new Date().toISOString(),
    };

    if (nextState === "resolved" && draft.autoResolveHighConfidence) {
      payload.resolution_method = draft.autoResolveHighConfidence.method;
      payload.resolution_note = draft.autoResolveHighConfidence.note;
      payload.resolved_by_document_id = draft.autoResolveHighConfidence.resolvedByDocumentId ?? null;
      payload.resolved_by_event_id = draft.autoResolveHighConfidence.resolvedByEventId ?? null;
      payload.resolved_by_user_id = userId;
      payload.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from("case_alerts")
      .upsert(payload, { onConflict: "case_id,alert_key" })
      .select("*")
      .single();

    if (!error && data) {
      const current = mapRow(data);
      byKey.set(current.alertKey, current);
      if (!prev || prev.state !== current.state) {
        transitions.push({ alert: current, from: prev?.state ?? null, to: current.state });
      }
    }
  }

  return { alerts: Array.from(byKey.values()), transitions };
}

export async function applyAlertAction(args: {
  caseId: string;
  userId: string;
  alertId: string;
  actionId: AlertActionId;
  resolutionNote?: string;
  documentId?: string;
  eventId?: string;
  confirmSuggested?: boolean;
}): Promise<{ before: CaseAlert; after: CaseAlert } | null> {
  if (!supabaseAdmin) return null;
  const { data: row } = await supabaseAdmin
    .from("case_alerts")
    .select("*")
    .eq("id", args.alertId)
    .eq("case_id", args.caseId)
    .eq("user_id", args.userId)
    .single();
  if (!row) return null;
  const before = mapRow(row);

  const allowed = ALLOWED_ACTIONS[before.type].some((item) => item.id === args.actionId)
    || args.actionId === "reopen";
  if (!allowed) return null;

  let state: AlertState = before.state;
  let resolutionMethod: AlertResolutionMethod | null = before.resolutionMethod;
  let resolvedByDocumentId = before.resolvedByDocumentId;
  let resolvedByEventId = before.resolvedByEventId;

  if (args.actionId === "mark_reviewed") state = "reviewed";
  if (args.actionId === "mark_not_applicable" || args.actionId === "dismiss_duplicate") state = "dismissed";
  if (args.actionId === "mark_resolved") {
    state = "resolved";
    resolutionMethod = "user";
  }
  if (["upload_document", "link_existing_document", "upload_related_document", "upload_filing", "upload_latest_notice", "upload_documents"].includes(args.actionId)) {
    state = "resolved";
    resolutionMethod = "document";
    resolvedByDocumentId = args.documentId ?? resolvedByDocumentId;
  }
  if (["add_outcome_event", "add_submission_event", "select_correct_event"].includes(args.actionId)) {
    state = "resolved";
    resolutionMethod = "event";
    resolvedByEventId = args.eventId ?? resolvedByEventId;
  }
  if (args.actionId === "ask_atlas") state = "reviewed";
  if (args.actionId === "reopen") state = "reopened";
  if (args.confirmSuggested && before.suggestedResolution) {
    state = "resolved";
    resolutionMethod = before.suggestedResolution.method;
    resolvedByDocumentId = before.suggestedResolution.documentId ?? resolvedByDocumentId;
    resolvedByEventId = before.suggestedResolution.eventId ?? resolvedByEventId;
  }

  const { data, error } = await supabaseAdmin
    .from("case_alerts")
    .update({
      state,
      resolution_method: state === "resolved" ? (resolutionMethod ?? "user") : null,
      resolved_by_document_id: state === "resolved" ? resolvedByDocumentId : null,
      resolved_by_event_id: state === "resolved" ? resolvedByEventId : null,
      resolved_by_user_id: state === "resolved" ? args.userId : null,
      resolution_note: args.resolutionNote?.trim() || before.resolutionNote,
      suggested_resolution_json: state === "resolved" ? null : before.suggestedResolution,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.alertId)
    .eq("case_id", args.caseId)
    .eq("user_id", args.userId)
    .select("*")
    .single();

  if (error || !data) return null;
  return { before, after: mapRow(data) };
}
