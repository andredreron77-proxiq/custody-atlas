/**
 * server/services/documents.ts
 *
 * Document ownership and history service.
 *
 * CURRENT STATE: All methods are stubs — no data is persisted.
 *
 * TO CONNECT SUPABASE:
 *   - Create a `documents` table: id, user_id, file_name, mime_type,
 *     page_count, analysis_json, extracted_text, created_at
 *   - Replace each stub below with the corresponding supabase.from("documents") call.
 *   - Enable Row Level Security so users can only read their own rows.
 *   - Store files in Supabase Storage and save the storage path in the table.
 */

export interface SavedDocument {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  pageCount: number;
  analysisJson: Record<string, unknown>;
  extractedText: string;
  createdAt: Date;
}

/**
 * Retrieve all documents analyzed by a user, newest first.
 *
 * Supabase slot:
 *   const { data } = await supabase.from("documents")
 *     .select("*").eq("user_id", userId).order("created_at", { ascending: false });
 *   return data ?? [];
 */
export async function getDocuments(_userId: string): Promise<SavedDocument[]> {
  return [];
}

/**
 * Persist a document analysis result for a user.
 *
 * Supabase slot:
 *   const { data } = await supabase.from("documents").insert({ user_id: userId, ...fields }).select().single();
 *   return data;
 */
export async function saveDocument(
  _userId: string,
  _fields: Omit<SavedDocument, "id" | "userId" | "createdAt">,
): Promise<SavedDocument | null> {
  return null;
}

/**
 * Delete a saved document by ID (verifying ownership).
 *
 * Supabase slot:
 *   await supabase.from("documents").delete().eq("id", documentId).eq("user_id", userId);
 */
export async function deleteDocument(
  _documentId: string,
  _userId: string,
): Promise<void> {
  // no-op
}
