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

/**
 * Generate a short-lived signed URL for a document stored in Supabase Storage.
 *
 * Security model:
 *   1. Ownership is enforced first via getDocumentById (filters by user_id).
 *   2. The raw storage_path is never sent to the client.
 *   3. Signed URLs expire in SIGNED_URL_TTL_SECONDS.
 *   4. "download" mode sets Content-Disposition: attachment so the browser
 *      prompts a save dialog rather than rendering in-tab.
 *
 * Returns null when:
 *   - supabaseAdmin is not configured
 *   - the document has no storagePath (pre-storage uploads)
 *   - Supabase Storage returns an error
 */
const SIGNED_URL_TTL_SECONDS = 90; // short-lived: 90 seconds

export type SignedUrlMode = "view" | "download";

export interface SignedUrlResult {
  signedUrl: string;
  expiresInSeconds: number;
  fileName: string;
  mimeType: string;
}

export async function createDocumentSignedUrl(
  documentId: string,
  userId: string,
  mode: SignedUrlMode,
): Promise<SignedUrlResult | null> {
  if (!supabaseAdmin) return null;

  // Step 1: Ownership check — looks up document filtered by BOTH id AND user_id.
  // If the document belongs to a different user, getDocumentById returns null.
  const doc = await getDocumentById(documentId, userId);
  if (!doc) {
    console.log(`[documents] signed-url denied — doc=${documentId} user=${userId}`);
    return null;
  }

  if (!doc.storagePath) {
    console.log(`[documents] signed-url skipped — no storage_path doc=${documentId}`);
    return null;
  }

  try {
    const options = mode === "download"
      ? { download: doc.fileName }
      : {};

    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(doc.storagePath, SIGNED_URL_TTL_SECONDS, options);

    if (error || !data?.signedUrl) {
      console.error(`[documents] signed-url error doc=${documentId} mode=${mode}:`, error?.message ?? "no URL returned");
      return null;
    }

    console.log(`[documents] signed-url ok doc=${documentId} mode=${mode} ttl=${SIGNED_URL_TTL_SECONDS}s`);
    return {
      signedUrl: data.signedUrl,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
    };
  } catch (err) {
    console.error(`[documents] signed-url exception doc=${documentId}:`, err);
    return null;
  }
}

export type DeleteDocumentResult =
  | { success: true; storageRemoved: boolean }
  | { success: false; reason: "not_found" | "not_owner" | "error" };

/**
 * Hard-delete a document: removes the file from Storage then deletes the DB row.
 *
 * Security:
 *   - Looks up the row first with both id AND user_id filter (ownership enforced).
 *   - Returns "not_found" when the document doesn't exist OR belongs to another user.
 *   - The storage_path is never sent to callers — only used internally.
 *
 * Storage failure handling:
 *   - If the storage file is already missing, we log and continue — the DB row
 *     is still deleted so the document is no longer accessible.
 *   - If the DB delete fails after storage removal, we log an error so the orphaned
 *     storage file can be identified and cleaned up later.
 *
 * What is deleted:
 *   - The original file in Supabase Storage
 *   - The DB row (including analysis_json and extracted_text)
 * After deletion no trace of the document remains in the system.
 */
export async function deleteDocument(
  documentId: string,
  userId: string,
): Promise<DeleteDocumentResult> {
  if (!supabaseAdmin) return { success: false, reason: "error" };

  try {
    // Step 1: ownership check — must match BOTH id and user_id
    const { data, error: fetchError } = await supabaseAdmin
      .from("documents")
      .select("storage_path, user_id")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !data) {
      console.log(`[documents] delete denied — doc=${documentId} user=${userId} reason=not_found`);
      return { success: false, reason: "not_found" };
    }

    // Step 2: remove original file from Storage (non-fatal if already gone)
    let storageRemoved = false;
    if (data.storage_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .remove([data.storage_path]);

      if (storageError) {
        // File may already be missing — log but do not abort; continue to DB delete.
        console.warn(`[documents] storage remove warn doc=${documentId}:`, storageError.message);
      } else {
        storageRemoved = true;
        console.log(`[documents] storage removed doc=${documentId}`);
      }
    } else {
      console.log(`[documents] delete — no storage_path to remove doc=${documentId}`);
    }

    // Step 3: hard-delete the DB row (analysis + extracted text deleted with it)
    const { error: dbError } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("user_id", userId);

    if (dbError) {
      console.error(`[documents] db delete error doc=${documentId}:`, dbError.message);
      return { success: false, reason: "error" };
    }

    console.log(`[documents] delete ok doc=${documentId} user=${userId} storageRemoved=${storageRemoved}`);
    return { success: true, storageRemoved };
  } catch (err) {
    console.error(`[documents] deleteDocument exception doc=${documentId}:`, err);
    return { success: false, reason: "error" };
  }
}
