import test from "node:test";
import assert from "node:assert/strict";
import { buildAskDocumentSystemPrompt } from "./routes";

test("ask-document runtime path: date question prompt generation does not throw", () => {
  assert.doesNotThrow(() => buildAskDocumentSystemPrompt("Are any dates stated within the file?"));

  const prompt = buildAskDocumentSystemPrompt("Are any dates stated within the file?");
  assert.match(prompt, /FACT QUESTION RULES/);
});
