import type { Case } from "../services/cases";
import type { SavedDocument } from "../services/documents";

export type CaseAssignmentStatus = "assigned" | "suggested" | "unassigned";

export interface CaseAssignmentDecision {
  status: CaseAssignmentStatus;
  assignedCaseId: string | null;
  suggestedCaseId: string | null;
  confidenceScore: number | null;
  reason: string;
  autoAssigned: boolean;
}

export interface AssignmentSignals {
  caseNumber: string | null;
  courtName: string | null;
  filingParty: string | null;
  opposingParty: string | null;
  jurisdictionState: string | null;
}

export interface AssignmentCandidate {
  caseRecord: Case;
  priorDocuments: SavedDocument[];
}

function clean(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

function includesText(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  const h = clean(haystack);
  const n = clean(needle);
  return Boolean(h && n && h.includes(n));
}

function scoreCandidate(signals: AssignmentSignals, candidate: AssignmentCandidate): number {
  let score = 0;
  const title = candidate.caseRecord.title;
  const description = candidate.caseRecord.description ?? "";

  if (signals.caseNumber && (includesText(title, signals.caseNumber) || includesText(description, signals.caseNumber))) {
    score += 60;
  }

  if (signals.jurisdictionState && includesText(candidate.caseRecord.jurisdictionState, signals.jurisdictionState)) {
    score += 10;
  }

  if (signals.courtName) {
    for (const doc of candidate.priorDocuments) {
      const facts = (doc.analysisJson?.extracted_facts ?? {}) as Record<string, unknown>;
      if (includesText(String(facts.court_name ?? ""), signals.courtName)) {
        score += 20;
        break;
      }
    }
  }

  if (signals.filingParty || signals.opposingParty) {
    for (const doc of candidate.priorDocuments) {
      const facts = (doc.analysisJson?.extracted_facts ?? {}) as Record<string, unknown>;
      const filing = String(facts.filing_party ?? "");
      const opposing = String(facts.opposing_party ?? "");
      if (
        (signals.filingParty && (includesText(filing, signals.filingParty) || includesText(title, signals.filingParty))) ||
        (signals.opposingParty && (includesText(opposing, signals.opposingParty) || includesText(title, signals.opposingParty)))
      ) {
        score += 15;
        break;
      }
    }
  }

  if (signals.caseNumber) {
    for (const doc of candidate.priorDocuments) {
      const facts = (doc.analysisJson?.extracted_facts ?? {}) as Record<string, unknown>;
      if (includesText(String(facts.case_number ?? ""), signals.caseNumber)) {
        score += 35;
        break;
      }
    }
  }

  return Math.min(100, score);
}

export function decideCaseAssignment(
  signals: AssignmentSignals,
  candidates: AssignmentCandidate[],
): CaseAssignmentDecision {
  if (candidates.length === 0) {
    return {
      status: "unassigned",
      assignedCaseId: null,
      suggestedCaseId: null,
      confidenceScore: null,
      reason: "no_existing_cases",
      autoAssigned: false,
    };
  }

  if (candidates.length === 1) {
    return {
      status: "assigned",
      assignedCaseId: candidates[0].caseRecord.id,
      suggestedCaseId: null,
      confidenceScore: 100,
      reason: "single_case_default",
      autoAssigned: true,
    };
  }

  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(signals, candidate) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const next = scored[1];
  const hasHighConfidence = top.score >= 70 && (!next || top.score - next.score >= 20);

  if (hasHighConfidence) {
    return {
      status: "assigned",
      assignedCaseId: top.candidate.caseRecord.id,
      suggestedCaseId: null,
      confidenceScore: top.score,
      reason: "high_confidence_signal_match",
      autoAssigned: true,
    };
  }

  if (top.score >= 25) {
    return {
      status: "suggested",
      assignedCaseId: null,
      suggestedCaseId: top.candidate.caseRecord.id,
      confidenceScore: top.score,
      reason: "low_confidence_suggestion",
      autoAssigned: false,
    };
  }

  return {
    status: "unassigned",
    assignedCaseId: null,
    suggestedCaseId: null,
    confidenceScore: top.score,
    reason: "no_confident_match",
    autoAssigned: false,
  };
}
