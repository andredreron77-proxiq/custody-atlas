export type CaseRiskLevel = "Low" | "Moderate" | "Elevated" | "High";

export interface CaseRiskInputs {
  hasOverdueItems: boolean;
  upcomingHearingDays: number | null;
  upcomingDeadlineDays: number | null;
  hasMissingKeyDocuments: boolean;
  hasConflictingTimelineEvents: boolean;
  daysSinceLastActivity: number | null;
}

export interface CaseRiskScoreResult {
  riskScore: number;
  riskLevel: CaseRiskLevel;
  appliedSignals: {
    overdueItems: boolean;
    hearingWithinSevenDays: boolean;
    deadlineWithinSevenDays: boolean;
    missingKeyDocuments: boolean;
    conflictingTimelineEvents: boolean;
    inactivityMoreThanFourteenDays: boolean;
  };
}

/**
 * Deterministic case risk scoring model for the dashboard.
 * Rules:
 * - overdue items: +40
 * - hearing within 7 days: +25
 * - deadline within 7 days: +20
 * - missing key docs: +15
 * - conflicting timeline events: +10
 * - inactivity > 14 days: +10
 * - capped at 100
 */
export function computeCaseRiskScore(inputs: CaseRiskInputs): CaseRiskScoreResult {
  const hearingWithinSevenDays = inputs.upcomingHearingDays !== null && inputs.upcomingHearingDays <= 7;
  const deadlineWithinSevenDays = inputs.upcomingDeadlineDays !== null && inputs.upcomingDeadlineDays <= 7;
  const inactivityMoreThanFourteenDays = inputs.daysSinceLastActivity !== null && inputs.daysSinceLastActivity > 14;

  const rawScore =
    (inputs.hasOverdueItems ? 40 : 0) +
    (hearingWithinSevenDays ? 25 : 0) +
    (deadlineWithinSevenDays ? 20 : 0) +
    (inputs.hasMissingKeyDocuments ? 15 : 0) +
    (inputs.hasConflictingTimelineEvents ? 10 : 0) +
    (inactivityMoreThanFourteenDays ? 10 : 0);

  const riskScore = Math.min(100, rawScore);
  const riskLevel = mapCaseRiskLevel(riskScore);

  return {
    riskScore,
    riskLevel,
    appliedSignals: {
      overdueItems: inputs.hasOverdueItems,
      hearingWithinSevenDays,
      deadlineWithinSevenDays,
      missingKeyDocuments: inputs.hasMissingKeyDocuments,
      conflictingTimelineEvents: inputs.hasConflictingTimelineEvents,
      inactivityMoreThanFourteenDays,
    },
  };
}

export function mapCaseRiskLevel(riskScore: number): CaseRiskLevel {
  if (riskScore >= 70) return "High";
  if (riskScore >= 40) return "Elevated";
  if (riskScore >= 20) return "Moderate";
  return "Low";
}

/**
 * Deterministic conflict check:
 * a date is considered conflicting when two or more hearing/deadline events
 * on the same day have different normalized labels.
 */
export function hasConflictingTimelineEvents(
  events: Array<{ dateRaw: string | Date; normalizedType: string; normalizedLabel: string }>,
): boolean {
  const byDate = new Map<string, string[]>();

  for (const event of events) {
    if (event.normalizedType !== "hearing" && event.normalizedType !== "deadline") continue;
    const date = String(event.dateRaw ?? "").trim();
    if (!date) continue;
    const labels = byDate.get(date) ?? [];
    labels.push(event.normalizedLabel.trim().toLowerCase());
    byDate.set(date, labels);
  }

  let hasConflict = false;
  byDate.forEach((labels) => {
    const uniqueLabels = new Set(labels.filter(Boolean));
    if (uniqueLabels.size >= 2) hasConflict = true;
  });

  return hasConflict;
}
