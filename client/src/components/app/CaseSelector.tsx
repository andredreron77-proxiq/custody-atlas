/**
 * CaseSelector
 *
 * Minimal case-based workspace widget. Shows the user's active cases,
 * lets them create a new one inline, and links to each case's conversations.
 *
 * This is the phase-1 foundation component — it reads from /api/cases and
 * /api/cases/:caseId/conversations but does NOT yet replace the existing
 * threads / documents flow.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderOpen, Plus, ChevronRight, Loader2, FolderX,
  MessageSquare, MoreHorizontal, MapPin, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface CaseRecord {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  caseId: string;
  userId: string;
  title: string | null;
  threadType: string;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
  documentId: string | null;
  createdAt: string;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* ── Inline create form ───────────────────────────────────────────────────── */

function NewCaseForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cases", {
      title: title.trim(),
      caseType: "custody",
      stateCode: "US",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      onCreated();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2" data-testid="form-new-case">
      <Input
        autoFocus
        placeholder="Case name (e.g. Smith vs. Jones)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        className="h-8 text-sm flex-1"
        data-testid="input-case-title"
        disabled={mutation.isPending}
      />
      <Button
        type="submit"
        size="sm"
        className="h-8 px-3 gap-1.5"
        disabled={!title.trim() || mutation.isPending}
        data-testid="button-save-new-case"
      >
        {mutation.isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Plus className="w-3.5 h-3.5" />
        )}
        Save
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-muted-foreground"
        onClick={onCancel}
        disabled={mutation.isPending}
        data-testid="button-cancel-new-case"
      >
        Cancel
      </Button>
    </form>
  );
}

/* ── Conversations mini-list (lazy-loaded per case) ───────────────────────── */

function CaseConversationList({ caseId }: { caseId: string }) {
  const { data, isLoading } = useQuery<{ conversations: ConversationRecord[] }>({
    queryKey: ["/api/cases", caseId, "conversations"],
    queryFn: async () => {
      const res = await fetch(`/api/cases/${caseId}/conversations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load conversations");
      return res.json();
    },
  });

  const conversations = data?.conversations ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 px-3 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading conversations…
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2 px-3" data-testid={`text-no-conversations-${caseId}`}>
        No conversations yet.
      </p>
    );
  }

  return (
    <ul className="mt-1 space-y-0.5" data-testid={`list-conversations-${caseId}`}>
      {conversations.map((conv) => (
        <li
          key={conv.id}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted/60 text-sm transition-colors"
          data-testid={`conversation-item-${conv.id}`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="flex-1 truncate text-muted-foreground">
            {conv.title ?? `${conv.threadType} conversation`}
          </span>
          <span className="text-[11px] text-muted-foreground/60 flex-shrink-0">
            {relativeTime(conv.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── Case row ─────────────────────────────────────────────────────────────── */

function CaseRow({ caseRecord }: { caseRecord: CaseRecord }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-lg border bg-background hover:border-primary/30 transition-colors"
      data-testid={`case-row-${caseRecord.id}`}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
        data-testid={`button-expand-case-${caseRecord.id}`}
        aria-expanded={expanded}
      >
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FolderOpen className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" data-testid={`text-case-title-${caseRecord.id}`}>
            {caseRecord.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {caseRecord.jurisdictionState && (
              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <MapPin className="w-2.5 h-2.5" />
                {caseRecord.jurisdictionState}
                {caseRecord.jurisdictionCounty ? `, ${caseRecord.jurisdictionCounty}` : ""}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground/60">
              {relativeTime(caseRecord.createdAt)}
            </span>
          </div>
        </div>
        <Badge
          variant={caseRecord.status === "active" ? "default" : "secondary"}
          className={cn(
            "text-[10px] px-1.5 py-0 h-4 flex-shrink-0",
            caseRecord.status === "active"
              ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50"
              : ""
          )}
          data-testid={`badge-case-status-${caseRecord.id}`}
        >
          {caseRecord.status}
        </Badge>
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 transition-transform",
            expanded && "rotate-90"
          )}
        />
      </button>
      {/* "Open" button — navigates to the case dashboard */}
      <div className="px-3 pb-2 flex justify-end">
        <Link href={`/case/${caseRecord.id}`}>
          <a
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            data-testid={`link-open-case-${caseRecord.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            Open case
            <ExternalLink className="w-3 h-3" />
          </a>
        </Link>
      </div>

      {expanded && (
        <div className="border-t px-1 pb-2 pt-1" data-testid={`case-conversations-${caseRecord.id}`}>
          <CaseConversationList caseId={caseRecord.id} />
        </div>
      )}
    </div>
  );
}

/* ── Main widget ──────────────────────────────────────────────────────────── */

export function CaseSelector() {
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery<{ cases: CaseRecord[] }>({
    queryKey: ["/api/cases"],
  });

  const cases = data?.cases ?? [];

  return (
    <div data-testid="widget-case-selector">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Cases
          </span>
          {cases.length > 0 && (
            <span className="text-[11px] text-muted-foreground/60">({cases.length})</span>
          )}
        </div>
        {!showForm && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowForm(true)}
            data-testid="button-new-case"
          >
            <Plus className="w-3 h-3" />
            New Case
          </Button>
        )}
      </div>

      {/* New case inline form */}
      {showForm && (
        <NewCaseForm
          onCreated={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground" data-testid="loading-cases">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading cases…
        </div>
      )}

      {/* Empty state */}
      {!isLoading && cases.length === 0 && !showForm && (
        <div
          className="flex flex-col items-center gap-2 py-5 text-center rounded-lg border border-dashed"
          data-testid="empty-cases"
        >
          <FolderX className="w-6 h-6 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No cases yet.</p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={() => setShowForm(true)}
            data-testid="button-create-first-case"
          >
            <Plus className="w-3 h-3" />
            Create your first case
          </Button>
        </div>
      )}

      {/* Case list */}
      {!isLoading && cases.length > 0 && (
        <div className="space-y-1.5" data-testid="list-cases">
          {cases.map((c) => (
            <CaseRow key={c.id} caseRecord={c} />
          ))}
        </div>
      )}
    </div>
  );
}
