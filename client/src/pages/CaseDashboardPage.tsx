/**
 * CaseDashboardPage — command center for a single case.
 *
 * Route: /case/:caseId
 *
 * Panels (all queries share cache keys — TanStack deduplicates):
 *   • Case metadata          GET /api/cases/:caseId
 *   • Key facts              GET /api/cases/:caseId/facts
 *   • Actions (enriched)     GET /api/cases/:caseId/actions
 *   • Conversations          GET /api/cases/:caseId/conversations
 *   • Documents              GET /api/cases/:caseId/documents
 *
 * Bug fixes applied in this version:
 *   • Added useQueryClient import (was missing — ActionsPanel broke on every render)
 *   • Fixed WhatMattersNow: fact.factValue → fact.value (CaseFactItem has .value)
 *   • Fixed WhatMattersNow: action.actionTitle → action.title (API returns .title)
 */

import { useParams, Link } from "wouter";
import {
  ArrowLeft, FolderOpen, MessageSquare, Upload, MapPin, Building2,
  Hash, Calendar, User2, ClipboardList, Loader2, CircleCheck, X,
  ChevronRight, CheckCheck, Zap, ExternalLink, FileText, AlertTriangle,
  File, ChevronDown, ChevronUp, History, Info, Scale,
} from "lucide-react";
import {
  DocFactChips, DocKeyDatesRow, DocQuickActions,
  DocObligationBadge, DocImplicationsSection, DocActionInsight,
} from "@/components/app/DocIntelPanel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  value: string;      // ← the real field name from the API
  source: string;
  sourceName: string | null;
  confidence: string;
}

interface CaseActionItem {
  id: number;
  actionType: string;
  title: string;       // ← the real field name from the API
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
  updatedAt?: string;
}

interface DocumentRow {
  id: string;
  fileName: string;
  docType: string;
  pageCount: number;
  createdAt: string;
  analysisJson: Record<string, unknown>;
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
    label:  (d) => d === 0 ? "Due today" : d != null ? `Due in ${d}d` : "Due soon",
  },
  soon: {
    badge:  "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
    border: "border-l-2 border-l-amber-400 dark:border-l-amber-600",
    label:  (d) => d != null ? `In ${d} days` : "Coming up",
  },
  normal: { badge: "", border: "", label: () => "" },
};

/* ── Fact display labels ──────────────────────────────────────────────────── */

const FACT_TYPE_LABELS: Record<string, string> = {
  court_name:            "Court",
  case_number:           "Case number",
  hearing_date:          "Next hearing",
  court_address:         "Courthouse address",
  judge_name:            "Judge",
  attorney_name:         "My attorney",
  opposing_counsel:      "Opposing counsel",
  filing_date:           "Filing date",
  child_name:            "Child name",
  child_dob:             "Child date of birth",
  custody_type:          "Custody type",
  visitation_schedule:   "Visitation schedule",
  modification_reason:   "Modification reason",
  state:                 "State",
  county:                "County",
};

const FACT_SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  user_confirmed:  { label: "Confirmed by you",  color: "text-emerald-600 dark:text-emerald-400" },
  ai_extracted:    { label: "AI extracted",       color: "text-blue-600 dark:text-blue-400" },
  document_ocr:    { label: "From document",      color: "text-violet-600 dark:text-violet-400" },
  attorney_input:  { label: "Attorney",           color: "text-amber-600 dark:text-amber-400" },
  system_inferred: { label: "System",             color: "text-muted-foreground" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  custody_order:  "Custody Order",
  communication:  "Communication",
  financial:      "Financial",
  other:          "Document",
};

const THREAD_TYPE_LABELS: Record<string, string> = {
  general:           "General",
  custody_question:  "Custody Q&A",
  document_review:   "Doc Review",
  strategy:          "Strategy",
  qa:                "Q&A",
};

/* ── Case Snapshot Panel ──────────────────────────────────────────────────── */

/**
 * Compact at-a-glance bar: shows the 4–5 core court facts + live action/doc counts.
 * Replaces the old CourtInfoBar and adds aggregate stat pills.
 */
