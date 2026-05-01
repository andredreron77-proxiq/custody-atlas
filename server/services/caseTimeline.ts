/**
 * server/services/caseTimeline.ts
 *
 * Derives a chronological case timeline from existing stored data.
 * No new database tables — events are aggregated from:
 *
 *   1. Documents → extracted_facts (hearing_date, filing_date, effective_date)
 *   2. Documents → key_dates[] (plain-text "date – description" strings)
 *   3. Case facts → hearing_date, filing_date facts stored in case_facts table
 *
 * Case actions are NOT included directly — their urgency already reflects
 * the hearing date, which appears as a "hearing" event from source 1/3.
 */

import { getDocumentsByCase } from "./documents";
import { getCaseFacts }       from "./caseFacts";

/* ── Types ────────────────────────────────────────────────────────────────── */

export type TimelineEventType =
  | "hearing"       // extracted hearing date
  | "filing"        // extracted filing date
  | "effective"     // order effective date
  | "key_date"      // from key_dates[] array
  | "fact";         // from case_facts table

export interface CaseTimelineEvent {
  /** Stable deterministic key for React rendering. */
  id: string;
  /** Original date string as it appears in the source. */
  dateRaw: string;
  /** Parsed Date, or null when the string is not parseable. */
  dateParsed: Date | null;
  /** Human-readable event label. */
  label: string;
  /** Where this event came from (document filename, "Case Facts", etc.). */
  source: string;
  /** Event category, used to pick the right icon in the UI. */
  type: TimelineEventType;
  /** True when dateParsed < today at midnight. */
  isPast: boolean;
  /** True when dateParsed >= today — i.e. the event hasn't happened yet. */
  isUpcoming: boolean;
  /**
   * True for exactly one event: the earliest upcoming event.
   * Highlighted in the UI as "next".
   */
  isNext: boolean;
  /**
   * True when the event is a hearing/deadline that is past-due
   * (date < today).  Used for red-accent styling.
   */
  isOverdue: boolean;
}

/* ── Date parsing ─────────────────────────────────────────────────────────── */

const SPLIT_RE = /\s[–—\-]\s/;
const ANNUAL_MARKER_RE = /\b(annually|annual|every year)\b/i;

/**
 * Try to extract a usable Date from a raw string.
 * Handles:
 *  - ISO:       "2024-04-15"
 *  - US long:   "April 15, 2024"
 *  - With time: "April 15, 2024 at 9:00 AM"
 *  - key_dates: "April 15, 2024 – Hearing at Fulton County" (split first)
 */
function parseDate(raw: string): Date | null {
  if (!raw?.trim()) return null;

  // For key_dates items that include a description after a dash separator,
  // take only the leading portion so "March 15, 2024 – Order effective" parses.
  const datePortion = raw.split(SPLIT_RE)[0].trim();
  const normalizedDatePortion = datePortion.replace(ANNUAL_MARKER_RE, "").replace(/\s+/g, " ").trim();

  if (ANNUAL_MARKER_RE.test(datePortion)) {
    const today = todayMidnight();
    const currentYearText = `${normalizedDatePortion}, ${today.getFullYear()}`;
    const currentYearDate = new Date(currentYearText);
    if (!isNaN(currentYearDate.getTime())) {
      const currentYearMidnight = new Date(
        currentYearDate.getFullYear(),
        currentYearDate.getMonth(),
        currentYearDate.getDate(),
      );
      if (currentYearMidnight >= today) return currentYearMidnight;
      const nextYearDate = new Date(`${normalizedDatePortion}, ${today.getFullYear() + 1}`);
      if (!isNaN(nextYearDate.getTime())) {
        return new Date(nextYearDate.getFullYear(), nextYearDate.getMonth(), nextYearDate.getDate());
      }
    }
  }

  const d = new Date(normalizedDatePortion);
  if (!isNaN(d.getTime())) return d;

  // Fallback: try the full string (handles some unusual formats)
  const d2 = new Date(raw);
  if (!isNaN(d2.getTime())) return d2;

  return null;
}

