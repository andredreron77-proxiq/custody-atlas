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
 *   doc_questions_used integer not null default 0
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
  fileHash?: string | null;
  normalizedFileName?: string | null;
  fileSizeBytes?: number | null;
  sourceKind?: string | null;
  intakeTextHash?: string | null;
  intakeTextPreview?: string | null;
  duplicateOfDocumentId?: string | null;
  duplicateConfidence?: number | null;
  retentionTier: "free" | "pro" | "attorney_firm";
  originalExpiresAt: string | null;
  intelligenceExpiresAt: string | null;
  lifecycleState: string;
  fileName: string;
  storagePath: string | null;
  mimeType: string;
  pageCount: number;
  docQuestionsUsed: number;
  docType: DocumentType;
  analysisJson: Record<string, unknown>;
  extractedText: string;
  createdAt: string;
}

export type DocumentCaseAssignmentStatus = "assigned" | "suggested" | "unassigned";

export interface DocumentCaseAssignmentView {
  status: DocumentCaseAssignmentStatus;
  caseId: string | null;
  suggestedCaseId: string | null;
  confidenceScore: number | null;
  reason: string | null;
  autoAssigned: boolean;
}

export interface DuplicateDocumentLookup {
  fileHash: string;
  fallbackSignature?: string | null;
}

export interface UploadIntakeAttemptInput {
  userId: string;
  fileName: string;
  normalizedFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  sourceKind: string;
  fileHash: string;
  intakeTextHash: string;
  intakeTextPreview: string;
  duplicateDecision: string;
  duplicateConfidence: number | null;
  duplicateOfDocumentId: string | null;
  allowedActions: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PersistenceErrorDetail {
  operation: string;
  table: string;
  writeMode: "insert" | "update" | "upsert";
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
  column: string | null;
  constraint: string | null;
  isRls: boolean;
}

export type SaveDocumentOutcome =
  | { status: "created"; document: SavedDocument }
  | { status: "duplicate"; document: SavedDocument }
  | { status: "error"; error: PersistenceErrorDetail };

export interface DocumentIntegrity {
  isAnalysisAvailable: boolean;
  analysisStatus: "uploaded" | "analyzing" | "analyzed" | "failed";
  integrityIssue: "missing_analysis" | null;
}

export function mergeCaseScopedDocumentIds(
  linkedDocumentIds: string[],
  legacyDocumentIds: string[],
): string[] {
  return Array.from(new Set([...linkedDocumentIds, ...legacyDocumentIds]));
}

const OPTIONAL_DOCUMENT_INSERT_COLUMNS = new Set([
  "retention_tier",
  "original_expires_at",
  "intelligence_expires_at",
  "lifecycle_state",
  "file_hash",
  "normalized_filename",
  "file_size_bytes",
  "source_kind",
  "intake_text_hash",
  "intake_text_preview",
  "duplicate_of_document_id",
  "duplicate_confidence",
  "ocr_status",
  "analysis_status",
]);

const OPTIONAL_DOCUMENT_UPDATE_COLUMNS = new Set([
  "ocr_status",
  "analysis_status",
]);

type LifecycleStatus = "pending" | "completed" | "failed";

function normalizeLifecycleStatus(raw: unknown, fallback: LifecycleStatus): LifecycleStatus {
  if (typeof raw !== "string") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "completed" || normalized === "analyzed" || normalized === "success") {
    return "completed";
  }
  if (normalized === "failed" || normalized === "error") {
    return "failed";
  }
  if (normalized === "pending" || normalized === "uploaded" || normalized === "analyzing" || normalized === "processing") {
    return "pending";
  }
  return fallback;
}

function getLifecycleStatusesFromAnalysis(
  analysisJson: Record<string, unknown>,
  extractedText: string,
): { ocrStatus: LifecycleStatus; analysisStatus: LifecycleStatus } {
  const ocrStatus = normalizeLifecycleStatus(
    analysisJson.ocr_status,
    extractedText.trim().length > 0 ? "completed" : "pending",
  );
  const summary = typeof analysisJson.summary === "string" ? analysisJson.summary.trim() : "";
  const analysisStatus = normalizeLifecycleStatus(
    analysisJson.analysis_status,
    summary.length > 0 ? "completed" : "pending",
  );
  return { ocrStatus, analysisStatus };
}

