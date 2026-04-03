import test from "node:test";
import assert from "node:assert/strict";
import { decideCaseAssignment } from "./documentCaseAssignment";

test("returns unassigned when there are no cases", () => {
  const decision = decideCaseAssignment(
    { caseNumber: null, courtName: null, filingParty: null, opposingParty: null, jurisdictionState: null },
    [],
  );
  assert.equal(decision.status, "unassigned");
});

test("returns assigned when there is one case", () => {
  const decision = decideCaseAssignment(
    { caseNumber: null, courtName: null, filingParty: null, opposingParty: null, jurisdictionState: null },
    [
      {
        caseRecord: {
          id: "case-1",
          userId: "u1",
          title: "Smith custody",
          description: null,
          jurisdictionState: "CA",
          jurisdictionCounty: null,
          status: "active",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
        priorDocuments: [],
      },
    ],
  );
  assert.equal(decision.status, "assigned");
  assert.equal(decision.assignedCaseId, "case-1");
});

test("high-confidence multi-case match auto-assigns", () => {
  const decision = decideCaseAssignment(
    {
      caseNumber: "24-DR-00123",
      courtName: "Superior Court",
      filingParty: "Jane Smith",
      opposingParty: null,
      jurisdictionState: "CA",
    },
    [
      {
        caseRecord: {
          id: "case-1",
          userId: "u1",
          title: "Case 24-DR-00123",
          description: null,
          jurisdictionState: "CA",
          jurisdictionCounty: null,
          status: "active",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
        priorDocuments: [],
      },
      {
        caseRecord: {
          id: "case-2",
          userId: "u1",
          title: "Different case",
          description: null,
          jurisdictionState: "TX",
          jurisdictionCounty: null,
          status: "active",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
        priorDocuments: [],
      },
    ],
  );

  assert.equal(decision.status, "assigned");
  assert.equal(decision.assignedCaseId, "case-1");
});

test("low-confidence multi-case match suggests", () => {
  const decision = decideCaseAssignment(
    { caseNumber: null, courtName: null, filingParty: "Jane", opposingParty: null, jurisdictionState: "CA" },
    [
      {
        caseRecord: {
          id: "case-1",
          userId: "u1",
          title: "Case A",
          description: null,
          jurisdictionState: "CA",
          jurisdictionCounty: null,
          status: "active",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
        priorDocuments: [
          {
            id: "doc-1",
            userId: "u1",
            caseId: "case-1",
            sourceFileSha256: null,
            retentionTier: "free",
            originalExpiresAt: null,
            intelligenceExpiresAt: null,
            lifecycleState: "active",
            fileName: "notice.pdf",
            storagePath: null,
            mimeType: "application/pdf",
            pageCount: 1,
            docType: "other",
            analysisJson: { extracted_facts: { filing_party: "Jane Doe" } },
            extractedText: "",
            createdAt: "2026-01-01",
          },
        ],
      },
      {
        caseRecord: {
          id: "case-2",
          userId: "u1",
          title: "Case B",
          description: null,
          jurisdictionState: "NY",
          jurisdictionCounty: null,
          status: "active",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
        priorDocuments: [],
      },
    ],
  );

  assert.equal(decision.status, "suggested");
  assert.equal(decision.suggestedCaseId, "case-1");
});
