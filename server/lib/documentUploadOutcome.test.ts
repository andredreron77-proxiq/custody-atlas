import test from "node:test";
import assert from "node:assert/strict";
import { buildDocumentUploadOutcome } from "./documentUploadOutcome";

test("new upload increments usage and records analyzed activity", () => {
  const outcome = buildDocumentUploadOutcome({
    fileName: "order.pdf",
    isDuplicate: false,
  });

  assert.equal(outcome.shouldTrackUsage, true);
  assert.equal(outcome.activityDescription, "Analyzed document: order.pdf");
  assert.equal(outcome.userMessage, null);
});

test("duplicate upload does not increment usage and returns clear message", () => {
  const outcome = buildDocumentUploadOutcome({
    fileName: "order.pdf",
    isDuplicate: true,
  });

  assert.equal(outcome.shouldTrackUsage, false);
  assert.match(outcome.activityDescription, /Already uploaded: order\.pdf/);
  assert.equal(
    outcome.userMessage,
    "This file was already in your workspace. We refreshed its analysis.",
  );
});