function CaseSnapshotPanel({
  facts,
  caseId,
  askHref,
}: {
  facts: CaseFactItem[];
  caseId: string;
  askHref: string;
}) {
  const byType = new Map<string, CaseFactItem>();
  for (const f of facts) {
    const cur = byType.get(f.factType);
    if (!cur || f.source === "user_confirmed") byType.set(f.factType, f);
  }

  const TOP_FACTS = ["court_name", "case_number", "hearing_date", "court_address", "judge_name"];
  const visible = TOP_FACTS
    .map((key) => ({ key, fact: byType.get(key) }))
    .filter((x) => !!x.fact);

  const ICONS: Record<string, typeof Building2> = {
    court_name: Building2, case_number: Hash, hearing_date: Calendar,
    court_address: MapPin, judge_name: User2,
  };

  const { data: actionsData } = useQuery<{ actions: CaseActionItem[] }>({
    queryKey: ["/api/cases", caseId, "actions"],
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/actions`);
      if (!res.ok) return { actions: [] };
      return res.json();
    },
    staleTime: 20_000,
  });

  const { data: docsData } = useQuery<{ documents: DocumentRow[] }>({
    queryKey: ["/api/cases", caseId, "documents"],
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/documents`);
      if (!res.ok) return { documents: [] };
      return res.json();
    },
    staleTime: 30_000,
  });

  const openActions   = (actionsData?.actions ?? []).filter((a) => a.status === "open");
  const hasOverdue    = openActions.some((a) => a.urgency === "overdue");
  const hasUrgent     = openActions.some((a) => a.urgency === "urgent");
  const docCount      = docsData?.documents.length ?? null;

  if (visible.length === 0 && openActions.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card px-4 py-3" data-testid="case-snapshot-panel">
      {visible.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Case Overview
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
            {visible.map(({ key, fact }) => {
              const Icon = ICONS[key] ?? Info;
              const isConfirmed = fact!.source === "user_confirmed";
              return (
                <div key={key} className="flex items-center gap-1.5 min-w-0">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">{FACT_TYPE_LABELS[key] ?? key}:</span>
                  <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
                    {fact!.value}
                  </span>
                  {isConfirmed && (
                    <CheckCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-label="Confirmed" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t pt-2.5" />
        </>
      )}

      {/* Aggregate stat pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={askHref}>
          <a
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border",
              hasOverdue
                ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
                : hasUrgent
                ? "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-300"
                : "bg-muted/60 border-border text-muted-foreground",
            )}
            data-testid="stat-open-actions"
          >
            <ClipboardList className="w-3 h-3" />
            {actionsData == null
              ? "…"
              : `${openActions.length} open action${openActions.length !== 1 ? "s" : ""}`}
            {hasOverdue && <span className="font-bold">!</span>}
          </a>
        </Link>

        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-muted/60 border-border text-muted-foreground"
          data-testid="stat-doc-count"
        >
          <FileText className="w-3 h-3" />
          {docCount === null ? "…" : `${docCount} document${docCount !== 1 ? "s" : ""}`}
        </span>
      </div>
    </div>
  );
}

/* ── Actions panel ────────────────────────────────────────────────────────── */

function ActionsPanel({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["/api/cases", caseId, "actions"];
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data, isLoading } = useQuery<{ actions: CaseActionItem[] }>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/actions`);
      if (!res.ok) return { actions: [] };
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

  const allActions    = data?.actions ?? [];
  const openActions   = allActions.filter((a) => a.status === "open");
  const doneActions   = allActions.filter((a) => a.status === "completed" || a.status === "dismissed");
  const hasUrgent     = openActions.some((a) => a.urgency === "overdue" || a.urgency === "urgent");

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="dashboard-actions-panel">
      {/* Header */}
      <div className={cn("px-4 py-2.5 flex items-center gap-2 border-b", hasUrgent && "bg-red-50/50 dark:bg-red-950/20")}>
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

      {/* Open actions */}
      <div className="divide-y">
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

      {/* History toggle */}
      {!isLoading && doneActions.length > 0 && (
        <>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t"
            data-testid="button-toggle-action-history"
          >
            <span className="flex items-center gap-1.5">
              <History className="w-3 h-3" />
              History ({doneActions.length})
            </span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showHistory && (
            <div className="divide-y bg-muted/10">
              {doneActions.map((action) => (
                <div
                  key={action.id}
                  className="px-4 py-2.5 flex items-start gap-3 opacity-60"
                  data-testid={`dashboard-action-done-${action.id}`}
                >
                  <CircleCheck className={cn(
                    "w-3.5 h-3.5 flex-shrink-0 mt-0.5",
                    action.status === "completed" ? "text-emerald-500" : "text-muted-foreground",
                  )} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground line-through decoration-muted-foreground/40">
                      {action.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {action.status} · {relativeTime(action.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
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
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="dashboard-conversations-panel">
      <div className="px-4 py-2.5 flex items-center justify-between gap-2 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary/70" />
          <span className="text-sm font-semibold text-foreground">Conversations</span>
        </div>
        <Link href={newChatHref}>
          <a
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            data-testid="link-new-conversation"
          >
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
          <p className="text-sm text-muted-foreground">No conversations yet.</p>
          <Link href={newChatHref}>
            <a
              className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:text-primary/80 transition-colors"
              data-testid="link-start-first-chat"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Start a conversation
            </a>
          </Link>
        </div>
      )}

      <div className="divide-y">
        {conversations.map((conv) => {
          // Use ?conversation= — conv.id is a Supabase conversations UUID, not a threads ID.
          const resumeParams = new URLSearchParams();
          resumeParams.set("case", caseId);
          resumeParams.set("conversation", conv.id);
          if (conv.jurisdictionState) resumeParams.set("state", conv.jurisdictionState);
          if (jurisdictionCounty) resumeParams.set("county", jurisdictionCounty);
          const href = `/ask?${resumeParams.toString()}`;

          const typeLabel = THREAD_TYPE_LABELS[conv.threadType] ?? conv.threadType.replace(/_/g, " ");
          const dateStr = conv.updatedAt
            ? shortDate(conv.updatedAt)
            : relativeTime(conv.createdAt);

          return (
            <Link key={conv.id} href={href}>
              <a
                className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors group"
                data-testid={`link-conversation-${conv.id}`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate text-foreground group-hover:text-primary transition-colors leading-snug">
                    {conv.title ?? "Untitled conversation"}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground/60 bg-muted/60 rounded px-1 py-px capitalize">
                      {typeLabel}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{dateStr}</span>
                  </div>
                </div>
                <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary/50 flex-shrink-0 mt-1 transition-colors" />
              </a>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Documents panel ──────────────────────────────────────────────────────── */

function DocumentsPanel({
  caseId,
  uploadHref,
  askHref,
}: {
  caseId: string;
  uploadHref: string;
  askHref: string;
}) {
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

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="dashboard-documents-panel">
      <div className="flex items-center justify-between px-4 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary/70" />
          <span className="text-sm font-semibold">Documents</span>
          {!isLoading && documents.length > 0 && (
            <span className="text-xs text-muted-foreground">({documents.length})</span>
          )}
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
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading documents…
        </div>
      )}

      {!isLoading && documents.length === 0 && (
        <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
          <File className="w-6 h-6 text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">No documents linked to this case yet.</p>
          <p className="text-[11px] text-muted-foreground/60">
            Upload a custody order or court filing to extract key facts automatically.
          </p>
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
          {documents.map((doc) => {
            const typeLabel = DOC_TYPE_LABELS[doc.docType] ?? "Document";
            const askDocHref = `${askHref}&document=${encodeURIComponent(doc.id)}&q=${encodeURIComponent(
              `Tell me about the ${typeLabel.toLowerCase()} I uploaded: ${doc.fileName}`,
            )}`;
            const analysis = doc.analysisJson ?? {};

            return (
              <div
                key={doc.id}
                className="px-4 py-3 hover:bg-muted/20 transition-colors"
                data-testid={`row-document-${doc.id}`}
              >
                {/* Row 1: filename + Ask button */}
                <div className="flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium truncate">{doc.fileName}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Link href={`/document/${doc.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                            data-testid={`btn-review-doc-${doc.id}`}
                          >
                            Review
                          </Button>
                        </Link>
                        <Link href={askDocHref}>
                          <a
                            className="flex-shrink-0"
                            data-testid={`link-ask-about-doc-${doc.id}`}
                            title="Ask Atlas about this document"
                          >
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1 text-primary/70 hover:text-primary">
                              <Zap className="w-3 h-3" />
                              Ask
                            </Button>
                          </a>
                        </Link>
                      </div>
                    </div>

                    {/* Row 2: type · pages · date */}
                    <p className="text-[10px] text-muted-foreground">
                      {typeLabel}
                      {" · "}
                      {doc.pageCount === 1 ? "1 page" : `${doc.pageCount} pages`}
                      {" · "}
                      {shortDate(doc.createdAt)}
                    </p>

                    {/* Row 3: obligation badges — hearing/deadline/time-sensitive */}
                    <DocObligationBadge analysisJson={analysis} />

                    {/* Row 4: extracted fact chips (court, case#, hearing date) */}
                    <DocFactChips analysisJson={analysis} />

                    {/* Row 5: key dates preview */}
                    <DocKeyDatesRow analysisJson={analysis} maxDates={2} />

                    {/* Row 6: one deterministic action insight */}
                    <DocActionInsight analysisJson={analysis} docType={doc.docType} />

                    {/* Row 7: quick action buttons */}
                    <DocQuickActions analysisJson={analysis} askBasePath={askHref} docId={doc.id} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Case Facts Section ───────────────────────────────────────────────────── */

/**
 * Shows all known case facts in a readable table.
 * Starts collapsed; expand to see all. First 5 shown by default.
 */
function CaseFactsSection({ facts, askHref }: { facts: CaseFactItem[]; askHref: string }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_COUNT = 5;

  if (facts.length === 0) return null;

  // Deduplicate by type, prefer user_confirmed
  const byType = new Map<string, CaseFactItem>();
  for (const f of facts) {
    const cur = byType.get(f.factType);
    if (!cur || f.source === "user_confirmed") byType.set(f.factType, f);
  }
  const dedupedFacts = Array.from(byType.values());

  const visible = expanded ? dedupedFacts : dedupedFacts.slice(0, PREVIEW_COUNT);
  const hasMore = dedupedFacts.length > PREVIEW_COUNT;

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="case-facts-section">
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-primary/70" />
          <span className="text-sm font-semibold">Case Facts</span>
          <span className="text-xs text-muted-foreground">({dedupedFacts.length})</span>
        </div>
        <Link href={`${askHref}&q=${encodeURIComponent("What else do you know about my case facts?")}`}>
          <a className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
             data-testid="link-ask-about-facts">
            <Zap className="w-3 h-3" />
            Add / confirm facts
          </a>
        </Link>
      </div>

      {/* Facts table */}
      <div className="divide-y">
        {visible.map((f) => {
          const label = FACT_TYPE_LABELS[f.factType] ?? f.factType.replace(/_/g, " ");
          const src   = FACT_SOURCE_LABELS[f.source] ?? { label: f.source, color: "text-muted-foreground" };
          const isConfirmed = f.source === "user_confirmed";

          return (
            <div
              key={f.id}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[180px_1fr_auto] items-start gap-x-3 gap-y-0.5 px-4 py-2.5"
              data-testid={`fact-row-${f.id}`}
            >
              {/* Fact type label */}
              <p className="text-xs text-muted-foreground font-medium capitalize hidden sm:block">
                {label}
              </p>

              {/* Value + mobile label */}
              <div className="min-w-0">
                <p className="text-xs sm:hidden text-muted-foreground mb-0.5">{label}</p>
                <p className="text-xs font-semibold text-foreground break-words">{f.value}</p>
                <p className={cn("text-[10px]", src.color)}>
                  {f.sourceName ? `${src.label} · ${f.sourceName}` : src.label}
                </p>
              </div>

              {/* Confirmed badge */}
              <div className="flex items-center mt-0.5">
                {isConfirmed ? (
                  <CheckCheck
                    className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0"
                    aria-label="Confirmed by you"
                    data-testid={`icon-fact-confirmed-${f.id}`}
                  />
                ) : (
                  <span className="w-3.5 h-3.5" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand / collapse */}
      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t"
          data-testid="button-toggle-facts"
        >
          {expanded ? (
            <><ChevronUp className="w-3.5 h-3.5" /> Show fewer</>
          ) : (
            <><ChevronDown className="w-3.5 h-3.5" /> Show all {dedupedFacts.length} facts</>
          )}
        </button>
      )}
    </div>
  );
}

/* ── What Matters Now ─────────────────────────────────────────────────────── */

/* ── Case Timeline ─────────────────────────────────────────────────────────
 * Derived from: document extracted_facts + key_dates[] + case_facts table.
 * No new DB table — pure aggregation via GET /api/cases/:caseId/timeline.
 * ────────────────────────────────────────────────────────────────────────── */

type TimelineEventType = "hearing" | "filing" | "effective" | "key_date" | "fact";

interface CaseTimelineEvent {
  id: string;
  dateRaw: string;
  dateParsed: string | null;
  label: string;
  source: string;
  type: TimelineEventType;
  isPast: boolean;
  isUpcoming: boolean;
  isNext: boolean;
  isOverdue: boolean;
}

function timelineIcon(type: TimelineEventType) {
  switch (type) {
    case "hearing":  return <Scale className="w-3.5 h-3.5" />;
    case "filing":   return <FileText className="w-3.5 h-3.5" />;
    case "effective": return <CircleCheck className="w-3.5 h-3.5" />;
    case "fact":     return <Hash className="w-3.5 h-3.5" />;
    default:         return <Calendar className="w-3.5 h-3.5" />;
  }
}

function timelineTypeLabel(type: TimelineEventType): string {
  switch (type) {
    case "hearing":   return "Hearing";
    case "filing":    return "Filing";
    case "effective": return "Effective";
    case "fact":      return "Case Fact";
    default:          return "Date";
  }
}

function CaseTimeline({ caseId }: { caseId: string }) {
  const { data, isLoading, isError } = useQuery<{ events: CaseTimelineEvent[] }>({
    queryKey: ["/api/cases", caseId, "timeline"],
    queryFn: async () => {
      const res = await fetch(`/api/cases/${caseId}/timeline`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load timeline");
      return res.json();
    },
    staleTime: 60_000,
  });

  const events = data?.events ?? [];
  const hasEvents = events.length > 0;
  const hasDatedEvents = events.some(e => e.dateParsed !== null);

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card px-4 py-3 h-16 animate-pulse" />
    );
  }

  if (isError || !hasEvents) return null;

  // Only render the panel when at least one event has a parseable date
  if (!hasDatedEvents) return null;

  function formatDate(raw: string | null): string {
    if (!raw) return "—";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // Limit to 12 most informative events for visual clarity
  // Priority: next event first, then upcoming, then past (most recent first)
  const nextEvents = events.filter(e => e.isNext);
  const otherUpcoming = events.filter(e => e.isUpcoming && !e.isNext);
  const pastEvents = [...events.filter(e => e.isPast)].reverse();
  const undated = events.filter(e => e.dateParsed === null);
  const sorted = [...nextEvents, ...otherUpcoming, ...pastEvents, ...undated].slice(0, 12);

  return (
    <div className="rounded-lg border bg-card" data-testid="case-timeline">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Case Timeline</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {events.filter(e => e.isUpcoming).length} upcoming
        </span>
      </div>

      <div className="px-4 py-3">
        <ol className="relative border-l border-border ml-2 space-y-0">
          {sorted.map((ev, idx) => {
            const isNextEv = ev.isNext;
            const isOverdue = ev.isOverdue;
            const isPast = ev.isPast;
            const isLast = idx === sorted.length - 1;

            const dotCls = isNextEv
              ? "bg-blue-500 ring-2 ring-blue-200 dark:ring-blue-900"
              : isOverdue
                ? "bg-red-400"
                : isPast
                  ? "bg-muted-foreground/40"
                  : "bg-primary/60";

            const rowCls = isPast && !isNextEv
              ? "opacity-60"
              : "";

            return (
              <li
                key={ev.id}
                data-testid={`timeline-event-${ev.id}`}
                className={`relative pl-6 ${isLast ? "pb-0" : "pb-4"} ${rowCls}`}
              >
                {/* Dot on the vertical line */}
                <span
                  className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border border-background ${dotCls}`}
                  aria-hidden
                />

                <div className="flex flex-col gap-0.5">
                  {/* Date row */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-medium tabular-nums ${
                        isNextEv
                          ? "text-blue-600 dark:text-blue-400"
                          : isOverdue
                            ? "text-red-500 dark:text-red-400"
                            : "text-muted-foreground"
                      }`}
                      data-testid={`timeline-date-${ev.id}`}
                    >
                      {formatDate(ev.dateParsed)}
                    </span>

                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      isNextEv
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : isOverdue
                          ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-muted text-muted-foreground"
                    }`}>
                      {timelineIcon(ev.type)}
                      {timelineTypeLabel(ev.type)}
                    </span>

                    {isNextEv && (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-blue-500 text-white">
                        Next
                      </span>
                    )}
                    {isOverdue && (
                      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Past due
                      </span>
                    )}
                  </div>

                  {/* Label */}
                  <p className="text-sm font-medium leading-snug" data-testid={`timeline-label-${ev.id}`}>
                    {ev.label}
                  </p>

                  {/* Source */}
                  <p className="text-xs text-muted-foreground leading-snug truncate max-w-xs">
                    {ev.source}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {events.length > 12 && (
          <p className="mt-3 text-xs text-muted-foreground text-center">
            {events.length - 12} more events in documents
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Deterministic CTA priority:
 *   1. Overdue action       → "Act on overdue action"   → askHref
 *   2. Hearing ≤ 7 days     → "Prepare for hearing"     → askHref
 *   3. No documents         → "Upload a document"       → uploadHref
 *   4. Hearing + no address → "Confirm courthouse"      → askHref w/ question
 *   5. Urgent action        → "Review open actions"     → askHref
 *   6. Default              → "Ask Atlas"               → askHref
 *
 * Field names confirmed:
 *   - CaseFactItem.value  (not .factValue — that was a bug)
 *   - CaseActionItem.title (not .actionTitle — that was a bug)
 */
function WhatMattersNow({
  facts,
  caseId,
  askHref,
  uploadHref,
}: {
  facts: CaseFactItem[];
  caseId: string;
  askHref: string;
  uploadHref: string;
}) {
  const hearingDateFact  = facts.find((f) => f.factType === "hearing_date");
  const courtNameFact    = facts.find((f) => f.factType === "court_name");
  const courtAddressFact = facts.find((f) => f.factType === "court_address");

  const { data: actionsData } = useQuery<{ actions: CaseActionItem[] }>({
    queryKey: ["/api/cases", caseId, "actions"],
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/actions`);
      if (!res.ok) return { actions: [] };
      return res.json();
    },
    staleTime: 20_000,
    enabled: !!caseId,
  });

  const { data: docsData } = useQuery<{ documents: { id: string }[] }>({
    queryKey: ["/api/cases", caseId, "documents"],
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/documents`);
      if (!res.ok) return { documents: [] };
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!caseId,
  });

  const openActions = (actionsData?.actions ?? []).filter((a) => a.status === "open");
  const topAction   =
    openActions.find((a) => a.urgency === "overdue") ??
    openActions.find((a) => a.urgency === "urgent")  ??
    openActions.find((a) => a.urgency === "soon")    ??
    openActions[0];

  // Use .value — the correct field name on CaseFactItem
  const hasHearing   = !!hearingDateFact?.value;
  const hasTopAction = !!topAction;
  if (!hasHearing && !hasTopAction) return null;

  const daysUntil      = topAction?.daysUntilHearing ?? null;
  const hasOverdue     = openActions.some((a) => a.urgency === "overdue");
  const hasUrgent      = openActions.some((a) => a.urgency === "urgent");
  const hasHearingSoon = hasHearing && daysUntil !== null && daysUntil >= 0 && daysUntil <= 7;
  const docsMissing    = docsData !== undefined && docsData.documents.length === 0;
  const courtAddressMissing = !courtAddressFact?.value;

  const urgencyKey: string =
    hasOverdue     ? "overdue" :
    hasUrgent      ? "urgent"  :
    hasHearingSoon ? "soon"    : "normal";

  const URGENCY_COLORS: Record<string, string> = {
    overdue: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800/50",
    urgent:  "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50",
    soon:    "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800/50",
    normal:  "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800/50",
  };
  const URGENCY_ICON_COLORS: Record<string, string> = {
    overdue: "text-red-500",
    urgent:  "text-amber-500",
    soon:    "text-yellow-500",
    normal:  "text-blue-500",
  };

  type CTADef = { label: string; href: string; Icon: typeof Zap };
  const cta: CTADef =
    hasOverdue
      ? { label: "Act on overdue action",   href: askHref,    Icon: Zap         }
    : hasHearingSoon
      ? { label: "Prepare for hearing",     href: askHref,    Icon: Calendar    }
    : docsMissing
      ? { label: "Upload a document",       href: uploadHref, Icon: Upload      }
    : hasHearing && courtAddressMissing && courtNameFact?.value
      ? {
          label: "Confirm courthouse",
          href:  `${askHref}&q=${encodeURIComponent(`What is the address for ${courtNameFact.value}?`)}`,
          Icon:  MapPin,
        }
    : hasUrgent
      ? { label: "Review open actions",     href: askHref,    Icon: ClipboardList }
    : { label: "Ask Atlas",                  href: askHref,    Icon: Zap         };

  return (
    <div
      className={cn("rounded-lg border px-4 py-3 flex items-start gap-3 shadow-sm", URGENCY_COLORS[urgencyKey])}
      data-testid="banner-what-matters-now"
    >
      <AlertTriangle className={cn("w-4 h-4 flex-shrink-0 mt-0.5", URGENCY_ICON_COLORS[urgencyKey])} />

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground mb-0.5">What matters now</p>
        <div className="flex flex-col gap-0.5">
          {hasHearing && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <span>Next hearing:</span>
              <span className="font-medium text-foreground">{hearingDateFact!.value}</span>
              {courtNameFact?.value && (
                <span className="text-muted-foreground"> · {courtNameFact.value}</span>
              )}
              {daysUntil !== null && (
                <span className="text-muted-foreground">
                  {" "}·{" "}
                  {daysUntil < 0
                    ? `${Math.abs(daysUntil)}d overdue`
                    : daysUntil === 0
                    ? "Today"
                    : `${daysUntil}d away`}
                </span>
              )}
            </p>
          )}
          {hasTopAction && (
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <ClipboardList className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>{topAction!.title}</span>
            </p>
          )}
        </div>
      </div>

      <Link href={cta.href}>
        <a data-testid="link-what-matters-cta">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 flex-shrink-0 whitespace-nowrap hover:bg-white/60 dark:hover:bg-white/10"
          >
            <cta.Icon className="w-3 h-3" />
            {cta.label}
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
  const facts      = factsData?.facts ?? [];

  const askParams = new URLSearchParams();
  askParams.set("case", caseId);
  if (caseRecord?.jurisdictionState) askParams.set("state", caseRecord.jurisdictionState);
  if (caseRecord?.jurisdictionCounty) askParams.set("county", caseRecord.jurisdictionCounty);
  const askHref = `/ask?${askParams.toString()}`;

  const uploadHref = caseRecord?.jurisdictionState
    ? `/upload-document?case=${caseId}&state=${caseRecord.jurisdictionState}`
    : `/upload-document?case=${caseId}`;

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
          <a
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            data-testid="link-back-to-workspace"
          >
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
              {caseRecord.description && (
                <span className="text-[11px] text-muted-foreground/70 truncate max-w-[240px]">
                  {caseRecord.description}
                </span>
              )}
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

      {/* ── Case Snapshot: court facts + aggregate stats ─────────────────── */}
      {factsLoading && (
        <div className="rounded-lg border bg-card px-4 py-3 h-16 animate-pulse" />
      )}
      {!factsLoading && (
        <CaseSnapshotPanel facts={facts} caseId={caseId} askHref={askHref} />
      )}

      {/* ── What matters now — smart urgency CTA ─────────────────────────── */}
      {!factsLoading && facts.length > 0 && (
        <WhatMattersNow
          facts={facts}
          caseId={caseId}
          askHref={askHref}
          uploadHref={uploadHref}
        />
      )}

      {/* ── Case Timeline — derived from docs + facts, no new table ──────── */}
      <CaseTimeline caseId={caseId} />

      {/* ── Two-column grid: actions + conversations ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-3">
          <ActionsPanel caseId={caseId} />
        </div>
        <div className="md:col-span-2">
          <ConversationsPanel
            caseId={caseId}
            jurisdictionState={caseRecord.jurisdictionState}
            jurisdictionCounty={caseRecord.jurisdictionCounty}
          />
        </div>
      </div>

      {/* ── All case facts — collapsible full table ───────────────────────── */}
      {!factsLoading && facts.length > 0 && (
        <CaseFactsSection facts={facts} askHref={askHref} />
      )}

      {/* ── Documents panel ──────────────────────────────────────────────── */}
      <DocumentsPanel caseId={caseId} uploadHref={uploadHref} askHref={askHref} />

      {/* ── Footer meta ──────────────────────────────────────────────────── */}
      <p className="text-[11px] text-muted-foreground/50 text-center pb-2">
        Case created {relativeTime(caseRecord.createdAt)}
        {" · "}
        <Link href="/workspace"><a className="hover:underline">All cases</a></Link>
      </p>
    </div>
  );
}
