export type DateStatus = "upcoming" | "today" | "past" | "unknown";
export type DetailedDateStatus = "next" | "today" | "past_due" | "historical" | "unknown";
const ANNUAL_MARKER_RE = /\b(annually|annual|every year)\b/i;

function toUtcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function projectAnnualDate(value: string, now: Date): Date | null {
  const normalized = value.replace(ANNUAL_MARKER_RE, "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const currentYear = now.getFullYear();
  const currentYearDate = new Date(`${normalized}, ${currentYear}`);
  if (Number.isNaN(currentYearDate.getTime())) return null;

  const currentYearDay = toUtcMidnight(currentYearDate);
  const today = toUtcMidnight(now);
  if (currentYearDay >= today) return currentYearDate;

  const nextYearDate = new Date(`${normalized}, ${currentYear + 1}`);
  return Number.isNaN(nextYearDate.getTime()) ? null : nextYearDate;
}

export function parseDateWithAnnualProjection(value: string | null | undefined, now: Date = new Date()): Date | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();

  if (ANNUAL_MARKER_RE.test(trimmed)) {
    return projectAnnualDate(trimmed, now);
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function classifyDetailedDateStatus(value: string | null | undefined, now: Date = new Date()): DetailedDateStatus {
  const parsed = parseDateWithAnnualProjection(value, now);
  if (!parsed) return "unknown";

  const nowDay = toUtcMidnight(now);
  const parsedDay = toUtcMidnight(parsed);
  const diffDays = Math.round((parsedDay - nowDay) / 86400000);

  if (diffDays > 0) return "next";
  if (diffDays === 0) return "today";
  if (diffDays >= -90) return "past_due";
  return "historical";
}

/**
 * Classifies a date string relative to the provided reference date.
 * - upcoming: strictly after reference day
 * - today: same calendar day (UTC-normalized)
 * - past: before reference day
 * - unknown: invalid / unparseable value
 */
export function classifyDateStatus(value: string | null | undefined, now: Date = new Date()): DateStatus {
  const detailed = classifyDetailedDateStatus(value, now);
  if (detailed === "today") return "today";
  if (detailed === "next") return "upcoming";
  if (detailed === "past_due" || detailed === "historical") return "past";
  return "unknown";
}

export function isCurrentOrFuture(status: DateStatus): boolean {
  return status === "today" || status === "upcoming";
}

export function dateStatusLabel(status: DetailedDateStatus): string | null {
  if (status === "next" || status === "today") return "NEXT";
  if (status === "past_due") return "PAST DUE";
  if (status === "historical") return "HISTORICAL";
  return null;
}

export function dateStatusMessage(status: DetailedDateStatus): string | null {
  if (status === "past_due") return "This date has passed. Confirm whether this was resolved.";
  if (status === "historical") return "This is a past event from your case record.";
  return null;
}
