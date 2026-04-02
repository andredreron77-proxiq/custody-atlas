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
  sourceFileSha256: string | null;
  retentionTier: "free" | "pro" | "attorney_firm";
  originalExpiresAt: string | null;
  intelligenceExpiresAt: string | null;
  lifecycleState: string;
  fileName: string;
  storagePath: string | null;
  mimeType: string;
  pageCount: number;
  docType: DocumentType;
  analysisJson: Record<string, unknown>;
  extractedText: string;
  createdAt: string;
}

export interface DuplicateDocumentLookup {
  fileHash: string;
}

export function mergeCaseScopedDocumentIds(
  linkedDocumentIds: string[],
  legacyDocumentIds: string[],
): string[] {
  return Array.from(new Set([...linkedDocumentIds, ...legacyDocumentIds]));
}

function mapRow(r: any): SavedDocument {
  return {
    id:            r.id,
    userId:        r.user_id,
    caseId:        r.case_id ?? null,
    sourceFileSha256:
      (typeof r.source_file_sha256 === "string" && r.source_file_sha256.trim()) ||
      (typeof r.analysis_json?.source_file_sha256 === "string" && r.analysis_json.source_file_sha256.trim()) ||
      null,
    retentionTier: (r.retention_tier ?? "free") as "free" | "pro" | "attorney_firm",
    originalExpiresAt: r.original_expires_at ?? null,
    intelligenceExpiresAt: r.intelligence_expires_at ?? null,
    lifecycleState: r.lifecycle_state ?? "active",
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
    const linkedDocumentIds: string[] = [];
    const legacyDocumentIds: string[] = [];

    // New canonical model: association table (document_case_links) handles case linkage.
    const { data: links, error: linksError } = await supabaseAdmin
      .from("document_case_links")
      .select("document_id")
      .eq("user_id", userId)
      .eq("case_id", caseId)
      .limit(100);

    if (!linksError && links?.length) {
      linkedDocumentIds.push(...links
        .map((l: any) => l.document_id as string | null)
        .filter((id): id is string => typeof id === "string" && id.length > 0));
    }

    // Legacy compatibility: include legacy case_id matches so pre-link rows remain visible.
    const { data: legacyRows, error: legacyError } = await supabaseAdmin
      .from("documents")
      .select("id")
      .eq("user_id", userId)
      .eq("case_id", caseId)
      .limit(100);

    if (legacyError) {
      console.error("[documents] getDocumentsByCase legacy fetch error:", legacyError.message);
    } else if (legacyRows?.length) {
      legacyDocumentIds.push(
        ...legacyRows
          .map((r: any) => r.id as string | null)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
    }

    const caseScopedDocumentIds = mergeCaseScopedDocumentIds(linkedDocumentIds, legacyDocumentIds);
    if (!caseScopedDocumentIds.length) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .in("id", caseScopedDocumentIds)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[documents] getDocumentsByCase documents fetch error:", error.message);
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
      source_file_sha256: fields.sourceFileSha256,
      retention_tier: fields.retentionTier ?? "free",
      original_expires_at: fields.originalExpiresAt,
      intelligence_expires_at: fields.intelligenceExpiresAt,
      lifecycle_state: fields.lifecycleState ?? "active",
      // case_id column confirmed present; include whenever a case is active
      case_id:        fields.caseId ?? null,
    };

    let { data, error } = await supabaseAdmin
      .from("documents")
      .insert(insertPayload)
      .select()
      .single();

    // Backward compatibility: older environments may not have the
    // source_file_sha256 column yet. Retry once without it so document
    // persistence (workspace visibility) still succeeds.
    if (error?.message?.includes("source_file_sha256")) {
      const { source_file_sha256, ...legacyPayload } = insertPayload;
      ({ data, error } = await supabaseAdmin
        .from("documents")
        .insert(legacyPayload)
        .select()
        .single());
    }

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
 * Look up an existing document with the same content to avoid duplicate rows
 * from repeated uploads/retries of the exact same file.
 */
export async function findDuplicateDocument(
  userId: string,
  lookup: DuplicateDocumentLookup,
): Promise<SavedDocument | null> {
  if (!supabaseAdmin) return null;

  const normalizedHash = lookup.fileHash.trim().toLowerCase();
  if (!normalizedHash) return null;

  try {
    let query = supabaseAdmin
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .or(`source_file_sha256.eq.${normalizedHash},analysis_json.cs.${JSON.stringify({ source_file_sha256: normalizedHash })}`)
      .order("created_at", { ascending: true })
      .limit(1);
    let { data, error } = await query;

    // Backward compatibility for pre-migration DBs without source_file_sha256.
    if (error?.message?.includes("source_file_sha256")) {
      query = supabaseAdmin
        .from("documents")
        .select("*")
        .eq("user_id", userId)
        .contains("analysis_json", { source_file_sha256: normalizedHash })
        .order("created_at", { ascending: true })
        .limit(1);
      ({ data, error } = await query);
    }
    if (error || !data?.length) return null;
    return mapRow(data[0]);
  } catch (err) {
    console.error("[documents] findDuplicateDocument exception:", err);
    return null;
  }
}

export async function getDocumentCaseIds(
  documentId: string,
  userId: string,
): Promise<string[]> {
  if (!supabaseAdmin) return [];

  const caseIds = new Set<string>();

  try {
    const { data: links, error: linksError } = await supabaseAdmin
      .from("document_case_links")
      .select("case_id")
      .eq("document_id", documentId)
      .eq("user_id", userId)
      .limit(100);

    if (!linksError && links?.length) {
      for (const row of links) {
        if (typeof (row as any).case_id === "string" && (row as any).case_id) {
          caseIds.add((row as any).case_id);
        }
      }
    }

    const { data: docRow, error: docError } = await supabaseAdmin
      .from("documents")
      .select("case_id")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (!docError && typeof docRow?.case_id === "string" && docRow.case_id) {
      caseIds.add(docRow.case_id);
    }
  } catch (err) {
    console.error("[documents] getDocumentCaseIds exception:", err);
  }

  return Array.from(caseIds);
}

/**
 * Link a canonical document to a case without creating a duplicate document row.
 */
export async function ensureDocumentCaseAssociation(
  documentId: string,
  caseId: string,
  userId: string,
): Promise<boolean> {
  if (!supabaseAdmin) return false;

  try {
    let linkWriteSucceeded = false;
    const { error } = await supabaseAdmin
      .from("document_case_links")
      .upsert(
        {
          document_id: documentId,
          case_id: caseId,
          user_id: userId,
        },
        { onConflict: "document_id,case_id" },
      );

    if (error) {
      console.error("[documents] ensureDocumentCaseAssociation error:", error.message);
    } else {
      linkWriteSucceeded = true;
    }

    // Compatibility bridge: set documents.case_id for records created in legacy views.
    const { error: legacyError } = await supabaseAdmin
      .from("documents")
      .update({ case_id: caseId })
      .eq("id", documentId)
      .eq("user_id", userId)
      .is("case_id", null);

    if (legacyError) {
      console.error("[documents] ensureDocumentCaseAssociation legacy update error:", legacyError.message);
    }

    return linkWriteSucceeded || !legacyError;
  } catch (err) {
    console.error("[documents] ensureDocumentCaseAssociation exception:", err);
    return false;
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
 * Update the analysis JSON of an existing document (for re-analysis without creating a duplicate row).
 */
export async function updateDocumentAnalysis(
  documentId: string,
  userId: string,
  analysisJson: Record<string, unknown>,
): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { error } = await supabaseAdmin
      .from("documents")
      .update({ analysis_json: analysisJson })
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
