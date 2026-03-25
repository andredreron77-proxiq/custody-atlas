import { useState } from "react";
import { useLocation, Link } from "wouter";
import { MessageSquare, MapPin, ArrowRight, Loader2, Lock, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatBox } from "@/components/app/ChatBox";
import { LocationSelector } from "@/components/app/LocationSelector";
import { Breadcrumb } from "@/components/app/Header";
import { JurisdictionContextHeader } from "@/components/app/JurisdictionContextHeader";
import { useJurisdiction } from "@/hooks/useJurisdiction";
import type { ChatMessage, Jurisdiction } from "@shared/schema";
import { formatJurisdictionLabel } from "@/lib/jurisdictionUtils";
import { apiRequestRaw } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { fetchUsageState } from "@/services/usageService";
import type { UsageState } from "@/services/usageService";
import { cn } from "@/lib/utils";

interface ThreadWithMessages {
  thread: {
    id: string;
    title: string | null;
    jurisdictionState: string | null;
    jurisdictionCounty: string | null;
    threadType: string;
    createdAt: string;
  };
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    messageText: string;
    structuredResponseJson: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export default function AskAIPage() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(
    location.split("?")[1] || window.location.search.slice(1)
  );

  const stateParam = urlParams.get("state");
  const countyParam = urlParams.get("county");
  const initialQuestion = urlParams.get("q") ?? undefined;
  const threadIdParam = urlParams.get("thread") ?? undefined;

  const urlJurisdiction: Jurisdiction | null =
    stateParam
      ? {
          state: stateParam,
          county: countyParam ?? "",
          country: urlParams.get("country") || "United States",
          formattedAddress: urlParams.get("address") || undefined,
          latitude: urlParams.get("lat") ? Number(urlParams.get("lat")) : undefined,
          longitude: urlParams.get("lng") ? Number(urlParams.get("lng")) : undefined,
        }
      : null;

  const { jurisdiction, setJurisdiction, clearJurisdiction } = useJurisdiction(urlJurisdiction);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Thread resume: fetch saved messages when ?thread= is in URL
  const { data: threadData, isLoading: isLoadingThread } = useQuery<ThreadWithMessages | null>({
    queryKey: ["/api/threads", threadIdParam],
    enabled: !!threadIdParam,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      if (!threadIdParam) return null;
      const res = await apiRequestRaw("GET", `/api/threads/${threadIdParam}`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  // Usage/plan info — must be declared before any early returns (Rules of Hooks)
  const { data: usage } = useQuery<UsageState>({
    queryKey: ["/api/usage"],
    queryFn: fetchUsageState,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const isFreeUser = usage?.isAuthenticated && usage.tier === "free";
  const isProUser = usage?.isAuthenticated && usage.tier === "pro";
  const nearLimit = isFreeUser && usage.questionsLimit !== null && usage.questionsUsed >= Math.ceil(usage.questionsLimit * 0.6);

  const handleJurisdictionFound = (j: Jurisdiction) => {
    setJurisdiction(j);
    setShowLocationPicker(false);
  };

  const handleChangeLocation = () => {
    clearJurisdiction();
    setShowLocationPicker(true);
  };

  // While loading a resumed thread, show a centered spinner
  if (threadIdParam && isLoadingThread) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
        <p className="text-sm text-muted-foreground">Loading your conversation...</p>
      </div>
    );
  }

  // Convert thread messages to ChatMessage[] for ChatBox
  const initialMessages: ChatMessage[] | undefined = threadData?.messages?.map((m) => ({
    role: m.role,
    content: m.messageText,
    structured: (m.structuredResponseJson as any) ?? undefined,
  }));

  /* ── Location picker (no jurisdiction yet) ───────────────────────────── */
  if (!jurisdiction || showLocationPicker) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2" data-testid="heading-ask-ai">
            Ask Atlas
          </h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Share your location so we can provide information specific to your state's custody laws.
          </p>
        </div>

        <LocationSelector onJurisdictionFound={handleJurisdictionFound} />

        <div className="flex flex-col items-center gap-2 mt-6">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3 h-3" />
            <span>Your location is only used to identify applicable laws — never stored.</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="w-3 h-3" />
            <span>Custody Atlas provides general legal information, not legal advice.</span>
          </div>
        </div>
      </div>
    );
  }

  const lawPagePath =
    `/jurisdiction/${encodeURIComponent(jurisdiction.state)}/${encodeURIComponent(jurisdiction.county)}` +
    `?country=${encodeURIComponent(jurisdiction.country ?? "United States")}` +
    `&address=${encodeURIComponent(jurisdiction.formattedAddress || "")}` +
    (jurisdiction.latitude !== undefined ? `&lat=${jurisdiction.latitude}` : "") +
    (jurisdiction.longitude !== undefined ? `&lng=${jurisdiction.longitude}` : "");

  /* ── Main Ask AI layout ───────────────────────────────────────────────── */
  return (
    <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">

      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: formatJurisdictionLabel(jurisdiction.state, jurisdiction.county), href: lawPagePath },
          { label: threadData?.thread?.title ?? "Ask Atlas" },
        ]}
      />

      {/* Jurisdiction context bar + action buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <JurisdictionContextHeader
          mode="jurisdiction"
          state={jurisdiction.state}
          county={jurisdiction.county}
          onChangeLocation={handleChangeLocation}
        />

        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          {/* Plan badge */}
          {isProUser && (
            <Badge className="text-xs gap-1 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/50 font-medium" data-testid="badge-plan-pro">
              <Zap className="w-3 h-3" />
              Pro
            </Badge>
          )}
          {isFreeUser && (
            <Badge variant="outline" className={cn("text-xs gap-1 font-medium", nearLimit && "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400")} data-testid="badge-plan-free">
              {nearLimit ? <Zap className="w-3 h-3" /> : null}
              {nearLimit
                ? `${usage!.questionsUsed}/${usage!.questionsLimit} questions used`
                : "Free plan"}
            </Badge>
          )}
          <Link href={lawPagePath}>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" data-testid="button-view-laws">
              <ArrowRight className="w-3.5 h-3.5" />
              View Law Summary
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleChangeLocation}
            className="gap-1.5 text-xs"
            data-testid="button-change-location"
          >
            <MapPin className="w-3.5 h-3.5" />
            Change Location
          </Button>
        </div>
      </div>

      {/* ChatBox — input sticky when active, conversation grows below */}
      <ChatBox
        jurisdiction={jurisdiction}
        initialQuestion={initialQuestion}
        initialMessages={initialMessages}
        initialThreadId={threadIdParam}
      />

      {/* Trust signal footer */}
      <div className="flex items-center justify-center gap-4 pt-2 pb-6 flex-wrap" data-testid="trust-signals">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
          <Lock className="w-3 h-3" />
          <span>Your data is private and tied to your account</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
          <Shield className="w-3 h-3" />
          <span>General legal information — not legal advice</span>
        </div>
      </div>

    </div>
  );
}
