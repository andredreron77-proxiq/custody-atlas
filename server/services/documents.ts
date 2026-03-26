/**
 * server/services/documents.ts
 *
 * Supabase-backed documents service with Storage integration.
 *
 * Active Supabase documents table schema:
 *   id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY
 *   user_id       uuid NOT NULL (FK → auth.users)
 *   file_name     text NOT NULL
 *   storage_path  text              -- path in Supabase Storage bucket
 *   mime_type     text
 *   page_count    int  NOT NULL DEFAULT 1
 *   doc_type      text              -- custody_order | communication | financial | other
 *   analysis_json jsonb
 *   extracted_text text
 *   case_id       uuid              -- nullable FK → cases(id) ON DELETE SET NULL
 *                                  -- Added via: ALTER TABLE documents
 *                                  --   ADD COLUMN IF NOT EXISTS case_id uuid
 *                                  --   REFERENCES cases(id) ON DELETE SET NULL;
 *   created_at    timestamptz NOT NULL DEFAULT now()
 *
 * NOTE ON case_id:
 *   The column must be added in Supabase manually if not already present.
 *   Run in the Supabase SQL Editor:
 *     ALTER TABLE documents
 *       ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES cases(id) ON DELETE SET NULL;
 *   Until this migration is applied, getDocumentsByCase returns [] (graceful fallback).
 *   saveDocument always tries to write case_id; Supabase silently ignores unknown columns
 *   in the REST API insert only if using the auto-generated API — with the service role
 *   client it will surface a PostgreSQL error. We catch and log that error.
 *
 * Supabase Storage bucket: "custody-documents"
 *   - Set bucket visibility to Private (access via service role only)
 */

import { readFileSync } from "fs";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const STORAGE_BUCKET = "custody-documents";

export type DocumentType = "custody_order" | "communication" | "financial" | "other";

export interface SavedDocument {
  id: string;
  userId: string;
  caseId: string | null;       // null when not associated with a case
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
 *
 * Requires the `case_id` column to be present on the `documents` table.
 * If the column does not yet exist (Supabase returns a column-not-found error),
 * this function logs a warning and returns [] — the dashboard documents panel
 * will show an empty state with migration instructions.
 *
 * Migration SQL:
 *   ALTER TABLE documents
 *     ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES cases(id) ON DELETE SET NULL;
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
      // Most likely cause: case_id column doesn't exist yet.
      // Log the problem clearly but don't crash.
      console.warn(
        `[documents] getDocumentsByCase — Supabase error (case_id column may not exist yet): ${error.message}`,
      );
      return [];
    }

    if (!data) return [];
    return data.map(mapRow);
  } catch (err) {
    console.error("[documents] getDocumentsByCase error:", err);
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
    const insertPayload: Record<string, unknown> = {
      user_id:        userId,
      file_name:      fields.fileName,
      storage_path:   fields.storagePath,
      mime_type:      fields.mimeType,
      page_count:     fields.pageCount,
      doc_type:       fields.docType ?? "other",
      analysis_json:  fields.analysisJson,
      extracted_text: fields.extractedText,
    };

    // Only include case_id when provided — avoids a null write on the legacy path.
    // If the column does not yet exist in Supabase, this insert will fail; we
    // catch the error below, retry without case_id, and log a clear warning.
    if (fields.caseId) {
      insertPayload.case_id = fields.caseId;
    }

    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      // If the error is likely a missing case_id column, retry without it.
      if (fields.caseId && (error.message?.includes("case_id") || error.code === "42703")) {
        console.warn(
          "[documents] saveDocument — case_id column missing, saving without case link. " +
          "Run: ALTER TABLE documents ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES cases(id) ON DELETE SET NULL;",
        );
        const { data: fallbackData, error: fallbackError } = await supabaseAdmin
          .from("documents")
          .insert({ ...insertPayload, case_id: undefined })
          .select()
          .single();
        if (fallbackError || !fallbackData) return null;
        return mapRow(fallbackData);
      }
      console.error("[documents] saveDocument error:", error.message);
      return null;
    }

    if (!data) return null;
    return mapRow(data);
  } catch (err) {
    console.error("[documents] saveDocument exception:", err);
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
