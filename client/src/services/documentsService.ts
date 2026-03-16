/**
 * client/src/services/documentsService.ts
 *
 * Frontend documents history service.
 *
 * CURRENT STATE: All functions are stubs — no data is persisted.
 *
 * TO CONNECT SUPABASE:
 *   - Replace getDocuments: GET /api/documents (authenticated) or
 *     supabase.from("documents").select("*") with RLS.
 *   - Replace saveDocument: POST /api/documents or supabase.from("documents").insert(...)
 *   - For file storage: use Supabase Storage (supabase.storage.from("documents").upload(...))
 *     and save the returned path in the documents table.
 */

export interface SavedDocument {
  id: string;
  fileName: string;
  mimeType: string;
  pageCount: number;
  analysisJson: Record<string, unknown>;
  createdAt: string;
}

/**
 * Return the signed-in user's document history.
 *
 * Supabase slot:
 *   const { data } = await supabase.from("documents")
 *     .select("*").order("created_at", { ascending: false });
 *   return data ?? [];
 */
export async function getDocuments(): Promise<SavedDocument[]> {
  return [];
}

/**
 * Persist a document analysis result.
 *
 * Supabase slot:
 *   const { data } = await supabase.from("documents")
 *     .insert({ ...fields }).select().single();
 *   return data;
 */
export async function saveDocument(
  _fields: Omit<SavedDocument, "id" | "createdAt">,
): Promise<SavedDocument | null> {
  return null;
}
