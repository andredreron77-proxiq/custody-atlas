import type { SavedDocument } from "../services/documents";

interface PersistDocumentInput {
  userId: string;
  caseId: string | null;
  fileName: string;
  mimeType: string;
  pageCount: number;
  extractedText: string;
  analysis: Record<string, unknown>;
  sourceFileSha256: string;
}

interface PersistDocumentDeps {
  findDuplicate: (userId: string, lookup: { fileHash: string; caseId: string | null }) => Promise<SavedDocument | null>;
  save: (userId: string, fields: Omit<SavedDocument, "id" | "userId" | "createdAt">) => Promise<SavedDocument | null>;
  updateAnalysis: (documentId: string, userId: string, analysisJson: Record<string, unknown>) => Promise<boolean>;
}

export function withSourceFileHash(
  analysis: Record<string, unknown>,
  sourceFileSha256: string,
): Record<string, unknown> {
  const normalizedHash = sourceFileSha256.trim().toLowerCase();
  if (!normalizedHash) return { ...analysis };
  return {
    ...analysis,
    source_file_sha256: normalizedHash,
  };
}

export function preserveSourceFileHash(
  existingAnalysis: Record<string, unknown> | null | undefined,
  nextAnalysis: Record<string, unknown>,
): Record<string, unknown> {
  const existingHash = typeof existingAnalysis?.source_file_sha256 === "string"
    ? existingAnalysis.source_file_sha256.trim().toLowerCase()
    : "";

  const nextHash = typeof nextAnalysis.source_file_sha256 === "string"
    ? nextAnalysis.source_file_sha256.trim().toLowerCase()
    : "";

  if (nextHash) return { ...nextAnalysis, source_file_sha256: nextHash };
  if (existingHash) return { ...nextAnalysis, source_file_sha256: existingHash };
  return { ...nextAnalysis };
}

/**
 * Single dedupe contract for every upload path:
 * same user + same case/null-case scope + same source_file_sha256.
 */
export async function persistDocumentWithDedup(
  input: PersistDocumentInput,
  deps: PersistDocumentDeps,
): Promise<SavedDocument | null> {
  const analysisWithHash = withSourceFileHash(input.analysis, input.sourceFileSha256);

  const duplicate = await deps.findDuplicate(input.userId, {
    fileHash: input.sourceFileSha256,
    caseId: input.caseId,
  });

  if (duplicate) {
    await deps.updateAnalysis(duplicate.id, input.userId, analysisWithHash);
    return duplicate;
  }

  return deps.save(input.userId, {
    fileName: input.fileName,
    storagePath: null,
    caseId: input.caseId,
    mimeType: input.mimeType,
    pageCount: input.pageCount,
    analysisJson: analysisWithHash,
    extractedText: input.extractedText,
    docType: "other",
  });
}
