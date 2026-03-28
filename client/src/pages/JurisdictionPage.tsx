import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, MessageSquare, ArrowRight,
  Scale, Users, RefreshCw, MapPin, Handshake, Gavel,
  ChevronDown, ChevronUp, Sparkles, Landmark, ExternalLink,
  GraduationCap, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/app/Header";
import { JurisdictionHeader } from "@/components/app/JurisdictionHeader";
import { JurisdictionContextHeader } from "@/components/app/JurisdictionContextHeader";
import { LawSectionCard } from "@/components/app/LawSectionCard";
import { EnforcementList } from "@/components/app/EnforcementList";
import { UnsupportedStateNotice } from "@/components/app/UnsupportedStateNotice";
import { ChildSupportImpactCard } from "@/components/app/ChildSupportImpactCard";
import { ChatBox } from "@/components/app/ChatBox";
import { useJurisdiction } from "@/hooks/useJurisdiction";
import type { CustodyLawRecord, CountyProcedureRecord, Jurisdiction } from "@shared/schema";

/**
 * JurisdictionPage
 *
 * Data sources (separated by layer):
 *   STATE CUSTODY LAW    /api/custody-laws/:state
 *     → Legal rules set by state statute — applies statewide.
 *     → Backed by data/custody_laws.json via server/custody-laws-store.ts.
 *
 *   COUNTY PROCEDURES    /api/county-procedures/:state/:county
 *     → Local court operational details that may vary county-by-county.
 *     → Backed by data/county_procedures.json via server/county-procedures-store.ts.
 *     → Optional — a 404 means the county has no record yet; the page
 *       degrades gracefully and shows state-law-only content.
 *
 * All display is handled by reusable components:
 *   JurisdictionHeader        — location summary with coordinates
 *   LawSectionCard            — collapsible card for each state-law category
 *   EnforcementList           — structured list of enforcement options
 *   CountyProceduresSection   — local court procedures (inline, this file)
 *   UnsupportedStateNotice    — friendly fallback for uncovered states
 *
 * Future DB migration: only the two API endpoints need to change.
 */

/* ── CountyProceduresSection ─────────────────────────────────────────────
 * Displayed only when county procedure data exists for the user's county.
 * Clearly labelled as "Local Court Procedures" to distinguish it from the
 * statewide legal rules shown in the LawSectionCard blocks above.
 */
