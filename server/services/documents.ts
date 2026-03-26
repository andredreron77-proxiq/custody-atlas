/**
 * server/services/documents.ts
 *
 * Supabase-backed documents service.
 *
 * Active Supabase documents table schema (confirmed 2026-03-26):
 *   id            uuid PK DEFAULT gen_random_uuid()
 *   user_id       uuid NOT NULL FK → auth.users
 *   file_name     text NOT NULL
 *   storage_path  text
 *   mime_type     text
 *   page_count    int  NOT NULL DEFAULT 1
 *   doc_type      text              -- custody_order | communication | financial | other
 *   analysis_json jsonb
 *   extracted_text text
 *   case_id       uuid              -- FK → cases(id) ON DELETE SET NULL  ← confirmed present
 *   created_at    timestamptz NOT NULL DEFAULT now()
 *
 * Supabase Storage bucket: "custody-documents" (Private)
 */

import { readFileSync } from "fs";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const STORAGE_BUCKET = "custody-documents";

export type DocumentType = "custody_order" | "communication" | "financial" | "other";

export interface SavedDocument {
  id: string;
  userId: string;
  caseId: string | null;
  fileName: string;
  storagePath: string | null;
  mimeType: string;
  pageCount: number;
  docType: DocumentType;
  analysisJson: Record<string, unknown>;
  extractedText: string;
  createdAt: string;
}

function mapRow(r: any): SavedDocument {
  return {
    id:            r.id,
    userId:        r.user_id,
    caseId:        r.case_id ?? null,
    fileName:      r.file_name,
    storagePath:   r.storage_path ?? null,
    mimeType:      r.mime_type ?? "application/octet-stream",
    pageCount:     r.page_count ?? 1,
    docType:       (r.doc_type ?? "other") as DocumentType,
    analysisJson:  r.analysis_json ?? {},
    extractedText: r.extracted_text ?? "",
    createdAt:     r.created_at,
  };
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
    return data.map(mapRow);
  } catch {
    return [];
  }
}

/**
 * Return documents linked to a specific case.
 * Requires documents.case_id (confirmed present — no fallback needed).
 */
export async function getDocumentsByCase(
  caseId: string,
  userId: string,
): Promise<SavedDocument[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[documents] getDocumentsByCase error:", error.message);
      return [];
    }

    return data?.map(mapRow) ?? [];
  } catch (err) {
    console.error("[documents] getDocumentsByCase exception:", err);
    return [];
  }
}

/**
 * Upload a file to Supabase Storage.
 * Returns the storage path on success, null on failure.
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

/**
 * Insert a document row into Supabase.
 *
 * case_id is a real column (confirmed) — always written when provided.
 * Dev log emitted whenever a document is successfully case-linked so
 * the linkage path is observable in server output without noise.
 */
export async function saveDocument(
  userId: string,
  fields: Omit<SavedDocument, "id" | "userId" | "createdAt">,
): Promise<SavedDocument | null> {
  if (!supabaseAdmin) return null;
  try {
    const insertPayload: Record<string, unknown> = {
      user_id:        userId,
      file_name:      fields.fileName,
      storage_path:   fields.storagePath,
      mime_type:      fields.mimeType,
      page_count:     fields.pageCount,
      doc_type:       fields.docType ?? "other",
      analysis_json:  fields.analysisJson,
      extracted_text: fields.extractedText,
      // case_id column confirmed present; include whenever a case is active
      case_id:        fields.caseId ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("[documents] saveDocument error:", error.message);
      return null;
    }

    if (!data) return null;

    const saved = mapRow(data);

    if (saved.caseId) {
      console.log(
        `[documents] Saved — id=${saved.id} case_id=${saved.caseId} file=${saved.fileName}`,
      );
    }

    return saved;
  } catch (err) {
    console.error("[documents] saveDocument exception:", err);
    return null;
  }
}

/**
 * Fetch a single document by ID, enforcing user ownership.
 * Returns null if the document doesn't exist or belongs to a different user.
 */
export async function getDocumentById(
  documentId: string,
  userId: string,
): Promise<SavedDocument | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();
    if (error || !data) return null;
    return mapRow(data);
  } catch (err) {
    console.error("[documents] getDocumentById exception:", err);
    return null;
  }
}

export async function updateDocumentType(
  documentId: string,
  userId: string,
  docType: DocumentType,
): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { error } = await supabaseAdmin
      .from("documents")
      .update({ doc_type: docType })
      .eq("id", documentId)
      .eq("user_id", userId);
    return !error;
  } catch {
    return false;
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
