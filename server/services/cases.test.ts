import test from "node:test";
import assert from "node:assert/strict";

import { extractMissingInsertColumn, mapCaseRow } from "./cases";

test("extractMissingInsertColumn parses PostgREST missing column errors", () => {
  const column = extractMissingInsertColumn("Could not find the 'title' column of 'cases' in the schema cache");
  assert.equal(column, "title");
});

test("extractMissingInsertColumn returns null for unrelated errors", () => {
  const column = extractMissingInsertColumn("permission denied for table cases");
  assert.equal(column, null);
});

test("mapCaseRow uses live cases table columns", () => {
  const mapped = mapCaseRow({
    id: "case-1",
    user_id: "user-1",
    title: "Parenting Plan 2026",
    case_type: "general",
    status: "active",
    created_at: "2026-04-03T00:00:00.000Z",
  });

  assert.equal(mapped.title, "Parenting Plan 2026");
  assert.equal(mapped.jurisdictionState, null);
  assert.equal(mapped.status, "active");
  assert.equal(mapped.updatedAt, "2026-04-03T00:00:00.000Z");
});
