import test from "node:test";
import assert from "node:assert/strict";

import { buildDocumentQASystemPrompt, buildExtractedFactsBlock } from "./documentQuestionPrompt";

test("document-aware factual question path builds prompt without runtime errors", () => {
  const extractedFactsBlock = buildExtractedFactsBlock({
    hearing_date: "May 5, 2026",
    case_number: "22-DR-101",
  });

  assert.match(extractedFactsBlock, /Hearing Date: May 5, 2026/);

  assert.doesNotThrow(() => {
    const systemPrompt = buildDocumentQASystemPrompt("Are any dates stated within the file?");
    assert.match(systemPrompt, /FACT QUESTION RULES/);
  });
});

test("non-factual question path omits FACT QUESTION RULES", () => {
  const systemPrompt = buildDocumentQASystemPrompt("What should I ask the judge next?");
  assert.doesNotMatch(systemPrompt, /FACT QUESTION RULES/);
});
