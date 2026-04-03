/**
 * server/services/cases.ts
 *
 * Supabase-backed service for the case-based architecture.
 * All operations are user-scoped and fail gracefully when tables
 * are not yet present (returns null / empty arrays so callers
 * never crash even during an incomplete migration).
 *
 * Expected Supabase tables (already applied via RLS migration):
 *
 *   cases
 *     id                  uuid PK DEFAULT gen_random_uuid()
 *     user_id             uuid NOT NULL
 *     title               text NOT NULL
 *     description         text
 *     jurisdiction_state  text
 *     jurisdiction_county text
 *     status              text DEFAULT 'active'
 *     created_at          timestamptz DEFAULT now()
 *     updated_at          timestamptz DEFAULT now()
 *
 *   conversations
 *     id                  uuid PK DEFAULT gen_random_uuid()
 *     case_id             uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE
 *     user_id             uuid NOT NULL
 *     title               text
 *     thread_type         text DEFAULT 'general'
 *     jurisdiction_state  text
 *     jurisdiction_county text
 *     document_id         uuid
 *     created_at          timestamptz DEFAULT now()
 *
 *   messages
 *     id                       uuid PK DEFAULT gen_random_uuid()
 *     conversation_id          uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
 *     role                     text NOT NULL
 *     message_text             text NOT NULL
 *     structured_response_json jsonb
 *     created_at               timestamptz DEFAULT now()
 *
 *   case_actions
 *     id          uuid PK DEFAULT gen_random_uuid()
 *     case_id     uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE
 *     user_id     uuid NOT NULL
 *     action_type text NOT NULL
 *     action_data jsonb
 *     created_at  timestamptz DEFAULT now()
 *
 *   case_memory
 *     id           uuid PK DEFAULT gen_random_uuid()
 *     case_id      uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE
 *     user_id      uuid NOT NULL
 *     memory_type  text NOT NULL
 *     content      text NOT NULL
 *     created_at   timestamptz DEFAULT now()
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";

/* ── Public types ─────────────────────────────────────────────────────────── */

export interface Case {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  caseId: string;
  userId: string;
  title: string | null;
  threadType: string;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
  documentId: string | null;
  createdAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  messageText: string;
  structuredResponseJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface CaseAction {
  id: string;
  caseId: string;
  userId: string;
  actionType: string;
  actionData: Record<string, unknown> | null;
  createdAt: string;
}

export interface CaseMemory {
  id: string;
  caseId: string;
  userId: string;
  memoryType: string;
  content: string;
  createdAt: string;
}

export interface CaseCreateFailure {
  stage: "unconfigured" | "insert" | "legacy_fallback" | "exception";
  message: string | null;
  code: string | null;
  details: string | null;
  hint: string | null;
}

export interface CreateCaseResult {
  caseRecord: Case | null;
  failure: CaseCreateFailure | null;
}

/* ── Row mappers ──────────────────────────────────────────────────────────── */

export function mapCaseRow(r: any): Case {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title ?? r.name ?? "Untitled case",
    description: r.description ?? null,
    jurisdictionState: r.jurisdiction_state ?? r.jurisdiction ?? null,
    jurisdictionCounty: r.jurisdiction_county ?? null,
    status: r.status ?? "active",
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
}

export function extractMissingInsertColumn(message: string | undefined): string | null {
  if (!message) return null;
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

export function extractNotNullViolationColumn(message: string | undefined): string | null {
  if (!message) return null;
  const match = message.match(/null value in column "([^"]+)"/i);
  return match?.[1] ?? null;
}

function mapConversation(r: any): Conversation {
  return {
    id: r.id,
    caseId: r.case_id,
    userId: r.user_id,
    title: r.title ?? null,
    threadType: r.thread_type ?? "general",
    jurisdictionState: r.jurisdiction_state ?? null,
    jurisdictionCounty: r.jurisdiction_county ?? null,
    documentId: r.document_id ?? null,
    createdAt: r.created_at,
  };
}

function mapMessage(r: any): ConversationMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as "user" | "assistant",
    messageText: r.message_text,
    structuredResponseJson: r.structured_response_json ?? null,
    createdAt: r.created_at,
  };
}

function mapAction(r: any): CaseAction {
  return {
    id: r.id,
    caseId: r.case_id,
    userId: r.user_id,
    actionType: r.action_type,
    actionData: r.action_data ?? null,
    createdAt: r.created_at,
  };
}

function mapMemory(r: any): CaseMemory {
  return {
    id: r.id,
    caseId: r.case_id,
    userId: r.user_id,
    memoryType: r.memory_type,
    content: r.content,
    createdAt: r.created_at,
  };
}

/* ── Cases ────────────────────────────────────────────────────────────────── */

