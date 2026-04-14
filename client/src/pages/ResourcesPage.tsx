import { useState } from "react";
import { ExternalLink, Loader2, MapPin, Phone, BellRing, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocationSelector } from "@/components/app/LocationSelector";
import { PageHeader, PageShell } from "@/components/app/PageShell";
import { useJurisdiction } from "@/hooks/useJurisdiction";
import { useCurrentUser } from "@/hooks/use-auth";
import { apiRequestRaw } from "@/lib/queryClient";
import { formatJurisdictionLabel } from "@/lib/jurisdictionUtils";
import { useToast } from "@/hooks/use-toast";
import type { Jurisdiction } from "@shared/schema";

interface ResourceItem {
  name: string;
  description: string;
  url: string;
  phone?: string;
  tags: string[];
}

interface ResourcesResponse {
  legal_aid: ResourceItem[];
  government_resources: ResourceItem[];
  court_self_help: ResourceItem[];
  mediation: ResourceItem[];
}

type ResourceCategoryKey = keyof ResourcesResponse;

interface ResourceSectionConfig {
  key: ResourceCategoryKey;
  heading: string;
  label: string;
  description: string;
  tag: string;
  tagClassName: string;
  accentClassName: string;
  prominentPhone?: boolean;
}

const RESOURCE_SECTIONS: ResourceSectionConfig[] = [
  {
    key: "legal_aid",
    heading: "Legal aid",
    label: "Free legal help",
    description: "Income-qualified free legal representation for custody and family law matters",
    tag: "Income-qualified",
    tagClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    accentClassName: "border-emerald-200/80",
  },
  {
    key: "government_resources",
    heading: "Government & state resources",
    label: "Government and state programs",
    description: "State and county agencies that provide direct support, enforcement, and guidance for custody and family law matters",
    tag: "Government",
    tagClassName: "border-amber-200 bg-amber-50 text-amber-700",
    accentClassName: "border-amber-200/80",
    prominentPhone: true,
  },
  {
    key: "court_self_help",
    heading: "Court self-help",
    label: "Court self-help centers",
    description: "In-person guidance on forms, filing, and self-representation at your local courthouse",
    tag: "Free",
    tagClassName: "border-blue-200 bg-blue-50 text-blue-700",
    accentClassName: "border-blue-200/80",
  },
  {
    key: "mediation",
    heading: "Mediation",
    label: "Mediation services",
    description: "Neutral third-party help to reach custody agreements outside of court",
    tag: "Low-cost",
    tagClassName: "border-teal-200 bg-teal-50 text-teal-700",
    accentClassName: "border-teal-200/80",
  },
];

function ResourceSkeleton({ accentClassName }: { accentClassName: string }) {
  return (
    <div className={`rounded-xl border bg-card px-4 py-4 animate-pulse ${accentClassName}`}>
      <div className="h-4 w-40 rounded bg-muted" />
      <div className="mt-3 h-3 w-full rounded bg-muted" />
      <div className="mt-2 h-3 w-5/6 rounded bg-muted" />
      <div className="mt-4 h-3 w-32 rounded bg-muted" />
    </div>
  );
}

