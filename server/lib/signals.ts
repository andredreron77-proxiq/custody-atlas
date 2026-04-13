// lib/signals.ts
// Signal data model, priority scoring, and tier gating for "What Matters Now"

export type SignalType = "urgent" | "risk" | "action" | "pattern";
export type UserTier = "free" | "pro";

export interface RawSignal {
  id: string;
  type: SignalType;
  title: string;
  detail: string;
  dueDate?: string;       // ISO 8601 date string, e.g. "2025-06-01"
  sourceDocumentId?: string;
  sourceDocumentIds?: string[]; // for cross-document pattern signals
  dismissed?: boolean;
}

export interface ScoredSignal extends RawSignal {
  score: number;
  locked: boolean;        // true when tier gate hides detail
  daysUntilDue?: number;  // computed from dueDate
}

// ---------------------------------------------------------------------------
// Scoring weights
// ---------------------------------------------------------------------------

const TYPE_WEIGHT: Record<SignalType, number> = {
  urgent:  30,
  risk:    20,
  action:  15,
  pattern: 10,
};

function dateProximityScore(dueDate?: string): number {
  if (!dueDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - today.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0)  return 0;   // past — don't boost overdue (surface separately later)
  if (days <= 7)  return 40;
  if (days <= 14) return 25;
  if (days <= 30) return 10;
  return 0;
}

function userStateModifier(
  signal: RawSignal,
  opts: {
    totalDocuments: number;
    lastActivityDaysAgo: number;
  }
): number {
  let mod = 0;

  // First document — boost clarity-oriented signals (urgent + action)
  if (opts.totalDocuments === 1 && (signal.type === "urgent" || signal.type === "action")) {
    mod += 8;
  }

  // Multiple documents — boost cross-doc patterns
  if (opts.totalDocuments > 1 && signal.type === "pattern") {
    mod += 12;
  }

  // User hasn't visited in 7+ days — resurface pending actions
  if (opts.lastActivityDaysAgo >= 7 && signal.type === "action") {
    mod += 10;
  }

  return mod;
}

// ---------------------------------------------------------------------------
// Score a single signal
// ---------------------------------------------------------------------------

export function scoreSignal(
  signal: RawSignal,
  opts: { totalDocuments: number; lastActivityDaysAgo: number }
): ScoredSignal {
  const daysUntilDue = signal.dueDate
    ? Math.ceil(
        (new Date(signal.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : undefined;

  const baseScore =
    TYPE_WEIGHT[signal.type] +
    dateProximityScore(signal.dueDate) +
    userStateModifier(signal, opts);

  // Dismissed signals decay heavily, but re-surface near due date
  const dismissalPenalty = signal.dismissed ? 50 : 0;
  const dueResurface = signal.dismissed && daysUntilDue !== undefined && daysUntilDue <= 7 ? 50 : 0;

  const score = Math.max(0, baseScore - dismissalPenalty + dueResurface);

  return {
    ...signal,
    score,
    daysUntilDue,
    locked: false, // tier gate applied separately
  };
}

// ---------------------------------------------------------------------------
// Tier gate
// ---------------------------------------------------------------------------

function applyTierGate(signals: ScoredSignal[], tier: UserTier): ScoredSignal[] {
  if (tier === "pro") {
    return signals.map((s) => ({ ...s, locked: false }));
  }

  // Free tier: top 2 signals fully visible; pattern signals locked
  return signals.map((s, index) => ({
    ...s,
    locked: s.type === "pattern" || index >= 2,
  }));
}

// ---------------------------------------------------------------------------
// Main entry — score, sort, gate, cap
// ---------------------------------------------------------------------------

const MAX_SIGNALS_DISPLAYED = 5;

export interface WhatMattersNowResult {
  signals: ScoredSignal[];
  lockedCount: number;
  patternCount: number;
}

export function buildWhatMattersNow(
  rawSignals: RawSignal[],
  opts: {
    tier: UserTier;
    totalDocuments: number;
    lastActivityDaysAgo: number;
  }
): WhatMattersNowResult {
  const scored = rawSignals.map((s) =>
    scoreSignal(s, {
      totalDocuments: opts.totalDocuments,
      lastActivityDaysAgo: opts.lastActivityDaysAgo,
    })
  );

  const sorted = scored.sort((a, b) => b.score - a.score);
  const capped = sorted.slice(0, MAX_SIGNALS_DISPLAYED);
  const gated = applyTierGate(capped, opts.tier);

  const lockedCount = gated.filter((s) => s.locked).length;
  const patternCount = rawSignals.filter((s) => s.type === "pattern").length;

  return {
    signals: gated,
    lockedCount,
    patternCount,
  };
}
