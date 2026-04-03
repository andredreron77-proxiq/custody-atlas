export type DateStatus = "upcoming" | "today" | "past" | "unknown";

function toUtcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Classifies a date string relative to the provided reference date.
 * - upcoming: strictly after reference day
 * - today: same calendar day (UTC-normalized)
 * - past: before reference day
 * - unknown: invalid / unparseable value
 */
export function classifyDateStatus(value: string | null | undefined, now: Date = new Date()): DateStatus {
  if (!value || !value.trim()) return "unknown";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown";

  const nowDay = toUtcMidnight(now);
  const parsedDay = toUtcMidnight(parsed);

  if (parsedDay === nowDay) return "today";
  if (parsedDay > nowDay) return "upcoming";
  return "past";
}

export function isCurrentOrFuture(status: DateStatus): boolean {
  return status === "today" || status === "upcoming";
}
