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

export async function fetchDocumentDetail(
  documentId: string,
): Promise<{ document: DocumentDetail; missingAnalysis: null } | { document: null; missingAnalysis: DocumentMissingAnalysisError }> {
  const res = await apiRequestRaw("GET", `/api/documents/${documentId}`);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 409 && json?.code === "DOCUMENT_ANALYSIS_MISSING") {
      return { document: null, missingAnalysis: json as DocumentMissingAnalysisError };
    }
    throw new Error("Document not found");
  }

  return { document: json.document as DocumentDetail, missingAnalysis: null };
}