export async function createCase(
  userId: string,
  opts: {
    title: string;
    description?: string;
    jurisdictionState?: string;
    jurisdictionCounty?: string;
  },
  trace?: {
    errorId?: string;
  },
): Promise<CreateCaseResult> {
  if (!supabaseAdmin) {
    return {
      caseRecord: null,
      failure: {
        stage: "unconfigured",
        message: "Supabase admin client not configured",
        code: null,
        details: null,
        hint: null,
      },
    };
  }
  try {
    const normalizedTitle = opts.title.slice(0, 200);
    const modernInsertPayload = {
      user_id: userId,
      title: normalizedTitle,
      description: opts.description ?? null,
      jurisdiction_state: opts.jurisdictionState ?? null,
      jurisdiction_county: opts.jurisdictionCounty ?? null,
      status: "active",
    };

    const { data, error } = await supabaseAdmin
      .from("cases")
      .insert(modernInsertPayload)
      .select()
      .single();

    if (!error && data) {
      return { caseRecord: mapCaseRow(data), failure: null };
    }

    const missingColumn = extractMissingInsertColumn(error?.message);
    const notNullColumn = extractNotNullViolationColumn(error?.message);
    const canRetryWithLegacySchema = missingColumn !== null
      && ["title", "description", "jurisdiction_state", "jurisdiction_county", "status"].includes(missingColumn);
    const canRetryWithLegacyRequiredName = notNullColumn === "name";

    if (canRetryWithLegacySchema || canRetryWithLegacyRequiredName) {
      const legacyInsertPayload = {
        user_id: userId,
        name: normalizedTitle,
        case_number: opts.description ?? null,
        jurisdiction: opts.jurisdictionState ?? null,
      };

      const legacyInsert = await supabaseAdmin
        .from("cases")
        .insert(legacyInsertPayload)
        .select()
        .single();

      if (!legacyInsert.error && legacyInsert.data) {
        console.warn(
          `[cases] createCase used legacy schema fallback (errorId=${trace?.errorId ?? "n/a"}, missingColumn='${missingColumn ?? "n/a"}', notNullColumn='${notNullColumn ?? "n/a"}').`,
        );
        return { caseRecord: mapCaseRow(legacyInsert.data), failure: null };
      }

      console.error("[cases] createCase legacy fallback error:", {
        errorId: trace?.errorId ?? null,
        message: legacyInsert.error?.message,
        code: legacyInsert.error?.code,
        details: legacyInsert.error?.details,
        hint: legacyInsert.error?.hint,
      });
      return {
        caseRecord: null,
        failure: {
          stage: "legacy_fallback",
          message: legacyInsert.error?.message ?? null,
          code: legacyInsert.error?.code ?? null,
          details: legacyInsert.error?.details ?? null,
          hint: legacyInsert.error?.hint ?? null,
        },
      };
    }

    console.error("[cases] createCase error:", {
      errorId: trace?.errorId ?? null,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    return {
      caseRecord: null,
      failure: {
        stage: "insert",
        message: error?.message ?? null,
        code: error?.code ?? null,
        details: error?.details ?? null,
        hint: error?.hint ?? null,
      },
    };
  } catch (err) {
    console.error("[cases] createCase exception:", {
      errorId: trace?.errorId ?? null,
      err,
    });
    return {
      caseRecord: null,
      failure: {
        stage: "exception",
        message: err instanceof Error ? err.message : "Unknown createCase exception",
        code: null,
        details: null,
        hint: null,
      },
    };
  }
}

export async function listCases(userId: string, limit = 50): Promise<Case[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("cases")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map(mapCaseRow);
  } catch {
    return [];
  }
}

export async function getCaseById(caseId: string, userId: string): Promise<Case | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .eq("user_id", userId)
      .single();
    if (error || !data) return null;
    return mapCaseRow(data);
  } catch {
    return null;
  }
}

export async function updateCaseStatus(
  caseId: string,
  userId: string,
  status: string,
): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { error } = await supabaseAdmin
      .from("cases")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", caseId)
      .eq("user_id", userId);
    return !error;
  } catch {
    return false;
  }
}

/* ── Conversations ────────────────────────────────────────────────────────── */

export async function createConversation(
  userId: string,
  caseId: string,
  opts: {
    title?: string;
    threadType?: string;
    jurisdictionState?: string;
    jurisdictionCounty?: string;
    documentId?: string;
  },
): Promise<Conversation | null> {
  if (!supabaseAdmin) return null;
  try {
    const ownerCheck = await getCaseById(caseId, userId);
    if (!ownerCheck) return null;

    const { data, error } = await supabaseAdmin
      .from("conversations")
      .insert({
        case_id: caseId,
        user_id: userId,
        title: opts.title?.slice(0, 200) ?? null,
        thread_type: opts.threadType ?? "general",
        jurisdiction_state: opts.jurisdictionState ?? null,
        jurisdiction_county: opts.jurisdictionCounty ?? null,
        document_id: opts.documentId ?? null,
      })
      .select()
      .single();
    if (error || !data) {
      console.error("[cases] createConversation error:", error?.message);
      return null;
    }
    return mapConversation(data);
  } catch (err) {
    console.error("[cases] createConversation exception:", err);
    return null;
  }
}

