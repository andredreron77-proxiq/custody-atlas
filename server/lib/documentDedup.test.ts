import test from "node:test";
import assert from "node:assert/strict";
import { persistDocumentWithDedup, preserveSourceFileHash, withSourceFileHash } from "./documentDedup";
import type { SavedDocument } from "../services/documents";

function mockDocument(overrides: Partial<SavedDocument> = {}): SavedDocument {
  return {
    id: overrides.id ?? "doc-1",
    userId: overrides.userId ?? "user-1",
    caseId: overrides.caseId ?? null,
    fileName: overrides.fileName ?? "test.pdf",
    storagePath: overrides.storagePath ?? null,
    mimeType: overrides.mimeType ?? "application/pdf",
    pageCount: overrides.pageCount ?? 1,
    docType: overrides.docType ?? "other",
    analysisJson: overrides.analysisJson ?? {},
    extractedText: overrides.extractedText ?? "text",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

test("same file uploaded twice in standard mode reuses existing row", async () => {
  let saveCalls = 0;
  let updateCalls = 0;
  const existing = mockDocument({ id: "doc-standard" });

  const saved = await persistDocumentWithDedup(
    {
      userId: "user-1",
      caseId: null,
      fileName: "order.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
      extractedText: "text",
      analysis: { summary: "first pass" },
      sourceFileSha256: "ABC123",
    },
    {
      findDuplicate: async () => existing,
      save: async () => {
        saveCalls += 1;
        return null;
      },
      updateAnalysis: async () => {
        updateCalls += 1;
        return true;
      },
    },
  );

  assert.equal(saved?.id, "doc-standard");
  assert.equal(saveCalls, 0);
  assert.equal(updateCalls, 1);
});

test("same file uploaded twice in Pro mode follows same hash dedupe contract", async () => {
  const findCalls: Array<{ fileHash: string; caseId: string | null }> = [];

  await persistDocumentWithDedup(
    {
      userId: "user-1",
      caseId: "case-1",
      fileName: "scan.jpg",
      mimeType: "image/jpeg",
      pageCount: 3,
      extractedText: "multi page text",
      analysis: { summary: "pro flow" },
      sourceFileSha256: "DEF456",
    },
    {
      findDuplicate: async (_userId, lookup) => {
        findCalls.push(lookup);
        return mockDocument({ id: "doc-pro", caseId: "case-1" });
      },
      save: async () => {
        throw new Error("save should not run for duplicate");
      },
      updateAnalysis: async () => true,
    },
  );

  assert.deepEqual(findCalls, [{ fileHash: "DEF456", caseId: "case-1" }]);
});

test("same file re-analyzed in Pro mode preserves source_file_sha256", () => {
  const merged = preserveSourceFileHash(
    { summary: "before", source_file_sha256: "abc999" },
    { summary: "after" },
  );

  assert.equal(merged.source_file_sha256, "abc999");
  assert.equal(merged.summary, "after");
});

test("same filename with different content hash creates a new row", async () => {
  let saveCalls = 0;

  const saved = await persistDocumentWithDedup(
    {
      userId: "user-1",
      caseId: null,
      fileName: "order.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
      extractedText: "new text",
      analysis: { summary: "different file" },
      sourceFileSha256: "different-hash",
    },
    {
      findDuplicate: async () => null,
      save: async () => {
        saveCalls += 1;
        return mockDocument({ id: "doc-new" });
      },
      updateAnalysis: async () => true,
    },
  );

  assert.equal(saved?.id, "doc-new");
  assert.equal(saveCalls, 1);
});

test("withSourceFileHash normalizes uppercase hashes", () => {
  const withHash = withSourceFileHash({ summary: "x" }, "AABBCC");
  assert.equal(withHash.source_file_sha256, "aabbcc");
});
