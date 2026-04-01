export type CaseActivityState =
  | "loading"
  | "empty"
  | "documents_only"
  | "analyzed_no_questions"
  | "active_attention"
  | "active_case";

export interface CaseActivityInput {
  isLoading: boolean;
  documentCount: number;
  analyzedDocumentCount: number;
  questionCount: number;
  latestActivityIso: string | null;
  unresolvedRiskCount?: number;
  unresolvedActionCount?: number;
}

export interface CaseActivityDerived {
  state: CaseActivityState;
  hasActivity: boolean;
  isContinuation: boolean;
  latestActivityIso: string | null;
  unresolvedRiskCount: number;
  unresolvedActionCount: number;
}

export function deriveCaseActivityState(input: CaseActivityInput): CaseActivityDerived {
  const unresolvedRiskCount = Math.max(0, input.unresolvedRiskCount ?? 0);
  const unresolvedActionCount = Math.max(0, input.unresolvedActionCount ?? 0);
  const hasUnresolvedItems = unresolvedRiskCount > 0 || unresolvedActionCount > 0;

  if (input.isLoading) {
    return {
      state: "loading",
      hasActivity: false,
      isContinuation: false,
      latestActivityIso: input.latestActivityIso,
      unresolvedRiskCount,
      unresolvedActionCount,
    };
  }

  if (input.questionCount > 0) {
    return {
      state: hasUnresolvedItems ? "active_attention" : "active_case",
      hasActivity: true,
      isContinuation: true,
      latestActivityIso: input.latestActivityIso,
      unresolvedRiskCount,
      unresolvedActionCount,
    };
  }

  if (input.analyzedDocumentCount > 0) {
    return {
      state: "analyzed_no_questions",
      hasActivity: true,
      isContinuation: false,
      latestActivityIso: input.latestActivityIso,
      unresolvedRiskCount,
      unresolvedActionCount,
    };
  }

  if (input.documentCount > 0) {
    return {
      state: "documents_only",
      hasActivity: true,
      isContinuation: false,
      latestActivityIso: input.latestActivityIso,
      unresolvedRiskCount,
      unresolvedActionCount,
    };
  }

  return {
    state: "empty",
    hasActivity: false,
    isContinuation: false,
    latestActivityIso: input.latestActivityIso,
    unresolvedRiskCount,
    unresolvedActionCount,
  };
}