export async function listConversations(
  caseId: string,
  userId: string,
  limit = 50,
): Promise<Conversation[]> {
  if (!supabaseAdmin) return [];
  try {
    const ownerCheck = await getCaseById(caseId, userId);
    if (!ownerCheck) return [];

    const { data, error } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map(mapConversation);
  } catch {
    return [];
  }
}

export async function getConversationById(
  conversationId: string,
  userId: string,
): Promise<Conversation | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single();
    if (error || !data) return null;
    return mapConversation(data);
  } catch {
    return null;
  }
}

/* ── Messages ─────────────────────────────────────────────────────────────── */

export async function listMessages(
  conversationId: string,
  userId: string,
  limit = 100,
): Promise<ConversationMessage[]> {
  if (!supabaseAdmin) return [];
  try {
    const ownerCheck = await getConversationById(conversationId, userId);
    if (!ownerCheck) return [];

    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) {
      console.warn("[cases] listMessages Supabase error — table may be missing:", error.message, error.code);
      return [];
    }
    if (!data) return [];
    return data.map(mapMessage);
  } catch (err) {
    console.error("[cases] listMessages exception:", err);
    return [];
  }
}

/**
 * Load the most recent messages for a conversation, returned oldest-first
 * so they can be fed directly into the AI history window.
 * Does NOT require a separate userId ownership check — caller must have
 * already verified the conversation belongs to the user.
 */
export async function getRecentConversationMessages(
  conversationId: string,
  limit = 16,
): Promise<ConversationMessage[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[cases] getRecentConversationMessages Supabase error:", error.message, error.code);
      return [];
    }
    if (!data) return [];
    return data.reverse().map(mapMessage);
  } catch (err) {
    console.error("[cases] getRecentConversationMessages exception:", err);
    return [];
  }
}

/**
 * Append a single message to a conversation's messages table.
 * Returns null (and logs) on failure — callers should treat this as non-fatal.
 */
export async function appendConversationMessage(
  conversationId: string,
  role: "user" | "assistant",
  messageText: string,
  structuredResponseJson?: Record<string, unknown>,
): Promise<ConversationMessage | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role,
        message_text: messageText,
        structured_response_json: structuredResponseJson ?? null,
      })
      .select()
      .single();
    if (error) {
      console.warn("[cases] appendConversationMessage Supabase error:", error.message, error.code);
      return null;
    }
    if (!data) return null;
    return mapMessage(data);
  } catch (err) {
    console.error("[cases] appendConversationMessage exception:", err);
    return null;
  }
}

/* ── Case Actions ─────────────────────────────────────────────────────────── */

export async function recordCaseAction(
  userId: string,
  caseId: string,
  actionType: string,
  actionData?: Record<string, unknown>,
): Promise<CaseAction | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("case_actions")
      .insert({
        case_id: caseId,
        user_id: userId,
        action_type: actionType,
        action_data: actionData ?? null,
      })
      .select()
      .single();
    if (error || !data) return null;
    return mapAction(data);
  } catch {
    return null;
  }
}

export async function listCaseActions(
  caseId: string,
  userId: string,
  limit = 50,
): Promise<CaseAction[]> {
  if (!supabaseAdmin) return [];
  try {
    const ownerCheck = await getCaseById(caseId, userId);
    if (!ownerCheck) return [];

    const { data, error } = await supabaseAdmin
      .from("case_actions")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map(mapAction);
  } catch {
    return [];
  }
}

/* ── Case Memory ──────────────────────────────────────────────────────────── */

export async function upsertCaseMemory(
  userId: string,
  caseId: string,
  memoryType: string,
  content: string,
): Promise<CaseMemory | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("case_memory")
      .insert({
        case_id: caseId,
        user_id: userId,
        memory_type: memoryType,
        content,
      })
      .select()
      .single();
    if (error || !data) return null;
    return mapMemory(data);
  } catch {
    return null;
  }
}

export async function listCaseMemory(
  caseId: string,
  userId: string,
): Promise<CaseMemory[]> {
  if (!supabaseAdmin) return [];
  try {
    const ownerCheck = await getCaseById(caseId, userId);
    if (!ownerCheck) return [];

    const { data, error } = await supabaseAdmin
      .from("case_memory")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data.map(mapMemory);
  } catch {
    return [];
  }
}
