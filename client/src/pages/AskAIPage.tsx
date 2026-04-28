import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { MessageSquare, ArrowRight, Loader2, Lock, Zap, Shield, FolderOpen, ChevronDown, CheckCheck, Hash, Building2, Calendar, ClipboardList, CircleCheck, X, FileText, AlertTriangle, Check, ChevronRight, Files } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatBox } from "@/components/app/ChatBox";
import { LocationSelector } from "@/components/app/LocationSelector";
import { Breadcrumb } from "@/components/app/Header";
import { JurisdictionContextHeader } from "@/components/app/JurisdictionContextHeader";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import { CaseScopeBadge } from "@/components/app/CaseScopeBadge";
import { useJurisdiction } from "@/hooks/useJurisdiction";
import type { ChatMessage, Jurisdiction } from "@shared/schema";
import { formatJurisdictionLabel } from "@/lib/jurisdictionUtils";
import { apiRequestRaw } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchUsageState } from "@/services/usageService";
import type { UsageState } from "@/services/usageService";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import DismissibleWhatMattersNow from "@/components/DismissibleWhatMattersNow";
import { buildWhatMattersNow, type RawSignal, type UserTier } from "@/lib/signals";
import type { GuidedSnapshotState } from "@/components/app/SnapshotCard";

const PENDING_GUIDED_CONVERSATION_KEY = "pendingGuidedConversation";

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
    messageMetadata?: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

interface CaseConversationRecord {
  id: string;
  title: string | null;
  threadType: string;
  guidedState?: Record<string, unknown> | null;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
  createdAt: string;
}

interface CaseRecord {
  id: string;
  title: string;
  status: string;
  situationType?: string | null;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
}

interface DocumentRecord {
  id: string;
  fileName: string;
  docType: string;
  pageCount: number;
  createdAt: string;
  summary: string | null;
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
  { key: "court_name", label: "Court", icon: Building2 },
  { key: "case_number", label: "Case #", icon: Hash },
  { key: "hearing_date", label: "Hearing Date", icon: Calendar },
];

interface CaseActionItem {
  id: string;
  title: string;
  description: string | null;
  actionType: string;
  urgency: "normal" | "urgent" | "overdue";
  status: "open" | "done";
  sourceType: string;
  createdAt: string;
}

type GuidedMemoryChip = {
  kind: "calendar" | "map" | "target";
  label: string;
};

function guidedFlowLabel(situationType?: string | null): string | null {
  switch (situationType) {
    case "more_time":
      return "Getting more parenting time";
    case "respond_filing":
    case "respond_to_filing":
      return "Responding to a filing";
    case "hearing_prep":
    case "hearing_coming_up":
      return "Preparing for your hearing";
    case "figuring_things_out":
      return "Exploring your options";
    default:
      return null;
  }
}

function diffDaysFromNow(dateStr: string): number | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(d);
  startOfTarget.setHours(0, 0, 0, 0);
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
}