function CountyProceduresSection({
  procedure,
  county,
  state,
}: {
  procedure: CountyProcedureRecord;
  county: string;
  state: string;
}) {
  const hasAnyContent =
    procedure.court_name ||
    procedure.mediation_notes ||
    procedure.parenting_class_required !== undefined ||
    procedure.local_procedure_notes ||
    (procedure.local_resources && procedure.local_resources.length > 0) ||
    procedure.filing_link;

  if (!hasAnyContent) return null;

  return (
    <Card
      className="border-amber-200 dark:border-amber-800/40 bg-amber-50/30 dark:bg-amber-950/10"
      data-testid="card-county-procedures"
    >
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-md bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Landmark className="w-4 h-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Local Court Procedures
              <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700">
                {county} County
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Court-specific procedures for {county} County, {state} — may differ from statewide rules above
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-3">

        {procedure.court_name && (
          <div className="flex items-start gap-2.5" data-testid="text-court-name">
            <Landmark className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Court</p>
              <p className="text-sm">{procedure.court_name}</p>
            </div>
          </div>
        )}

        {procedure.mediation_notes && (
          <div className="flex items-start gap-2.5" data-testid="text-mediation-notes">
            <Handshake className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Local Mediation</p>
              <p className="text-sm leading-relaxed">{procedure.mediation_notes}</p>
            </div>
          </div>
        )}

        {procedure.parenting_class_required !== undefined && (
          <div className="flex items-start gap-2.5" data-testid="text-parenting-class">
            <GraduationCap className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Parenting Class</p>
              <p className="text-sm">
                {procedure.parenting_class_required
                  ? `Required${procedure.parenting_class_name ? ` — ${procedure.parenting_class_name}` : ""}`
                  : "Not required in this county"}
              </p>
            </div>
          </div>
        )}

        {procedure.local_procedure_notes && (
          <div className="flex items-start gap-2.5" data-testid="text-local-procedure-notes">
            <AlertCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Local Practice Notes</p>
              <p className="text-sm leading-relaxed">{procedure.local_procedure_notes}</p>
            </div>
          </div>
        )}

        {procedure.filing_link && (
          <a
            href={procedure.filing_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            data-testid="link-filing-portal"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Court Filing Portal
          </a>
        )}

        {procedure.local_resources && procedure.local_resources.length > 0 && (
          <div data-testid="list-local-resources">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Local Resources</p>
            <ul className="space-y-1">
              {procedure.local_resources.map((r, i) => (
                <li key={i}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
export default function JurisdictionPage() {
  const [match, params] = useRoute("/jurisdiction/:state/:county");
  const [location] = useLocation();
  const [askAIOpen, setAskAIOpen] = useState(false);

  // Build jurisdiction from URL before any early return (hooks must be called unconditionally)
  const state = match && params ? decodeURIComponent(params.state) : "";
  const county = match && params ? decodeURIComponent(params.county) : "";

  // "general" is the sentinel county used by the map flow (state-only view).
  const isStateOnly = !county || county.toLowerCase() === "general";
  const urlParams = new URLSearchParams(
    location.split("?")[1] || window.location.search.slice(1)
  );

  const jurisdiction: Jurisdiction = {
    state,
    county,
    country: urlParams.get("country") ?? "United States",
    formattedAddress: urlParams.get("address") ?? undefined,
    latitude: urlParams.get("lat") ? Number(urlParams.get("lat")) : undefined,
    longitude: urlParams.get("lng") ? Number(urlParams.get("lng")) : undefined,
  };

  // Persist to sessionStorage so other pages (e.g. Workspace) can read it back
  useJurisdiction(match && params ? jurisdiction : null);

  if (!match || !params) return null;

  // ── State custody law (legal rules set by state statute) ─────────────────
  const { data: law, isLoading, error } = useQuery<CustodyLawRecord>({
    queryKey: ["/api/custody-laws", state],
    queryFn: async () => {
      const res = await fetch(`/api/custody-laws/${encodeURIComponent(state)}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("unsupported_state");
        throw new Error("Failed to fetch custody law data");
      }
      return res.json();
    },
  });

  // ── County court procedures (local operational details) ───────────────────
  // Only fetched when a real county is known — "general" (the map sentinel) is
  // never a real county so we skip the fetch entirely.  A 404 response is normal
  // and means no county record exists yet; the UI degrades silently.
  const { data: countyProcedure } = useQuery<CountyProcedureRecord>({
    queryKey: ["/api/county-procedures", state, county],
    queryFn: async () => {
      const res = await fetch(
        `/api/county-procedures/${encodeURIComponent(state)}/${encodeURIComponent(county)}`
      );
      if (!res.ok) return null as unknown as CountyProcedureRecord; // 404 = no data, not an error
      return res.json();
    },
    enabled: !isStateOnly && !!state && !!county,
    staleTime: 5 * 60 * 1000,
    retry: false, // Don't retry 404s
  });

  const isUnsupported = error instanceof Error && error.message === "unsupported_state";

  const askAIPath =
    `/ask?state=${encodeURIComponent(state)}&county=${encodeURIComponent(county)}` +
    `&country=${encodeURIComponent(jurisdiction.country ?? "United States")}` +
    (jurisdiction.formattedAddress ? `&address=${encodeURIComponent(jurisdiction.formattedAddress)}` : "");

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fade-in">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Find My Laws", href: "/location" },
          { label: isStateOnly ? `${state} Custody Law` : `${county} County, ${state}` },
        ]}
      />

      <JurisdictionContextHeader
        mode="jurisdiction"
        state={state}
        county={isStateOnly ? undefined : county}
        changeLocationHref="/location"
      />

      <div>
        <span className="inline-flex items-center rounded-full border border-[#dcc98a] bg-[#fdf9ee] px-2.5 py-0.5 text-[11px] font-semibold tracking-widest text-[#b5922f] uppercase mb-2.5">
          {isStateOnly ? "State Law Overview" : "Jurisdiction"}
        </span>
        <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground leading-tight mb-1" data-testid="heading-jurisdiction">
          {isStateOnly ? `${state} Custody Law` : `Child Custody Laws — ${state}`}
        </h1>
        <p className="text-[15px] text-foreground/70">
          {isStateOnly
            ? "General statewide overview"
            : `Jurisdiction-specific information for ${county} County`}
        </p>
        {isStateOnly && (
          <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1 flex-wrap" data-testid="text-personalization-hint">
            Looking for more tailored guidance?{" "}
            <Link
              href="/location"
              className="text-primary hover:underline inline-flex items-center gap-0.5 font-medium transition-colors"
              data-testid="link-use-my-location"
            >
              <MapPin className="w-3 h-3" />
              Use My Location
            </Link>
          </p>
        )}
      </div>

      {/* Location summary with coordinates */}
      <JurisdictionHeader
        jurisdiction={jurisdiction}
        stateCode={law?.state_code}
        hasData={!!law}
      />

      {/* Subtle trust message */}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 -mt-2">
        <Scale className="w-3.5 h-3.5 flex-shrink-0" />
        Custody Atlas explains custody law in plain English based on your location.
      </p>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-3" data-testid="loading-laws">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-muted-foreground">Loading custody laws for {state}...</span>
        </div>
      )}

      {/* Unsupported state — friendly notice with CTAs */}
      {isUnsupported && (
        <UnsupportedStateNotice state={state} askAIPath={askAIPath} />
      )}

      {/* Generic error (not 404) */}
      {error && !isUnsupported && (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="p-5 flex items-start gap-3">
            <MapPin className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-destructive mb-1">Failed to load law data</p>
              <p className="text-xs text-destructive/80">
                Could not retrieve custody law information. Please try refreshing the page.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => window.location.reload()} className="gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </Button>
                <Link href="/location">
                  <Button size="sm" variant="ghost" className="gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    Change Location
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Law data sections — one LawSectionCard per field in CustodyLawRecord */}
      {law && !isLoading && (
        <>
          {/* Quick summary — plain-English overview shown before the detailed cards */}
          {law.quick_summary && (
            <div
              className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
              data-testid="panel-quick-summary"
            >
              <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
                At a Glance
              </p>
              <p className="text-sm leading-relaxed text-foreground">
                {law.quick_summary}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <LawSectionCard
              title="Custody Standard"
              content={law.custody_standard}
              icon={Scale}
              defaultExpanded
              accentColor="text-primary"
              testId="card-custody-standard"
            />
            <LawSectionCard
              title="Custody Types"
              content={law.custody_types}
              icon={Users}
              defaultExpanded
              accentColor="text-blue-600 dark:text-blue-400"
              testId="card-custody-types"
            />
            <LawSectionCard
              title="Modification Rules"
              content={law.modification_rules}
              icon={Gavel}
              accentColor="text-violet-600 dark:text-violet-400"
              testId="card-modification-rules"
            />
            <LawSectionCard
              title="Relocation Rules"
              content={law.relocation_rules}
              icon={MapPin}
              accentColor="text-orange-600 dark:text-orange-400"
              testId="card-relocation-rules"
            />
            <LawSectionCard
              title="Mediation Requirements"
              content={law.mediation_requirements}
              icon={Handshake}
              accentColor="text-teal-600 dark:text-teal-400"
              testId="card-mediation-requirements"
            />
          </div>

          {/* Enforcement options get their own dedicated list component */}
          <EnforcementList
            enforcementText={law.enforcement_options}
            state={state}
          />

          {/* Child support educational card */}
          <ChildSupportImpactCard
            state={state}
            county={county}
            country={jurisdiction.country ?? "United States"}
          />

          {/*
           * Local court procedures — rendered only when county procedure data
           * exists for this county (fetched from /api/county-procedures/:state/:county).
           * When no data exists the section is invisible; state law content is unaffected.
           */}
          {countyProcedure && (
            <CountyProceduresSection
              procedure={countyProcedure}
              county={county}
              state={state}
            />
          )}

          {/* Embedded Ask AI Panel */}
          <Card
            className="border-primary/20 overflow-hidden"
            data-testid="card-ask-ai-panel"
          >
            <CardHeader
              className="py-4 px-5 cursor-pointer select-none bg-primary/5 hover:bg-primary/10 transition-colors"
              onClick={() => setAskAIOpen((v) => !v)}
              role="button"
              aria-expanded={askAIOpen}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setAskAIOpen((v) => !v);
                }
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      Ask Atlas About {state} Custody Law
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Plain-English answers to your specific questions
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!askAIOpen && (
                    <Link href={askAIPath} onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-xs"
                        data-testid="button-full-page-ask"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Full Page
                      </Button>
                    </Link>
                  )}
                  {askAIOpen ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>

            {askAIOpen && (
              <CardContent className="p-0">
                <div className="h-px bg-border" />
                <div
                  className="p-4 h-[520px] flex flex-col overflow-y-auto"
                  data-testid="panel-ask-ai-content"
                >
                  <ChatBox jurisdiction={jurisdiction} />
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
