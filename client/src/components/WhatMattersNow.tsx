"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Lock, ShieldAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ScoredSignal, UserTier, WhatMattersNowResult } from "@/lib/signals";

interface WhatMattersNowProps {
  result: WhatMattersNowResult;
  tier: UserTier;
  loading?: boolean;
  onDismiss?: (signalId: string) => void;
  onUpgradeClick?: () => void;
  className?: string;
}

type Urgency = "critical" | "high" | "medium";

function deriveUrgency(signal: ScoredSignal): Urgency {
  if ((signal.daysUntilDue ?? 99) <= 3 || signal.type === "urgent") return "critical";
  if ((signal.daysUntilDue ?? 99) <= 10 || signal.type === "risk") return "high";
  return "medium";
}

function urgencyClass(urgency: Urgency): string {
  if (urgency === "critical") return "border-red-400/60 bg-red-500/15 text-red-200";
  if (urgency === "high") return "border-amber-400/60 bg-amber-500/15 text-amber-200";
  return "border-sky-400/60 bg-sky-500/15 text-sky-200";
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dueFraming(signal: ScoredSignal): string {
  if ((signal.daysUntilDue ?? 99) < 0) {
    return "This already moved without waiting for you.";
  }
  return "This will happen whether you are ready or not.";
}

function dismissButton(signalId: string, onDismiss?: (signalId: string) => void) {
  if (!onDismiss) return null;
  return (
    <button
      type="button"
      onClick={() => onDismiss(signalId)}
      className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
      aria-label="Dismiss signal"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-5">
        <div className="mb-3 h-5 w-28 rounded bg-white/10" />
        <div className="mb-3 h-8 w-4/5 rounded bg-white/10" />
        <div className="h-4 w-3/4 rounded bg-white/10" />
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
        <div className="mb-3 h-5 w-52 rounded bg-white/10" />
        <div className="space-y-3">
          <div className="h-14 rounded-xl bg-white/10" />
          <div className="h-14 rounded-xl bg-white/10" />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/60 px-5 py-8 text-center">
      <p className="text-sm text-slate-400">
        No immediate pressure points are visible yet. Upload a document to surface the next thing that can change your case.
      </p>
    </div>
  );
}

function LockedSignalCard({
  signal,
  onUpgradeClick,
}: {
  signal: ScoredSignal;
  onUpgradeClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onUpgradeClick}
      className="flex w-full items-center justify-between rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-300 blur-[2px]">{signal.title}</p>
        <p className="mt-1 text-xs text-slate-500">Unlock the rest of this case pressure map with Pro.</p>
      </div>
      <Lock className="h-4 w-4 shrink-0 text-slate-500" />
    </button>
  );
}

function UpgradeNudge({
  lockedCount,
  patternCount,
  onUpgradeClick,
}: {
  lockedCount: number;
  patternCount: number;
  onUpgradeClick?: () => void;
}) {
  const label = patternCount > 0
    ? `${patternCount} cross-document pattern${patternCount > 1 ? "s" : ""} hidden`
    : `${lockedCount} more pressure point${lockedCount > 1 ? "s" : ""} hidden`;

  return (
    <button
      type="button"
      onClick={onUpgradeClick}
      className="w-full rounded-xl border border-dashed border-sky-400/25 bg-sky-500/5 px-4 py-3 text-left transition-colors hover:bg-sky-500/10"
    >
      <p className="text-sm font-medium text-sky-100">{label}</p>
      <p className="mt-1 text-xs text-sky-200/70">Upgrade to see the full case pressure map and hidden document patterns.</p>
    </button>
  );
}

