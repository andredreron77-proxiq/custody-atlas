import test from "node:test";
import assert from "node:assert/strict";
import { deriveCaseActivityState } from "./workspaceState";

test("empty state when no documents and no questions", () => {
  const result = deriveCaseActivityState({
    isLoading: false,
    documentCount: 0,
    analyzedDocumentCount: 0,
    questionCount: 0,
    latestActivityIso: null,
  });

  assert.equal(result.state, "empty");
  assert.equal(result.hasActivity, false);
  assert.equal(result.isContinuation, false);
});

test("documents-only state when uploads exist but none analyzed and no questions", () => {
  const result = deriveCaseActivityState({
    isLoading: false,
    documentCount: 2,
    analyzedDocumentCount: 0,
    questionCount: 0,
    latestActivityIso: "2026-03-30T10:00:00.000Z",
  });

  assert.equal(result.state, "documents_only");
  assert.equal(result.hasActivity, true);
  assert.equal(result.isContinuation, false);
});

test("analyzed-no-questions state prompts for document question", () => {
  const result = deriveCaseActivityState({
    isLoading: false,
    documentCount: 2,
    analyzedDocumentCount: 2,
    questionCount: 0,
    latestActivityIso: "2026-03-30T10:00:00.000Z",
  });

  assert.equal(result.state, "analyzed_no_questions");
  assert.equal(result.hasActivity, true);
  assert.equal(result.isContinuation, false);
});

test("active-case state when at least one question exists", () => {
  const result = deriveCaseActivityState({
    isLoading: false,
    documentCount: 3,
    analyzedDocumentCount: 2,
    questionCount: 1,
    latestActivityIso: "2026-03-31T10:00:00.000Z",
  });

  assert.equal(result.state, "active_case");
  assert.equal(result.hasActivity, true);
  assert.equal(result.isContinuation, true);
});

test("question activity never regresses to first-question flow", () => {
  const result = deriveCaseActivityState({
    isLoading: false,
    documentCount: 0,
    analyzedDocumentCount: 0,
    questionCount: 4,
    latestActivityIso: "2026-03-31T10:00:00.000Z",
    unresolvedRiskCount: 1,
  });

  assert.equal(result.state, "active_attention");
  assert.equal(result.isContinuation, true);
});
