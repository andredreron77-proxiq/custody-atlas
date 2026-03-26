import { useState } from "react";
import { useLocation, Link } from "wouter";
import { MessageSquare, MapPin, ArrowRight, Loader2, Lock, Zap, Shield, FolderOpen, ChevronDown, CheckCheck, Hash, Building2, Calendar, ClipboardList, CircleCheck, X, FileText } from "lucide-react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchUsageState } from "@/services/usageService";
import type { UsageState } from "@/services/usageService";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-auth";

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

interface CaseRecord {
  id: string;
  title: string;
  status: string;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
}

interface CaseFactItem {
  id: number;
  factType: string;
  value: string;
  source: string;
  sourceName: string | null;
  confidence: string;
}

const KEY_FACT_TYPES: Array<{ key: string; label: string; icon: typeof Hash }> = [
  { key: "court_name",    label: "Court",         icon: Building2 },
  { key: "case_number",   label: "Case #",        icon: Hash },
  { key: "hearing_date",  label: "Hearing Date",  icon: Calendar },
];

function CaseFactsPanel({ caseId }: { caseId: string }) {
  const { data, isLoading } = useQuery<{ facts: CaseFactItem[] }>({
    queryKey: ["/api/cases", caseId, "facts"],
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/facts`);
      if (!res.ok) return { facts: [] };
      return res.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) return null;

  const facts = data?.facts ?? [];
  // For each key type, prefer user_confirmed then highest confidence
  const keyFacts = KEY_FACT_TYPES.map(({ key, label, icon: Icon }) => {
    const rows = facts.filter((f) => f.factType === key);
    if (rows.length === 0) return null;
    const confirmed = rows.find((r) => r.source === "user_confirmed");
    const best = confirmed ?? rows[0];
    return { key, label, Icon, value: best.value, isConfirmed: best.source === "user_confirmed" };
  }).filter(Boolean) as Array<{ key: string; label: string; Icon: typeof Hash; value: string; isConfirmed: boolean }>;

  if (keyFacts.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 flex flex-wrap gap-x-4 gap-y-1.5" data-testid="case-facts-panel">
      {keyFacts.map(({ key, label, Icon, value, isConfirmed }) => (
        <div key={key} className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground font-medium">{label}:</span>
          <span className="text-xs font-semibold text-foreground truncate max-w-[150px]">{value}</span>
          {isConfirmed && (
            <CheckCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-label="User confirmed" />
          )}
        </div>
      ))}
    </div>
  );
}

interface CaseActionItem {
  id: number;
  actionType: string;
  title: string;
  description: string;
  status: "open" | "completed" | "dismissed";
  urgency: "overdue" | "urgent" | "soon" | "normal";
  daysUntilHearing: number | null;
  createdAt: string;
}

const URGENCY_STYLES: Record<
  CaseActionItem["urgency"],
  { badge: string; border: string; label: (days: number | null) => string }
> = {
  overdue: {
    badge:  "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
    border: "border-l-2 border-l-red-400 dark:border-l-red-600",
    label:  () => "Overdue",
  },
  urgent: {
    badge:  "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
    border: "border-l-2 border-l-orange-400 dark:border-l-orange-600",
    label:  (d) => d === 0 ? "Due today" : `Due in ${d} day${d === 1 ? "" : "s"}`,
  },
  soon: {
    badge:  "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
    border: "border-l-2 border-l-amber-400 dark:border-l-amber-600",
    label:  (d) => d != null ? `In ${d} days` : "Coming up",
  },
  normal: {
    badge:  "",
    border: "",
    label:  () => "",
  },
};

function CaseActionsPanel({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["/api/cases", caseId, "actions"];

  const { data, isLoading } = useQuery<{ actions: CaseActionItem[]; hearingDate: string | null }>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/actions`);
      if (!res.ok) return { actions: [], hearingDate: null };
      return res.json();
    },
    staleTime: 20_000,
  });

  const [pendingId, setPendingId] = useState<number | null>(null);

  async function markStatus(actionId: number, status: "completed" | "dismissed") {
    setPendingId(actionId);
    try {
      const res = await apiRequestRaw("PATCH", `/api/case-actions/${actionId}`, { status });
      if (res.ok) queryClient.invalidateQueries({ queryKey });
    } finally {
      setPendingId(null);
    }
  }

  if (isLoading) return null;

  const openActions = (data?.actions ?? []).filter((a) => a.status === "open").slice(0, 5);
  if (openActions.length === 0) return null;

  const hasUrgent = openActions.some((a) => a.urgency === "overdue" || a.urgency === "urgent");

  return (
    <div className="rounded-lg border bg-card divide-y overflow-hidden" data-testid="case-actions-panel">
      <div className={`px-3 py-2 flex items-center gap-2 ${hasUrgent ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}>
        <ClipboardList className={`w-3.5 h-3.5 ${hasUrgent ? "text-red-600 dark:text-red-400" : "text-primary/70"}`} />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Action Items</span>
        <Badge
          variant="outline"
          className={`ml-auto text-xs h-5 px-1.5 ${hasUrgent ? "border-red-300 dark:border-red-700 text-red-700 dark:text-red-300" : ""}`}
        >
          {openActions.length} open
        </Badge>
      </div>
      {openActions.map((action) => {
        const style = URGENCY_STYLES[action.urgency];
        const urgencyLabel = style.label(action.daysUntilHearing);
        return (
          <div
            key={action.id}
            className={`px-3 py-2.5 flex items-start gap-2.5 ${style.border}`}
            data-testid={`action-item-${action.id}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2 flex-wrap">
                <p className="text-xs font-medium text-foreground leading-snug flex-1 min-w-0">{action.title}</p>
                {urgencyLabel && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${style.badge}`}>
                    {urgencyLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{action.description}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
              <button
                onClick={() => markStatus(action.id, "completed")}
                disabled={pendingId === action.id}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors disabled:opacity-50"
                data-testid={`button-complete-action-${action.id}`}
              >
                {pendingId === action.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <CircleCheck className="w-3 h-3" />}
                Done
              </button>
              <button
                onClick={() => markStatus(action.id, "dismissed")}
                disabled={pendingId === action.id}
                className="inline-flex items-center p-1 rounded text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                aria-label="Dismiss"
                data-testid={`button-dismiss-action-${action.id}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
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
  // ?conversation= resumes a case-aware conversation (Supabase conversations table)
  // This is DIFFERENT from ?thread= which is the legacy threads table.
  const conversationIdParam = urlParams.get("conversation") ?? undefined;
  // ?case= URL param lets other pages deep-link into a specific case context
  const caseIdParam = urlParams.get("case") ?? undefined;
  // ?document= scopes this Ask Atlas session to a specific uploaded document.
  // When present, every question is answered from that document first.
  const documentIdParam = urlParams.get("document") ?? undefined;

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
  const [activeCaseId, setActiveCaseId] = useState<string | undefined>(caseIdParam);
  const [showCasePicker, setShowCasePicker] = useState(false);
  const { user } = useCurrentUser();

  // Legacy thread resume: fetch saved messages when ?thread= is in URL
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

  // Case conversation resume: fetch messages when ?conversation= is in URL.
  // Uses the new Supabase conversations/messages path, NOT the legacy threads path.
  const { data: convMessagesData, isLoading: isLoadingConversation } = useQuery<{
    messages: Array<{
      id: string;
      role: "user" | "assistant";
      messageText: string;
      structuredResponseJson: Record<string, unknown> | null;
      createdAt: string;
    }>;
  } | null>({
    queryKey: ["/api/conversations", conversationIdParam, "messages"],
    enabled: !!conversationIdParam,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      if (!conversationIdParam) return null;
      const res = await apiRequestRaw("GET", `/api/conversations/${conversationIdParam}/messages`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  // Document scope: fetch the selected document's metadata so we can show the
  // scope indicator.  extractedText is NOT returned by this endpoint (too large).
  interface ScopedDocMeta {
    id: string;
    fileName: string;
    docType: string;
    pageCount: number;
    analysisJson: Record<string, unknown>;
  }
  const { data: scopedDocMeta } = useQuery<ScopedDocMeta | null>({
    queryKey: ["/api/documents", documentIdParam],
    enabled: !!documentIdParam,
    staleTime: 120_000,
    retry: false,
    queryFn: async () => {
      if (!documentIdParam) return null;
      const res = await apiRequestRaw("GET", `/api/documents/${documentIdParam}`);
      if (!res.ok) return null;
      const json = await res.json();
      // GET /api/documents/:id returns { document: {...} }
      return json.document ?? json;
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

  // Cases list — only fetched when the user is authenticated
  const { data: casesData } = useQuery<{ cases: CaseRecord[] }>({
    queryKey: ["/api/cases"],
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const cases = casesData?.cases ?? [];
  const activeCase = cases.find((c) => c.id === activeCaseId) ?? null;

  const handleJurisdictionFound = (j: Jurisdiction) => {
    setJurisdiction(j);
    setShowLocationPicker(false);
  };

  const handleChangeLocation = () => {
    clearJurisdiction();
    setShowLocationPicker(true);
  };

  // While loading a resumed thread or conversation, show a centered spinner
  if ((threadIdParam && isLoadingThread) || (conversationIdParam && isLoadingConversation)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
        <p className="text-sm text-muted-foreground">Loading your conversation...</p>
      </div>
    );
  }

  // Build initialMessages from whichever resume path is active:
  //   ?thread=   → legacy threads table  (no case context)
  //   ?conversation= → Supabase conversations (case-aware)
  const initialMessages: ChatMessage[] | undefined =
    threadData?.messages?.map((m) => ({
      role: m.role,
      content: m.messageText,
      structured: (m.structuredResponseJson as any) ?? undefined,
    })) ??
    convMessagesData?.messages?.map((m) => ({
      role: m.role as "user" | "assistant",
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

      {/* Case context picker — only shown for authenticated users with cases */}
      {user && (
        <div className="rounded-lg border bg-muted/20 px-3 py-2 flex items-center justify-between gap-3 text-sm" data-testid="case-context-bar">
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
            {activeCase ? (
              <span className="font-medium text-foreground truncate">{activeCase.title}</span>
            ) : (
              <span className="text-muted-foreground">No case linked — responses save to General Workspace</span>
            )}
          </div>
          <div className="relative flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs h-7 px-2"
              onClick={() => setShowCasePicker((v) => !v)}
              data-testid="button-pick-case"
            >
              {activeCase ? "Change" : "Link Case"}
              <ChevronDown className="w-3 h-3" />
            </Button>
            {showCasePicker && (
              <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-lg border bg-popover shadow-lg py-1 text-sm">
                <button
                  className="w-full text-left px-3 py-2 hover:bg-muted/60 text-muted-foreground text-xs"
                  onClick={() => { setActiveCaseId(undefined); setShowCasePicker(false); }}
                  data-testid="option-no-case"
                >
                  No case (General Workspace)
                </button>
                {cases.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground italic">No cases yet — create one in the Workspace.</p>
                )}
                {cases.map((c) => (
                  <button
                    key={c.id}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-muted/60",
                      c.id === activeCaseId && "bg-primary/8 font-medium text-primary"
                    )}
                    onClick={() => { setActiveCaseId(c.id); setShowCasePicker(false); }}
                    data-testid={`option-case-${c.id}`}
                  >
                    <span className="block truncate">{c.title}</span>
                    {c.jurisdictionState && (
                      <span className="text-xs text-muted-foreground">{c.jurisdictionState}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document scope indicator — shown when ?document= is in URL */}
      {documentIdParam && (
        <div
          className="rounded-lg border border-blue-200 dark:border-blue-800/60 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2 flex items-center gap-2.5"
          data-testid="document-scope-indicator"
        >
          <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Document scope active</span>
            {scopedDocMeta ? (
              <span className="ml-1.5 text-xs text-blue-600/80 dark:text-blue-400/80 truncate">
                — {scopedDocMeta.fileName}
              </span>
            ) : (
              <span className="ml-1.5 text-xs text-blue-500/60 dark:text-blue-500/60">Loading…</span>
            )}
          </div>
          <span className="text-xs text-blue-500/70 dark:text-blue-400/50 flex-shrink-0 hidden sm:inline">
            Questions answered from this document first
          </span>
          <Link href={`/ask${jurisdiction ? `?state=${encodeURIComponent(jurisdiction.state)}&county=${encodeURIComponent(jurisdiction.county)}` : ""}`}>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-blue-600/70 hover:text-blue-700 dark:text-blue-400/70" data-testid="button-clear-document-scope">
              <X className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      )}

      {/* Case facts quick-view — shows court, case number, hearing date for active case */}
      {activeCaseId && <CaseFactsPanel caseId={activeCaseId} />}

      {/* Case actions — open action items generated from known facts */}
      {activeCaseId && <CaseActionsPanel caseId={activeCaseId} />}

      {/* ChatBox — input sticky when active, conversation grows below */}
      <ChatBox
        jurisdiction={jurisdiction}
        initialQuestion={initialQuestion}
        initialMessages={initialMessages}
        initialThreadId={threadIdParam}
        initialConversationId={conversationIdParam}
        caseId={activeCaseId}
        documentId={documentIdParam}
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
