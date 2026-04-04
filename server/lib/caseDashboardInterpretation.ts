export type InterpretableEventType = "hearing" | "filing" | "deadline" | "order" | "mediation" | "allegation" | "context";

export type InterpretableAlertKind = "missing_document" | "no_recent_activity" | "timeline_gap" | "overdue" | "analysis_missing";

function normalized(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Deterministic, neutral interpretation layer for dashboard events.
 * Returns a single sentence or null when no interpretation should be shown.
 */
export function eventWhyThisMatters(type: InterpretableEventType, label: string): string | null {
  const text = normalized(label);

  if (type === "hearing") {
    if (/\bfinal\b/.test(text)) return "Final-hearing outcomes often shape the longer-term case path.";
    if (/\bpretrial\b/.test(text)) return "Pretrial hearings often narrow the issues that move forward.";
    return "Court hearings often set or clarify the next case steps.";
  }

  if (type === "deadline") {
    if (/\bresponse\b|\breply\b/.test(text)) return "Response timing can affect what information the court reviews next.";
    return "Deadlines help keep the case timeline moving and organized.";
  }

  if (type === "mediation") {
    return "Mediation can influence whether contested issues proceed to more court time.";
  }

  return null;
}

/**
 * Deterministic, neutral impact text for dashboard alerts.
 */
export function alertImpactWhyThisMatters(kind: InterpretableAlertKind): string {
  if (kind === "missing_document") return "Missing core filings can limit visibility into deadlines and hearing context.";
  if (kind === "timeline_gap") return "Timeline gaps can hide upcoming obligations or unresolved milestones.";
  if (kind === "overdue") return "Missed or unclear outcomes can slow progress and create follow-up risk.";
  if (kind === "analysis_missing") return "Unanalyzed documents may contain dates or obligations that are easy to miss.";
  return "Limited activity can make near-term priorities harder to confirm.";
}
