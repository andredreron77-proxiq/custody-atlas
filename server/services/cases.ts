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
 *     case_type           text
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

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  stage: "insert";
  category:
    | "table_missing"
    | "column_missing"
    | "not_null_violation"
    | "rls_policy_block"
    | "auth_session_issue"
    | "malformed_payload"
    | "wrong_schema"
    | "service_role_client_issue"
    | "other";
  insertPayload: Record<string, unknown>;
  error: {
    message?: string | null;
    code?: string | null;
    details?: string | null;
    hint?: string | null;
  };
}

export interface CreateCaseResult {
  createdCase: Case | null;
  failure: CaseCreateFailure | null;
}

/* ── Row mappers ──────────────────────────────────────────────────────────── */

export function mapCaseRow(r: any): Case {
  const createdAt =
    typeof r.created_at === "string" && r.created_at.trim().length > 0
      ? r.created_at
      : new Date().toISOString();

  return {
    id: r.id,
    userId: r.user_id,
    title: r.title ?? "Untitled case",
    description: r.description ?? null,
    jurisdictionState: r.jurisdiction_state ?? null,
    jurisdictionCounty: r.jurisdiction_county ?? null,
    status: r.status ?? "active",
    createdAt,
    updatedAt: r.updated_at ?? createdAt,
  };
}

function categorizeCreateCaseError(err: {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}): CaseCreateFailure["category"] {
  const message = (err.message ?? "").toLowerCase();
  const details = (err.details ?? "").toLowerCase();
  const hint = (err.hint ?? "").toLowerCase();
  const code = (err.code ?? "").toLowerCase();

  if (message.includes("relation") && message.includes("does not exist")) return "table_missing";
  if (message.includes("column") && message.includes("does not exist")) return "column_missing";
  if (code === "23502" || message.includes("null value in column")) return "not_null_violation";
  if (code === "42501" || message.includes("row-level security") || details.includes("violates row-level security")) {
    return "rls_policy_block";
  }
  if (message.includes("jwt") || message.includes("not authenticated")) return "auth_session_issue";
  if (code === "22p02" || message.includes("invalid input syntax")) return "malformed_payload";
  if (message.includes("schema cache") || hint.includes("schema cache")) return "wrong_schema";
  if (message.includes("service role") || message.includes("permission denied")) return "service_role_client_issue";
  return "other";
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
    caseType?: string;
    status?: string;
  },
): Promise<Case | null> {
  const result = await createCaseWithDiagnostics(userId, opts);
  return result.createdCase;
}

export async function createCaseWithDiagnostics(
  userId: string,
  opts: {
    title: string;
    caseType?: string;
    status?: string;
    authToken?: string | null;
  },
): Promise<CreateCaseResult> {
  const normalizedTitle = opts.title.slice(0, 200);
  // Keep inserts aligned to confirmed live schema columns only.
  const insertPayload: {
    user_id: string;
    title: string;
    case_type: string;
    status: string;
  } = {
    user_id: userId,
    title: normalizedTitle,
    case_type: opts.caseType ?? "general",
    status: opts.status ?? "active",
  };

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const authToken = (opts.authToken ?? "").trim();
  const authedClient: SupabaseClient | null =
    supabaseUrl && anonKey && authToken
      ? createClient(supabaseUrl, anonKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
          global: {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          },
        })
      : null;

  const insertWithClient = async (client: SupabaseClient) => {
    console.info("[cases] createCase insert attempt", {
      userId,
      insertPayload,
      hasAuthToken: authToken.length > 0,
      clientMode: client === authedClient ? "authenticated_jwt" : "admin_service_role",
    });
    return client
      .from("cases")
      .insert(insertPayload)
      .select()
      .single();
  };

  if (!supabaseAdmin && !authedClient) {
    return {
      createdCase: null,
      failure: {
        stage: "insert",
        category: "service_role_client_issue",
        insertPayload,
        error: {
          message: "Supabase admin client is not configured.",
          code: null,
          details: null,
          hint: "Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        },
      },
    };
  }
  try {
    // Prefer authenticated user context first so RLS insert policies are always satisfied.
    const primaryClient = authedClient ?? supabaseAdmin;
    if (!primaryClient) {
      throw new Error("No Supabase client available for case insert.");
    }

    let { data, error } = await insertWithClient(primaryClient);
    const shouldFallbackToAdmin =
      !!error &&
      primaryClient === authedClient &&
      supabaseAdmin &&
      (error.code === "42501" ||
        /row-level security/i.test(error.message ?? "") ||
        /permission denied/i.test(error.message ?? ""));
    if (shouldFallbackToAdmin) {
      const adminClient = supabaseAdmin;
      if (!adminClient) {
        throw new Error("Admin Supabase client unavailable during createCase fallback.");
      }
      console.warn("[cases] createCase retrying insert with admin client after RLS/auth failure", {
        userId,
        insertPayload,
        initialError: {
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
        },
      });
      ({ data, error } = await insertWithClient(adminClient));
    }

    if (!error && data) {
      return { createdCase: mapCaseRow(data), failure: null };
    }
    console.error("[cases] createCase insert failed", {
      userId,
      insertPayload,
      error: {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      },
    });

    return {
      createdCase: null,
      failure: {
        stage: "insert",
        category: categorizeCreateCaseError({
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
        }),
        insertPayload,
        error: {
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
        },
      },
    };
  } catch (err) {
    console.error("[cases] createCase insert exception", { userId, insertPayload, err });
    return {
      createdCase: null,
      failure: {
        stage: "insert",
        category: "other",
        insertPayload,
        error: {
          message: err instanceof Error ? err.message : String(err),
          code: null,
          details: null,
          hint: null,
        },
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
