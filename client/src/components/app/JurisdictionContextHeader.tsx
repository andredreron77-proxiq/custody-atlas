/**
 * JurisdictionContextHeader
 *
 * A compact, persistent context banner that shows the user's active
 * jurisdiction or comparison state across all main product screens.
 *
 * Modes:
 *   "jurisdiction" — single state/county (law summary, AI Q&A)
 *   "comparison"   — two-state comparison (custody map compare mode)
 *   "document"     — document analysis with optional filename
 */

import { MapPin, Lock, ArrowRight, GitCompare, FileText, Scale } from "lucide-react";
import { Link } from "wouter";
import { formatJurisdictionLabel } from "@/lib/jurisdictionUtils";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface JurisdictionMode {
  mode: "jurisdiction";
  state: string;
  county?: string;
  onChangeLocation?: () => void;
  changeLocationHref?: string;
}

interface ComparisonMode {
  mode: "comparison";
  stateA: string;
  stateB: string;
}

interface DocumentMode {
  mode: "document";
  state?: string;
  county?: string;
  documentName?: string;
  onChangeLocation?: () => void;
  changeLocationHref?: string;
}

export type JurisdictionContextHeaderProps =
  | JurisdictionMode
  | ComparisonMode
  | DocumentMode;

/* ── Sub-pieces ─────────────────────────────────────────────────────────── */

function PrivateBadge() {
  return (
    <div
      className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground/70"
      data-testid="badge-private-session"
    >
      <Lock className="w-3 h-3" />
      <span>Private session</span>
    </div>
  );
}

interface ChangeLocationProps {
  onClick?: () => void;
  href?: string;
}

function ChangeLocationLink({ onClick, href }: ChangeLocationProps) {
  const cls =
    "flex items-center gap-1 text-xs font-medium text-primary hover:underline transition-colors";

  if (href) {
    return (
      <Link href={href} className={cls} data-testid="link-change-location">
        Change location
        <ArrowRight className="w-3 h-3" />
      </Link>
    );
  }
  if (onClick) {
    return (
      <button onClick={onClick} className={cls} data-testid="button-change-location-ctx">
        Change location
        <ArrowRight className="w-3 h-3" />
      </button>
    );
  }
  return null;
}

/* ── Main component ──────────────────────────────────────────────────────── */

export function JurisdictionContextHeader(props: JurisdictionContextHeaderProps) {
  if (props.mode === "comparison") {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border bg-white dark:bg-card shadow-sm px-4 py-3"
        data-testid="jurisdiction-context-header"
        aria-label={`Comparing custody laws: ${props.stateA} vs ${props.stateB}`}
      >
        {/* Icon */}
        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <GitCompare className="w-3.5 h-3.5 text-primary" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Comparing:</span>
            <span
              className="text-sm font-semibold text-foreground"
              data-testid="text-ctx-state-a"
            >
              {props.stateA}
            </span>
            <span className="text-xs text-muted-foreground font-medium">vs</span>
            <span
              className="text-sm font-semibold text-foreground"
              data-testid="text-ctx-state-b"
            >
              {props.stateB}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Custody law comparison</p>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <PrivateBadge />
        </div>
      </div>
    );
  }

  if (props.mode === "document") {
    const { state, county, documentName, onChangeLocation, changeLocationHref } = props;
    // Treat the "General"/"general" county sentinel as state-only.
    const locationText = formatJurisdictionLabel(state, county) || null;
    const hasLocation = !!locationText;

    return (
      <div
        className="flex items-center gap-3 rounded-xl border bg-white dark:bg-card shadow-sm px-4 py-3"
        data-testid="jurisdiction-context-header"
        aria-label="Document analysis context"
      >
        {/* Icon */}
        <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
          <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {hasLocation && (
              <>
                <span className="text-xs text-muted-foreground">Jurisdiction:</span>
                <span
                  className="text-sm font-semibold text-foreground"
                  data-testid="text-ctx-location"
                >
                  {locationText}
                </span>
              </>
            )}
            {documentName && (
              <>
                {hasLocation && (
                  <span className="text-muted-foreground/50 text-xs">·</span>
                )}
                <span
                  className="text-xs text-muted-foreground truncate max-w-[200px]"
                  data-testid="text-ctx-document-name"
                  title={documentName}
                >
                  {documentName}
                </span>
              </>
            )}
            {!hasLocation && !documentName && (
              <span className="text-sm font-semibold text-foreground">Document Analysis</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Secure document analysis</p>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <PrivateBadge />
          <ChangeLocationLink onClick={onChangeLocation} href={changeLocationHref} />
        </div>
      </div>
    );
  }

  /* ── jurisdiction mode (default) ─────────────────────────────────── */
  const { state, county, onChangeLocation, changeLocationHref } = props;

  // "general" is the sentinel county used by the custody-map flow (state-only).
  // Treat absent or sentinel county as state-only mode.
  const isStateOnly = !county || county.toLowerCase() === "general";

  const locationLabel = isStateOnly ? "State" : "Jurisdiction";
  const locationText = isStateOnly
    ? state
    : `${county} County, ${state}`;
  const subtext = isStateOnly
    ? "General statewide custody law overview"
    : "Plain-English custody law guidance based on your location";

  return (
    <div
      className="flex items-center gap-3 rounded-xl border bg-white dark:bg-card shadow-sm px-4 py-3"
      data-testid="jurisdiction-context-header"
      aria-label={`Jurisdiction: ${locationText}`}
    >
      {/* Icon */}
      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Scale className="w-3.5 h-3.5 text-primary" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground">{locationLabel}:</span>
          <span
            className="text-sm font-semibold text-foreground truncate"
            data-testid="text-ctx-location"
          >
            {locationText}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <PrivateBadge />
        <ChangeLocationLink onClick={onChangeLocation} href={changeLocationHref} />
      </div>
    </div>
  );
}