export function extractMissingInsertColumn(errorMessage: string): string | null {
  if (!errorMessage) return null;

  const postgrestMatch = errorMessage.match(/Could not find the '([a-z_]+)' column/i);
  if (postgrestMatch?.[1]) return postgrestMatch[1].toLowerCase();

  const postgresMatch = errorMessage.match(/column "?([a-z_]+)"? of relation "documents" does not exist/i);
  if (postgresMatch?.[1]) return postgresMatch[1].toLowerCase();

  return null;
}

export function dropUnsupportedInsertColumn(
  payload: Record<string, unknown>,
  errorMessage: string,
): { nextPayload: Record<string, unknown>; removedColumn: string | null } {
  const missingColumn = extractMissingInsertColumn(errorMessage);
  if (!missingColumn || !OPTIONAL_DOCUMENT_INSERT_COLUMNS.has(missingColumn) || !(missingColumn in payload)) {
    return { nextPayload: payload, removedColumn: null };
  }

  const { [missingColumn]: _removed, ...nextPayload } = payload;
  return { nextPayload, removedColumn: missingColumn };
}

export function isSourceHashUniqueConflict(errorMessage: string): boolean {
  if (!errorMessage) return false;
  const normalized = errorMessage.toLowerCase();
  return normalized.includes("documents_user_source_hash_unique")
    || (normalized.includes("duplicate key value violates unique constraint")
      && normalized.includes("source_file_sha256"));
}

export function isCanonicalDocument(
  doc: { duplicateOfDocumentId?: string | null; duplicate_of_document_id?: string | null },
): boolean {
  return !(doc.duplicateOfDocumentId ?? doc.duplicate_of_document_id);
}

function mapRow(r: any): SavedDocument {
  return {
    id:            r.id,
    userId:        r.user_id,
    caseId:        r.case_id ?? null,
    sourceFileSha256:
      (typeof r.source_file_sha256 === "string" && r.source_file_sha256.trim()) ||
      (typeof r.file_hash === "string" && r.file_hash.trim()) ||
      (typeof r.analysis_json?.source_file_sha256 === "string" && r.analysis_json.source_file_sha256.trim()) ||
      null,
    fileHash:
      (typeof r.file_hash === "string" && r.file_hash.trim()) ||
      (typeof r.source_file_sha256 === "string" && r.source_file_sha256.trim()) ||
      null,
    normalizedFileName: typeof r.normalized_filename === "string" ? r.normalized_filename : null,
    fileSizeBytes: typeof r.file_size_bytes === "number" ? r.file_size_bytes : null,
    sourceKind: typeof r.source_kind === "string" ? r.source_kind : null,
    intakeTextHash:
      (typeof r.intake_text_hash === "string" && r.intake_text_hash.trim()) ||
      (typeof r.analysis_json?.intake_text_hash === "string" && r.analysis_json.intake_text_hash.trim()) ||
      null,
    intakeTextPreview:
      (typeof r.intake_text_preview === "string" && r.intake_text_preview.trim()) ||
      (typeof r.analysis_json?.intake_text_preview === "string" && r.analysis_json.intake_text_preview.trim()) ||
      null,
    duplicateOfDocumentId: typeof r.duplicate_of_document_id === "string" ? r.duplicate_of_document_id : null,
    duplicateConfidence: typeof r.duplicate_confidence === "number" ? r.duplicate_confidence : null,
    retentionTier: (r.retention_tier ?? "free") as "free" | "pro" | "attorney_firm",
    originalExpiresAt: r.original_expires_at ?? null,
    intelligenceExpiresAt: r.intelligence_expires_at ?? null,
    lifecycleState: r.lifecycle_state ?? "active",
    fileName:      r.file_name,
    storagePath:   r.storage_path ?? null,
    mimeType:      r.mime_type ?? "application/octet-stream",
    pageCount:     r.page_count ?? 1,
    docQuestionsUsed: typeof r.doc_questions_used === "number" ? r.doc_questions_used : 0,
    docType:       (r.doc_type ?? "other") as DocumentType,
    analysisJson:  r.analysis_json ?? {},
    extractedText: r.extracted_text ?? "",
    createdAt:     r.created_at,
  };
}

