import test from "node:test";
import assert from "node:assert/strict";
import { isDirectFactQuestion } from "./documentQuestionUtils";

test("detects direct factual document question about dates", () => {
  assert.equal(isDirectFactQuestion("Are any dates stated within the file?"), true);
});

test("does not classify general strategy question as direct fact lookup", () => {
  assert.equal(isDirectFactQuestion("What should I ask the judge next?"), false);
});
