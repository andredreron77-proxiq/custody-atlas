/**
 * DocIntelPanel — surfaces extracted document intelligence in the UI
 * without requiring the user to ask a question first.
 *
 * Used by both WorkspacePage (DocumentsSection) and CaseDashboardPage (DocumentsPanel).
 *
 * Three sub-components:
 *   DocFactChips      — compact chips for court_name, hearing_date, case_number
 *   DocKeyDatesRow    — shows 1–3 key_dates from analysis, with "No dates found" fallback
 *   DocQuickActions   — "View key dates", "Summarize", "Find deadlines" → Ask Atlas
 *
 * All sub-components return null when the data they need isn't available,
 * so callers don't need to guard before rendering them.
 */

import { Link } from "wouter";
import { Calendar, Building2, Hash, Clock, Sparkles, Search, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    // Truncate long court names so the chip stays compact
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
 * Shows "No dates found in this document" when key_dates is an empty array
 * (i.e. the document was analyzed but no dates were extracted).
 * Returns null if the document has not been analyzed yet (key_dates absent).
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

  // key_dates absent means the document hasn't been analyzed (analysisJson is empty)
  // — we skip rather than showing "no dates" for unanalyzed documents.
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
 *
 * @param askBasePath  Base URL like `/ask?state=Georgia&county=Fulton&case=<id>`
 *                     or `/ask` — the document ID + question are appended here.
 * @param docId        UUID of the document to scope the question to.
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
