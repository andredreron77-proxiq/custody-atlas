"use client";

// components/WhatMattersNow.tsx
// Renders the "What Matters Now" signal panel.
// Drop into Workspace dashboard, Analyze page sidebar, or Ask Atlas alert strip.

import { useState } from "react";
import { ScoredSignal, UserTier, WhatMattersNowResult } from "@/lib/signals";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WhatMattersNowProps {
  result: WhatMattersNowResult;
  tier: UserTier;
  loading?: boolean;
  onDismiss?: (signalId: string) => void;
  onUpgradeClick?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Signal type config
// ---------------------------------------------------------------------------

const TYPE_CONFIG = {
  urgent: {
    label: "Urgent",
    color: "text-red-700 bg-red-50 border-red-100",
    dot: "bg-red-500",
    border: "border-l-red-400",
  },
  risk: {
    label: "Risk",
    color: "text-amber-700 bg-amber-50 border-amber-100",
    dot: "bg-amber-500",
    border: "border-l-amber-400",
  },
  action: {
    label: "Action",
    color: "text-teal-700 bg-teal-50 border-teal-100",
    dot: "bg-teal-500",
    border: "border-l-teal-400",
  },
  pattern: {
    label: "Pattern",
    color: "text-purple-700 bg-purple-50 border-purple-100",
    dot: "bg-purple-500",
    border: "border-l-purple-400",
  },
} as const;

// ---------------------------------------------------------------------------
// Due date helper
// ---------------------------------------------------------------------------

function formatDue(daysUntilDue?: number): string | null {
  if (daysUntilDue === undefined) return null;
  if (daysUntilDue < 0) return "Overdue";
  if (daysUntilDue === 0) return "Due today";
  if (daysUntilDue === 1) return "Due tomorrow";
  if (daysUntilDue <= 7) return `Due in ${daysUntilDue} days`;
  if (daysUntilDue <= 14) return `Due in ${daysUntilDue} days`;
  return null; // not worth surfacing for distant dates
}

// ---------------------------------------------------------------------------
// Single signal card
// ---------------------------------------------------------------------------

function SignalCard({
  signal,
  onDismiss,
}: {
  signal: ScoredSignal;
  onDismiss?: (id: string) => void;
}) {
  const config = TYPE_CONFIG[signal.type];
  const dueLabel = formatDue(signal.daysUntilDue);
  const [dismissing, setDismissing] = useState(false);

  function handleDismiss() {
    setDismissing(true);
    setTimeout(() => onDismiss?.(signal.id), 200);
  }

  return (
    <div
      className={`
        relative border-l-2 ${config.border}
        bg-white border border-gray-100 rounded-lg px-4 py-3
        transition-all duration-200
        ${dismissing ? "opacity-0 scale-95" : "opacity-100"}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {/* Type badge */}
          <span
            className={`
              inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium
              border ${config.color} flex-shrink-0
            `}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot} mr-1.5`} />
            {config.label}
          </span>

          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 leading-snug">
              {signal.title}
            </p>

            {dueLabel && (
              <p
                className={`text-xs mt-0.5 font-medium ${
                  signal.daysUntilDue !== undefined && signal.daysUntilDue <= 7
                    ? "text-red-600"
                    : "text-gray-400"
                }`}
              >
                {dueLabel}
              </p>
            )}

            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              {signal.detail}
            </p>
          </div>
        </div>

        {/* Dismiss */}
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors mt-0.5"
            aria-label="Dismiss signal"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locked signal placeholder
// ---------------------------------------------------------------------------

function LockedSignalCard({
  signal,
  onUpgradeClick,
}: {
  signal: ScoredSignal;
  onUpgradeClick?: () => void;
}) {
  const config = TYPE_CONFIG[signal.type];

  return (
    <div
      className={`
        relative border-l-2 border-l-gray-200
        bg-gray-50 border border-gray-100 rounded-lg px-4 py-3
        opacity-60
      `}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`
              inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
              border ${config.color} opacity-50
            `}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot} mr-1.5`} />
            {config.label}
          </span>
          <p className="text-sm text-gray-400 blur-sm select-none">
            {signal.title}
          </p>
        </div>

        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="text-gray-300 flex-shrink-0"
        >
          <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4 6V4a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-2.5 animate-pulse">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="border-l-2 border-l-gray-200 bg-white border border-gray-100 rounded-lg px-4 py-3"
        >
          <div className="flex items-start gap-2.5">
            <div className="w-16 h-5 bg-gray-100 rounded-full mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <div className="w-3/4 h-4 bg-gray-100 rounded" />
              <div className="w-full h-3 bg-gray-100 rounded" />
              <div className="w-2/3 h-3 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upgrade nudge — shown below locked signals
// ---------------------------------------------------------------------------

function UpgradeNudge({
  lockedCount,
  patternCount,
  onUpgradeClick,
}: {
  lockedCount: number;
  patternCount: number;
  onUpgradeClick?: () => void;
}) {
  const label =
    patternCount > 0
      ? `${patternCount} pattern${patternCount > 1 ? "s" : ""} detected across your documents`
      : `${lockedCount} more signal${lockedCount > 1 ? "s" : ""} found`;

  return (
    <button
      onClick={onUpgradeClick}
      className="
        w-full text-left mt-2
        border border-dashed border-gray-200 rounded-lg px-4 py-3
        hover:border-gray-300 hover:bg-gray-50
        transition-all duration-150 group
      "
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
            {label}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            See what to do next — get deeper guidance
          </p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0"
        >
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="text-center py-6">
      <p className="text-sm text-gray-400">
        No signals found yet. Upload a document to get started.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WhatMattersNow({
  result,
  tier,
  loading = false,
  onDismiss,
  onUpgradeClick,
  className = "",
}: WhatMattersNowProps) {
  const { signals, lockedCount, patternCount } = result;
  const visibleSignals = signals.filter((s) => !s.locked);
  const lockedSignals = signals.filter((s) => s.locked);
  const hasContent = signals.length > 0;
  const showUpgradeNudge = tier === "free" && (lockedCount > 0 || patternCount > 0);

  return (
    <section className={`${className}`} aria-label="What matters now">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900 tracking-tight">
          What matters now
        </h2>
        {!loading && hasContent && (
          <span className="text-xs text-gray-400">
            {visibleSignals.length} signal{visibleSignals.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : !hasContent ? (
        <EmptyState />
      ) : (
        <div className="space-y-2.5">
          {/* Visible signals */}
          {visibleSignals.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              onDismiss={onDismiss}
            />
          ))}

          {/* Locked signal placeholders */}
          {lockedSignals.map((signal) => (
            <LockedSignalCard
              key={signal.id}
              signal={signal}
              onUpgradeClick={onUpgradeClick}
            />
          ))}

          {/* Upgrade nudge */}
          {showUpgradeNudge && (
            <UpgradeNudge
              lockedCount={lockedCount}
              patternCount={patternCount}
              onUpgradeClick={onUpgradeClick}
            />
          )}
        </div>
      )}
    </section>
  );
}
