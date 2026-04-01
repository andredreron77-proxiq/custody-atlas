import test from "node:test";
import assert from "node:assert/strict";
import { parseStoredJurisdiction } from "./useJurisdiction";

test("new signed-in user does not inherit legacy unscoped jurisdiction", () => {
  const raw = JSON.stringify({
    jurisdiction: { state: "Georgia", county: "Clayton" },
    savedAt: Date.now(),
  });

  const parsed = parseStoredJurisdiction(raw, "user-b");
  assert.ok(parsed);
  assert.equal(parsed.shouldClearStorage, true);
});

test("returning signed-in user keeps their own saved jurisdiction", () => {
  const raw = JSON.stringify({
    jurisdiction: { state: "Georgia", county: "Fulton" },
    savedAt: Date.now(),
    userId: "user-a",
  });

  const parsed = parseStoredJurisdiction(raw, "user-a");
  assert.ok(parsed);
  assert.equal(parsed.shouldClearStorage, false);
  assert.equal(parsed.entry.jurisdiction.county, "Fulton");
});
