import test from "node:test";
import assert from "node:assert/strict";
import { deriveActionInsight, deriveObligations, type DocAnalysis } from "./DocIntelPanel";

function makeAnalysis(overrides: Partial<DocAnalysis> = {}): DocAnalysis {
  return {
    document_type: "custody_order",
    summary: "",
    key_dates: [],
    extracted_facts: {},
    important_terms: [],
    possible_implications: [],
    ...overrides,
  };
}

test("future hearing date keeps prepare language", () => {
  const insight = deriveActionInsight(makeAnalysis({ extracted_facts: { hearing_date: "2099-03-12" } }));
  assert.match(insight ?? "", /prepare for a hearing/i);
});

test("same-day hearing is treated as current action", () => {
  const insight = deriveActionInsight(makeAnalysis({ extracted_facts: { hearing_date: new Date().toISOString().slice(0, 10) } }));
  assert.match(insight ?? "", /scheduled for today/i);
});

test("past hearing date uses historical language (not upcoming prep)", () => {
  const insight = deriveActionInsight(makeAnalysis({ extracted_facts: { hearing_date: "2020-03-12" } }));
  assert.match(insight ?? "", /Past hearing date detected/i);
  assert.doesNotMatch(insight ?? "", /prepare for a hearing on/i);

  const obligations = deriveObligations(makeAnalysis({ extracted_facts: { hearing_date: "2020-03-12" } }));
  assert.equal(obligations[0]?.label, "Past hearing");
});

test("past filing date is labeled historical", () => {
  const obligations = deriveObligations(makeAnalysis({ extracted_facts: { filing_date: "2020-02-01" } }));
  assert.equal(obligations[0]?.label, "Historical filing date");
});

test("mixed document keeps future hearing priority and historical context", () => {
  const obligations = deriveObligations(makeAnalysis({
    extracted_facts: { hearing_date: "2099-03-12", filing_date: "2020-02-01" },
  }));
  assert.equal(obligations[0]?.label, "Upcoming hearing");
  assert.equal(obligations[1]?.label, "Historical filing date");
});