export default function WhatMattersNow({
  result,
  tier,
  loading = false,
  onDismiss,
  onUpgradeClick,
  className = "",
}: WhatMattersNowProps) {
  const { signals, lockedCount, patternCount } = result;
  const visibleSignals = signals.filter((signal) => !signal.locked);
  const lockedSignals = signals.filter((signal) => signal.locked);

  const derived = useMemo(() => {
    const primarySignal = visibleSignals[0] ?? null;
    const timeline = visibleSignals
      .filter((signal) => Boolean(signal.dueDate))
      .sort((left, right) => {
        const leftTime = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      })
      .slice(0, 4);

    const riskCandidates = visibleSignals
      .filter((signal) => signal.type === "risk" || signal.type === "urgent")
      .slice(0, 4);

    const risks = riskCandidates.length > 0
      ? riskCandidates
      : visibleSignals.slice(primarySignal ? 1 : 0, primarySignal ? 4 : 3);

    return { primarySignal, timeline, risks };
  }, [visibleSignals]);

  const [dismissedRiskIds, setDismissedRiskIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDismissedRiskIds(new Set());
  }, [signals]);

  if (loading) {
    return <LoadingState />;
  }

  if (visibleSignals.length === 0 && lockedSignals.length === 0) {
    return <EmptyState />;
  }

  const activeRisks = derived.risks.filter((risk) => !dismissedRiskIds.has(risk.id));
  const showUpgradeNudge = tier === "free" && (lockedCount > 0 || patternCount > 0);

  return (
    <section className={cn("min-w-0 max-w-full", className)} aria-label="What matters now">
      <div className="min-w-0 space-y-4">
        {derived.primarySignal && (
          <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/90 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="mb-4 flex min-w-0 flex-col gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Primary Priority</p>
                <p className="mt-3 break-words text-lg font-semibold leading-snug text-slate-50 sm:text-xl">
                  {derived.primarySignal.title}
                </p>
              </div>
              <div className="flex items-start justify-between gap-2">
                <Badge
                  variant="outline"
                  className={`max-w-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${urgencyClass(deriveUrgency(derived.primarySignal))}`}
                >
                  {deriveUrgency(derived.primarySignal)}
                </Badge>
                {dismissButton(derived.primarySignal.id, onDismiss)}
              </div>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <p className="text-sm font-medium text-red-100">
                <span className="text-red-300">If ignored:</span> {derived.primarySignal.detail}
              </p>
            </div>
          </div>
        )}

        <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-sky-300" />
            <h2 className="text-sm font-semibold text-slate-100">What will happen whether you are ready or not</h2>
          </div>
          {derived.timeline.length === 0 ? (
            <p className="text-sm text-slate-400">No dated event is surfaced yet from your current case signals.</p>
          ) : (
            <div className="space-y-3">
              {derived.timeline.map((signal, index) => (
                <div key={signal.id} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-50">{formatDate(signal.dueDate) ?? "Date TBD"}</p>
                        {index === 0 ? (
                          <Badge variant="outline" className="border-sky-400/40 bg-sky-500/10 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200">
                            Next
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-200">{signal.title}</p>
                      <p className="mt-2 text-xs italic text-slate-400">{dueFraming(signal)}</p>
                    </div>
                    {dismissButton(signal.id, onDismiss)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-slate-100">Risks you cannot ignore</h2>
          </div>
          {activeRisks.length === 0 ? (
            <p className="text-sm text-slate-400">No additional risks are visible from the current signal set.</p>
          ) : (
            <div className="space-y-3">
              {activeRisks.map((risk) => (
                <div key={risk.id} className="min-w-0 rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium leading-relaxed text-amber-50">{risk.title}</p>
                      <p className="mt-2 break-words text-sm text-red-200">
                        <span className="font-semibold text-red-300">If ignored:</span> {risk.detail}
                      </p>
                      {risk.dueDate ? (
                        <p className="mt-2 break-words text-xs uppercase tracking-[0.16em] text-amber-300/80">
                          Deadline: {formatDate(risk.dueDate)}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDismissedRiskIds((current) => new Set(current).add(risk.id));
                        onDismiss?.(risk.id);
                      }}
                      className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
                      aria-label="Dismiss risk"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {lockedSignals.length > 0 && (
          <div className="space-y-3">
            {lockedSignals.map((signal) => (
              <LockedSignalCard key={signal.id} signal={signal} onUpgradeClick={onUpgradeClick} />
            ))}
          </div>
        )}

        {showUpgradeNudge && (
          <UpgradeNudge
            lockedCount={lockedCount}
            patternCount={patternCount}
            onUpgradeClick={onUpgradeClick}
          />
        )}
      </div>
    </section>
  );
}
