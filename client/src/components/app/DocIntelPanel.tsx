/**
 * DocIntelPanel — surfaces extracted document intelligence in the UI
 * without requiring the user to ask a question first.
 *
 * Used by both WorkspacePage (DocumentsSection) and CaseDashboardPage (DocumentsPanel).
 *
 * Sub-components:
 *   DocFactChips          — compact chips for court_name, hearing_date, case_number
 *   DocKeyDatesRow        — shows 1–3 key_dates from analysis, with "No dates found" fallback
 *   DocObligationBadge    — colored pills: "Upcoming hearing", "Response may be required", "Time-sensitive item found"
 *   DocImplicationsSection — 1–3 bullets from possible_implications[]
 *   DocActionInsight      — one deterministic action sentence from doc_type + key signals
 *   DocQuickActions       — "View key dates", "Summarize", "Find deadlines" → Ask Atlas
 *   DocSummaryLine        — first sentence of summary (utility, available for use anywhere)
 *
 * All sub-components return null when the data they need isn't available,
 * so callers don't need to guard before rendering them.
 */

import { Link } from "wouter";
import {
  Calendar, Building2, Hash, Clock,
  Sparkles, Search, BookOpen,
  AlertCircle, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { classifyDateStatus } from "@shared/dateStatus";

/* ── Types ────────────────────────────────────────────────────────────────── */

interface ExtractedFacts {
  document_title?: string | null;
  document_type?: string | null;
  case_number?: string | null;
  court_name?: string | null;
  court_address?: string | null;
  judge_name?: string | null;
  hearing_date?: string | null;
  filing_date?: string | null;
  effective_date?: string | null;
  filing_party?: string | null;
  opposing_party?: string | null;
}

export interface DocAnalysis {
  document_type?: string | null;
  summary?: string | null;
  key_dates?: string[];
  extracted_facts?: ExtractedFacts;
  important_terms?: string[];
  possible_implications?: string[];
}

/**
 * Parse the raw analysisJson into typed DocAnalysis.
 * Safe to call with an empty object — all fields optional.
 */
export function parseDocAnalysis(analysisJson: Record<string, unknown>): DocAnalysis {
  return {
    document_type:   (analysisJson.document_type as string | undefined) ?? null,
    summary:         (analysisJson.summary as string | undefined) ?? null,
    key_dates:       Array.isArray(analysisJson.key_dates) ? (analysisJson.key_dates as string[]) : [],
    extracted_facts: (analysisJson.extracted_facts as ExtractedFacts | undefined) ?? {},
    important_terms: Array.isArray(analysisJson.important_terms) ? (analysisJson.important_terms as string[]) : [],
    possible_implications: Array.isArray(analysisJson.possible_implications) ? (analysisJson.possible_implications as string[]) : [],
  };
}

/** True when any meaningful analysis data is present. */
export function hasAnalysis(analysisJson: Record<string, unknown>): boolean {
  return Object.keys(analysisJson).length > 0;
}

/* ── DocFactChips ─────────────────────────────────────────────────────────── */

/**
 * Renders a compact row of fact chips from extracted_facts.
 * Shows hearing_date, court_name, case_number — only the ones that exist.
 * Returns null if none of the three are populated.
 */
export function DocFactChips({
  analysisJson,
  className = "",
}: {
  analysisJson: Record<string, unknown>;
  className?: string;
}) {
  const { extracted_facts: ef } = parseDocAnalysis(analysisJson);
  if (!ef) return null;

  const items: Array<{ icon: typeof Calendar; label: string; value: string }> = [];

  if (ef.hearing_date) {
    items.push({ icon: Calendar, label: "Hearing", value: ef.hearing_date });
  }
  if (ef.court_name) {
    const name = ef.court_name.length > 30 ? ef.court_name.slice(0, 28) + "…" : ef.court_name;
    items.push({ icon: Building2, label: "Court", value: name });
  }
  if (ef.case_number) {
    items.push({ icon: Hash, label: "Case", value: ef.case_number });
  }

  if (items.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 ${className}`} data-testid="doc-fact-chips">
      {items.map(({ icon: Icon, label, value }) => (
        <span key={label} className="flex items-center gap-1 text-[10px] text-muted-foreground leading-4">
          <Icon className="w-3 h-3 flex-shrink-0 text-muted-foreground/60" />
          <span className="font-medium text-foreground/70">{label}:</span>
          <span>{value}</span>
        </span>
      ))}
    </div>
  );
}

/* ── DocKeyDatesRow ───────────────────────────────────────────────────────── */

/**
 * Shows the first 1–2 key_dates strings from analysisJson.
 * Shows "No dates found in this document" when key_dates is an empty array.
 * Returns null if the document has not been analyzed yet.
 */
export function DocKeyDatesRow({
  analysisJson,
  maxDates = 2,
  className = "",
}: {
  analysisJson: Record<string, unknown>;
  maxDates?: number;
  className?: string;
}) {
  if (!hasAnalysis(analysisJson)) return null;

  const { key_dates } = parseDocAnalysis(analysisJson);

  if (!Array.isArray(key_dates)) return null;

  if (key_dates.length === 0) {
    return (
      <p className={`flex items-center gap-1.5 text-[10px] text-muted-foreground/60 italic ${className}`} data-testid="doc-no-dates">
        <Clock className="w-3 h-3 flex-shrink-0" />
        No dates found in this document
      </p>
    );
  }

  const shown = key_dates.slice(0, maxDates);
  const remaining = key_dates.length - shown.length;

  return (
    <div className={`space-y-0.5 ${className}`} data-testid="doc-key-dates">
      {shown.map((date, i) => (
        <p key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground leading-4">
          <Clock className="w-3 h-3 flex-shrink-0 text-muted-foreground/50" />
          <span className="truncate">{date}</span>
        </p>
      ))}
      {remaining > 0 && (
        <p className="text-[10px] text-muted-foreground/60 pl-4.5">+{remaining} more date{remaining > 1 ? "s" : ""}</p>
      )}
    </div>
  );
}

/* ── DocObligationBadge ───────────────────────────────────────────────────── */

type ObligationVariant = "hearing" | "deadline" | "timelimit" | "historical";

type ObligationItem = {
  label: string;
  variant: ObligationVariant;
};

export function deriveObligations(analysis: DocAnalysis): ObligationItem[] {
  const obligations: ObligationItem[] = [];
  const ef = analysis.extracted_facts ?? {};
  const keyDates = (analysis.key_dates ?? []).map(d => d.toLowerCase());
  const implications = (analysis.possible_implications ?? []).map(i => i.toLowerCase());

  // Explicit hearing date in structured extraction → highest priority signal
  if (ef.hearing_date) {
    const hearingStatus = classifyDateStatus(ef.hearing_date);
    if (hearingStatus === "upcoming" || hearingStatus === "today") {
      obligations.push({ label: hearingStatus === "today" ? "Hearing today" : "Upcoming hearing", variant: "hearing" });
    } else if (hearingStatus === "past") {
      obligations.push({ label: "Past hearing", variant: "historical" });
    }
  } else if (keyDates.some(d => d.includes("hearing"))) {
    obligations.push({ label: "Upcoming hearing", variant: "hearing" });
  }

  if (obligations.length < 2 && ef.filing_date && classifyDateStatus(ef.filing_date) === "past") {
    obligations.push({ label: "Historical filing date", variant: "historical" });
  }

  // Response / answer deadline in key dates
  const deadlineKws = ["deadline", "respond", "response", "due by", "file by", "serve by", "object", "answer"];
  if (keyDates.some(d => deadlineKws.some(kw => d.includes(kw)))) {
    obligations.push({ label: "Response may be required", variant: "deadline" });
  }

  // Compliance / urgency signals in key dates or implications (max 2 total badges)
  if (obligations.length < 2) {
    const urgentKws = ["compli", "mandatory", "required within", "time-sensitive", "immediately", "promptly"];
    const hasUrgent =
      keyDates.some(d => urgentKws.some(kw => d.includes(kw))) ||
      implications.some(i => urgentKws.some(kw => i.includes(kw)));
    if (hasUrgent) {
      obligations.push({ label: "Time-sensitive item found", variant: "timelimit" });
    }
  }

  return obligations.slice(0, 2);
}

/**
 * Colored obligation pills derived entirely from existing analysisJson data.
 * No LLM calls. Returns null when no obligation signals are found.
 *
 * Signals checked (in priority order):
 *   1. extracted_facts.hearing_date → "Upcoming hearing" (orange)
 *   2. key_dates[] contains deadline/response keywords → "Response may be required" (amber)
 *   3. key_dates[] or possible_implications[] contains compliance/urgency keywords → "Time-sensitive item found" (amber)
 */
export function DocObligationBadge({
  analysisJson,
  className = "",
}: {
  analysisJson: Record<string, unknown>;
  className?: string;
}) {
  if (!hasAnalysis(analysisJson)) return null;
  const analysis = parseDocAnalysis(analysisJson);
  const obligations = deriveObligations(analysis);
  if (obligations.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1", className)}
      data-testid="doc-obligation-badges"
    >
      {obligations.map(({ label, variant }) => (
        <span
          key={label}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-4",
            variant === "hearing"
              ? "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400"
              : variant === "historical"
                ? "bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
          )}
          data-testid={`badge-obligation-${variant}`}
        >
          <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />
          {label}
        </span>
      ))}
    </div>
  );
}

/* ── DocImplicationsSection ───────────────────────────────────────────────── */

/**
 * Shows 1–3 bullets from possible_implications[].
 * Each bullet comes directly from the AI's analysis — already written in
 * hedged, plain-English language ("This may mean…", "You may need to…").
 * Returns null when no implications are available.
 */
export function DocImplicationsSection({
  analysisJson,
  maxItems = 3,
  className = "",
}: {
  analysisJson: Record<string, unknown>;
  maxItems?: number;
  className?: string;
}) {
  if (!hasAnalysis(analysisJson)) return null;
  const { possible_implications } = parseDocAnalysis(analysisJson);
  if (!possible_implications || possible_implications.length === 0) return null;

  const shown = possible_implications.slice(0, maxItems);

  return (
    <div className={cn("space-y-0.5", className)} data-testid="doc-implications">
      <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
        What this may require
      </p>
      {shown.map((impl, i) => (
        <p
          key={i}
          className="flex items-start gap-1 text-[10px] text-muted-foreground leading-[1.45]"
        >
          <span className="flex-shrink-0 leading-4 text-muted-foreground/50">·</span>
          <span className="line-clamp-2">{impl}</span>
        </p>
      ))}
    </div>
  );
}

/* ── DocActionInsight ─────────────────────────────────────────────────────── */

export function deriveActionInsight(analysis: DocAnalysis, docType?: string): string | null {
  const ef = analysis.extracted_facts ?? {};
  const keyDates = (analysis.key_dates ?? []).map(d => d.toLowerCase());

  const hasHearing =
    !!ef.hearing_date ||
    keyDates.some(d => d.includes("hearing"));

  const hasDeadline =
    keyDates.some(d => /deadline|respond|response|due by|file by|serve by/i.test(d));

  // Derive type from docType prop first, then fall back to extracted document_type
  const type = (docType ?? analysis.document_type ?? "").toLowerCase();

  // Most specific first: hearing with a known date
  if (hasHearing && ef.hearing_date) {
    const hearingStatus = classifyDateStatus(ef.hearing_date);
    if (hearingStatus === "upcoming" || hearingStatus === "today") {
      return hearingStatus === "today"
        ? `Hearing is scheduled for today (${ef.hearing_date}) — prepare now and confirm logistics`
        : `You may need to prepare for a hearing on ${ef.hearing_date}`;
    }
    if (hearingStatus === "past") {
      return `Past hearing date detected (${ef.hearing_date}). This hearing appears to have already occurred — review related orders, outcomes, or follow-up deadlines`;
    }
  }
  if (hasHearing) {
    return "You may need to prepare for an upcoming court hearing";
  }
  if (hasDeadline) {
    return "You may need to review the response timing for this document";
  }
  if (type.includes("custody_order") || type.includes("order")) {
    return "You may want to confirm how this order affects your current arrangement";
  }
  if (type.includes("communication")) {
    return "You may want to review this communication with your attorney";
  }
  if (type.includes("financial")) {
    return "You may need to review or respond to this financial document";
  }

  // Generic fallback when facts are present but nothing specific triggered
  const hasSomeFacts = Object.values(ef).some(v => v != null && v !== "");
  if (hasSomeFacts) {
    return "You may want to discuss this document with your attorney";
  }

  return null;
}

/**
 * One deterministic action sentence derived from existing analysisJson data.
 * Uses hedged language: "You may need to…", "You may want to…"
 * No LLM call. Returns null if no useful signal exists.
 *
 * @param docType  Optional document type string ("custody_order", "financial", etc.)
 *                 — used to supplement analysis.document_type when available.
 */
export function DocActionInsight({
  analysisJson,
  docType,
  className = "",
}: {
  analysisJson: Record<string, unknown>;
  docType?: string;
  className?: string;
}) {
  if (!hasAnalysis(analysisJson)) return null;
  const analysis = parseDocAnalysis(analysisJson);
  const insight = deriveActionInsight(analysis, docType);
  if (!insight) return null;

  return (
    <p
      className={cn(
        "flex items-start gap-1 text-[10px] text-muted-foreground italic leading-[1.45]",
        className,
      )}
      data-testid="doc-action-insight"
    >
      <ChevronRight className="w-3 h-3 flex-shrink-0 mt-px text-muted-foreground/50" />
      <span>{insight}</span>
    </p>
  );
}

/* ── DocQuickActions ──────────────────────────────────────────────────────── */

const QUICK_ACTIONS = [
  {
    id: "key-dates",
    icon: Clock,
    label: "Key dates",
    question: "What are all the key dates, deadlines, and important dates in this document?",
    testIdSuffix: "key-dates",
  },
  {
    id: "summarize",
    icon: BookOpen,
    label: "Summarize",
    question: "Summarize this document in plain English. What does it say and what does it mean for me?",
    testIdSuffix: "summarize",
  },
  {
    id: "deadlines",
    icon: Search,
    label: "Find deadlines",
    question: "What response deadlines, compliance dates, or time-sensitive requirements are in this document?",
    testIdSuffix: "deadlines",
  },
] as const;

/**
 * Three compact quick-action buttons that open Ask Atlas pre-scoped to the document.
 * Only rendered when the document has been analyzed (analysisJson non-empty).
 */
export function DocQuickActions({
  analysisJson,
  askBasePath,
  docId,
  className = "",
}: {
  analysisJson: Record<string, unknown>;
  askBasePath: string;
  docId: string;
  className?: string;
}) {
  if (!hasAnalysis(analysisJson)) return null;

  const sep = askBasePath.includes("?") ? "&" : "?";

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`} data-testid={`doc-quick-actions-${docId}`}>
      {QUICK_ACTIONS.map(({ id, icon: Icon, label, question, testIdSuffix }) => {
        const href = `${askBasePath}${sep}document=${encodeURIComponent(docId)}&q=${encodeURIComponent(question)}`;
        return (
          <Link key={id} href={href}>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1 border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              data-testid={`btn-doc-${testIdSuffix}-${docId}`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </Button>
          </Link>
        );
      })}
    </div>
  );
}

/* ── DocSummaryLine ───────────────────────────────────────────────────────── */

/**
 * Shows the first sentence of the document summary, truncated.
 * Returns null if no summary is available.
 */
export function DocSummaryLine({
  analysisJson,
  maxChars = 120,
  className = "",
}: {
  analysisJson: Record<string, unknown>;
  maxChars?: number;
  className?: string;
}) {
  if (!hasAnalysis(analysisJson)) return null;
  const { summary } = parseDocAnalysis(analysisJson);
  if (!summary) return null;

  const firstSentence = summary.split(/(?<=[.!?])\s/)[0] ?? summary;
  const display = firstSentence.length > maxChars
    ? firstSentence.slice(0, maxChars - 1) + "…"
    : firstSentence;

  return (
    <p className={`text-[10px] text-muted-foreground leading-4 ${className}`} data-testid="doc-summary-line">
      {display}
    </p>
  );
}
