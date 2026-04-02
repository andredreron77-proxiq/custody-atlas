import test from "node:test";
import assert from "node:assert/strict";
import { mergeCaseScopedDocumentIds } from "./documents";

test("workspace listing merges link-table and legacy case_id results without duplicates", () => {
  const merged = mergeCaseScopedDocumentIds(
    ["doc-1", "doc-2", "doc-3"],
    ["doc-3", "doc-4"],
  );

  assert.deepEqual(merged, ["doc-1", "doc-2", "doc-3", "doc-4"]);
});

test("workspace listing supports legacy fallback when link-table rows are absent", () => {
  const merged = mergeCaseScopedDocumentIds([], ["doc-legacy-1"]);

  assert.deepEqual(merged, ["doc-legacy-1"]);
});
