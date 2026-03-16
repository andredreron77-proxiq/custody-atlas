/**
 * server/services/documents.ts
 *
 * Supabase-backed documents service with Storage integration.
 *
 * Expected documents table schema:
 *   id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY
 *   user_id       uuid NOT NULL (FK → auth.users)
 *   file_name     text NOT NULL
 *   storage_path  text              -- path in Supabase Storage bucket
 *   mime_type     text
 *   page_count    int  NOT NULL DEFAULT 1
 *   analysis_json jsonb
 *   extracted_text text
 *   created_at    timestamptz NOT NULL DEFAULT now()
 *
 * Supabase Storage bucket: "custody-documents"
 *   - Set bucket visibility to Private (access via service role only)
 *   - Enable RLS on the bucket if you want client-direct access in the future
 */

import { readFileSync } from "fs";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const STORAGE_BUCKET = "custody-documents";

export interface SavedDocument {
  id: string;
  userId: string;
  fileName: string;
  storagePath: string | null;
  mimeType: string;
  pageCount: number;
  analysisJson: Record<string, unknown>;
  extractedText: string;
  createdAt: string;
}

export async function getDocuments(userId: string): Promise<SavedDocument[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      fileName: r.file_name,
      storagePath: r.storage_path ?? null,
      mimeType: r.mime_type ?? "application/octet-stream",
      pageCount: r.page_count ?? 1,
      analysisJson: r.analysis_json ?? {},
      extractedText: r.extracted_text ?? "",
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Upload a file to Supabase Storage and return the storage path.
 * Returns null if storage is not configured or the upload fails.
 */
export async function uploadToStorage(
  userId: string,
  filePath: string,
  fileName: string,
  mimeType: string,
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const fileBuffer = readFileSync(filePath);
    const storagePath = `${userId}/${Date.now()}-${fileName}`;
    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });
    if (error) {
      console.error("[documents] Storage upload error:", error.message);
      return null;
    }
    return storagePath;
  } catch (err) {
    console.error("[documents] uploadToStorage error:", err);
    return null;
  }
}

export async function saveDocument(
  userId: string,
  fields: Omit<SavedDocument, "id" | "userId" | "createdAt">,
): Promise<SavedDocument | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert({
        user_id: userId,
        file_name: fields.fileName,
        storage_path: fields.storagePath,
        mime_type: fields.mimeType,
        page_count: fields.pageCount,
        analysis_json: fields.analysisJson,
        extracted_text: fields.extractedText,
      })
      .select()
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      fileName: data.file_name,
      storagePath: data.storage_path ?? null,
      mimeType: data.mime_type,
      pageCount: data.page_count,
      analysisJson: data.analysis_json ?? {},
      extractedText: data.extracted_text ?? "",
      createdAt: data.created_at,
    };
  } catch {
    return null;
  }
}

export async function deleteDocument(documentId: string, userId: string): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { data } = await supabaseAdmin
      .from("documents")
      .select("storage_path")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (data?.storage_path) {
      await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([data.storage_path]);
    }

    await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("user_id", userId);
  } catch (err) {
    console.error("[documents] deleteDocument error:", err);
  }
}
