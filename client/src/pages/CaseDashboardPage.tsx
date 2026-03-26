/**
 * CaseDashboardPage — the home base for a single case.
 *
 * Route: /case/:caseId
 *
 * Loads in parallel:
 *   • Case metadata         GET /api/cases/:caseId
 *   • Key facts             GET /api/cases/:caseId/facts
 *   • Actions (with urgency) GET /api/cases/:caseId/actions
 *   • Recent conversations  GET /api/cases/:caseId/conversations
 */

import { useParams, Link } from "wouter";
import {
  ArrowLeft, FolderOpen, MessageSquare, Upload, MapPin, Building2,
  Hash, Calendar, User2, ClipboardList, Loader2, CircleCheck, X,
  ChevronRight, CheckCheck, Zap, ExternalLink, FileText, AlertTriangle,
  File,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequestRaw } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

/* ── Shared helpers ───────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/* ── Types ────────────────────────────────────────────────────────────────── */

interface CaseRecord {
  id: string;
  title: string;
  description: string | null;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface CaseFactItem {
  id: number;
  factType: string;
  value: string;
  source: string;
  sourceName: string | null;
  confidence: string;
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

interface ConversationRecord {
  id: string;
  caseId: string;
  title: string | null;
  threadType: string;
  jurisdictionState: string | null;
  createdAt: string;
}

/* ── Urgency styling ──────────────────────────────────────────────────────── */

const URGENCY: Record<
  CaseActionItem["urgency"],
  { badge: string; border: string; label: (d: number | null) => string }
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
  normal: { badge: "", border: "", label: () => "" },
};

/* ── Court & hearing info bar ─────────────────────────────────────────────── */

const FACT_DISPLAY: Array<{ key: string; label: string; Icon: typeof Hash }> = [
  { key: "court_name",    label: "Court",         Icon: Building2 },
  { key: "case_number",   label: "Case #",        Icon: Hash },
  { key: "hearing_date",  label: "Hearing",       Icon: Calendar },
  { key: "court_address", label: "Address",       Icon: MapPin },
  { key: "judge_name",    label: "Judge",         Icon: User2 },
];

function CourtInfoBar({ facts }: { facts: CaseFactItem[] }) {
  const byType = new Map<string, CaseFactItem>();
  for (const f of facts) {
    const cur = byType.get(f.factType);
    if (!cur || f.source === "user_confirmed") byType.set(f.factType, f);
  }

  const visible = FACT_DISPLAY
    .map(({ key, label, Icon }) => ({ key, label, Icon, fact: byType.get(key) }))
    .filter((x) => x.fact);

  if (visible.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card px-4 py-3" data-testid="court-info-bar">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        Court &amp; Hearing Info
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {visible.map(({ key, label, Icon, fact }) => (
          <div key={key} className="flex items-center gap-1.5 min-w-0">
            <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground">{label}:</span>
            <span className="text-xs font-semibold text-foreground truncate max-w-[180px]">
              {fact!.value}
            </span>
            {fact!.source === "user_confirmed" && (
              <CheckCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-label="Confirmed" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Actions panel ────────────────────────────────────────────────────────── */

function ActionsPanel({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["/api/cases", caseId, "actions"];
  const [pendingId, setPendingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ actions: CaseActionItem[]; hearingDate: string | null }>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/actions`);
      if (!res.ok) return { actions: [], hearingDate: null };
      return res.json();
    },
    staleTime: 20_000,
  });

  async function markStatus(id: number, status: "completed" | "dismissed") {
    setPendingId(id);
    try {
      const res = await apiRequestRaw("PATCH", `/api/case-actions/${id}`, { status });
      if (res.ok) queryClient.invalidateQueries({ queryKey });
    } finally {
      setPendingId(null);
    }
  }

  const openActions = (data?.actions ?? []).filter((a) => a.status === "open");
  const hasUrgent = openActions.some((a) => a.urgency === "overdue" || a.urgency === "urgent");

  return (
    <div className="rounded-lg border bg-card divide-y overflow-hidden" data-testid="dashboard-actions-panel">
      <div className={cn("px-4 py-2.5 flex items-center gap-2", hasUrgent && "bg-red-50/50 dark:bg-red-950/20")}>
        <ClipboardList className={cn("w-4 h-4", hasUrgent ? "text-red-600 dark:text-red-400" : "text-primary/70")} />
        <span className="text-sm font-semibold text-foreground">Action Items</span>
        <Badge
          variant="outline"
          className={cn(
            "ml-auto text-xs h-5 px-1.5",
            hasUrgent && "border-red-300 dark:border-red-700 text-red-700 dark:text-red-300",
          )}
        >
          {isLoading ? "…" : `${openActions.length} open`}
        </Badge>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {!isLoading && openActions.length === 0 && (
        <p className="px-4 py-4 text-sm text-muted-foreground" data-testid="text-no-actions">
          No open actions. Upload a court document to generate case-specific tasks.
        </p>
      )}

      {openActions.map((action) => {
        const style = URGENCY[action.urgency];
        const label = style.label(action.daysUntilHearing);
        return (
          <div
            key={action.id}
            className={cn("px-4 py-3 flex items-start gap-3", style.border)}
            data-testid={`dashboard-action-item-${action.id}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2 flex-wrap">
                <p className="text-sm font-medium text-foreground leading-snug flex-1 min-w-0">
                  {action.title}
                </p>
                {label && (
                  <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0", style.badge)}>
                    {label}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                {action.description}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
              <button
                onClick={() => markStatus(action.id, "completed")}
                disabled={pendingId === action.id}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 transition-colors disabled:opacity-50"
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
                className="p-1 rounded text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
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

/* ── Conversations panel ──────────────────────────────────────────────────── */

function ConversationsPanel({
  caseId,
  jurisdictionState,
  jurisdictionCounty,
}: {
  caseId: string;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
}) {
  const { data, isLoading } = useQuery<{ conversations: ConversationRecord[] }>({
    queryKey: ["/api/cases", caseId, "conversations"],
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/conversations`);
      if (!res.ok) return { conversations: [] };
      return res.json();
    },
    staleTime: 30_000,
  });

  const conversations = (data?.conversations ?? []).slice(0, 8);

  const askParams = new URLSearchParams();
  askParams.set("case", caseId);
  if (jurisdictionState) askParams.set("state", jurisdictionState);
  if (jurisdictionCounty) askParams.set("county", jurisdictionCounty);
  const newChatHref = `/ask?${askParams.toString()}`;

  return (
    <div className="rounded-lg border bg-card divide-y overflow-hidden" data-testid="dashboard-conversations-panel">
      <div className="px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary/70" />
          <span className="text-sm font-semibold text-foreground">Conversations</span>
        </div>
        <Link href={newChatHref}>
          <a className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
             data-testid="link-new-conversation">
            New chat
            <ChevronRight className="w-3 h-3" />
          </a>
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {!isLoading && conversations.length === 0 && (
        <div className="px-4 py-4 flex flex-col gap-2" data-testid="text-no-conversations">
          <p className="text-sm text-muted-foreground">No conversations yet for this case.</p>
          <Link href={newChatHref}>
            <a className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:text-primary/80 transition-colors"
               data-testid="link-start-first-chat">
              <MessageSquare className="w-3.5 h-3.5" />
              Start a conversation
            </a>
          </Link>
        </div>
      )}

      {conversations.map((conv) => {
        // Use ?conversation= NOT ?thread= — conv.id is a Supabase conversations UUID,
        // not a legacy thread ID. The two are different tables and different systems.
        const resumeParams = new URLSearchParams();
        resumeParams.set("case", caseId);
        resumeParams.set("conversation", conv.id);
        if (conv.jurisdictionState) resumeParams.set("state", conv.jurisdictionState);
        if (jurisdictionCounty) resumeParams.set("county", jurisdictionCounty);
        const href = `/ask?${resumeParams.toString()}`;

        return (
          <Link key={conv.id} href={href}>
            <a
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors group"
              data-testid={`link-conversation-${conv.id}`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate text-foreground group-hover:text-primary transition-colors">
                  {conv.title ?? `${conv.threadType.replace(/_/g, " ")} conversation`}
                </p>
                <p className="text-[11px] text-muted-foreground">{relativeTime(conv.createdAt)}</p>
              </div>
              <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary/50 flex-shrink-0 transition-colors" />
            </a>
          </Link>
        );
      })}
    </div>
  );
}

/* ── DocumentsPanel ───────────────────────────────────────────────────────── */

interface DocumentRow {
  id: string;
  fileName: string;
  docType: string;
  pageCount: number;
  createdAt: string;
}

function DocumentsPanel({ caseId, uploadHref }: { caseId: string; uploadHref: string }) {
  const { data, isLoading } = useQuery<{ documents: DocumentRow[] }>({
    queryKey: ["/api/cases", caseId, "documents"],
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/documents`);
      if (!res.ok) return { documents: [] };
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!caseId,
  });

  const documents = data?.documents ?? [];

  const DOC_TYPE_LABELS: Record<string, string> = {
    custody_order:  "Custody Order",
    communication:  "Communication",
    financial:      "Financial",
    other:          "Document",
  };

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-primary/70" />
          <h3 className="text-sm font-semibold">Documents</h3>
        </div>
        <Link href={uploadHref}>
          <a data-testid="link-upload-document-panel">
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <Upload className="w-3 h-3" />
              Upload
            </Button>
          </a>
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-xs animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading documents…
        </div>
      )}

      {!isLoading && documents.length === 0 && (
        <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
          <File className="w-6 h-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">No documents linked to this case yet.</p>
          <Link href={uploadHref}>
            <a>
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs mt-1">
                <Upload className="w-3 h-3" />
                Upload your first document
              </Button>
            </a>
          </Link>
        </div>
      )}

      {!isLoading && documents.length > 0 && (
        <div className="divide-y">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 px-4 py-2.5"
              data-testid={`row-document-${doc.id}`}
            >
              <FileText className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{doc.fileName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {DOC_TYPE_LABELS[doc.docType] ?? "Document"}
                  {" · "}
                  {doc.pageCount === 1 ? "1 page" : `${doc.pageCount} pages`}
                  {" · "}
                  {relativeTime(doc.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── WhatMattersNow ────────────────────────────────────────────────────────── */

interface EnrichedAction {
  id: number;
  actionType: string;
  actionTitle: string;
  actionDetail?: string | null;
  status: string;
  urgency?: string | null;
  daysUntilHearing?: number | null;
}

function WhatMattersNow({
  facts,
  caseId,
  askHref,
}: {
  facts: CaseFactItem[];
  caseId: string;
  askHref: string;
}) {
  const hearingDateFact = facts.find((f) => f.factType === "hearing_date");
  const courtNameFact = facts.find((f) => f.factType === "court_name");

  const { data: actionsData } = useQuery<{ actions: EnrichedAction[] }>({
    queryKey: ["/api/cases", caseId, "actions"],
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/actions`);
      if (!res.ok) return { actions: [] };
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!caseId,
  });

  const openActions = (actionsData?.actions ?? []).filter((a) => a.status === "open");
  const topAction = openActions.find((a) => a.urgency === "overdue")
    ?? openActions.find((a) => a.urgency === "urgent")
    ?? openActions.find((a) => a.urgency === "soon")
    ?? openActions[0];

  const hasHearing = !!hearingDateFact?.factValue;
  const hasTopAction = !!topAction;
  if (!hasHearing && !hasTopAction) return null;

  const daysUntil = topAction?.daysUntilHearing ?? null;

  const URGENCY_COLORS: Record<string, string> = {
    overdue: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800/50",
    urgent:  "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50",
    soon:    "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800/50",
    normal:  "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800/50",
  };
  const urgencyKey = topAction?.urgency ?? "normal";
  const colorClass = URGENCY_COLORS[urgencyKey] ?? URGENCY_COLORS.normal;

  const URGENCY_ICON_COLORS: Record<string, string> = {
    overdue: "text-red-500",
    urgent:  "text-amber-500",
    soon:    "text-yellow-500",
    normal:  "text-blue-500",
  };
  const iconColor = URGENCY_ICON_COLORS[urgencyKey] ?? "text-blue-500";

  return (
    <div
      className={cn("rounded-lg border px-4 py-3 flex items-start gap-3 shadow-sm", colorClass)}
      data-testid="banner-what-matters-now"
    >
      <AlertTriangle className={cn("w-4 h-4 flex-shrink-0 mt-0.5", iconColor)} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground mb-0.5">What matters now</p>
        <div className="flex flex-col gap-0.5">
          {hasHearing && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              Next hearing:{" "}
              <span className="font-medium text-foreground">{hearingDateFact!.factValue}</span>
              {courtNameFact?.factValue && (
                <> · {courtNameFact.factValue}</>
              )}
              {daysUntil !== null && (
                <> · {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? "Today" : `${daysUntil}d away`}</>
              )}
            </p>
          )}
          {hasTopAction && (
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <ClipboardList className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>
                Top action:{" "}
                <span className="font-medium text-foreground">{topAction!.actionTitle}</span>
              </span>
            </p>
          )}
        </div>
      </div>
      <Link href={askHref}>
        <a>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-shrink-0 border-current/20 hover:bg-white/50">
            <Zap className="w-3 h-3" />
            Ask Atlas
          </Button>
        </a>
      </Link>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function CaseDashboardPage() {
  const params = useParams<{ caseId: string }>();
  const caseId = params.caseId;

  const { data: caseData, isLoading: caseLoading } = useQuery<{ case: CaseRecord }>({
    queryKey: ["/api/cases", caseId],
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}`);
      if (!res.ok) throw new Error("Case not found");
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  const { data: factsData, isLoading: factsLoading } = useQuery<{ facts: CaseFactItem[] }>({
    queryKey: ["/api/cases", caseId, "facts"],
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/facts`);
      if (!res.ok) return { facts: [] };
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!caseId,
  });

  const caseRecord = caseData?.case ?? null;
  const facts = factsData?.facts ?? [];

  /* ── Build Ask Atlas link ─────────────────────────────────────────────── */
  const askParams = new URLSearchParams();
  askParams.set("case", caseId);
  if (caseRecord?.jurisdictionState) askParams.set("state", caseRecord.jurisdictionState);
  if (caseRecord?.jurisdictionCounty) askParams.set("county", caseRecord.jurisdictionCounty);
  const askHref = `/ask?${askParams.toString()}`;

  const uploadHref = caseRecord?.jurisdictionState
    ? `/upload-document?case=${caseId}&state=${caseRecord.jurisdictionState}`
    : `/upload-document?case=${caseId}`;

  /* ── Loading state ────────────────────────────────────────────────────── */
  if (caseLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">Loading case…</span>
      </div>
    );
  }

  if (!caseRecord) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center">
        <FolderOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <h2 className="text-lg font-semibold mb-1">Case not found</h2>
        <p className="text-sm text-muted-foreground mb-4">
          This case doesn't exist or you don't have access to it.
        </p>
        <Link href="/workspace">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Workspace
          </Button>
        </Link>
      </div>
    );
  }

  const isActive = caseRecord.status === "active";

  return (
    <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4" data-testid="case-dashboard-page">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Link href="/workspace">
          <a className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
             data-testid="link-back-to-workspace">
            <ArrowLeft className="w-3.5 h-3.5" />
            My Cases
          </a>
        </Link>

        <div className="flex-1 min-w-0 flex items-center gap-2 sm:ml-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FolderOpen className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold truncate leading-tight" data-testid="heading-case-title">
              {caseRecord.title}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {caseRecord.jurisdictionState && (
                <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  <MapPin className="w-2.5 h-2.5" />
                  {caseRecord.jurisdictionState}
                  {caseRecord.jurisdictionCounty ? `, ${caseRecord.jurisdictionCounty}` : ""}
                </span>
              )}
              <Badge
                variant={isActive ? "default" : "secondary"}
                className={cn(
                  "text-[10px] px-1.5 py-0 h-4",
                  isActive && "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
                )}
                data-testid="badge-case-status"
              >
                {caseRecord.status}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href={uploadHref}>
            <a data-testid="link-upload-document">
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                <Upload className="w-3.5 h-3.5" />
                Upload Doc
              </Button>
            </a>
          </Link>
          <Link href={askHref}>
            <a data-testid="link-ask-atlas">
              <Button size="sm" className="gap-1.5 h-8 text-xs">
                <Zap className="w-3.5 h-3.5" />
                Ask Atlas
              </Button>
            </a>
          </Link>
        </div>
      </div>

      {/* ── Court & hearing info bar ─────────────────────────────────────── */}
      {!factsLoading && facts.length > 0 && <CourtInfoBar facts={facts} />}
      {factsLoading && (
        <div className="rounded-lg border bg-card px-4 py-3 h-14 animate-pulse" />
      )}

      {/* ── What matters now — urgency banner from facts + top action ────── */}
      {!factsLoading && facts.length > 0 && (
        <WhatMattersNow facts={facts} caseId={caseId} askHref={askHref} />
      )}

      {/* ── Two-column grid: actions + conversations ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Actions — wider column */}
        <div className="md:col-span-3">
          <ActionsPanel caseId={caseId} />
        </div>

        {/* Conversations — narrower column */}
        <div className="md:col-span-2">
          <ConversationsPanel
            caseId={caseId}
            jurisdictionState={caseRecord.jurisdictionState}
            jurisdictionCounty={caseRecord.jurisdictionCounty}
          />
        </div>
      </div>

      {/* ── Documents panel ──────────────────────────────────────────────── */}
      <DocumentsPanel caseId={caseId} uploadHref={uploadHref} />

      {/* ── Footer meta ──────────────────────────────────────────────────── */}
      <p className="text-[11px] text-muted-foreground/50 text-center pb-2">
        Case created {relativeTime(caseRecord.createdAt)}
        {caseRecord.updatedAt !== caseRecord.createdAt && ` · updated ${relativeTime(caseRecord.updatedAt)}`}
      </p>
    </div>
  );
}
