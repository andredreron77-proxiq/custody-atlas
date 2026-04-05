import { apiRequestRaw } from "@/lib/queryClient";

export interface DocumentDetail {
  id: string;
  fileName: string;
  mimeType: string;
  pageCount: number;
  docType: string;
  analysisJson: Record<string, unknown>;
  caseId: string | null;
  createdAt: string;
  hasStoragePath: boolean;
  isAnalysisAvailable?: boolean;
  analysisStatus?: "uploaded" | "analyzing" | "analyzed" | "failed";
  integrityIssue?: "missing_analysis" | null;
}

export interface DocumentMissingAnalysisError {
  code: "DOCUMENT_ANALYSIS_MISSING";
  error: string;
  document: Omit<DocumentDetail, "analysisJson">;
}

export interface DocumentSupersededError {
  code: "DOCUMENT_SUPERSEDED";
  error: string;
  document: {
    id: string;
    fileName: string;
    duplicateOfDocumentId: string;
  };
  canonicalDocument: {
    id: string;
    fileName: string;
  } | null;
}

export async function fetchDocumentDetail(
  documentId: string,
): Promise<
  | { document: DocumentDetail; missingAnalysis: null; superseded: null }
  | { document: null; missingAnalysis: DocumentMissingAnalysisError; superseded: null }
  | { document: null; missingAnalysis: null; superseded: DocumentSupersededError }
> {
  const res = await apiRequestRaw("GET", `/api/documents/${documentId}`);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 409 && json?.code === "DOCUMENT_ANALYSIS_MISSING") {
      return { document: null, missingAnalysis: json as DocumentMissingAnalysisError, superseded: null };
    }
    if (res.status === 409 && json?.code === "DOCUMENT_SUPERSEDED") {
      return { document: null, missingAnalysis: null, superseded: json as DocumentSupersededError };
    }
    throw new Error("Document not found");
  }

  return { document: json.document as DocumentDetail, missingAnalysis: null, superseded: null };
}
