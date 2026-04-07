export type RiskSeverity = "low" | "medium" | "high";

export interface NormalizedIntelligenceDate {
  documentId: string;
  raw: string;
  parsedDate: string | null;
  kind: "hearing" | "deadline" | "other";
}

export interface NormalizedIntelligenceData {
  facts: Record<string, string[]>;
  keyDates: NormalizedIntelligenceDate[];
  documentTypes: string[];
  implications: string[];
}

export interface RiskSignal {
  id: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  trigger_reason: string;
}

export interface RiskEngineContext {
  normalized: NormalizedIntelligenceData;
  documents: Array<{
    id: string;
    createdAt: string;
    summary: string;
    documentType: string;
    extractedFacts: Record<string, unknown>;
    implications: string[];
  }>;
}

function textIncludes(text: string, words: string[]): boolean {
  const value = text.toLowerCase();
  return words.some((word) => value.includes(word));
}

function toTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function daysFromNow(iso: string | null): number | null {
  const ts = toTimestamp(iso);
  if (ts === null) return null;
  const diff = ts - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function hasOrderDocument(documentTypes: string[]): boolean {
  return documentTypes.some((value) => {
    const lower = value.toLowerCase();
    return lower.includes("order") || lower.includes("judgment") || lower.includes("decree");
  });
}

function hasMotionDocument(documentTypes: string[], summaries: string[]): boolean {
  if (documentTypes.some((value) => value.toLowerCase().includes("motion"))) return true;
  return summaries.some((summary) => textIncludes(summary, [" motion ", "motion to", "motion for"]));
}

function hasResponseDocument(documentTypes: string[], summaries: string[]): boolean {
  if (documentTypes.some((value) => textIncludes(value, ["response", "reply", "opposition"]))) return true;
  return summaries.some((summary) => textIncludes(summary, ["response", "reply", "opposition"]));
}

export function evaluateRisks(context: RiskEngineContext): RiskSignal[] {
  const risks: RiskSignal[] = [];
  const summaries = context.documents.map((doc) => doc.summary.toLowerCase());
  const allText = [
    ...summaries,
    ...context.normalized.implications.map((value) => value.toLowerCase()),
    ...Object.values(context.normalized.facts).flat().map((value) => value.toLowerCase()),
  ].join(" \n");

  const hearingSoon = context.normalized.keyDates
    .filter((entry) => entry.kind === "hearing")
    .map((entry) => ({ entry, daysAway: daysFromNow(entry.parsedDate) }))
    .find((item) => item.daysAway !== null && item.daysAway >= 0 && item.daysAway <= 14);

  if (hearingSoon) {
    risks.push({
      id: "upcoming_hearing_14_days",
      title: "Hearing coming soon",
      description: "You have a court date coming soon.",
      severity: "high",
      trigger_reason: `A hearing date is within ${hearingSoon.daysAway} day(s).`,
    });
  }

  const deadlineSoon = context.normalized.keyDates
    .filter((entry) => entry.kind === "deadline")
    .map((entry) => ({ entry, daysAway: daysFromNow(entry.parsedDate) }))
    .find((item) => item.daysAway !== null && item.daysAway >= 0 && item.daysAway <= 7);

  if (deadlineSoon) {
    risks.push({
      id: "deadline_7_days",
      title: "Deadline very close",
      description: "A court deadline is very close.",
      severity: "high",
      trigger_reason: `A deadline is within ${deadlineSoon.daysAway} day(s).`,
    });
  }

  const hasOrder = hasOrderDocument(context.normalized.documentTypes) || textIncludes(allText, ["court ordered", "ordered that", "court order"]);
  if (hasOrder) {
    const obligationSignals = ["must", "shall", "required", "obligation", "complete", "pay", "exchange", "attend", "submit"];
    if (textIncludes(allText, obligationSignals)) {
      risks.push({
        id: "court_order_obligations",
        title: "Court order has duties",
        description: "A court order says there are things you must do.",
        severity: "high",
        trigger_reason: "Order-like documents include obligation language.",
      });
    }
  }

  const hasMotion = hasMotionDocument(context.normalized.documentTypes, summaries);
  const hasResponse = hasResponseDocument(context.normalized.documentTypes, summaries);
  if (hasMotion && !hasResponse) {
    risks.push({
      id: "motion_without_response",
      title: "Motion may need a response",
      description: "A motion appears in your case, but no response was found.",
      severity: "medium",
      trigger_reason: "Motion-related document found without a matching response document.",
    });
  }

  if (textIncludes(allText, ["relocation", "move away", "move out of state", "change residence"])) {
    risks.push({
      id: "relocation_mentioned",
      title: "Relocation is mentioned",
      description: "Someone may be planning to move, which can affect parenting time.",
      severity: "medium",
      trigger_reason: "Relocation language detected in summaries, facts, or implications.",
    });
  }

  if (textIncludes(allText, ["supervised visitation", "supervised parenting time", "supervised visits"])) {
    risks.push({
      id: "supervised_visitation",
      title: "Supervised visits are mentioned",
      description: "Supervised visitation may be part of this case.",
      severity: "high",
      trigger_reason: "Supervised visitation language detected in extracted data.",
    });
  }

  if (context.documents.length > 0) {
    const latestActivity = context.documents.reduce<number | null>((latest, doc) => {
      const ts = toTimestamp(doc.createdAt);
      if (ts === null) return latest;
      if (latest === null) return ts;
      return Math.max(latest, ts);
    }, null);

    if (latestActivity !== null) {
      const days = Math.floor((Date.now() - latestActivity) / (1000 * 60 * 60 * 24));
      if (days >= 30) {
        risks.push({
          id: "no_activity_30_days",
          title: "No recent case activity",
          description: "Your case has had no new document activity for over 30 days.",
          severity: "low",
          trigger_reason: `${days} day(s) since the last document was added.`,
        });
      }
    }
  }

  if (hasOrder) {
    const hasHearingDetail = context.normalized.keyDates.some((entry) => entry.kind === "hearing")
      || textIncludes(allText, ["hearing date", "hearing time", "courtroom", "department"]);

    if (!hasHearingDetail) {
      risks.push({
        id: "missing_hearing_details",
        title: "Missing hearing details",
        description: "There is an order, but hearing details are missing.",
        severity: "medium",
        trigger_reason: "Order detected without clear hearing date/time/location information.",
      });
    }
  }

  return risks;
}