function formatGuidedDate(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function guidedProgressLabel(messageCount: number): string {
  if (messageCount <= 2) return "Getting to know your situation";
  if (messageCount <= 4) return "Building your case picture";
  if (messageCount <= 6) return "Identifying what matters most";
  return "Your case profile is taking shape";
}

function CasePickerMenu({
  cases,
  activeCaseId,
  onSelect,
}: {
  cases: CaseRecord[];
  activeCaseId?: string;
  onSelect: (id?: string) => void;
}) {
  return (
    <div className="absolute right-0 mt-2 w-72 rounded-lg border bg-popover shadow-lg z-30 p-1.5">
      <button
        className={cn(
          "w-full text-left rounded-md px-3 py-2 text-sm transition-colors",
          !activeCaseId ? "bg-muted text-foreground" : "hover:bg-muted/60 text-foreground/80"
        )}
        onClick={() => onSelect(undefined)}
        data-testid="option-case-none"
      >
        General Workspace
      </button>
      <div className="my-1 h-px bg-border" />
      <div className="max-h-64 overflow-auto">
        {cases.map((c) => (
          <button
            key={c.id}
            className={cn(
              "w-full text-left rounded-md px-3 py-2 text-sm transition-colors",
              activeCaseId === c.id ? "bg-muted text-foreground" : "hover:bg-muted/60 text-foreground/80"
            )}
            onClick={() => onSelect(c.id)}
            data-testid={`option-case-${c.id}`}
          >
            <div className="font-medium truncate">{c.title}</div>
            {c.jurisdictionState && (
              <span className="text-xs text-muted-foreground">{c.jurisdictionState}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AskAIPage() {
  const [location, navigate] = useLocation();
  const urlParams = new URLSearchParams(
    location.split("?")[1] || window.location.search.slice(1)
  );

  const stateParam = urlParams.get("state");
  const countyParam = urlParams.get("county");
  const initialQuestion = urlParams.get("q") ?? undefined;
  const threadIdParam = urlParams.get("thread") ?? undefined;
  const conversationIdParam = urlParams.get("conversation") ?? undefined;
  const caseIdParam = urlParams.get("case") ?? undefined;
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

  const { data: profile } = useUserProfile();
  const profileJurisdiction: Jurisdiction | null = profile?.jurisdictionState
    ? {
        state: profile.jurisdictionState,
        county: profile.jurisdictionCounty ?? "",
        country: "United States",
      }
    : null;
  const { jurisdiction, setJurisdiction } = useJurisdiction(urlJurisdiction ?? profileJurisdiction);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<string | undefined>(caseIdParam);
  const [showCasePicker, setShowCasePicker] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [showDocSelector, setShowDocSelector] = useState(false);
  const [showLinkCaseNudge, setShowLinkCaseNudge] = useState(true);
  const [hasChatMessages, setHasChatMessages] = useState(Boolean(initialQuestion));
  const [resolvedConversationId, setResolvedConversationId] = useState<string | undefined>(conversationIdParam);
  const [resolvedConversationType, setResolvedConversationType] = useState<string | undefined>(undefined);
  const [chatMessageCount, setChatMessageCount] = useState(0);
  const [initializedConversationPayload, setInitializedConversationPayload] = useState<{
    conversation: CaseConversationRecord;
    messages: Array<{
      id: string;
      role: "user" | "assistant";
      messageText: string;
      structuredResponseJson: Record<string, unknown> | null;
      messageMetadata?: Record<string, unknown> | null;
      createdAt: string;
    }>;
  } | null>(null);
  const [isInitializingGuidedConversation, setIsInitializingGuidedConversation] = useState(false);
  const guidedInitRef = useRef(false);
  const { user } = useCurrentUser();

  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [docSelectionInitialized, setDocSelectionInitialized] = useState(false);

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

  const effectiveConversationId = conversationIdParam ?? resolvedConversationId;

  const { data: convMessagesData, isLoading: isLoadingConversation } = useQuery<{
    conversation?: CaseConversationRecord;
    snapshotMemory?: (GuidedSnapshotState & {
      actions?: string[];
      savedAt?: string | null;
    }) | null;
    messages: Array<{
      id: string;
      role: "user" | "assistant";
      messageText: string;
      structuredResponseJson: Record<string, unknown> | null;
      messageMetadata?: Record<string, unknown> | null;
      createdAt: string;
    }>;
  } | null>({
    queryKey: ["/api/conversations", effectiveConversationId, "messages"],
    enabled: !!effectiveConversationId && !initializedConversationPayload,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      if (!effectiveConversationId) return null;
      const res = await apiRequestRaw("GET", `/api/conversations/${effectiveConversationId}/messages`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: usage } = useQuery<UsageState>({
    queryKey: ["/api/usage"],
    queryFn: fetchUsageState,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const isFreeUser = usage?.isAuthenticated && usage.tier === "free";
  const isProUser = usage?.isAuthenticated && usage.tier === "pro";
  const nearLimit = isFreeUser && usage.questionsLimit !== null && usage.questionsUsed >= Math.ceil(usage.questionsLimit * 0.6);

  const { data: casesData, isLoading: isLoadingCases } = useQuery<{ cases: CaseRecord[] }>({
    queryKey: ["/api/cases"],
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const cases = casesData?.cases ?? [];
  const activeCase = cases.find((c) => c.id === activeCaseId) ?? null;
  const caseJurisdiction: Jurisdiction | null = activeCase?.jurisdictionState
    ? {
        state: activeCase.jurisdictionState,
        county: activeCase.jurisdictionCounty ?? "",
        country: "United States",
      }
    : null;

  const { data: caseConversationsData, isLoading: isLoadingCaseConversations } = useQuery<{ conversations: CaseConversationRecord[] }>({
    queryKey: ["/api/cases", activeCaseId, "conversations"],
    enabled: !!activeCaseId && !threadIdParam,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      if (!activeCaseId) return { conversations: [] };
      const res = await apiRequestRaw("GET", `/api/cases/${activeCaseId}/conversations`);
      if (!res.ok) return { conversations: [] };
      return res.json();
    },
  });

  const { data: documentsData } = useQuery<{ documents: DocumentRecord[] }>({
    queryKey: ["/api/documents"],
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const userDocuments = documentsData?.documents ?? [];

  useEffect(() => {
    if (docSelectionInitialized || userDocuments.length === 0) return;
    if (documentIdParam && userDocuments.some((d) => d.id === documentIdParam)) {
      setSelectedDocIds(new Set([documentIdParam]));
    } else {
      setSelectedDocIds(new Set(userDocuments.map((d) => d.id)));
    }
    setDocSelectionInitialized(true);
  }, [userDocuments, docSelectionInitialized, documentIdParam]);

  const chatSelectedDocumentIds = docSelectionInitialized
    ? Array.from(selectedDocIds)
    : undefined;

  const { data: pageActionsData } = useQuery<{ actions: CaseActionItem[]; hearingDate: string | null }>({
    queryKey: ["/api/cases", activeCaseId, "actions"],
    enabled: !!activeCaseId,
    staleTime: 20_000,
    queryFn: async () => {
      if (!activeCaseId) return { actions: [], hearingDate: null };
      const res = await apiRequestRaw("GET", `/api/cases/${activeCaseId}/actions`);
      if (!res.ok) return { actions: [], hearingDate: null };
      return res.json();
    },
  });
  const openActions = (pageActionsData?.actions ?? []).filter((a) => a.status === "open");
  const overdueActions = openActions.filter((a) => a.urgency === "overdue");
  const urgentActions = openActions.filter((a) => a.urgency === "urgent");
  const rawHearingDate = pageActionsData?.hearingDate ?? null;
  const hearingDaysAway = rawHearingDate ? diffDaysFromNow(rawHearingDate) : null;

  const isUrgentCase = !!activeCaseId && (
    overdueActions.length > 0 ||
    urgentActions.length > 0 ||
    (hearingDaysAway !== null && hearingDaysAway <= 7)
  );
  const askPageState: "no_case" | "active_case" | "urgent_case" =
    !activeCaseId ? "no_case" :
    isUrgentCase ? "urgent_case" : "active_case";

  const [caseJurisdictionApplied, setCaseJurisdictionApplied] = useState(false);

  useEffect(() => {
    const pending = window.sessionStorage.getItem(PENDING_GUIDED_CONVERSATION_KEY);
    if (!pending) return;

    try {
      const parsed = JSON.parse(pending) as { conversationId?: string; caseId?: string };
      if (parsed.caseId) {
        setActiveCaseId(parsed.caseId);
      }
      if (parsed.conversationId) {
        setResolvedConversationId(parsed.conversationId);
        setResolvedConversationType(undefined);
        setInitializedConversationPayload(null);
      }
    } catch (error) {
      console.error("[AskAIPage] Failed to read pending guided conversation:", error);
    } finally {
      window.sessionStorage.removeItem(PENDING_GUIDED_CONVERSATION_KEY);
    }
  }, []);

  useEffect(() => {
    if (caseIdParam) return;
    if (activeCaseId) return;
    if (cases.length !== 1) return;
    setActiveCaseId(cases[0].id);
  }, [activeCaseId, caseIdParam, cases]);

  useEffect(() => {
    if (caseIdParam) {
      setActiveCaseId(caseIdParam);
    }
  }, [caseIdParam]);

  useEffect(() => {
    setResolvedConversationId(conversationIdParam);
    setResolvedConversationType(undefined);
    setInitializedConversationPayload(null);
    guidedInitRef.current = false;
  }, [activeCaseId, conversationIdParam]);

  useEffect(() => {
    if (!conversationIdParam) return;
    if (isLoadingConversation) return;
    if (initializedConversationPayload) return;
    if (convMessagesData !== null) return;

    console.warn("[AskAIPage] Conversation from URL failed to load; redirecting to /ask", {
      conversationIdParam,
      caseIdParam,
    });
    navigate("/ask", { replace: true });
  }, [
    caseIdParam,
    conversationIdParam,
    convMessagesData,
    initializedConversationPayload,
    isLoadingConversation,
    navigate,
  ]);

  useEffect(() => {
    if (threadIdParam || conversationIdParam || !activeCaseId) return;
    if (isLoadingCaseConversations) return;

    const latestConversation = caseConversationsData?.conversations?.[0];
    if (latestConversation) {
      setResolvedConversationId(latestConversation.id);
      setResolvedConversationType(latestConversation.threadType);
      setInitializedConversationPayload(null);
      return;
    }

    if (!activeCase?.situationType || guidedInitRef.current) return;

    let cancelled = false;
    guidedInitRef.current = true;
    setIsInitializingGuidedConversation(true);
    void (async () => {
      try {
        const res = await apiRequestRaw("POST", "/api/conversations/initialize-guided", {
          caseId: activeCaseId,
        });
        if (!res.ok) return;
        const data = await res.json() as {
          conversation: CaseConversationRecord;
          messages: Array<{
            id: string;
            role: "user" | "assistant";
            messageText: string;
            structuredResponseJson: Record<string, unknown> | null;
            messageMetadata?: Record<string, unknown> | null;
            createdAt: string;
          }>;
        };
        if (cancelled) return;
        setResolvedConversationId(data.conversation.id);
        setResolvedConversationType(data.conversation.threadType);
        setInitializedConversationPayload(data);
      } finally {
        setIsInitializingGuidedConversation(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeCase?.situationType,
    activeCaseId,
    caseConversationsData?.conversations,
    conversationIdParam,
    isLoadingCaseConversations,
    threadIdParam,
  ]);

  useEffect(() => {
    if (!effectiveConversationId) return;
    const matchingConversation =
      caseConversationsData?.conversations?.find((conversation) => conversation.id === effectiveConversationId)
      ?? convMessagesData?.conversation;
    if (matchingConversation?.threadType) {
      setResolvedConversationType(matchingConversation.threadType);
    }
  }, [caseConversationsData?.conversations, convMessagesData?.conversation, effectiveConversationId]);

  useEffect(() => {
    if (caseJurisdictionApplied) return;
    if (jurisdiction) { setCaseJurisdictionApplied(true); return; }
    if (!caseJurisdiction) return;
    setJurisdiction(caseJurisdiction);
    setCaseJurisdictionApplied(true);
  }, [caseJurisdiction, jurisdiction, caseJurisdictionApplied, setJurisdiction]);

  useEffect(() => {
    const saved = window.localStorage.getItem("askAtlas_contextExpanded");
    if (saved === "true") setContextExpanded(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("askAtlas_contextExpanded", contextExpanded ? "true" : "false");
  }, [contextExpanded]);

  const handleJurisdictionFound = (j: Jurisdiction) => {
    setJurisdiction(j);
    setShowLocationPicker(false);
  };

  const handleChangeLocation = () => {
    setShowLocationPicker(true);
  };

  const awaitingCaseJurisdiction =
    Boolean(caseIdParam) &&
    !jurisdiction &&
    !showLocationPicker &&
    isLoadingCases;

  const initialMessages: ChatMessage[] | undefined =
    threadData?.messages?.map((m) => ({
      role: m.role,
      content: m.messageText,
      structured: (m.structuredResponseJson as any) ?? undefined,
      metadata: m.messageMetadata ?? undefined,
    })) ??
    initializedConversationPayload?.messages?.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.messageText,
      structured: (m.structuredResponseJson as any) ?? undefined,
      metadata: m.messageMetadata ?? undefined,
    })) ??
    convMessagesData?.messages?.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.messageText,
      structured: (m.structuredResponseJson as any) ?? undefined,
      metadata: m.messageMetadata ?? undefined,
    }));

  useEffect(() => {
    if ((initialMessages?.length ?? 0) > 0) {
      setHasChatMessages(true);
    }
  }, [initialMessages]);

  const activeCaseName = activeCase?.title?.trim() || (activeCaseId ? "Unnamed Case" : null);
  const answeringScopeLabel = activeCaseName
    ? `Answering from: ${activeCaseName}`
    : "Answering from: General Workspace";
  const guidedContextLabel =
    resolvedConversationType?.startsWith("guided_")
      ? guidedFlowLabel(activeCase?.situationType)
      : null;
  const guidedMemoryChips: GuidedMemoryChip[] = [];
  if (guidedContextLabel) {
    guidedMemoryChips.push({ kind: "target", label: `Goal: ${guidedContextLabel}` });
  }
  if (rawHearingDate) {
    const formattedHearingDate = formatGuidedDate(rawHearingDate);
    if (formattedHearingDate) {
      guidedMemoryChips.push({ kind: "calendar", label: `Hearing: ${formattedHearingDate}` });
    }
  }
  if (jurisdiction?.state) {
    const locationLabel = jurisdiction.county && jurisdiction.county !== "General"
      ? `${jurisdiction.state}, ${jurisdiction.county} County`
      : jurisdiction.state;
    guidedMemoryChips.push({ kind: "map", label: locationLabel });
  }
  const guidedProgress = guidedContextLabel ? guidedProgressLabel(chatMessageCount) : null;
  const initializedConversation = initializedConversationPayload?.conversation ?? null;
  const activeConversationRecord =
    initializedConversation?.id === effectiveConversationId
      ? initializedConversation
      : caseConversationsData?.conversations?.find((conversation) => conversation.id === effectiveConversationId)
        ?? convMessagesData?.conversation
        ?? null;
  const activeGuidedState = activeConversationRecord?.guidedState ?? null;
  const activeSnapshotState = convMessagesData?.snapshotMemory
    ? ({ ...convMessagesData.snapshotMemory } as GuidedSnapshotState)
    : undefined;
  const activeSnapshotActions = Array.isArray(convMessagesData?.snapshotMemory?.actions)
    ? convMessagesData.snapshotMemory.actions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;
  const selectedDocCount = chatSelectedDocumentIds ? chatSelectedDocumentIds.length : userDocuments.length;
  const userTier: UserTier = isProUser ? "pro" : "free";

  const { data: signalsData, isLoading: isLoadingSignals } = useQuery<{ signals: RawSignal[] }>({
    queryKey: ["/api/signals", "case", activeCaseId],
    enabled: !!activeCaseId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!activeCaseId) return { signals: [] };
      const res = await apiRequestRaw("GET", `/api/signals?caseId=${encodeURIComponent(activeCaseId)}`);
      if (!res.ok) return { signals: [] };
      return res.json();
    },
  });

  const whatMattersNowPreview = activeCaseId
    ? buildWhatMattersNow(signalsData?.signals ?? [], {
        tier: userTier,
        totalDocuments: userDocuments.length,
        lastActivityDaysAgo: 0,
      })
    : null;
  const topCaseSignals: RawSignal[] = (whatMattersNowPreview?.signals ?? [])
    .slice(0, 2)
    .map(({ score, locked, daysUntilDue, ...raw }) => raw);

  if ((threadIdParam && isLoadingThread) || (effectiveConversationId && !initializedConversationPayload && isLoadingConversation) || isInitializingGuidedConversation) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
        <p className="text-sm text-muted-foreground">Loading your conversation...</p>
      </div>
    );
  }

  if (awaitingCaseJurisdiction) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
        <p className="text-sm text-muted-foreground">Loading case context...</p>
      </div>
    );
  }

  if (!jurisdiction || showLocationPicker) {
    const previousJurisdiction = showLocationPicker ? jurisdiction : null;

    return (
      <PageShell className="max-w-2xl">
        <PageHeader
          eyebrow="Ask Atlas"
          title={previousJurisdiction ? "Change your location?" : "What custody question can we help you with?"}
          subtitle={previousJurisdiction
            ? "Your current location is shown below. Update it only if you need a different jurisdiction."
            : "Share your location and we'll provide guidance specific to your state's custody laws."}
          center
        />

        {previousJurisdiction && (
          <div className="rounded-lg border bg-card px-4 py-3.5 flex items-center gap-3 mb-1" data-testid="panel-current-jurisdiction">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Current location</p>
              <p className="text-sm font-semibold text-foreground truncate">
                {previousJurisdiction.county && previousJurisdiction.county !== "General"
                  ? `${previousJurisdiction.county} County, ${previousJurisdiction.state}`
                  : previousJurisdiction.state}
              </p>
            </div>
            <button
              onClick={() => setShowLocationPicker(false)}
              className="flex-shrink-0 text-xs font-medium text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-md border border-primary/30 hover:bg-primary/5"
              data-testid="button-keep-jurisdiction"
            >
              Keep this location
            </button>
          </div>
        )}

        {previousJurisdiction && (
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or select a different location</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

        <LocationSelector onJurisdictionFound={handleJurisdictionFound} />

        <div className="flex flex-col items-center gap-2 mt-6">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3 h-3" />
            <span>Your location is only used to identify applicable laws.</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="w-3 h-3" />
            <span>Custody Atlas provides general legal information, not legal advice.</span>
          </div>
        </div>
      </PageShell>
    );
  }

  const lawPagePath =
    `/jurisdiction/${encodeURIComponent(jurisdiction.state)}/${encodeURIComponent(jurisdiction.county)}` +
    `?country=${encodeURIComponent(jurisdiction.country ?? "United States")}` +
    `&address=${encodeURIComponent(jurisdiction.formattedAddress || "")}` +
    (jurisdiction.latitude !== undefined ? `&lat=${jurisdiction.latitude}` : "") +
    (jurisdiction.longitude !== undefined ? `&lng=${jurisdiction.longitude}` : "");


  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex items-center gap-3">
            <div className="inline-flex min-w-0 items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5">
              <span className="truncate text-xs font-medium text-foreground">
                {formatJurisdictionLabel(jurisdiction.state, jurisdiction.county)}
              </span>
            </div>
            <button
              onClick={handleChangeLocation}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Change location
            </button>
          </div>

          <div className="relative flex items-center gap-2 text-right">
            {activeCaseId ? (
              <button
                onClick={() => setContextExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors"
              >
                <span>{answeringScopeLabel} · {selectedDocCount} docs</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${contextExpanded ? "rotate-180" : ""}`} />
              </button>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">General workspace</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setShowCasePicker((v) => !v)}
                  data-testid="button-pick-case"
                >
                  <FolderOpen className="h-3 w-3" />
                  Link case
                </Button>
              </>
            )}

            {showCasePicker && (
              <CasePickerMenu
                cases={cases}
                activeCaseId={activeCaseId}
                onSelect={(id) => {
                  setActiveCaseId(id);
                  setShowCasePicker(false);
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 sm:px-6">
          {!activeCaseId && cases.length > 0 && !hasChatMessages && showLinkCaseNudge && (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/20">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="mt-0.5 rounded-md bg-amber-100 p-1.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    <FolderOpen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      Link a case to get answers specific to your court, judge, and documents.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-7 px-0 text-xs text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
                      onClick={() => setShowCasePicker(true)}
                    >
                      Link case
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLinkCaseNudge(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-background/70 hover:text-foreground transition-colors"
                  aria-label="Dismiss case link nudge"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {activeCaseId && contextExpanded && (
            <div className="rounded-lg border bg-card px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{activeCaseName}</p>
                  <p className="text-xs text-muted-foreground">{activeCase?.status ?? "Unknown status"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <CaseScopeBadge
                    caseTitle={activeCase?.title}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium"
                  />
                  {isProUser ? (
                    <Badge className="text-xs gap-1 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/50 font-medium">
                      <Zap className="w-3 h-3" />
                      Pro
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn("text-xs gap-1 font-medium", nearLimit && "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400")}
                    >
                      {nearLimit ? <Zap className="w-3 h-3" /> : null}
                      {nearLimit
                        ? `${usage!.questionsUsed}/${usage!.questionsLimit} questions used`
                        : "Free plan"}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {selectedDocCount} document{selectedDocCount === 1 ? "" : "s"} selected for Atlas context
                </p>
                <button
                  onClick={() => setShowDocSelector((v) => !v)}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  {showDocSelector ? "Done" : "Change"}
                </button>
              </div>

              {showDocSelector && userDocuments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {userDocuments.map((doc) => {
                    const checked = docSelectionInitialized ? selectedDocIds.has(doc.id) : true;
                    return (
                      <label
                        key={doc.id}
                        className="flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedDocIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(doc.id)) next.delete(doc.id);
                              else next.add(doc.id);
                              return next;
                            });
                            if (!docSelectionInitialized) setDocSelectionInitialized(true);
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{doc.fileName}</p>
                          <p className="text-xs text-muted-foreground">{doc.docType}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeCaseId && (isLoadingSignals || topCaseSignals.length > 0) ? (
            <DismissibleWhatMattersNow
              rawSignals={topCaseSignals}
              tier={userTier}
              totalDocuments={userDocuments.length}
              lastActivityDaysAgo={0}
              loading={isLoadingSignals}
            />
          ) : null}
        </div>
      </div>

        <ChatBox
          jurisdiction={jurisdiction}
          initialQuestion={initialQuestion}
          initialMessages={initialMessages}
          initialThreadId={threadIdParam}
          initialConversationId={effectiveConversationId}
          caseId={activeCaseId}
          caseName={activeCase?.title ?? undefined}
          selectedDocumentIds={chatSelectedDocumentIds}
          onSelectCase={(id) => setActiveCaseId(id)}
          answeringScopeLabel={answeringScopeLabel}
          conversationType={resolvedConversationType}
          guidedState={activeGuidedState}
          guidedSnapshotState={activeSnapshotState}
          guidedSnapshotActions={activeSnapshotActions}
          guidedMemoryChips={guidedMemoryChips}
          guidedProgressLabel={guidedProgress ?? undefined}
          className="flex-1 min-h-0"
          onHasMessagesChange={setHasChatMessages}
          onMessageCountChange={setChatMessageCount}
        />
      </div>
    );
}
