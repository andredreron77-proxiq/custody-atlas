import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPersistenceErrorDetail,
  dropUnsupportedInsertColumn,
  extractMissingInsertColumn,
  getDocumentIntegrity,
  isCaseIdForeignKeyViolation,
  isCanonicalDocument,
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

test("isCaseIdForeignKeyViolation detects case_id FK write failures", () => {
  assert.equal(
    isCaseIdForeignKeyViolation({
      code: "23503",
      message: "insert or update on table \"documents\" violates foreign key constraint \"documents_case_id_fkey\"",
      details: "Key (case_id)=(missing-case) is not present in table \"cases\".",
    }),
    true,
  );
  assert.equal(
    isCaseIdForeignKeyViolation({
      code: "23503",
      message: "insert or update on table \"documents\" violates foreign key constraint \"documents_user_id_fkey\"",
      details: "Key (user_id)=(missing-user) is not present in table \"users\".",
    }),
    false,
  );
});

test("buildPersistenceErrorDetail surfaces constraint, column, and RLS hints", () => {
  const detail = buildPersistenceErrorDetail(
    {
      code: "42501",
      message: "new row violates row-level security policy for table \"documents\"",
      details: "Failing row contains (case_id)=abc123.",
      hint: "Use authenticated role",
    },
    {
      operation: "saveDocumentWithDuplicateOutcome",
      table: "documents",
      writeMode: "insert",
    },
  );
  assert.equal(detail.constraint, null);
  assert.equal(detail.column, "case_id");
  assert.equal(detail.isRls, true);
});

test("isCanonicalDocument returns true only for non-duplicate rows", () => {
  assert.equal(isCanonicalDocument({ duplicateOfDocumentId: null }), true);
  assert.equal(isCanonicalDocument({ duplicateOfDocumentId: "doc-1" }), false);
  assert.equal(isCanonicalDocument({ duplicate_of_document_id: null }), true);
  assert.equal(isCanonicalDocument({ duplicate_of_document_id: "doc-1" }), false);
});

test("getDocumentIntegrity treats completed lifecycle status as analyzed", () => {
  const integrity = getDocumentIntegrity({
    analysisJson: {
      analysis_status: "completed",
      summary: "Structured summary present.",
    },
  });

  assert.equal(integrity.isAnalysisAvailable, true);
  assert.equal(integrity.analysisStatus, "analyzed");
  assert.equal(integrity.integrityIssue, null);
});

test("getDocumentIntegrity treats pending lifecycle status as analyzing", () => {
  const integrity = getDocumentIntegrity({
    analysisJson: {
      analysis_status: "pending",
    },
  });

  assert.equal(integrity.isAnalysisAvailable, false);
  assert.equal(integrity.analysisStatus, "analyzing");
  assert.equal(integrity.integrityIssue, "missing_analysis");
});