export function getDocumentCaseAssignmentView(
  doc: Pick<SavedDocument, "caseId" | "analysisJson">,
): DocumentCaseAssignmentView {
  const raw = (doc.analysisJson?.case_assignment ?? {}) as Record<string, unknown>;
  const status = raw.status === "assigned" || raw.status === "suggested" || raw.status === "unassigned"
    ? raw.status
    : (doc.caseId ? "assigned" : "unassigned");
  return {
    status,
    caseId: doc.caseId ?? null,
    suggestedCaseId: typeof raw.suggested_case_id === "string" ? raw.suggested_case_id : null,
    confidenceScore: typeof raw.confidence_score === "number" ? raw.confidence_score : null,
    reason: typeof raw.reason === "string" ? raw.reason : null,
    autoAssigned: Boolean(raw.auto_assigned),
  };
}

export function getDocumentIntegrity(doc: Pick<SavedDocument, "analysisJson">): DocumentIntegrity {
  const analysis = (doc.analysisJson ?? {}) as Record<string, unknown>;
  const explicitStatus = typeof analysis.analysis_status === "string"
    ? analysis.analysis_status.trim().toLowerCase()
    : "";
  const summary = typeof analysis.summary === "string" ? analysis.summary.trim() : "";

  if (explicitStatus === "failed") {
    return { isAnalysisAvailable: false, analysisStatus: "failed", integrityIssue: "missing_analysis" };
  }
  if (explicitStatus === "analyzing" || explicitStatus === "pending" || explicitStatus === "processing") {
    return { isAnalysisAvailable: false, analysisStatus: "analyzing", integrityIssue: "missing_analysis" };
  }
  if (explicitStatus === "uploaded") {
    return { isAnalysisAvailable: false, analysisStatus: "uploaded", integrityIssue: "missing_analysis" };
  }

  if (summary.length > 0) {
    return { isAnalysisAvailable: true, analysisStatus: "analyzed", integrityIssue: null };
  }

  return { isAnalysisAvailable: false, analysisStatus: "failed", integrityIssue: "missing_analysis" };
}

function applyCanonicalOnlyFilter<T extends { is: Function }>(query: T): T {
  return query.is("duplicate_of_document_id", null) as T;
}

export async function getDocuments(userId: string): Promise<SavedDocument[]> {
  if (!supabaseAdmin) return [];
  try {
    const baseQuery = supabaseAdmin
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    const { data, error } = await applyCanonicalOnlyFilter(baseQuery);
    if (error || !data) return [];
    return data.map(mapRow);
  } catch {
    return [];
  }
}

export async function recordUploadIntakeAttempt(input: UploadIntakeAttemptInput): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin
      .from("upload_intake_attempts")
      .insert({
        user_id: input.userId,
        file_name: input.fileName,
        normalized_filename: input.normalizedFileName,
        mime_type: input.mimeType,
        file_size_bytes: input.fileSizeBytes,
        source_kind: input.sourceKind,
        file_hash: input.fileHash,
        intake_text_hash: input.intakeTextHash,
        intake_text_preview: input.intakeTextPreview,
        duplicate_decision: input.duplicateDecision,
        duplicate_confidence: input.duplicateConfidence,
        duplicate_of_document_id: input.duplicateOfDocumentId,
        allowed_actions: input.allowedActions ?? {},
        metadata: input.metadata ?? {},
      });
    if (error) {
      const parsed = buildPersistenceErrorDetail(error, {
        operation: "recordUploadIntakeAttempt",
        table: "upload_intake_attempts",
        writeMode: "insert",
      });
      console.error("[documents] recordUploadIntakeAttempt error:", parsed);
    }
  } catch {
    return;
  }
}

