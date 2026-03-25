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

/* ── Row mappers ──────────────────────────────────────────────────────────── */

function mapCase(r: any): Case {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    description: r.description ?? null,
    jurisdictionState: r.jurisdiction_state ?? null,
    jurisdictionCounty: r.jurisdiction_county ?? null,
    status: r.status ?? "active",
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
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
): Promise<Case | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("cases")
      .insert({
        user_id: userId,
        title: opts.title.slice(0, 200),
        description: opts.description ?? null,
        jurisdiction_state: opts.jurisdictionState ?? null,
        jurisdiction_county: opts.jurisdictionCounty ?? null,
        status: "active",
      })
      .select()
      .single();
    if (error || !data) {
      console.error("[cases] createCase error:", error?.message);
      return null;
    }
    return mapCase(data);
  } catch (err) {
    console.error("[cases] createCase exception:", err);
    return null;
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
    return data.map(mapCase);
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
    return mapCase(data);
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
    if (error || !data) return [];
    return data.map(mapMessage);
  } catch {
    return [];
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