function ResourceCard({
  resource,
  prominentPhone,
}: {
  resource: ResourceItem;
  prominentPhone?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{resource.name}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{resource.description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <a
          href={resource.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:text-primary/80"
        >
          Visit site
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {resource.phone && (
          <span
            className={`inline-flex items-center gap-1.5 ${
              prominentPhone
                ? "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700"
                : "text-muted-foreground"
            }`}
          >
            <Phone className="h-3.5 w-3.5" />
            {resource.phone}
          </span>
        )}
      </div>
      {resource.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {resource.tags.map((tag) => (
            <span
              key={`${resource.name}-${tag}`}
              className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyCategoryState({
  heading,
  county,
  state,
}: {
  heading: string;
  county: string;
  state: string;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-4 py-5 text-sm text-muted-foreground">
      We couldn&apos;t find specific {heading.toLowerCase()} resources for {county}, {state}. Try searching{" "}
      <a
        href="https://www.lawhelp.org/"
        target="_blank"
        rel="noreferrer"
        className="font-medium text-primary hover:text-primary/80"
      >
        LawHelp.org
      </a>{" "}
      for your area.
    </div>
  );
}

function ResourceCategorySection({
  config,
  items,
  isLoading,
  county,
  state,
}: {
  config: ResourceSectionConfig;
  items: ResourceItem[];
  isLoading: boolean;
  county: string;
  state: string;
}) {
  return (
    <Card className={`border ${config.accentClassName}`}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {config.heading}
            </p>
            <CardTitle className="mt-2">{config.label}</CardTitle>
            <CardDescription className="mt-2 max-w-2xl">{config.description}</CardDescription>
          </div>
          <Badge variant="outline" className={config.tagClassName}>
            {config.tag}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <ResourceSkeleton accentClassName={config.accentClassName} />
            <ResourceSkeleton accentClassName={config.accentClassName} />
          </>
        ) : items.length > 0 ? (
          items.map((resource) => (
            <ResourceCard
              key={`${config.key}-${resource.name}`}
              resource={resource}
              prominentPhone={config.prominentPhone}
            />
          ))
        ) : (
          <EmptyCategoryState heading={config.label} county={county} state={state} />
        )}
      </CardContent>
    </Card>
  );
}

export default function ResourcesPage() {
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const { toast } = useToast();
  const { user } = useCurrentUser();

  const urlParams = new URLSearchParams(window.location.search);
  const stateParam = urlParams.get("state");
  const countyParam = urlParams.get("county");
  const urlJurisdiction: Jurisdiction | null = stateParam
    ? {
        state: stateParam,
        county: countyParam ?? "",
        country: urlParams.get("country") || "United States",
        formattedAddress: urlParams.get("address") || undefined,
        latitude: urlParams.get("lat") ? Number(urlParams.get("lat")) : undefined,
        longitude: urlParams.get("lng") ? Number(urlParams.get("lng")) : undefined,
      }
    : null;

  const { jurisdiction, setJurisdiction } = useJurisdiction(urlJurisdiction);

  const resourcesUrl = jurisdiction
    ? `/api/resources?state=${encodeURIComponent(jurisdiction.state)}&county=${encodeURIComponent(jurisdiction.county)}`
    : null;

  const legalAidQuery = useQuery<ResourceItem[]>({
    queryKey: ["/api/resources", "legal_aid", jurisdiction?.state, jurisdiction?.county],
    enabled: !!resourcesUrl,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", resourcesUrl!);
      if (!res.ok) throw new Error("Failed to load legal aid resources.");
      const data = await res.json() as ResourcesResponse;
      return data.legal_aid ?? [];
    },
  });

  const courtSelfHelpQuery = useQuery<ResourceItem[]>({
    queryKey: ["/api/resources", "court_self_help", jurisdiction?.state, jurisdiction?.county],
    enabled: !!resourcesUrl,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", resourcesUrl!);
      if (!res.ok) throw new Error("Failed to load self-help resources.");
      const data = await res.json() as ResourcesResponse;
      return data.court_self_help ?? [];
    },
  });

  const governmentResourcesQuery = useQuery<ResourceItem[]>({
    queryKey: ["/api/resources", "government_resources", jurisdiction?.state, jurisdiction?.county],
    enabled: !!resourcesUrl,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", resourcesUrl!);
      if (!res.ok) throw new Error("Failed to load government resources.");
      const data = await res.json() as ResourcesResponse;
      return data.government_resources ?? [];
    },
  });

  const mediationQuery = useQuery<ResourceItem[]>({
    queryKey: ["/api/resources", "mediation", jurisdiction?.state, jurisdiction?.county],
    enabled: !!resourcesUrl,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", resourcesUrl!);
      if (!res.ok) throw new Error("Failed to load mediation resources.");
      const data = await res.json() as ResourcesResponse;
      return data.mediation ?? [];
    },
  });

  const handleJurisdictionFound = (next: Jurisdiction) => {
    setJurisdiction(next);
    setShowLocationPicker(false);
  };

  async function handleNotifyMe() {
    if (!jurisdiction || !user?.email || waitlistLoading || waitlistJoined) return;

    setWaitlistLoading(true);
    try {
      const res = await apiRequestRaw("POST", "/api/resources/attorney-waitlist", {
        email: user.email,
        state: jurisdiction.state,
        county: jurisdiction.county,
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Could not join waitlist.");
      }

      setWaitlistJoined(true);
      toast({
        title: "You’re on the list",
        description: "We’ll let you know when attorney consultations open in your area.",
      });
    } catch (error: any) {
      toast({
        title: "Could not join waitlist",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setWaitlistLoading(false);
    }
  }

  if (!jurisdiction || showLocationPicker) {
    const previousJurisdiction = showLocationPicker ? jurisdiction : null;
    return (
      <PageShell className="max-w-3xl">
        <PageHeader
          eyebrow="Resources"
          title={previousJurisdiction ? "Update your location" : "Find help near you"}
          subtitle={previousJurisdiction
            ? "Change your location only if you need resources in a different county."
            : "Set your county so we can show free and low-cost custody help available near you."}
        />

        {previousJurisdiction && (
          <div className="mb-4 flex items-center justify-between rounded-xl border bg-card px-4 py-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Current location</p>
              <p className="text-sm font-semibold text-foreground">
                {formatJurisdictionLabel(previousJurisdiction.state, previousJurisdiction.county)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowLocationPicker(false)}>
              Keep this location
            </Button>
          </div>
        )}

        <LocationSelector onJurisdictionFound={handleJurisdictionFound} />
      </PageShell>
    );
  }

  const jurisdictionLabel = formatJurisdictionLabel(jurisdiction.state, jurisdiction.county);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border bg-card px-6 py-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Resources</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Resources</h1>
              <p className="mt-2 text-base text-muted-foreground">
                Free and low-cost help available in your area
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-sm font-medium text-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              {jurisdictionLabel}
              <button
                onClick={() => setShowLocationPicker(true)}
                className="ml-2 text-xs font-medium text-primary hover:text-primary/80"
              >
                Change
              </button>
            </div>
          </div>
        </div>

        {RESOURCE_SECTIONS.map((section) => {
          const query = section.key === "legal_aid"
            ? legalAidQuery
            : section.key === "government_resources"
              ? governmentResourcesQuery
            : section.key === "court_self_help"
              ? courtSelfHelpQuery
              : mediationQuery;

          return (
            <ResourceCategorySection
              key={section.key}
              config={section}
              items={query.data ?? []}
              isLoading={query.isLoading}
              county={jurisdiction.county}
              state={jurisdiction.state}
            />
          );
        })}

        <Card className="border-purple-300 bg-gradient-to-br from-card via-card to-purple-50/40 shadow-md" style={{ borderWidth: "1.5px" }}>
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-700">Attorney portal</p>
                <CardTitle className="mt-2">Vetted family law attorneys</CardTitle>
                <CardDescription className="mt-2 max-w-2xl">
                  Connect with custody attorneys who can see your case context and offer flat-fee consultations — no cold calls, no intake forms
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">
                Coming soon
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {["Case-aware consultations", "Flat-fee hearing prep", "Unbundled representation"].map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border border-purple-200 bg-white/80 px-3 py-1 text-xs font-medium text-purple-700"
                >
                  {pill}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {user ? (
                <Button
                  onClick={handleNotifyMe}
                  disabled={waitlistJoined || waitlistLoading}
                  className="gap-2"
                >
                  {waitlistLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                  {waitlistJoined ? "You’re on the list" : "Notify me when available"}
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Sign in to get notified
                </Button>
              )}

              <p className="text-sm text-muted-foreground">
                We’ll reach out when vetted attorneys are available for {jurisdictionLabel}.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
