import test from "node:test";
import assert from "node:assert/strict";

import { mapCaseRow } from "./cases";

test("mapCaseRow uses live cases table columns", () => {
  const mapped = mapCaseRow({
    id: "case-1",
    user_id: "user-1",
    title: "Parenting Plan 2026",
    case_type: "custody",
    situation_type: "hearing_coming_up",
    status: "active",
    created_at: "2026-04-03T00:00:00.000Z",
  });

  assert.equal(mapped.title, "Parenting Plan 2026");
  assert.equal(mapped.situationType, "hearing_coming_up");
  assert.equal(mapped.jurisdictionState, null);
  assert.equal(mapped.status, "active");
  assert.equal(mapped.updatedAt, "2026-04-03T00:00:00.000Z");
});
