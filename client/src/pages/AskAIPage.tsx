import { useState, useEffect } from "react";
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
              <p className="text-xs text-foreground/75 mt-0.5 leading-relaxed line-clamp-2">{action.description}</p>
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

/* ─────────────────────────────────────────────────────────────────────────────
 * Helpers shared across page states
 * ───────────────────────────────────────────────────────────────────────────── */

/** Days between now and a date string (negative = past). */
function diffDaysFromNow(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Picks ONE highest-priority urgent signal and returns the strip content.
 * Precedence: overdue → urgent + days → hearing soon.
 * Returns null when the case has no time-sensitive signals.
 */
function derivePrioritySignal(params: {
  overdueActions: CaseActionItem[];
  urgentActions: CaseActionItem[];
  hearingDaysAway: number | null;
  baseAskHref: string;
}): { message: string; cta: string; ctaHref: string } | null {
  const { overdueActions, urgentActions, hearingDaysAway, baseAskHref } = params;

  if (overdueActions.length > 0) {
    const n = overdueActions.length;
    const q = n === 1
      ? "I have an overdue action item. What should I do first?"
      : `I have ${n} overdue action items. What should I prioritize?`;
    return {
      message: n === 1
        ? "An action item is overdue — this may affect your case"
        : `${n} action items are overdue — address them before your hearing`,
      cta: "Ask Atlas",
      ctaHref: `${baseAskHref}&q=${encodeURIComponent(q)}`,
    };
  }

  if (urgentActions.length > 0 && hearingDaysAway !== null) {
    const dayStr = hearingDaysAway === 0
      ? "today"
      : hearingDaysAway === 1
      ? "tomorrow"
      : `in ${hearingDaysAway} day${hearingDaysAway === 1 ? "" : "s"}`;
    const topAction = urgentActions[0];
    const q = `My hearing is ${dayStr}. What should I prioritize right now?`;
    return {
      message: `Hearing ${dayStr} — ${topAction.title}`,
      cta: "Ask Atlas",
      ctaHref: `${baseAskHref}&q=${encodeURIComponent(q)}`,
    };
  }

  if (hearingDaysAway !== null && hearingDaysAway <= 7) {
    const dayStr = hearingDaysAway <= 0
      ? "today or past"
      : hearingDaysAway === 1
      ? "tomorrow"
      : `in ${hearingDaysAway} days`;
    const q = `My hearing is ${dayStr}. What should I review and prepare?`;
    return {
      message: `Hearing ${dayStr} — review your preparation checklist now`,
      cta: "Ask Atlas",
      ctaHref: `${baseAskHref}&q=${encodeURIComponent(q)}`,
    };
  }

  return null;
}

/** Shared case picker dropdown list rendered inside a popover. */
function CasePickerMenu({
  cases,
  activeCaseId,
  onSelect,
}: {
  cases: CaseRecord[];
  activeCaseId: string | undefined;
  onSelect: (id: string | undefined) => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-lg border bg-popover shadow-lg py-1 text-sm">
      <button
        className="w-full text-left px-3 py-2 hover:bg-muted/60 text-muted-foreground text-xs"
        onClick={() => onSelect(undefined)}
        data-testid="option-no-case"
      >
        No case (General Workspace)
      </button>
      {cases.length === 0 && (
        <p className="px-3 py-2 text-xs text-muted-foreground italic">
          No cases yet — create one in the Workspace.
        </p>
      )}
      {cases.map((c) => (
        <button
          key={c.id}
          className={cn(
            "w-full text-left px-3 py-2 hover:bg-muted/60",
            c.id === activeCaseId && "bg-primary/8 font-medium text-primary"
          )}
          onClick={() => onSelect(c.id)}
          data-testid={`option-case-${c.id}`}
        >
          <span className="block truncate">{c.title}</span>
          {c.jurisdictionState && (
            <span className="text-xs text-muted-foreground">{c.jurisdictionState}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Collapsible document context panel — shows which documents Atlas is using,
 * lets users toggle individual documents in/out of context.
 */
function DocumentContextPanel({
  documents,
  selectedDocIds,
  initialized,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  documents: DocumentRecord[];
  selectedDocIds: Set<string>;
  initialized: boolean;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (documents.length === 0) return null;

  const total = documents.length;
  const selected = initialized ? selectedDocIds.size : total;
  const noneSelected = initialized && selectedDocIds.size === 0;
  const allSelected = !initialized || selectedDocIds.size === total;

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="document-context-panel">
      {/* ── Trigger row ────────────────────────────────────────────────── */}
      <button
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
        data-testid="button-toggle-document-panel"
        aria-expanded={expanded}
      >
        <Files className={cn(
          "w-3.5 h-3.5 flex-shrink-0 transition-colors",
          noneSelected ? "text-amber-500 dark:text-amber-400" : "text-primary/70"
        )} />
        <span className={cn(
          "text-xs font-medium flex-1 min-w-0 truncate",
          noneSelected ? "text-amber-700 dark:text-amber-300" : "text-foreground"
        )}>
          {noneSelected
            ? "No documents selected — Atlas will respond generally"
            : `Using ${selected} of ${total} document${total !== 1 ? "s" : ""} from your case`}
        </span>
        <ChevronRight className={cn(
          "w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0 transition-transform duration-150",
          expanded && "rotate-90"
        )} />
      </button>

      {/* ── Expanded document list ──────────────────────────────────────── */}
      {expanded && (
        <div className="border-t bg-muted/20">
          {/* Controls row */}
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/60">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Documents in context
            </span>
            <div className="flex items-center gap-3">
              <button
                className="text-xs text-primary/70 hover:text-primary transition-colors"
                onClick={onSelectAll}
                disabled={allSelected}
                data-testid="button-select-all-docs"
              >
                Select all
              </button>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={onClearAll}
                disabled={noneSelected}
                data-testid="button-clear-all-docs"
              >
                Clear all
              </button>
            </div>
          </div>

          {/* Document rows */}
          <div className="divide-y divide-border/40 max-h-56 overflow-y-auto">
            {documents.map((doc) => {
              const isSelected = !initialized || selectedDocIds.has(doc.id);
              return (
                <button
                  key={doc.id}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-muted/60 transition-colors text-left"
                  onClick={() => onToggle(doc.id)}
                  data-testid={`toggle-document-${doc.id}`}
                >
                  {/* Checkbox visual */}
                  <span className={cn(
                    "w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-colors",
                    isSelected
                      ? "bg-primary border-primary"
                      : "border-border bg-background"
                  )}>
                    {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </span>

                  {/* Doc info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{doc.fileName}</p>
                    <p className="text-[11px] text-muted-foreground">{doc.docType}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Upload link */}
          <div className="border-t border-border/60 px-3.5 py-2">
            <Link
              href="/upload"
              className="text-xs text-primary/70 hover:text-primary transition-colors"
              data-testid="link-upload-document"
            >
              + Upload another document
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** One-line urgent strip shown above ChatBox when the case has time-sensitive signals. */
function UrgentPriorityStrip({
  signal,
}: {
  signal: { message: string; cta: string; ctaHref: string };
}) {
  return (
    <div
      className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50/60 dark:bg-orange-950/20 px-3.5 py-2.5 flex items-center gap-3"
      data-testid="urgent-priority-strip"
    >
      <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 flex-shrink-0" />
      <p className="text-xs font-medium text-orange-800 dark:text-orange-200 flex-1 min-w-0 leading-snug">
        {signal.message}
      </p>
      <Link
        href={signal.ctaHref}
        className="text-xs font-semibold text-orange-700 dark:text-orange-300 hover:text-orange-900 dark:hover:text-orange-100 transition-colors flex-shrink-0 flex items-center gap-0.5"
        data-testid="link-urgent-cta"
      >
        {signal.cta}
        <ArrowRight className="w-3 h-3" />
      </Link>
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

  const { jurisdiction, setJurisdiction } = useJurisdiction(urlJurisdiction);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<string | undefined>(caseIdParam);
  const [showCasePicker, setShowCasePicker] = useState(false);
  const { user } = useCurrentUser();

  // Multi-document context selection: tracks which docs are included in Atlas context.
  // null = not yet initialized (treat as "all selected" for API calls).
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [docSelectionInitialized, setDocSelectionInitialized] = useState(false);

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

  // Documents list — only fetched when the user is authenticated (for the doc picker)
  const { data: documentsData } = useQuery<{ documents: DocumentRecord[] }>({
    queryKey: ["/api/documents"],
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const userDocuments = documentsData?.documents ?? [];

  // Initialize selectedDocIds once documents load.
  // If ?document= URL param is present (deep-link from Upload page), pre-select just that doc.
  // Otherwise select all documents by default.
  useEffect(() => {
    if (docSelectionInitialized || userDocuments.length === 0) return;
    if (documentIdParam && userDocuments.some((d) => d.id === documentIdParam)) {
      setSelectedDocIds(new Set([documentIdParam]));
    } else {
      setSelectedDocIds(new Set(userDocuments.map((d) => d.id)));
    }
    setDocSelectionInitialized(true);
  }, [userDocuments, docSelectionInitialized, documentIdParam]);

  // Compute selectedDocumentIds for the API — undefined when not yet initialized
  // (server falls back to "use all docs"). Array once the user has made a selection.
  const chatSelectedDocumentIds = docSelectionInitialized
    ? Array.from(selectedDocIds)
    : undefined;

  // Page-level actions query — same cache key as CaseActionsPanel, zero extra requests.
  // Used to derive urgent_case state for the priority strip.
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
  const openActions   = (pageActionsData?.actions ?? []).filter((a) => a.status === "open");
  const overdueActions = openActions.filter((a) => a.urgency === "overdue");
  const urgentActions  = openActions.filter((a) => a.urgency === "urgent");
  const rawHearingDate = pageActionsData?.hearingDate ?? null;
  const hearingDaysAway = rawHearingDate ? diffDaysFromNow(rawHearingDate) : null;

  // Derive page state: urgent_case when hearing ≤ 7 days or overdue/urgent actions present.
  const isUrgentCase = !!activeCaseId && (
    overdueActions.length > 0 ||
    urgentActions.length > 0 ||
    (hearingDaysAway !== null && hearingDaysAway <= 7)
  );
  const askPageState: "no_case" | "active_case" | "urgent_case" =
    !activeCaseId   ? "no_case" :
    isUrgentCase    ? "urgent_case" : "active_case";

  // ── Auto-populate jurisdiction from the active case ───────────────────────
  // If no jurisdiction is stored (new session, incognito, first visit) but
  // the user navigated here via ?case=..., use the case's saved jurisdiction
  // so they don't have to re-enter location every time.
  const [caseJurisdictionApplied, setCaseJurisdictionApplied] = useState(false);
  useEffect(() => {
    if (caseJurisdictionApplied) return;
    if (jurisdiction) { setCaseJurisdictionApplied(true); return; } // already have one
    if (!activeCase?.jurisdictionState) return;
    const caseJ: Jurisdiction = {
      state: activeCase.jurisdictionState,
      county: activeCase.jurisdictionCounty ?? "",
      country: "United States",
    };
    setJurisdiction(caseJ);
    setCaseJurisdictionApplied(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCase?.jurisdictionState, activeCase?.jurisdictionCounty, jurisdiction, caseJurisdictionApplied]);

  const handleJurisdictionFound = (j: Jurisdiction) => {
    setJurisdiction(j);
    setShowLocationPicker(false);
  };

  const handleChangeLocation = () => {
    // Do NOT clear jurisdiction here — we keep it so the current jurisdiction
    // is shown as a "quick reuse" option in the picker.
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

  /* ── Location picker ─────────────────────────────────────────────────── */
  if (!jurisdiction || showLocationPicker) {
    // If the user clicked "Change location" but still has a valid jurisdiction
    // in memory, surface it as a one-click "keep this" option so they don't
    // have to re-enter location unless they actually want to change it.
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

        {/* Quick-reuse panel — shown when user clicked "Change location" */}
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

  // Base href for urgent strip CTAs — /ask with case + state pre-set.
  // q= is appended by derivePrioritySignal per signal type.
  const baseAskHref = activeCaseId
    ? `/ask?case=${activeCaseId}&state=${encodeURIComponent(jurisdiction.state)}&county=${encodeURIComponent(jurisdiction.county || "")}`
    : `/ask?state=${encodeURIComponent(jurisdiction.state)}&county=${encodeURIComponent(jurisdiction.county || "")}`;

  const prioritySignal = askPageState === "urgent_case"
    ? derivePrioritySignal({ overdueActions, urgentActions, hearingDaysAway, baseAskHref })
    : null;
  const answeringScopeLabel = activeCase
    ? `Answering from: ${activeCase.title}`
    : "General Workspace";

  /* ── Main Ask AI layout ───────────────────────────────────────────────── */
  return (
    <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4 animate-fade-in">

      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: formatJurisdictionLabel(jurisdiction.state, jurisdiction.county), href: lawPagePath },
          { label: threadData?.thread?.title ?? "Ask Atlas" },
        ]}
      />

      {/* ── Slim context row — jurisdiction + secondary law link ──────────── */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <JurisdictionContextHeader
          mode="jurisdiction"
          state={jurisdiction.state}
          county={jurisdiction.county}
          onChangeLocation={handleChangeLocation}
        />
        <div className="flex items-center gap-3 flex-shrink-0">
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
          {/* Secondary — subtle text link, not a competing button */}
          <Link
            href={lawPagePath}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-view-laws"
          >
            <ArrowRight className="w-3 h-3" />
            Law summary
          </Link>
        </div>
      </div>

      <div className="flex items-center">
        <CaseScopeBadge
          caseTitle={activeCase?.title}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium"
        />
      </div>

      {/* ── Case context — 3-state rendering ─────────────────────────────── */}
      {user && askPageState === "no_case" && (
        /* no_case: compact decision block */
        <div className="rounded-lg border border-border bg-muted/20 px-3.5 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5" data-testid="case-context-bar">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <FolderOpen className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
            <span className="text-xs text-muted-foreground">
              Link a case to get context-aware answers and saved history.
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs"
                onClick={() => setShowCasePicker((v) => !v)}
                data-testid="button-pick-case"
              >
                <FolderOpen className="w-3 h-3" />
                Link Case
                <ChevronDown className="w-3 h-3" />
              </Button>
              {showCasePicker && (
                <CasePickerMenu
                  cases={cases}
                  activeCaseId={activeCaseId}
                  onSelect={(id) => { setActiveCaseId(id); setShowCasePicker(false); }}
                />
              )}
            </div>
            <button
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors px-1"
              onClick={() => setShowCasePicker(false)}
              data-testid="button-continue-without-case"
            >
              Keep General Workspace
            </button>
          </div>
        </div>
      )}

      {user && (askPageState === "active_case" || askPageState === "urgent_case") && (
        /* active_case / urgent_case: slim chip — urgent gets orange accent */
        <div
          className={cn(
            "rounded-lg border px-3 py-2 flex items-center justify-between gap-3",
            askPageState === "urgent_case"
              ? "border-orange-200 dark:border-orange-800/50 bg-orange-50/30 dark:bg-orange-950/10"
              : "bg-primary/5"
          )}
          data-testid="case-context-bar"
        >
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className={cn(
              "w-3.5 h-3.5 flex-shrink-0",
              askPageState === "urgent_case" ? "text-orange-600 dark:text-orange-400" : "text-primary/70"
            )} />
            <span className="text-xs font-medium text-foreground truncate">
              {activeCase?.title ? `Answering from: ${activeCase.title}` : "General Workspace"}
            </span>
            {activeCase?.jurisdictionState && (
              <span className="text-xs text-muted-foreground hidden sm:inline">· {activeCase.jurisdictionState}</span>
            )}
            {askPageState === "urgent_case" && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 flex-shrink-0">
                Time-sensitive
              </span>
            )}
          </div>
          <div className="relative flex-shrink-0">
            <button
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              onClick={() => setShowCasePicker((v) => !v)}
              data-testid="button-pick-case"
            >
              Change
            </button>
            {showCasePicker && (
              <CasePickerMenu
                cases={cases}
                activeCaseId={activeCaseId}
                onSelect={(id) => { setActiveCaseId(id); setShowCasePicker(false); }}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Document context panel — multi-select, always shown when user has docs ── */}
      {user && userDocuments.length > 0 && (
        <DocumentContextPanel
          documents={userDocuments}
          selectedDocIds={selectedDocIds}
          initialized={docSelectionInitialized}
          onToggle={(id) => {
            setSelectedDocIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
            if (!docSelectionInitialized) setDocSelectionInitialized(true);
          }}
          onSelectAll={() => {
            setSelectedDocIds(new Set(userDocuments.map((d) => d.id)));
            if (!docSelectionInitialized) setDocSelectionInitialized(true);
          }}
          onClearAll={() => {
            setSelectedDocIds(new Set());
            if (!docSelectionInitialized) setDocSelectionInitialized(true);
          }}
        />
      )}

      {/* Case facts quick-view — shows court, case number, hearing date for active case */}
      {activeCaseId && <CaseFactsPanel caseId={activeCaseId} />}

      {/* Case actions — open action items generated from known facts */}
      {activeCaseId && <CaseActionsPanel caseId={activeCaseId} />}

      {/* ── Urgent priority strip — single focused signal for urgent_case ─── */}
      {prioritySignal && <UrgentPriorityStrip signal={prioritySignal} />}

      {/* ChatBox — input sticky when active, conversation grows below */}
      <ChatBox
        jurisdiction={jurisdiction}
        initialQuestion={initialQuestion}
        initialMessages={initialMessages}
        initialThreadId={threadIdParam}
        initialConversationId={conversationIdParam}
        caseId={activeCaseId}
        selectedDocumentIds={chatSelectedDocumentIds}
        onSelectCase={(id) => setActiveCaseId(id)}
        answeringScopeLabel={answeringScopeLabel}
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
