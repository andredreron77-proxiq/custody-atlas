import type { GeneratedAction } from "./actionGenerator";
import type { RiskSignal, RiskSeverity } from "./riskEngine";

export interface WhatMattersNow {
  top_priority: string;
  reason: string;
  urgency: RiskSeverity;
}

const severityRank: Record<RiskSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function pickWhatMattersNow(risks: RiskSignal[]): WhatMattersNow {
  if (risks.length === 0) {
    return {
      top_priority: "No urgent issues right now.",
      reason: "Keep your documents organized and stay prepared.",
      urgency: "low",
    };
  }

  const top = [...risks].sort((a, b) => severityRank[b.severity] - severityRank[a.severity])[0];
  return {
    top_priority: top.title,
    reason: top.description,
    urgency: top.severity,
  };
}

export function renderSummary(risks: RiskSignal[], actions: GeneratedAction[], documentCount: number): string {
  if (risks.length === 0) {
    return "No urgent issues right now. Keep your documents organized and stay prepared.";
  }

  const top = pickWhatMattersNow(risks);
  const firstAction = actions[0]?.action;
  const docSentence = documentCount > 0
    ? `I reviewed ${documentCount} case document${documentCount === 1 ? "" : "s"}.`
    : "I could not find case documents yet.";

  return [
    docSentence,
    `${top.reason}`,
    firstAction ?? "Take the next step now to stay on track.",
  ].join(" ");
}