function todayMidnight(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function classify(
  dateParsed: Date | null,
  type: TimelineEventType,
): Pick<CaseTimelineEvent, "isPast" | "isUpcoming" | "isOverdue"> {
  if (!dateParsed) return { isPast: false, isUpcoming: false, isOverdue: false };
  const today = todayMidnight();
  const eventDay = new Date(dateParsed.getFullYear(), dateParsed.getMonth(), dateParsed.getDate());
  const isPast = eventDay < today;
  const isUpcoming = !isPast;
  const daysPast = isPast
    ? Math.floor((today.getTime() - eventDay.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isOverdue = Boolean(
    isPast
      && daysPast !== null
      && daysPast <= 30
      && (type === "hearing" || type === "fact"),
  );
  return { isPast, isUpcoming, isOverdue };
}

/* ── Event builders ───────────────────────────────────────────────────────── */

let _seq = 0;
function uid(prefix: string): string {
  return `${prefix}-${++_seq}`;
}

function makeEvent(
  fields: Omit<CaseTimelineEvent, "isPast" | "isUpcoming" | "isNext" | "isOverdue">,
): CaseTimelineEvent {
  const { isPast, isUpcoming, isOverdue } = classify(fields.dateParsed, fields.type);
  return { ...fields, isPast, isUpcoming, isNext: false, isOverdue };
}

/* ── Main derivation ──────────────────────────────────────────────────────── */

/**
 * Aggregate timeline events for a case.
 *
 * Deduplication:
 *   When the same hearing/filing/effective date appears in both a document's
 *   extracted_facts AND in case_facts, the structured-facts version takes
 *   precedence (it is already deduplicated by the facts upsert logic).
 *   Document key_dates[] items are always included (they often contain
 *   additional context the structured extraction misses).
 *
 * @param caseId  Supabase case UUID
 * @param userId  Authenticated user's Supabase UID (ownership enforcement)
 */
export async function deriveCaseTimeline(
  caseId: string,
  userId: string,
): Promise<CaseTimelineEvent[]> {
  _seq = 0; // reset per-call so IDs are stable within a single derivation

  // Fetch in parallel — all three already enforce userId ownership
  const [documents, hearingFacts, filingFacts] = await Promise.all([
    getDocumentsByCase(caseId, userId),
    getCaseFacts(caseId, userId, "hearing_date"),
    getCaseFacts(caseId, userId, "filing_date"),
  ]);

  console.log("[caseTimeline] getCaseFacts results", {
    caseId,
    userId,
    hearingFacts,
    filingFacts,
  });

  const events: CaseTimelineEvent[] = [];

  // ── Track seen date+type pairs for deduplication ──────────────────────────
  // Key: `${type}:${dateRaw}` — prevents the same hearing from appearing
  // from both a document's extracted_facts and the case_facts table.
  const seen = new Set<string>();

  function dedupeKey(type: string, dateRaw: string): string {
    return `${type}:${dateRaw.trim().toLowerCase()}`;
  }

  function addIfNew(event: CaseTimelineEvent): void {
    const key = dedupeKey(event.type, event.dateRaw);
    if (!seen.has(key)) {
      seen.add(key);
      events.push(event);
    }
  }

  // ── 1. Case facts: hearing_date ───────────────────────────────────────────
  for (const fact of hearingFacts) {
    addIfNew(makeEvent({
      id:          uid("fact-hearing"),
      dateRaw:     fact.value,
      dateParsed:  parseDate(fact.value),
      type:        "hearing",
      label:       "Court hearing",
      source:      fact.sourceName ? `Case Facts (via ${fact.sourceName})` : "Case Facts",
    }));
  }

  // ── 2. Case facts: filing_date ────────────────────────────────────────────
  for (const fact of filingFacts) {
    addIfNew(makeEvent({
      id:         uid("fact-filing"),
      dateRaw:    fact.value,
      dateParsed: parseDate(fact.value),
      type:       "filing",
      label:      "Filing date",
      source:     fact.sourceName ? `Case Facts (via ${fact.sourceName})` : "Case Facts",
    }));
  }

  // ── 3. Documents: extracted_facts ────────────────────────────────────────
  for (const doc of documents) {
    const ef = (doc.analysisJson?.extracted_facts ?? {}) as Record<string, string | null>;
    const src = `Document: ${doc.fileName}`;

    if (ef.hearing_date) {
      addIfNew(makeEvent({
        id:         uid("doc-hearing"),
        dateRaw:    ef.hearing_date,
        dateParsed: parseDate(ef.hearing_date),
        type:       "hearing",
        label:      "Court hearing",
        source:     src,
      }));
    }

    if (ef.filing_date) {
      addIfNew(makeEvent({
        id:         uid("doc-filing"),
        dateRaw:    ef.filing_date,
        dateParsed: parseDate(ef.filing_date),
        type:       "filing",
        label:      "Filing date",
        source:     src,
      }));
    }

    if (ef.effective_date) {
      addIfNew(makeEvent({
        id:         uid("doc-effective"),
        dateRaw:    ef.effective_date,
        dateParsed: parseDate(ef.effective_date),
        type:       "effective",
        label:      "Order effective",
        source:     src,
      }));
    }

    // ── 4. Documents: key_dates[] ─────────────────────────────────────────
    const keyDates = Array.isArray(doc.analysisJson?.key_dates)
      ? (doc.analysisJson.key_dates as string[])
      : [];

    for (const kd of keyDates) {
      if (!kd?.trim()) continue;

      // Extract description after the separator
      const parts = kd.split(SPLIT_RE);
      const datePart = parts[0].trim();
      const descPart = parts.slice(1).join(" – ").trim() || datePart;

      events.push(makeEvent({
        id:         uid("doc-kd"),
        dateRaw:    datePart,
        dateParsed: parseDate(datePart),
        type:       "key_date",
        label:      descPart,
        source:     src,
      }));
    }
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  // Chronological order: past → future → undated.
  // Within past events: most recent first (so recent history is at top).
  // Within future events: soonest first.
  events.sort((a, b) => {
    const aMs = a.dateParsed?.getTime() ?? null;
    const bMs = b.dateParsed?.getTime() ?? null;

    if (aMs !== null && bMs !== null) return aMs - bMs; // both dated → chrono
    if (aMs !== null) return -1;                         // dated before undated
    if (bMs !== null) return 1;
    return 0;                                            // both undated
  });

  // ── Mark the first upcoming event ─────────────────────────────────────────
  const firstUpcoming = events.find(e => e.isUpcoming && e.dateParsed !== null);
  if (firstUpcoming) firstUpcoming.isNext = true;

  return events;
}
