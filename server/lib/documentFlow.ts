import type { DocumentAnalysisResult } from "@shared/schema";
import { isDocumentFactLookupQuestion } from "./documentQuestionUtils";

export type DocumentQuestionType = "fact" | "interpretive";

export interface AnalyzeDocumentGuardsInput {
  hasFile: boolean;
  mimeType?: string;
  fileSize?: number;
  hasAiClient: boolean;
  isDocx: boolean;
  hasDocAiConfig: boolean;
}

export interface GuardResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024;

export function validateAnalyzeDocumentGuards(input: AnalyzeDocumentGuardsInput): GuardResult {
  console.log("[documentFlow] flow started");
  if (!input.hasFile) {
    return { ok: false, status: 400, error: "No file uploaded. Please attach a PDF, JPG, or PNG." };
  }

  if (!input.mimeType) {
    return { ok: false, status: 400, error: "Unsupported file type. Please upload a PDF, Word document (.docx), JPG, or PNG." };
  }

  if (input.fileSize && input.fileSize > MAX_DOCUMENT_SIZE_BYTES) {
    return { ok: false, status: 400, error: "File is too large. Maximum size is 50MB." };
  }

  if (!input.hasAiClient) {
    return { ok: false, status: 503, error: "AI service not configured." };
  }

  if (!input.isDocx && !input.hasDocAiConfig) {
    return { ok: false, status: 503, error: "Google Document AI is not configured." };
  }

  return { ok: true };
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const label = obj.term ?? obj.name ?? obj.title ?? obj.provision ?? "";
      const detail = obj.explanation ?? obj.definition ?? obj.description ?? obj.meaning ?? obj.value ?? "";
      if (label && detail) return `${label}: ${detail}`;
      if (label) return String(label);
      if (detail) return String(detail);
      return JSON.stringify(item);
    }
    return String(item);
  });
}

export function normalizeDocumentAnalysisPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;

  const mutable = payload as Record<string, unknown>;
  const fields = ["important_terms", "key_dates", "possible_implications", "questions_to_ask_attorney"] as const;

  for (const field of fields) {
    if (Array.isArray(mutable[field])) {
      mutable[field] = normalizeStringArray(mutable[field]);
    }
  }

  return mutable;
}

export function classifyDocumentQuestion(question: string): DocumentQuestionType {
  return isDocumentFactLookupQuestion(question) ? "fact" : "interpretive";
}

export function buildExtractedFactsBlock(analysis: DocumentAnalysisResult): string {
  const facts = analysis.extracted_facts;
  if (!facts) return "";

  const rows = [
    facts.document_title ? `- Title: ${facts.document_title}` : "",
    facts.case_number ? `- Case Number: ${facts.case_number}` : "",
    facts.court_name ? `- Court: ${facts.court_name}` : "",
    facts.court_address ? `- Court Address: ${facts.court_address}` : "",
    facts.judge_name ? `- Judge: ${facts.judge_name}` : "",
    facts.hearing_date ? `- Hearing Date: ${facts.hearing_date}` : "",
    facts.filing_party ? `- Filing Party: ${facts.filing_party}` : "",
    facts.opposing_party ? `- Opposing Party: ${facts.opposing_party}` : "",
  ].filter(Boolean);

  if (rows.length === 0) return "";

  return [
    "KNOWN FACTS FROM THIS DOCUMENT (verbatim from text — use these to answer factual questions directly):",
    ...rows,
  ].join("\n");
}

export function getSafeErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
    return (err as any).message;
  }
  return fallback;
}
