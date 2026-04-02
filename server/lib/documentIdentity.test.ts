import test from "node:test";
import assert from "node:assert/strict";
import { planUploadAssociation } from "./documentIdentity";

test("same file uploaded twice by same user reuses one canonical document row", () => {
  const plan = planUploadAssociation({
    canonicalDocumentId: "doc-1",
    existingCaseIds: [],
    requestedCaseId: null,
  });

  assert.equal(plan.reuseCanonical, true);
  assert.equal(plan.createCanonical, false);
  assert.equal(plan.linkToRequestedCase, false);
});

test("same file uploaded first with no case, then into a case links without creating canonical duplicate", () => {
  const plan = planUploadAssociation({
    canonicalDocumentId: "doc-1",
    existingCaseIds: [],
    requestedCaseId: "case-a",
  });

  assert.equal(plan.reuseCanonical, true);
  assert.equal(plan.createCanonical, false);
  assert.equal(plan.linkToRequestedCase, true);
});

test("same file uploaded into multiple cases reuses canonical and links only missing case", () => {
  const plan = planUploadAssociation({
    canonicalDocumentId: "doc-1",
    existingCaseIds: ["case-a"],
    requestedCaseId: "case-b",
  });

  assert.equal(plan.reuseCanonical, true);
  assert.equal(plan.createCanonical, false);
  assert.equal(plan.linkToRequestedCase, true);
});

test("same file uploaded again into already-linked case is deduped with no new link", () => {
  const plan = planUploadAssociation({
    canonicalDocumentId: "doc-1",
    existingCaseIds: ["case-a"],
    requestedCaseId: "case-a",
  });

  assert.equal(plan.reuseCanonical, true);
  assert.equal(plan.createCanonical, false);
  assert.equal(plan.linkToRequestedCase, false);
});

test("different file hash path creates a new canonical document", () => {
  const plan = planUploadAssociation({
    canonicalDocumentId: null,
    existingCaseIds: [],
    requestedCaseId: "case-a",
  });

  assert.equal(plan.reuseCanonical, false);
  assert.equal(plan.createCanonical, true);
  assert.equal(plan.linkToRequestedCase, true);
});

test("same filename with different content hash creates a separate canonical document", () => {
  const plan = planUploadAssociation({
    canonicalDocumentId: null,
    existingCaseIds: [],
    requestedCaseId: null,
  });

  assert.equal(plan.reuseCanonical, false);
  assert.equal(plan.createCanonical, true);
  assert.equal(plan.linkToRequestedCase, false);
});
