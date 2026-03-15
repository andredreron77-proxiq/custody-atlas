import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, MessageSquare, ArrowRight,
  Scale, Users, RefreshCw, MapPin, Handshake, Gavel,
  ChevronDown, ChevronUp, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/app/Header";
import { JurisdictionHeader } from "@/components/app/JurisdictionHeader";
import { JurisdictionContextHeader } from "@/components/app/JurisdictionContextHeader";
import { LawSectionCard } from "@/components/app/LawSectionCard";
import { EnforcementList } from "@/components/app/EnforcementList";
import { UnsupportedStateNotice } from "@/components/app/UnsupportedStateNotice";
import { ChatBox } from "@/components/app/ChatBox";
import type { CustodyLawRecord, Jurisdiction } from "@shared/schema";

/**
 * JurisdictionPage
 *
 * Loads the matching state's custody law record from /api/custody-laws/:state
 * (backed by custody_laws.json via custody-laws-store.ts on the server).
 *
 * All display is handled by reusable components:
 *   JurisdictionHeader   — location summary with coordinates
 *   LawSectionCard       — collapsible card for each law category
 *   EnforcementList      — structured list of enforcement options
 *   UnsupportedStateNotice — friendly fallback for uncovered states
 *
 * Future DB migration: only the /api/custody-laws/:state endpoint needs to change.
 */
export default function JurisdictionPage() {
  const [match, params] = useRoute("/jurisdiction/:state/:county");
  const [location] = useLocation();
  const [askAIOpen, setAskAIOpen] = useState(false);

  if (!match || !params) return null;

  const state = decodeURIComponent(params.state);
  const county = decodeURIComponent(params.county);
  const urlParams = new URLSearchParams(location.split("?")[1] || "");

  const jurisdiction: Jurisdiction = {
    state,
    county,
    country: urlParams.get("country") ?? "United States",
    formattedAddress: urlParams.get("address") ?? undefined,
    latitude: urlParams.get("lat") ? Number(urlParams.get("lat")) : undefined,
    longitude: urlParams.get("lng") ? Number(urlParams.get("lng")) : undefined,
  };

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

  const isUnsupported = error instanceof Error && error.message === "unsupported_state";

  const askAIPath =
    `/ask?state=${encodeURIComponent(state)}&county=${encodeURIComponent(county)}` +
    `&country=${encodeURIComponent(jurisdiction.country ?? "United States")}` +
    (jurisdiction.formattedAddress ? `&address=${encodeURIComponent(jurisdiction.formattedAddress)}` : "");

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Find My Laws", href: "/location" },
          { label: `${county} County, ${state}` },
        ]}
      />

      <JurisdictionContextHeader
        mode="jurisdiction"
        state={state}
        county={county}
        changeLocationHref="/location"
      />

      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-1" data-testid="heading-jurisdiction">
          Child Custody Laws — {state}
        </h1>
        <p className="text-muted-foreground text-sm">
          Jurisdiction-specific information for {county} County
        </p>
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
                      Ask AI About {state} Custody Law
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
                  className="p-4 h-[520px] flex flex-col"
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
