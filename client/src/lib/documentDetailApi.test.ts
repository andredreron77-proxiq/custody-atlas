import test from "node:test";
import assert from "node:assert/strict";
import { fetchDocumentDetail } from "./documentDetailApi";
import { setAccessToken } from "./tokenStore";

test("fetchDocumentDetail sends Bearer auth and returns document payload", async () => {
  setAccessToken("token-free-user");

  const originalFetch = global.fetch;
  let capturedAuthHeader: string | null = null;

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedAuthHeader = (init?.headers as Record<string, string>)?.Authorization ?? null;
    return new Response(
      JSON.stringify({
        document: {
          id: "doc-1",
          fileName: "order.pdf",
          mimeType: "application/pdf",
          pageCount: 2,
          docType: "other",
          analysisJson: { summary: "ready" },
          caseId: null,
          createdAt: "2026-04-03T00:00:00.000Z",
          hasStoragePath: false,
          isAnalysisAvailable: true,
          analysisStatus: "analyzed",
          integrityIssue: null,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await fetchDocumentDetail("doc-1");
    assert.equal(capturedAuthHeader, "Bearer token-free-user");
    assert.equal(result.missingAnalysis, null);
    assert.equal(result.superseded, null);
    assert.equal(result.document?.id, "doc-1");
  } finally {
    global.fetch = originalFetch;
    setAccessToken(null);
  }
});

test("fetchDocumentDetail surfaces missing-analysis response as structured state", async () => {
  setAccessToken("token-pro-user");

  const originalFetch = global.fetch;

  global.fetch = (async () => {
    return new Response(
      JSON.stringify({
        code: "DOCUMENT_ANALYSIS_MISSING",
        error: "Missing analysis",
        document: {
          id: "doc-2",
          fileName: "motion.pdf",
          mimeType: "application/pdf",
          pageCount: 1,
          docType: "other",
          caseId: null,
          createdAt: "2026-04-03T00:00:00.000Z",
          hasStoragePath: false,
        },
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await fetchDocumentDetail("doc-2");
    assert.equal(result.document, null);
    assert.equal(result.missingAnalysis?.code, "DOCUMENT_ANALYSIS_MISSING");
    assert.equal(result.missingAnalysis?.document.id, "doc-2");
    assert.equal(result.superseded, null);
  } finally {
    global.fetch = originalFetch;
    setAccessToken(null);
  }
});

test("fetchDocumentDetail surfaces superseded duplicate response", async () => {
  setAccessToken("token-pro-user");

  const originalFetch = global.fetch;

  global.fetch = (async () => {
    return new Response(
      JSON.stringify({
        code: "DOCUMENT_SUPERSEDED",
        error: "This document was merged into another record.",
        document: {
          id: "doc-dup",
          fileName: "order-copy.pdf",
          duplicateOfDocumentId: "doc-canonical",
        },
        canonicalDocument: {
          id: "doc-canonical",
          fileName: "order.pdf",
        },
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await fetchDocumentDetail("doc-dup");
    assert.equal(result.document, null);
    assert.equal(result.missingAnalysis, null);
    assert.equal(result.superseded?.code, "DOCUMENT_SUPERSEDED");
    assert.equal(result.superseded?.canonicalDocument?.id, "doc-canonical");
  } finally {
    global.fetch = originalFetch;
    setAccessToken(null);
  }
});
