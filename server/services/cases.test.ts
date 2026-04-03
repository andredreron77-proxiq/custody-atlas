import test from "node:test";
import assert from "node:assert/strict";

import { extractMissingInsertColumn, extractNotNullViolationColumn, mapCaseRow } from "./cases";

test("extractMissingInsertColumn parses PostgREST missing column errors", () => {
  const column = extractMissingInsertColumn("Could not find the 'title' column of 'cases' in the schema cache");
  assert.equal(column, "title");
});

test("extractMissingInsertColumn returns null for unrelated errors", () => {
  const column = extractMissingInsertColumn("permission denied for table cases");
  assert.equal(column, null);
});

test("extractNotNullViolationColumn parses required legacy column errors", () => {
  const column = extractNotNullViolationColumn(
    'null value in column "name" of relation "cases" violates not-null constraint',
  );
  assert.equal(column, "name");
});

test("mapCaseRow supports legacy cases table columns", () => {
  const mapped = mapCaseRow({
    id: "case-1",
    user_id: "user-1",
    name: "Legacy Case Name",
    case_number: "24-DR-00123",
    jurisdiction: "California",
    created_at: "2026-04-03T00:00:00.000Z",
  });

  assert.equal(mapped.title, "Legacy Case Name");
  assert.equal(mapped.jurisdictionState, "California");
  assert.equal(mapped.status, "active");
  assert.equal(mapped.updatedAt, "2026-04-03T00:00:00.000Z");
});
