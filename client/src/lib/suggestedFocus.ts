export type FocusActionType = "navigate" | "upload" | "create_event" | "ask_atlas" | "review_alert";

export type SuggestedFocusItem = {
  title: string;
  description: string;
  actionType: FocusActionType;
  actionTarget: string;
  priority: "high" | "medium" | "low";
};

export type FocusAlert = {
  id: string;
  kind: "missing_document" | "overdue_event" | "upcoming_deadline" | "conflict_detected" | "incomplete_case";
  severity: "high" | "medium" | "info";
  state: "active" | "reviewed" | "resolved" | "dismissed" | "reopened";
  relatedItem: string;
  title: string;
};

export type FocusTimelineItem = {
  id: string;
  date: string;
  label: string;
  type: "hearing" | "filing" | "deadline" | "order" | "mediation";
  status: "past" | "upcoming" | "overdue" | "future";
};

export type FocusEngineInput = {
  alerts: FocusAlert[];
  riskScore: number;
  immediateConcern?: string;
  hearingDaysUntil: number | null;
  deadlineDaysUntil: number | null;
  documentCompleteness: "Strong" | "Partial" | "Needs review" | "Not yet uploaded";
  timeline: FocusTimelineItem[];
};

function normalizeRiskFactor(input?: string): string {
  const normalized = (input ?? "").trim();
  return normalized || "case stability factors";
}

function mapAlertToFocus(alert: FocusAlert): SuggestedFocusItem {
  if (alert.kind === "missing_document") {
    return {
      title: "Resolve a missing document alert",
      description: `Upload or verify ${alert.relatedItem || "the requested document"} to strengthen your case.`,
      actionType: "upload",
      actionTarget: alert.id,
      priority: "high",
    };
  }

  if (alert.kind === "overdue_event") {
    return {
      title: "Document your recent court event",
      description: "Review and document the outcome of your recent court event.",
      actionType: "create_event",
      actionTarget: alert.id,
      priority: "high",
    };
  }

  if (alert.kind === "conflict_detected") {
    return {
      title: "Fix a timeline conflict",
      description: "Resolve conflicting dates to ensure your case timeline is accurate.",
      actionType: "review_alert",
      actionTarget: alert.id,
      priority: "high",
    };
  }

  if (alert.kind === "upcoming_deadline") {
    return {
      title: "Review your upcoming deadline",
      description: `Prioritize ${alert.relatedItem || "the next deadline"} and confirm filings are prepared.`,
      actionType: "navigate",
      actionTarget: "timeline",
      priority: "high",
    };
  }

  return {
    title: "Complete missing case details",
    description: "Fill in incomplete case information so your timeline and risk posture stay accurate.",
    actionType: "ask_atlas",
    actionTarget: "case-details",
    priority: "high",
  };
}

function getNextDaysUntil(timeline: FocusTimelineItem[], type: "hearing" | "deadline"): number | null {
  const now = new Date();
  const candidates = timeline
    .filter((item) => item.type === type)
    .map((item) => new Date(item.date))
    .filter((date) => !Number.isNaN(date.getTime()))
    .map((date) => Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    .filter((days) => days >= 0)
    .sort((a, b) => a - b);

  return candidates.length > 0 ? candidates[0] : null;
}

export function generateSuggestedFocus(input: FocusEngineInput): SuggestedFocusItem {
  const hasOverdueItems = input.timeline.some((item) => item.status === "overdue");
  if (hasOverdueItems) {
    return {
      title: "Resolve overdue court item",
      description: "A past-due court item requires immediate attention. Review and update this item before proceeding.",
      actionType: "review_alert",
      actionTarget: "overdue_item",
      priority: "high",
    };
  }

  const activeHighAlerts = input.alerts.filter((alert) => alert.state === "active" && alert.severity === "high");
  if (activeHighAlerts.length > 0) {
    return mapAlertToFocus(activeHighAlerts[0]);
  }

  if (input.riskScore >= 70) {
    const factor = normalizeRiskFactor(input.immediateConcern);
    return {
      title: "Reduce your highest risk factor",
      description: `Your risk score is elevated. Address ${factor} first to improve case posture.`,
      actionType: "ask_atlas",
      actionTarget: "risk-factor",
      priority: "high",
    };
  }

  const hearingDays = input.hearingDaysUntil ?? getNextDaysUntil(input.timeline, "hearing");
  if (hearingDays !== null && hearingDays <= 7) {
    return {
      title: "Prepare for your upcoming hearing",
      description: `A hearing is in ${hearingDays} day${hearingDays === 1 ? "" : "s"}. Finalize exhibits, notes, and key talking points now.`,
      actionType: "navigate",
      actionTarget: "timeline",
      priority: "medium",
    };
  }

  if (input.documentCompleteness !== "Strong") {
    return {
      title: "Complete key case documents",
      description: "Your document set is incomplete. Upload missing records to strengthen your position.",
      actionType: "upload",
      actionTarget: "documents",
      priority: "medium",
    };
  }

  const deadlineDays = input.deadlineDaysUntil ?? getNextDaysUntil(input.timeline, "deadline");
  if (deadlineDays !== null && deadlineDays <= 10) {
    return {
      title: "Review the next deadline",
      description: `Your next deadline is in ${deadlineDays} day${deadlineDays === 1 ? "" : "s"}. Confirm all required filings are on track.`,
      actionType: "navigate",
      actionTarget: "timeline",
      priority: "medium",
    };
  }

  return {
    title: "Review your timeline for updates",
    description: "No urgent blockers detected. Review your timeline to keep facts and dates current.",
    actionType: "navigate",
    actionTarget: "timeline",
    priority: "low",
  };
}