export async function getAllDocumentsForUser(userId: string): Promise<SavedDocument[]> {
  if (!supabaseAdmin) return [];
  const rows: any[] = [];
  const pageSize = 500;
  try {
    for (let offset = 0; offset < 5000; offset += pageSize) {
      const baseQuery = supabaseAdmin
        .from("documents")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      const { data, error } = await applyCanonicalOnlyFilter(baseQuery);
      if (error || !data?.length) break;
      rows.push(...data);
      if (data.length < pageSize) break;
    }
    return rows.map(mapRow);
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
    const explicitlyLinkedDocumentIds: string[] = [];
    const legacyDocumentIds: string[] = [];

    // New canonical model: association table (document_case_links) handles case linkage.
    const { data: links, error: linksError } = await supabaseAdmin
      .from("document_case_links")
      .select("document_id")
      .eq("user_id", userId)
      .eq("case_id", caseId)
      .limit(100);

    if (!linksError && links?.length) {
      explicitlyLinkedDocumentIds.push(...links
        .map((l: any) => l.document_id as string | null)
        .filter((id): id is string => typeof id === "string" && id.length > 0));
    }

    // Legacy compatibility: include legacy case_id matches so pre-link rows remain visible.
    const legacyBaseQuery = supabaseAdmin
      .from("documents")
      .select("id")
      .eq("user_id", userId)
      .eq("case_id", caseId)
      .limit(100);
    const { data: legacyRows, error: legacyError } = await applyCanonicalOnlyFilter(legacyBaseQuery);

    if (legacyError) {
      console.error("[documents] getDocumentsByCase legacy fetch error:", legacyError.message);
    } else if (legacyRows?.length) {
      legacyDocumentIds.push(
        ...legacyRows
          .map((r: any) => r.id as string | null)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
    }

    const caseScopedDocumentIds = mergeCaseScopedDocumentIds(explicitlyLinkedDocumentIds, legacyDocumentIds);
    if (!caseScopedDocumentIds.length) {
      return [];
    }

    const baseDocumentsQuery = supabaseAdmin
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .in("id", caseScopedDocumentIds)
      .order("created_at", { ascending: false })
      .limit(50);
    const { data, error } = await baseDocumentsQuery;

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
  const result = await saveDocumentWithDuplicateOutcome(userId, fields);
  if (result.status === "created" || result.status === "duplicate") return result.document;
  return null;
}

export async function saveDocumentWithDuplicateOutcome(
  userId: string,
  fields: Omit<SavedDocument, "id" | "userId" | "createdAt" | "docQuestionsUsed">,
): Promise<SaveDocumentOutcome> {
  if (!supabaseAdmin) {
    return {
      status: "error",
      error: {
        operation: "saveDocumentWithDuplicateOutcome",
        table: "documents",
        writeMode: "insert",
        code: null,
        message: "Supabase admin client is not configured.",
        details: null,
        hint: null,
        column: null,
        constraint: null,
        isRls: false,
      },
    };
  }
  try {
    const lifecycle = getLifecycleStatusesFromAnalysis(fields.analysisJson, fields.extractedText ?? "");
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
      file_hash: fields.fileHash ?? fields.sourceFileSha256,
      normalized_filename: fields.normalizedFileName ?? null,
      file_size_bytes: fields.fileSizeBytes ?? null,
      source_kind: fields.sourceKind ?? null,
      intake_text_hash: fields.intakeTextHash ?? null,
      intake_text_preview: fields.intakeTextPreview ?? null,
      duplicate_of_document_id: fields.duplicateOfDocumentId ?? null,
      duplicate_confidence: fields.duplicateConfidence ?? null,
      retention_tier: fields.retentionTier ?? "free",
      original_expires_at: fields.originalExpiresAt,
      intelligence_expires_at: fields.intelligenceExpiresAt,
      lifecycle_state: fields.lifecycleState ?? "active",
      ocr_status: lifecycle.ocrStatus,
      analysis_status: lifecycle.analysisStatus,
      // case_id column confirmed present; include whenever a case is active
      case_id:        fields.caseId ?? null,
    };

    let payload = insertPayload;
    let data: any = null;
    let error: any = null;

    const normalizedSourceHash = fields.sourceFileSha256?.trim().toLowerCase() ?? "";
    const fallbackDuplicateSignature =
      typeof fields.analysisJson?.duplicate_signature_v1 === "string"
        ? fields.analysisJson.duplicate_signature_v1
        : null;

    for (let attempt = 0; attempt <= OPTIONAL_DOCUMENT_INSERT_COLUMNS.size + 1; attempt += 1) {
      if (normalizedSourceHash) {
        ({ data, error } = await supabaseAdmin
          .from("documents")
          .upsert(payload, {
            onConflict: "user_id,source_file_sha256",
            ignoreDuplicates: true,
          })
          .select()
          .maybeSingle());

        if (!error && data) break;
        if (!error && !data) {
          const existing = await findDuplicateDocument(userId, {
            fileHash: normalizedSourceHash,
            fallbackSignature: fallbackDuplicateSignature,
          });
          if (existing) {
            return { status: "duplicate", document: existing };
          }
          // Defensive fallback when upsert ignored insert but immediate lookup races.
          error = { message: "Duplicate conflict detected but existing row could not be loaded." };
          break;
        }
      } else {
        ({ data, error } = await supabaseAdmin
          .from("documents")
          .insert(payload)
          .select()
          .single());
        if (!error) break;
      }

      const message = error?.message ?? "";
      if (isCaseIdForeignKeyViolation(error) && payload.case_id) {
        console.warn("[documents] saveDocument retry without invalid case_id foreign key");
        payload = { ...payload, case_id: null };
        continue;
      }
      if (isSourceHashUniqueConflict(message) && normalizedSourceHash) {
        const existing = await findDuplicateDocument(userId, {
          fileHash: normalizedSourceHash,
          fallbackSignature: fallbackDuplicateSignature,
        });
        if (existing) {
          return { status: "duplicate", document: existing };
        }
      }

      const missingOnConflictSupport = message.toLowerCase().includes("there is no unique or exclusion constraint matching the on conflict specification");
      if (missingOnConflictSupport && normalizedSourceHash) {
        ({ data, error } = await supabaseAdmin
          .from("documents")
          .insert(payload)
          .select()
          .single());
        if (!error) break;
        if (isSourceHashUniqueConflict(error?.message ?? "")) {
          const existing = await findDuplicateDocument(userId, {
            fileHash: normalizedSourceHash,
            fallbackSignature: fallbackDuplicateSignature,
          });
          if (existing) return { status: "duplicate", document: existing };
        }
      }

      const { nextPayload, removedColumn } = dropUnsupportedInsertColumn(payload, message);
      if (!removedColumn) {
        break;
      }

      payload = nextPayload;
      console.warn(`[documents] saveDocument retry without optional column: ${removedColumn}`);
    }

    if (error) {
      const parsed = buildPersistenceErrorDetail(error, {
        operation: "saveDocumentWithDuplicateOutcome",
        table: "documents",
        writeMode: normalizedSourceHash ? "upsert" : "insert",
      });
      console.error("[documents] saveDocument error:", parsed);
      return { status: "error", error: parsed };
    }

    if (!data) {
      return {
        status: "error",
        error: {
          operation: "saveDocumentWithDuplicateOutcome",
          table: "documents",
          writeMode: normalizedSourceHash ? "upsert" : "insert",
          code: null,
          message: "Document insert returned no row.",
          details: null,
          hint: null,
          column: null,
          constraint: null,
          isRls: false,
        },
      };
    }

    const saved = mapRow(data);

    if (saved.caseId) {
      console.log(
        `[documents] Saved — id=${saved.id} case_id=${saved.caseId} file=${saved.fileName}`,
      );
    }

    return { status: "created", document: saved };
  } catch (err) {
    const parsed = buildPersistenceErrorDetail(err, {
      operation: "saveDocumentWithDuplicateOutcome",
      table: "documents",
      writeMode: "insert",
    });
    console.error("[documents] saveDocument exception:", parsed);
    return { status: "error", error: parsed };
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
  const normalizedFallbackSignature = typeof lookup.fallbackSignature === "string"
    ? lookup.fallbackSignature.trim().toLowerCase()
    : "";
  if (!normalizedHash && !normalizedFallbackSignature) return null;

  try {
    if (normalizedHash) {
      let baseQuery = supabaseAdmin
        .from("documents")
        .select("*")
        .eq("user_id", userId)
        .eq("source_file_sha256", normalizedHash)
        .order("created_at", { ascending: true })
        .limit(1);
      let { data, error } = await applyCanonicalOnlyFilter(baseQuery);

      // Backward compatibility for pre-migration DBs without source_file_sha256.
      if (!error && data?.length) return mapRow(data[0]);

      const hashColumnMissing = Boolean(error?.message?.includes("source_file_sha256"));
      if (!hashColumnMissing) {
        baseQuery = supabaseAdmin
          .from("documents")
          .select("*")
          .eq("user_id", userId)
          .contains("analysis_json", { source_file_sha256: normalizedHash })
          .order("created_at", { ascending: true })
          .limit(1);
        ({ data, error } = await applyCanonicalOnlyFilter(baseQuery));
        if (!error && data?.length) return mapRow(data[0]);
      } else {
        baseQuery = supabaseAdmin
          .from("documents")
          .select("*")
          .eq("user_id", userId)
          .contains("analysis_json", { source_file_sha256: normalizedHash })
          .order("created_at", { ascending: true })
          .limit(1);
        ({ data, error } = await applyCanonicalOnlyFilter(baseQuery));
        if (!error && data?.length) return mapRow(data[0]);
      }
    }

    if (!normalizedFallbackSignature) return null;

    const fallbackBaseQuery = supabaseAdmin
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .contains("analysis_json", { duplicate_signature_v1: normalizedFallbackSignature })
      .order("created_at", { ascending: true })
      .limit(1);
    const { data: fallbackData, error: fallbackError } = await applyCanonicalOnlyFilter(fallbackBaseQuery);
    if (fallbackError || !fallbackData?.length) return null;
    return mapRow(fallbackData[0]);
  } catch (err) {
    console.error("[documents] findDuplicateDocument exception:", err);
    return null;
  }
}

export async function findDocumentByIntakeTextHash(
  userId: string,
  intakeTextHash: string,
): Promise<SavedDocument | null> {
  if (!supabaseAdmin) return null;
  const normalizedHash = intakeTextHash.trim().toLowerCase();
  if (!normalizedHash) return null;
  try {
    let baseQuery = supabaseAdmin
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .eq("intake_text_hash", normalizedHash)
      .order("created_at", { ascending: true })
      .limit(1);
    let { data, error } = await applyCanonicalOnlyFilter(baseQuery);
    if (!error && data?.length) return mapRow(data[0]);

    baseQuery = supabaseAdmin
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .contains("analysis_json", { intake_text_hash: normalizedHash })
      .order("created_at", { ascending: true })
      .limit(1);
    ({ data, error } = await applyCanonicalOnlyFilter(baseQuery));
    if (error || !data?.length) return null;
    return mapRow(data[0]);
  } catch (err) {
    console.error("[documents] findDocumentByIntakeTextHash exception:", err);
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

export async function setDocumentCaseAssignment(
  documentId: string,
  userId: string,
  caseId: string | null,
): Promise<boolean> {
  if (!supabaseAdmin) return false;

  try {
    const { data: current, error: fetchError } = await supabaseAdmin
      .from("documents")
      .select("analysis_json")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();
    if (fetchError) return false;

    if (caseId) {
      const linked = await ensureDocumentCaseAssociation(documentId, caseId, userId);
      if (!linked) return false;
      const nextAnalysis = {
        ...(current?.analysis_json ?? {}),
        case_assignment: {
          status: "assigned",
          suggested_case_id: null,
          confidence_score: 100,
          reason: "user_selected_case",
          auto_assigned: false,
        },
      };
      const { error: updateError } = await supabaseAdmin
        .from("documents")
        .update({
          case_id: caseId,
          analysis_json: nextAnalysis,
        })
        .eq("id", documentId)
        .eq("user_id", userId);
      return !updateError;
    }

    await supabaseAdmin
      .from("document_case_links")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", userId);

    const nextAnalysis = {
      ...(current?.analysis_json ?? {}),
      case_assignment: {
        status: "unassigned",
        suggested_case_id: null,
        confidence_score: null,
        reason: "user_left_unassigned",
        auto_assigned: false,
      },
    };
    const { error: updateError } = await supabaseAdmin
      .from("documents")
      .update({
        case_id: null,
        analysis_json: nextAnalysis,
      })
      .eq("id", documentId)
      .eq("user_id", userId);
    return !updateError;
  } catch (err) {
    console.error("[documents] setDocumentCaseAssignment exception:", err);
    return false;
  }
}

export async function setDocumentCaseSuggestion(
  documentId: string,
  userId: string,
  suggestedCaseId: string | null,
  confidenceScore: number | null,
  reason: string,
): Promise<boolean> {
  if (!supabaseAdmin) return false;

  try {
    const { data: current, error: fetchError } = await supabaseAdmin
      .from("documents")
      .select("analysis_json")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();
    if (fetchError) return false;

    const nextAnalysis = {
      ...(current?.analysis_json ?? {}),
      case_assignment: {
        status: suggestedCaseId ? "suggested" : "unassigned",
        suggested_case_id: suggestedCaseId,
        confidence_score: confidenceScore,
        reason,
        auto_assigned: false,
      },
    };

    const { error: updateError } = await supabaseAdmin
      .from("documents")
      .update({
        case_id: null,
        analysis_json: nextAnalysis,
      })
      .eq("id", documentId)
      .eq("user_id", userId);

    return !updateError;
  } catch (err) {
    console.error("[documents] setDocumentCaseSuggestion exception:", err);
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

export async function incrementDocumentQuestionUsage(
  documentId: string,
  userId: string,
): Promise<number | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data: existing, error: readError } = await supabaseAdmin
      .from("documents")
      .select("doc_questions_used")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (readError || !existing) return null;

    const nextCount = (typeof existing.doc_questions_used === "number" ? existing.doc_questions_used : 0) + 1;
    const { error: updateError } = await supabaseAdmin
      .from("documents")
      .update({ doc_questions_used: nextCount })
      .eq("id", documentId)
      .eq("user_id", userId);

    if (updateError) return null;
    return nextCount;
  } catch (err) {
    console.error("[documents] incrementDocumentQuestionUsage exception:", err);
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
    const lifecycle = getLifecycleStatusesFromAnalysis(analysisJson, "has_text");
    let payload: Record<string, unknown> = {
      analysis_json: analysisJson,
      ocr_status: lifecycle.ocrStatus,
      analysis_status: lifecycle.analysisStatus,
    };

    for (let attempt = 0; attempt <= OPTIONAL_DOCUMENT_UPDATE_COLUMNS.size + 1; attempt += 1) {
      const { error } = await supabaseAdmin
        .from("documents")
        .update(payload)
        .eq("id", documentId)
        .eq("user_id", userId);
      if (!error) return true;

      const { nextPayload, removedColumn } = dropUnsupportedInsertColumn(payload, error.message ?? "");
      if (!removedColumn || !OPTIONAL_DOCUMENT_UPDATE_COLUMNS.has(removedColumn)) {
        const parsed = buildPersistenceErrorDetail(error, {
          operation: "updateDocumentAnalysis",
          table: "documents",
          writeMode: "update",
        });
        console.error("[documents] updateDocumentAnalysis error:", parsed);
        return false;
      }
      payload = nextPayload;
      console.warn(`[documents] updateDocumentAnalysis retry without optional column: ${removedColumn}`);
    }

    return false;
  } catch {
    return false;
  }
}

export async function updateDocumentLifecycleStatuses(
  documentId: string,
  userId: string,
  statuses: Partial<{ ocrStatus: LifecycleStatus; analysisStatus: LifecycleStatus }>,
): Promise<boolean> {
  if (!supabaseAdmin) return false;

  let payload: Record<string, unknown> = {};
  if (statuses.ocrStatus) payload.ocr_status = statuses.ocrStatus;
  if (statuses.analysisStatus) payload.analysis_status = statuses.analysisStatus;
  if (Object.keys(payload).length === 0) return true;

  for (let attempt = 0; attempt <= OPTIONAL_DOCUMENT_UPDATE_COLUMNS.size + 1; attempt += 1) {
    const { error } = await supabaseAdmin
      .from("documents")
      .update(payload)
      .eq("id", documentId)
      .eq("user_id", userId);
    if (!error) return true;

    const { nextPayload, removedColumn } = dropUnsupportedInsertColumn(payload, error.message ?? "");
    if (!removedColumn || !OPTIONAL_DOCUMENT_UPDATE_COLUMNS.has(removedColumn)) {
      return false;
    }
    payload = nextPayload;
    if (Object.keys(payload).length === 0) return true;
    console.warn(`[documents] updateDocumentLifecycleStatuses retry without optional column: ${removedColumn}`);
  }

  return false;
}

function inferErrorColumn(errorLike: { message?: string | null; details?: string | null }): string | null {
  const message = errorLike.message ?? "";
  const details = errorLike.details ?? "";
  const fromMessage = message.match(/column "?([a-z_]+)"?/i)?.[1];
  if (fromMessage) return fromMessage.toLowerCase();
  const fromDetails = details.match(/\(([a-z_]+)\)=/i)?.[1];
  if (fromDetails) return fromDetails.toLowerCase();
  return null;
}

function inferConstraint(errorLike: { message?: string | null }): string | null {
  const message = errorLike.message ?? "";
  const match = message.match(/constraint "([^"]+)"/i);
  return match?.[1] ?? null;
}

export function buildPersistenceErrorDetail(
  error: any,
  context: Pick<PersistenceErrorDetail, "operation" | "table" | "writeMode">,
): PersistenceErrorDetail {
  const message = typeof error?.message === "string" ? error.message : "Unknown persistence error";
  const details = typeof error?.details === "string" ? error.details : null;
  const hint = typeof error?.hint === "string" ? error.hint : null;
  const code = typeof error?.code === "string" ? error.code : null;
  const normalized = `${message} ${details ?? ""}`.toLowerCase();

  return {
    ...context,
    code,
    message,
    details,
    hint,
    column: inferErrorColumn({ message, details }),
    constraint: inferConstraint({ message }),
    isRls: normalized.includes("row-level security") || code === "42501",
  };
}

export function isCaseIdForeignKeyViolation(error: any): boolean {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  const details = typeof error?.details === "string" ? error.details.toLowerCase() : "";
  return code === "23503"
    && (
      message.includes("case_id")
      || details.includes("(case_id)")
      || message.includes("documents_case_id_fkey")
    );
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

    // Step 3: remove case-link rows explicitly (defensive cleanup for environments
    // where FK cascade is missing or temporarily misconfigured).
    const { error: linkDeleteError } = await supabaseAdmin
      .from("document_case_links")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", userId);

    if (linkDeleteError && !linkDeleteError.message?.includes("relation")) {
      console.warn(`[documents] link cleanup warn doc=${documentId}:`, linkDeleteError.message);
    }

    // Step 4: hard-delete the DB row (analysis + extracted text deleted with it)
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
