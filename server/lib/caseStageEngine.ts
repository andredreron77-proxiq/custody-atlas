export type CaseStageId =
  | "intake"
  | "organizing"
  | "pre_hearing"
  | "hearing_imminent"
  | "awaiting_outcome"
  | "order_entered"
  | "follow_up";

export type CaseStageEventType = "hearing" | "filing" | "deadline" | "order" | "mediation" | "allegation" | "context";

export interface CaseStageEvent {
  normalizedType: CaseStageEventType;
  dateParsed: Date | null;
}

export interface CaseStageEngineInput {
  events: CaseStageEvent[];
  documentCount: number;
  hasOrderDocument: boolean;
  hasIncompleteDocumentAnalysis: boolean;
}

export interface CaseStageResult {
  id: CaseStageId;
  label: string;
  reason: string;
}

const DAY_MS = 86400000;

export const CASE_STAGE_LABELS: Record<CaseStageId, string> = {
  intake: "Early case setup",
  organizing: "Case organization in progress",
  pre_hearing: "Preparing for an upcoming court event",
  hearing_imminent: "Hearing preparation is active",
  awaiting_outcome: "Reviewing a recent court event",
  order_entered: "Order entered — follow-up may be needed",
  follow_up: "Monitoring next steps and ongoing obligations",
};

export const CASE_STAGE_PRIORITY: CaseStageId[] = [
  "hearing_imminent",
  "awaiting_outcome",
  "pre_hearing",
  "order_entered",
  "follow_up",
  "organizing",
  "intake",
];

function daysFromNow(date: Date, nowMs: number): number {
  return Math.ceil((date.getTime() - nowMs) / DAY_MS);
}

function latestDateMs(events: CaseStageEvent[]): number | null {
  const timestamps = events
    .map((event) => event.dateParsed?.getTime() ?? null)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (timestamps.length === 0) return null;
  return Math.max(...timestamps);
}

function findSoonestDays(events: CaseStageEvent[], type: CaseStageEventType, nowMs: number): number | null {
  const days = events
    .filter((event) => event.normalizedType === type && Boolean(event.dateParsed))
    .map((event) => daysFromNow(event.dateParsed as Date, nowMs))
    .filter((delta) => delta >= 0)
    .sort((a, b) => a - b);
  return days.length > 0 ? days[0] : null;
}

function findMostRecentPastDays(events: CaseStageEvent[], type: CaseStageEventType, nowMs: number): number | null {
  const daysAgo = events
    .filter((event) => event.normalizedType === type && Boolean(event.dateParsed))
    .map((event) => daysFromNow(event.dateParsed as Date, nowMs))
    .filter((delta) => delta < 0)
    .map((delta) => Math.abs(delta))
    .sort((a, b) => a - b);
  return daysAgo.length > 0 ? daysAgo[0] : null;
}

