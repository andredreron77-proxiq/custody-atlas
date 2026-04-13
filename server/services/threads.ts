/**
 * server/services/threads.ts
 *
 * Supabase-backed conversation thread service.
 * Gracefully returns empty results if the tables do not yet exist.
 *
 * Required Supabase tables (run in Supabase SQL editor to enable persistence):
 *
 *   CREATE TABLE IF NOT EXISTS threads (
 *     id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id             uuid NOT NULL,
 *     title               text,
 *     thread_type         text NOT NULL DEFAULT 'general',
 *     jurisdiction_state  text,
 *     jurisdiction_county text,
 *     document_id         uuid,
 *     created_at          timestamptz NOT NULL DEFAULT now()
 *   );
 *
 *   -- Add title column if you already have a threads table without it:
 *   ALTER TABLE threads ADD COLUMN IF NOT EXISTS title text;
 *
 *   CREATE TABLE IF NOT EXISTS thread_messages (
 *     id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     thread_id                uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
 *     role                     text NOT NULL,
 *     message_text             text NOT NULL,
 *     structured_response_json jsonb,
 *     created_at               timestamptz NOT NULL DEFAULT now()
 *   );
 *
 *   CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_id
 *     ON thread_messages (thread_id, created_at);
 *   CREATE INDEX IF NOT EXISTS idx_threads_user_id
 *     ON threads (user_id, created_at DESC);
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";

export type ThreadType = "general" | "document" | "comparison";

export interface Thread {
  id: string;
  userId: string;
  title: string | null;
  threadType: ThreadType;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
  documentId: string | null;
  createdAt: string;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  messageText: string;
  structuredResponseJson: Record<string, unknown> | null;
  createdAt: string;
}

/** Maximum messages loaded from DB per AI call — caps context window cost. */
export const HISTORY_WINDOW = 8;

function mapThread(r: any): Thread {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title ?? null,
    threadType: r.thread_type as ThreadType,
    jurisdictionState: r.jurisdiction_state ?? null,
    jurisdictionCounty: r.jurisdiction_county ?? null,
    documentId: r.document_id ?? null,
    createdAt: r.created_at,
  };
}

function mapMessage(r: any): ThreadMessage {
  return {
    id: r.id,
    threadId: r.thread_id,
    role: r.role as "user" | "assistant",
    messageText: r.message_text,
    structuredResponseJson: r.structured_response_json ?? null,
    createdAt: r.created_at,
  };
}

/**
 * Create a new conversation thread for the given user.
 * Title is stored in a best-effort second UPDATE call so the thread
 * is always created even when the title column doesn't exist yet.
 */
export async function createThread(
  userId: string,
  opts: {
    threadType: ThreadType;
    jurisdictionState?: string;
    jurisdictionCounty?: string;
    documentId?: string;
    title?: string;
  },
): Promise<Thread | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("threads")
      .insert({
        user_id: userId,
        thread_type: opts.threadType,
        jurisdiction_state: opts.jurisdictionState ?? null,
        jurisdiction_county: opts.jurisdictionCounty ?? null,
        document_id: opts.documentId ?? null,
      })
      .select()
      .single();
    if (error || !data) return null;

    // Best-effort: set title (ignored if column does not exist)
    if (opts.title) {
      try {
        await supabaseAdmin
          .from("threads")
          .update({ title: opts.title.slice(0, 200) })
          .eq("id", data.id);
      } catch {}
    }

    return mapThread({ ...data, title: opts.title ?? null });
  } catch {
    return null;
  }
}

/**
 * List recent threads for a user (newest first).
 */
export async function listThreads(userId: string, limit = 20): Promise<Thread[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("threads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map(mapThread);
  } catch {
    return [];
  }
}

/**
 * Retrieve a single thread owned by the given user.
 * Returns null when not found or the thread belongs to another user.
 */
export async function getThread(threadId: string, userId: string): Promise<Thread | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("threads")
      .select("*")
      .eq("id", threadId)
      .eq("user_id", userId)
      .single();
    if (error || !data) return null;
    return mapThread(data);
  } catch {
    return null;
  }
}

/**
 * Retrieve recent messages for a thread, ordered oldest→newest,
 * capped to HISTORY_WINDOW so we never send unbounded context to the AI.
 */
export async function getRecentMessages(threadId: string, limit = HISTORY_WINDOW): Promise<ThreadMessage[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("thread_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.reverse().map(mapMessage);
  } catch {
    return [];
  }
}

/**
 * Append a single message to a thread.
 */
export async function appendMessage(
  threadId: string,
  role: "user" | "assistant",
  messageText: string,
  structuredResponseJson?: Record<string, unknown>,
): Promise<ThreadMessage | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("thread_messages")
      .insert({
        thread_id: threadId,
        role,
        message_text: messageText,
        structured_response_json: structuredResponseJson ?? null,
      })
      .select()
      .single();
    if (error || !data) return null;
    return mapMessage(data);
  } catch {
    return null;
  }
}

/**
 * Delete a thread and all its messages (CASCADE handles messages).
 */
export async function deleteThread(threadId: string, userId: string): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin
      .from("threads")
      .delete()
      .eq("id", threadId)
      .eq("user_id", userId);
  } catch (err) {
    console.error("[threads] deleteThread error:", err);
  }
}
