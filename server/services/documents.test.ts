import test from "node:test";
import assert from "node:assert/strict";
import {
  dropUnsupportedInsertColumn,
  extractMissingInsertColumn,
  isSourceHashUniqueConflict,
  mergeCaseScopedDocumentIds,
} from "./documents";

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

test("extractMissingInsertColumn parses PostgREST missing-column errors", () => {
  const column = extractMissingInsertColumn("Could not find the 'retention_tier' column of 'documents' in the schema cache");
  assert.equal(column, "retention_tier");
});

test("dropUnsupportedInsertColumn removes optional insert columns only", () => {
  const payload = {
    user_id: "user-1",
    file_name: "order.pdf",
    retention_tier: "pro",
  };

  const result = dropUnsupportedInsertColumn(payload, "Could not find the 'retention_tier' column of 'documents' in the schema cache");
  assert.equal(result.removedColumn, "retention_tier");
  assert.deepEqual(result.nextPayload, {
    user_id: "user-1",
    file_name: "order.pdf",
  });
});

test("dropUnsupportedInsertColumn keeps payload intact for non-optional columns", () => {
  const payload = {
    user_id: "user-1",
    file_name: "order.pdf",
    case_id: "case-1",
  };

  const result = dropUnsupportedInsertColumn(payload, "Could not find the 'case_id' column of 'documents' in the schema cache");
  assert.equal(result.removedColumn, null);
  assert.deepEqual(result.nextPayload, payload);
});

test("dropUnsupportedInsertColumn does not remove source_file_sha256", () => {
  const payload = {
    user_id: "user-1",
    file_name: "order.pdf",
    source_file_sha256: "abc123",
  };

  const result = dropUnsupportedInsertColumn(payload, "Could not find the 'source_file_sha256' column of 'documents' in the schema cache");
  assert.equal(result.removedColumn, null);
  assert.deepEqual(result.nextPayload, payload);
});

test("isSourceHashUniqueConflict detects unique index violations on source hash", () => {
  assert.equal(
    isSourceHashUniqueConflict(
      "duplicate key value violates unique constraint \"documents_user_source_hash_unique\"",
    ),
    true,
  );
  assert.equal(
    isSourceHashUniqueConflict(
      "duplicate key value violates unique constraint \"documents_other_index\"",
    ),
    false,
  );
});
