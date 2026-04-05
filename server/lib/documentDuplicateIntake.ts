import { createHash } from "crypto";
import type { SavedDocument } from "../services/documents";

export type DuplicateDecisionType =
  | "EXACT_DUPLICATE"
  | "SEMANTIC_DUPLICATE"
  | "LIKELY_DUPLICATE"
  | "NEW_DOCUMENT";

export interface DuplicateDecision {
  type: DuplicateDecisionType;
  confidence: number;
  matchedDocument: SavedDocument | null;
  reasons: string[];
}

export interface DuplicateFingerprintInput {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  sourceKind: string;
  sourceFileHash: string;
  extractedText: string;
}

export interface DuplicateFingerprints {
  fileHash: string;
  normalizedFilename: string;
  fileSizeBytes: number;
  mimeType: string;
  sourceKind: string;
  intakeTextHash: string;
  intakeTextPreview: string;
  normalizedExtractedText: string;
}

export function normalizeFileName(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeExtractedText(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\r\n/g, "\n")
    .replace(/[^a-z0-9\s:/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function textTokenSet(text: string): Set<string> {
  return new Set(
    text
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 4)
      .slice(0, 400),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const intersection = Array.from(a).filter((token) => b.has(token)).length;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function buildDuplicateFingerprints(input: DuplicateFingerprintInput): DuplicateFingerprints {
  const normalizedText = normalizeExtractedText(input.extractedText);
  return {
    fileHash: input.sourceFileHash.trim().toLowerCase(),
    normalizedFilename: normalizeFileName(input.fileName),
    fileSizeBytes: input.fileSizeBytes,
    mimeType: input.mimeType,
    sourceKind: input.sourceKind,
    intakeTextHash: hashString(normalizedText),
    intakeTextPreview: normalizedText.slice(0, 500),
    normalizedExtractedText: normalizedText,
  };
}

export function classifyDuplicate(
  fingerprints: DuplicateFingerprints,
  docs: SavedDocument[],
): DuplicateDecision {
  const exact = docs.find((d) => (d.fileHash ?? "").trim().toLowerCase() === fingerprints.fileHash);
  if (exact) {
    return {
      type: "EXACT_DUPLICATE",
      confidence: 1,
      matchedDocument: exact,
      reasons: ["same_file_hash"],
    };
  }

  const semantic = docs.find((d) => (d.intakeTextHash ?? "").trim().toLowerCase() === fingerprints.intakeTextHash);
  if (semantic) {
    return {
      type: "SEMANTIC_DUPLICATE",
      confidence: 0.98,
      matchedDocument: semantic,
      reasons: ["same_intake_text_hash"],
    };
  }

  const uploadTokens = textTokenSet(fingerprints.normalizedExtractedText);
  let best: { score: number; doc: SavedDocument; reasons: string[] } | null = null;
  for (const doc of docs) {
    const docName = normalizeFileName(doc.fileName);
    const docText = normalizeExtractedText(doc.extractedText ?? "");
    const docTokens = textTokenSet(docText);
    const sim = jaccardSimilarity(uploadTokens, docTokens);

    let score = sim;
    const reasons: string[] = [];
    if (docName && fingerprints.normalizedFilename && (docName === fingerprints.normalizedFilename || docName.includes(fingerprints.normalizedFilename) || fingerprints.normalizedFilename.includes(docName))) {
      score += 0.2;
      reasons.push("filename_overlap");
    }
    if (sim >= 0.7) reasons.push("high_text_similarity");
    if (sim >= 0.58) {
      if (!best || score > best.score) best = { score, doc, reasons };
    }
  }

  if (best) {
    return {
      type: "LIKELY_DUPLICATE",
      confidence: Math.min(best.score, 0.95),
      matchedDocument: best.doc,
      reasons: best.reasons.length ? best.reasons : ["text_similarity"],
    };
  }

  return {
    type: "NEW_DOCUMENT",
    confidence: 0,
    matchedDocument: null,
    reasons: ["no_duplicate_signal"],
  };
}
