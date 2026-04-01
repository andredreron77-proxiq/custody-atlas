import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExtractedFactsBlock,
  classifyDocumentQuestion,
  normalizeDocumentAnalysisPayload,
  validateAnalyzeDocumentGuards,
} from "./documentFlow";

test("validateAnalyzeDocumentGuards rejects missing file", () => {
  const result = validateAnalyzeDocumentGuards({
    hasFile: false,
    mimeType: undefined,
    fileSize: 0,
    hasAiClient: true,
    isDocx: false,
    hasDocAiConfig: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("validateAnalyzeDocumentGuards rejects oversized file", () => {
  const result = validateAnalyzeDocumentGuards({
    hasFile: true,
    mimeType: "application/pdf",
    fileSize: 12 * 1024 * 1024,
    hasAiClient: true,
    isDocx: false,
    hasDocAiConfig: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("normalizeDocumentAnalysisPayload converts object arrays into strings", () => {
  const normalized = normalizeDocumentAnalysisPayload({
    important_terms: [{ term: "Legal Custody", explanation: "Decision-making rights" }],
    key_dates: [],
    possible_implications: [],
    questions_to_ask_attorney: [{ name: "Deadline", description: "What is the filing deadline?" }],
  }) as Record<string, unknown>;

  assert.deepEqual(normalized.important_terms, ["Legal Custody: Decision-making rights"]);
  assert.deepEqual(normalized.questions_to_ask_attorney, ["Deadline: What is the filing deadline?"]);
});

test("classifyDocumentQuestion distinguishes fact lookups", () => {
  assert.equal(classifyDocumentQuestion("What is the case number?"), "fact");
  assert.equal(classifyDocumentQuestion("What should I do next?"), "interpretive");
});

test("buildExtractedFactsBlock handles sparse documents with no extracted facts", () => {
  const block = buildExtractedFactsBlock({
    document_type: "Court Order",
    summary: "Summary",
    important_terms: [],
    key_dates: [],
    possible_implications: [],
    questions_to_ask_attorney: [],
    extracted_facts: {
      case_number: null,
      court_name: null,
      court_address: null,
      document_title: null,
      filing_party: null,
      hearing_date: null,
      judge_name: null,
      opposing_party: null,
    },
  });

  assert.equal(block, "");
});