export function computeCaseStage(input: CaseStageEngineInput): CaseStageResult {
  const nowMs = Date.now();
  const upcomingHearingDays = findSoonestDays(input.events, "hearing", nowMs);
  const upcomingDeadlineDays = findSoonestDays(input.events, "deadline", nowMs);
  const recentPastHearingDays = findMostRecentPastDays(input.events, "hearing", nowMs);

  const orderEvents = input.events.filter((event) => event.normalizedType === "order");
  const hasOrderDetected = input.hasOrderDocument || orderEvents.length > 0;
  const latestOrderMs = latestDateMs(orderEvents);

  const recentHearingMs = latestDateMs(
    input.events.filter((event) => event.normalizedType === "hearing" && Boolean(event.dateParsed) && daysFromNow(event.dateParsed as Date, nowMs) < 0),
  );

  // 1) hearing_imminent
  if (upcomingHearingDays !== null && upcomingHearingDays <= 7) {
    return {
      id: "hearing_imminent",
      label: CASE_STAGE_LABELS.hearing_imminent,
      reason: `A hearing is scheduled within ${upcomingHearingDays} day${upcomingHearingDays === 1 ? "" : "s"}.`,
    };
  }

  // 2) awaiting_outcome
  const orderAfterRecentHearing = recentHearingMs !== null && latestOrderMs !== null && latestOrderMs >= recentHearingMs;
  if (recentPastHearingDays !== null && recentPastHearingDays <= 14 && !orderAfterRecentHearing) {
    return {
      id: "awaiting_outcome",
      label: CASE_STAGE_LABELS.awaiting_outcome,
      reason: `A hearing occurred ${recentPastHearingDays} day${recentPastHearingDays === 1 ? "" : "s"} ago and no later order is detected.`,
    };
  }

  // 3) pre_hearing
  if (upcomingHearingDays !== null && upcomingHearingDays > 7) {
    return {
      id: "pre_hearing",
      label: CASE_STAGE_LABELS.pre_hearing,
      reason: `The next hearing is in ${upcomingHearingDays} day${upcomingHearingDays === 1 ? "" : "s"}.`,
    };
  }

  // 4) order_entered
  if (hasOrderDetected) {
    return {
      id: "order_entered",
      label: CASE_STAGE_LABELS.order_entered,
      reason: "A court order is detected and no higher-priority hearing milestone is active.",
    };
  }

  // 5) follow_up
  if (upcomingDeadlineDays !== null && upcomingDeadlineDays <= 30) {
    return {
      id: "follow_up",
      label: CASE_STAGE_LABELS.follow_up,
      reason: `A deadline is approaching in ${upcomingDeadlineDays} day${upcomingDeadlineDays === 1 ? "" : "s"}.`,
    };
  }

  const timelineMaturity = input.events.length;
  const hasEnoughCaseData = input.documentCount >= 2 || timelineMaturity >= 3;
  if (hasEnoughCaseData && !input.hasIncompleteDocumentAnalysis) {
    return {
      id: "organizing",
      label: CASE_STAGE_LABELS.organizing,
      reason: "Case records are present with no urgent hearings, orders, or deadlines requiring immediate action.",
    };
  }

  return {
    id: "intake",
    label: CASE_STAGE_LABELS.intake,
    reason: "Only limited case records are available, so foundational setup is still in progress.",
  };
}

export const CASE_STAGE_RULES_EXPLANATION = [
  "Priority order: hearing_imminent > awaiting_outcome > pre_hearing > order_entered > follow_up > organizing > intake.",
  "hearing_imminent: hearing within 7 days.",
  "awaiting_outcome: hearing in the past 14 days with no later detected order.",
  "pre_hearing: hearing scheduled beyond 7 days.",
  "order_entered: order detected with no higher-priority active hearing milestone.",
  "follow_up: no higher-priority stage, but a deadline is due within 30 days.",
  "organizing: enough case data exists, without urgent milestone pressure.",
  "intake: minimal case data or analysis coverage.",
] as const;

export const CASE_STAGE_EXAMPLES = [
  {
    scenario: "Hearing in 4 days",
    output: { id: "hearing_imminent", label: CASE_STAGE_LABELS.hearing_imminent },
  },
  {
    scenario: "Hearing 5 days ago, no order after hearing",
    output: { id: "awaiting_outcome", label: CASE_STAGE_LABELS.awaiting_outcome },
  },
  {
    scenario: "Hearing in 21 days",
    output: { id: "pre_hearing", label: CASE_STAGE_LABELS.pre_hearing },
  },
  {
    scenario: "Order detected, no near hearing",
    output: { id: "order_entered", label: CASE_STAGE_LABELS.order_entered },
  },
  {
    scenario: "No hearing/order, deadline in 12 days",
    output: { id: "follow_up", label: CASE_STAGE_LABELS.follow_up },
  },
  {
    scenario: "2+ documents and mature timeline, no urgent milestones",
    output: { id: "organizing", label: CASE_STAGE_LABELS.organizing },
  },
  {
    scenario: "No documents and sparse timeline",
    output: { id: "intake", label: CASE_STAGE_LABELS.intake },
  },
] as const;
