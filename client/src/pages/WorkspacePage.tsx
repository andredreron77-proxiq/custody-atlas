import { useState } from "react";
import { Link } from "wouter";
import {
  LayoutDashboard, MapPin, MessageSquare, FileSearch, Map,
  GitCompare, ShieldCheck, Lock, FileText, ArrowRight,
  ChevronRight, BookOpen, Scale, Lightbulb, X,
  Clock, Play, Loader2, CalendarDays, PlusCircle, Trash2,
  Sparkles, ChevronDown, Tag, TriangleAlert, Zap,
} from "lucide-react";
import { fetchUsageState } from "@/services/usageService";
import type { UsageState } from "@/services/usageService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { JurisdictionContextHeader } from "@/components/app/JurisdictionContextHeader";
import { CaseSelector } from "@/components/app/CaseSelector";
import { useJurisdiction } from "@/hooks/useJurisdiction";
import { isStateOnlyCounty } from "@/lib/jurisdictionUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestRaw, apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-auth";

/* ── API types ────────────────────────────────────────────────────────────── */

interface WorkspaceThread {
  id: string;
  title: string | null;
  threadType: string;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
  documentId: string | null;
  createdAt: string;
}

type DocType = "custody_order" | "communication" | "financial" | "other";

interface WorkspaceDocument {
  id: string;
  fileName: string;
  mimeType: string;
  docType: DocType;
  analysisJson: Record<string, unknown>;
  createdAt: string;
}

interface WorkspaceTimelineEvent {
  id: string;
  eventDate: string;
  description: string;
  createdAt: string;
}

interface WorkspaceData {
  threads: WorkspaceThread[];
  documents: WorkspaceDocument[];
  timelineEvents: WorkspaceTimelineEvent[];
}

interface CaseSummary {
  themes: string[];
  custodyFactors: string[];
  insights: string[];
  disclaimer: string;
}

/* ── Constants ────────────────────────────────────────────────────────────── */

const DOC_TYPE_LABELS: Record<DocType, string> = {
  custody_order: "Custody Order",
  communication: "Communication",
  financial: "Financial",
  other: "Other",
};

const DOC_TYPE_COLORS: Record<DocType, string> = {
  custody_order: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50",
  communication: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/50",
  financial: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50",
  other: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700/50",
};

/* ── Shared sub-components ────────────────────────────────────────────────── */

function AnalyzedBadge() {
  return (
    <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50">
      Analyzed
    </Badge>
  );
}

function DocTypeBadge({ type }: { type: DocType }) {
  return (
    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-medium ${DOC_TYPE_COLORS[type]}`}>
      {DOC_TYPE_LABELS[type]}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatEventDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

/* ── Next Best Step ───────────────────────────────────────────────────────── */

type StepScenario = "no-jurisdiction" | "no-questions" | "no-document" | "review-conversations" | "pro-summarize";

interface StepConfig {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel: string;
}

const STEP_CONFIGS: Record<StepScenario, StepConfig> = {
  "no-jurisdiction": {
    icon: MapPin, iconBg: "bg-blue-100 dark:bg-blue-950/50", iconColor: "text-blue-600 dark:text-blue-400",
    title: "Set your location",
    description: "We'll use your state and county to provide more relevant custody information.",
    ctaLabel: "Set Location", ctaHref: "/location", secondaryLabel: "Skip for now",
  },
  "no-questions": {
    icon: MessageSquare, iconBg: "bg-blue-100 dark:bg-blue-950/50", iconColor: "text-blue-600 dark:text-blue-400",
    title: "Ask your first custody question",
    description: "Ask Atlas can help you understand custody rules that may apply where you live.",
    ctaLabel: "Ask Atlas", ctaHref: "/ask", secondaryLabel: "Skip for now",
  },
  "no-document": {
    icon: FileText, iconBg: "bg-emerald-100 dark:bg-emerald-950/50", iconColor: "text-emerald-600 dark:text-emerald-400",
    title: "Upload a custody document",
    description: "Analyze a custody order or legal notice to get a plain-English explanation.",
    ctaLabel: "Analyze a Document", ctaHref: "/upload-document", secondaryLabel: "Skip for now",
  },
  "review-conversations": {
    icon: MessageSquare, iconBg: "bg-violet-100 dark:bg-violet-950/50", iconColor: "text-violet-600 dark:text-violet-400",
    title: "Review your saved conversations",
    description: "Your questions and documents are saved here so you can continue where you left off.",
    ctaLabel: "Resume Conversation", ctaHref: "/ask", secondaryLabel: "Maybe later",
  },
  "pro-summarize": {
    icon: Sparkles, iconBg: "bg-amber-100 dark:bg-amber-950/50", iconColor: "text-amber-600 dark:text-amber-400",
    title: "Summarize your situation",
    description: "Generate a structured summary based on your questions and documents.",
    ctaLabel: "Summarize My Situation", ctaHref: "#case-summary", secondaryLabel: "Maybe later",
  },
};

function NextBestStepPanel({ scenario, ctaHref }: { scenario: StepScenario; ctaHref: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const { icon: Icon, iconBg, iconColor, title, description, ctaLabel, secondaryLabel } = STEP_CONFIGS[scenario];
  const isHashLink = ctaHref.startsWith("#");
  const CtaWrapper = ({ children }: { children: React.ReactNode }) =>
    isHashLink ? (
      <a href={ctaHref} onClick={() => setDismissed(false)}>{children}</a>
    ) : (
      <Link href={ctaHref}>{children}</Link>
    );
  return (
    <div data-testid="panel-next-best-step">
      <div className="flex items-center gap-1.5 mb-2">
        <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recommended Next Step</span>
      </div>
      <div className="relative rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background dark:from-primary/10 dark:via-background dark:to-background px-5 py-5 shadow-sm">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
          data-testid="button-dismiss-next-step"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-start gap-4 pr-6">
          <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-foreground text-base leading-tight mb-1" data-testid="text-next-step-title">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3.5" data-testid="text-next-step-description">
              {description}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <CtaWrapper>
                <Button size="sm" className="gap-1.5 shadow-sm px-4" data-testid="button-next-step-cta">
                  {ctaLabel}<ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </CtaWrapper>
              <button
                onClick={() => setDismissed(true)}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                data-testid="button-next-step-skip"
              >
                {secondaryLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────────── */

function EmptyState({
  icon: Icon, message, ctaLabel, ctaHref, testId,
}: { icon: React.ElementType; message: string; ctaLabel: string; ctaHref: string; testId: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6 text-center" data-testid={testId}>
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground leading-snug max-w-[180px]">{message}</p>
      <Link href={ctaHref}>
        <Button variant="outline" size="sm" className="gap-1.5" data-testid={`${testId}-cta`}>
          {ctaLabel}<ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </Link>
    </div>
  );
}

/* ── Timeline Section ─────────────────────────────────────────────────────── */

function TimelineSection({ events, isLoading }: {
  events: WorkspaceTimelineEvent[];
  isLoading: boolean;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [description, setDescription] = useState("");

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/timeline", { eventDate, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workspace"] });
      setShowForm(false);
      setEventDate("");
      setDescription("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => apiRequest("DELETE", `/api/timeline/${eventId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/workspace"] }),
  });

  return (
    <Card className="shadow-sm border md:col-span-2" data-testid="card-timeline">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-primary" />
            Case Timeline
          </CardTitle>
          {!showForm && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 px-2"
              onClick={() => setShowForm(true)}
              data-testid="button-add-event"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add event
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add event form */}
        {showForm && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3" data-testid="form-add-event">
            <p className="text-xs font-semibold text-foreground">New timeline event</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="event-date" className="text-xs">Date</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="input-event-date"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="event-desc" className="text-xs">Description</Label>
                <Input
                  id="event-desc"
                  type="text"
                  placeholder="e.g. Custody hearing scheduled"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  className="h-8 text-sm"
                  data-testid="input-event-description"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={!eventDate || !description.trim() || addMutation.isPending}
                onClick={() => addMutation.mutate()}
                data-testid="button-save-event"
              >
                {addMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlusCircle className="w-3 h-3" />}
                Save event
              </Button>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { setShowForm(false); setEventDate(""); setDescription(""); }}
                data-testid="button-cancel-event"
              >
                Cancel
              </button>
            </div>
            {addMutation.isError && (
              <p className="text-xs text-destructive">Failed to save. Please try again.</p>
            )}
          </div>
        )}

        {/* Event list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-5 text-center" data-testid="empty-timeline">
            <CalendarDays className="w-7 h-7 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground max-w-[260px] leading-snug">
              Add dates that matter — hearings, filing deadlines, agreements — to keep your timeline organized.
            </p>
          </div>
        ) : (
          <div className="relative" data-testid="list-timeline-events">
            {/* Vertical connector line */}
            <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border" aria-hidden />
            <ul className="space-y-2 pl-6">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="relative flex items-start justify-between gap-3 group"
                  data-testid={`timeline-event-${ev.id}`}
                >
                  {/* Dot */}
                  <span className="absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 border-primary bg-background flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {formatEventDate(ev.eventDate)}
                    </p>
                    <p className="text-sm text-foreground leading-snug mt-0.5">{ev.description}</p>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => deleteMutation.mutate(ev.id)}
                    disabled={deleteMutation.isPending}
                    aria-label="Delete event"
                    data-testid={`button-delete-event-${ev.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Case Summary Section ─────────────────────────────────────────────────── */

function CaseSummarySection() {
  const [summary, setSummary] = useState<CaseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const summaryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequestRaw("POST", "/api/workspace/summarize");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to generate summary.");
      }
      return res.json() as Promise<CaseSummary>;
    },
    onSuccess: (data) => {
      setSummary(data);
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  return (
    <Card id="case-summary" className="shadow-sm border md:col-span-2" data-testid="card-case-summary">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Case Summary
          </CardTitle>
          {summary && (
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setOpen((v) => !v)}
              data-testid="button-toggle-summary"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!summary && !summaryMutation.isPending && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <p className="text-sm font-semibold text-foreground">Summarize My Situation</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Generate an informational overview of the themes and general custody factors
                that appear in your conversations and documents.
              </p>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-left max-w-sm w-full">
                <TriangleAlert className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive leading-snug">{error}</p>
              </div>
            )}
            <Button
              onClick={() => summaryMutation.mutate()}
              className="gap-2"
              data-testid="button-generate-summary"
            >
              <Sparkles className="w-4 h-4" />
              Summarize My Situation
            </Button>
          </div>
        )}

        {summaryMutation.isPending && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing your conversations and documents…</p>
          </div>
        )}

        {summary && open && (
          <div className="space-y-5" data-testid="section-summary-output">
            {/* Themes */}
            {summary.themes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Key Themes</p>
                <div className="flex flex-wrap gap-1.5">
                  {summary.themes.map((t, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium"
                      data-testid={`tag-theme-${i}`}
                    >
                      <Tag className="w-2.5 h-2.5" />
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Custody factors */}
            {summary.custodyFactors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">General Custody Factors</p>
                <ul className="space-y-1.5">
                  {summary.custodyFactors.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground" data-testid={`item-factor-${i}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Insights */}
            {summary.insights.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Informational Insights</p>
                <ul className="space-y-2">
                  {summary.insights.map((ins, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 rounded-lg bg-muted/50 border px-3 py-2.5 text-sm text-foreground"
                      data-testid={`item-insight-${i}`}
                    >
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      {ins}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Disclaimer */}
            {summary.disclaimer && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2.5">
                <Scale className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  {summary.disclaimer}
                </p>
              </div>
            )}

            {/* Regenerate */}
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              onClick={() => { setSummary(null); }}
              data-testid="button-regenerate-summary"
            >
              Regenerate summary
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Documents — grouped by type ──────────────────────────────────────────── */

function DocumentsSection({
  documents, isLoading, askAIPath,
}: {
  documents: WorkspaceDocument[];
  isLoading: boolean;
  askAIPath: string;
}) {
  const qc = useQueryClient();
  const [localTypes, setLocalTypes] = useState<Record<string, DocType>>({});

  const typeMutation = useMutation({
    mutationFn: ({ docId, docType }: { docId: string; docType: DocType }) =>
      apiRequest("PATCH", `/api/documents/${docId}/type`, { docType }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/workspace"] }),
  });

  function getDocType(doc: WorkspaceDocument): DocType {
    return localTypes[doc.id] ?? doc.docType ?? "other";
  }

  function handleTypeChange(doc: WorkspaceDocument, val: string) {
    const newType = val as DocType;
    setLocalTypes((prev) => ({ ...prev, [doc.id]: newType }));
    typeMutation.mutate({ docId: doc.id, docType: newType });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileSearch}
        message="Upload your first custody document"
        ctaLabel="Analyze a document"
        ctaHref="/upload-document"
        testId="empty-recent-documents"
      />
    );
  }

  // Group documents by type
  const groups: Partial<Record<DocType, WorkspaceDocument[]>> = {};
  for (const doc of documents) {
    const t = getDocType(doc);
    if (!groups[t]) groups[t] = [];
    groups[t]!.push(doc);
  }
  const groupOrder: DocType[] = ["custody_order", "communication", "financial", "other"];
  const activeGroups = groupOrder.filter((t) => groups[t]?.length);

  return (
    <div className="space-y-4" data-testid="list-documents-grouped">
      {activeGroups.map((groupType) => (
        <div key={groupType}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <DocTypeBadge type={groupType} />
            <span className="text-[10px] text-muted-foreground">{groups[groupType]!.length}</span>
          </div>
          <ul className="space-y-2">
            {groups[groupType]!.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-2 rounded-lg border p-3"
                data-testid={`doc-item-${doc.id}`}
              >
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{doc.fileName}</span>
                    {Object.keys(doc.analysisJson).length > 0 && <AnalyzedBadge />}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={getDocType(doc)}
                      onValueChange={(val) => handleTypeChange(doc, val)}
                    >
                      <SelectTrigger
                        className="h-6 text-[10px] px-2 py-0 w-auto border-dashed gap-1"
                        data-testid={`select-doc-type-${doc.id}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custody_order">Custody Order</SelectItem>
                        <SelectItem value="communication">Communication</SelectItem>
                        <SelectItem value="financial">Financial</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-[11px] text-muted-foreground">
                      {relativeTime(doc.createdAt)}
                    </span>
                  </div>
                </div>
                <Link href={`${askAIPath}${askAIPath.includes("?") ? "&" : "?"}document=${encodeURIComponent(doc.id)}`}>
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-7 px-2 flex-shrink-0" data-testid={`button-view-doc-${doc.id}`}>
                    Ask about it
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function WorkspacePage() {
  const { jurisdiction } = useJurisdiction();
  const { user } = useCurrentUser();

  const { data: usage } = useQuery<UsageState>({
    queryKey: ["/api/usage"],
    queryFn: fetchUsageState,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const isFreeUser = usage?.isAuthenticated && usage.tier === "free";
  const isProUser = usage?.isAuthenticated && usage.tier === "pro";

  const { data: workspaceData, isLoading: isLoadingWorkspace } = useQuery<WorkspaceData | null>({
    queryKey: ["/api/workspace"],
    enabled: !!user,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/workspace");
      if (!res.ok) return { threads: [], documents: [], timelineEvents: [] };
      return res.json();
    },
  });

  const threads: WorkspaceThread[] = workspaceData?.threads ?? [];
  const documents: WorkspaceDocument[] = workspaceData?.documents ?? [];
  const timelineEvents: WorkspaceTimelineEvent[] = workspaceData?.timelineEvents ?? [];

  const hasQuestions = threads.length > 0;
  const hasDocuments = documents.length > 0;

  function resolveScenario(): StepScenario {
    if (!jurisdiction) return "no-jurisdiction";
    if (!hasQuestions) return "no-questions";
    if (!hasDocuments) return "no-document";
    if (isProUser) return "pro-summarize";
    return "review-conversations";
  }
  const scenario = resolveScenario();

  const scenarioCta = ((): string => {
    if (scenario === "review-conversations") {
      const threadParam = threads[0] ? `thread=${threads[0].id}` : null;
      if (jurisdiction) {
        const jParams = `state=${encodeURIComponent(jurisdiction.state)}&county=${encodeURIComponent(jurisdiction.county)}&country=${encodeURIComponent(jurisdiction.country ?? "United States")}`;
        return threadParam ? `/ask?${threadParam}&${jParams}` : `/ask?${jParams}`;
      }
      return threadParam ? `/ask?${threadParam}` : "/ask";
    }
    if (scenario === "pro-summarize") return "#case-summary";
    const base = STEP_CONFIGS[scenario].ctaHref;
    if (scenario === "no-questions" && jurisdiction) {
      return `/ask?state=${encodeURIComponent(jurisdiction.state)}&county=${encodeURIComponent(jurisdiction.county)}&country=${encodeURIComponent(jurisdiction.country ?? "United States")}`;
    }
    return base;
  })();

  const lawPagePath = jurisdiction
    ? `/jurisdiction/${encodeURIComponent(jurisdiction.state)}/${encodeURIComponent(jurisdiction.county)}` +
      `?country=${encodeURIComponent(jurisdiction.country ?? "United States")}` +
      (jurisdiction.formattedAddress ? `&address=${encodeURIComponent(jurisdiction.formattedAddress)}` : "") +
      (jurisdiction.latitude !== undefined ? `&lat=${jurisdiction.latitude}` : "") +
      (jurisdiction.longitude !== undefined ? `&lng=${jurisdiction.longitude}` : "")
    : null;

  const askAIPath = jurisdiction
    ? `/ask?state=${encodeURIComponent(jurisdiction.state)}&county=${encodeURIComponent(jurisdiction.county)}&country=${encodeURIComponent(jurisdiction.country ?? "United States")}`
    : "/ask";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6" data-testid="page-workspace">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="heading-workspace">Case Workspace</h1>
          {isProUser && (
            <Badge className="text-xs gap-1 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/50 font-medium ml-1" data-testid="badge-workspace-plan-pro">
              <Zap className="w-3 h-3" />
              Pro
            </Badge>
          )}
          {isFreeUser && (
            <Badge variant="outline" className="text-xs font-medium ml-1" data-testid="badge-workspace-plan-free">
              Free plan
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm ml-10">
          Organize your custody activity, track key dates, and understand your situation.
        </p>
      </div>

      {/* Jurisdiction context banner */}
      {jurisdiction && (
        <JurisdictionContextHeader
          mode="jurisdiction"
          state={jurisdiction.state}
          county={jurisdiction.county}
          changeLocationHref="/location"
        />
      )}

      {/* Next Best Step */}
      <NextBestStepPanel scenario={scenario} ctaHref={scenarioCta} />

      {/* Cases */}
      <Card className="shadow-sm border" data-testid="card-cases">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <LayoutDashboard className="w-3.5 h-3.5 text-primary" />
            My Cases
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CaseSelector />
        </CardContent>
      </Card>

      {/* Dashboard grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── A: Jurisdiction Card ─────────────────────────────────── */}
        <Card className="shadow-sm border" data-testid="card-jurisdiction">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Jurisdiction
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {jurisdiction ? (
              <>
                <div>
                  <p className="text-xl font-bold text-foreground" data-testid="text-workspace-state">{jurisdiction.state}</p>
                  {!isStateOnlyCounty(jurisdiction.county) && (
                    <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-workspace-county">
                      {jurisdiction.county} County
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                    Plain-English custody law guidance based on your location.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lawPagePath && (
                    <Link href={lawPagePath}>
                      <Button size="sm" className="gap-1.5" data-testid="button-view-law-summary">
                        <BookOpen className="w-3.5 h-3.5" />
                        View law summary
                      </Button>
                    </Link>
                  )}
                  <Link href="/location">
                    <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-change-location-workspace">
                      <MapPin className="w-3.5 h-3.5" />
                      Change location
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Set your location to get custody law guidance specific to your state and county.
                </p>
                <Link href="/location">
                  <Button size="sm" className="gap-1.5" data-testid="button-set-location">
                    <MapPin className="w-3.5 h-3.5" />
                    Set my location
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── B: Quick Actions Card ──────────────────────────────── */}
        <Card className="shadow-sm border" data-testid="card-quick-actions">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: askAIPath, icon: MessageSquare, bg: "bg-blue-100 dark:bg-blue-950/40", color: "text-blue-600 dark:text-blue-400", label: "Ask a custody question", testId: "quick-action-ask-ai" },
                { href: "/upload-document", icon: FileSearch, bg: "bg-emerald-100 dark:bg-emerald-950/40", color: "text-emerald-600 dark:text-emerald-400", label: "Analyze a document", testId: "quick-action-analyze-doc" },
                { href: "/custody-map", icon: Map, bg: "bg-violet-100 dark:bg-violet-950/40", color: "text-violet-600 dark:text-violet-400", label: "Explore custody map", testId: "quick-action-explore-map" },
                { href: "/custody-map?mode=compare", icon: GitCompare, bg: "bg-amber-100 dark:bg-amber-950/40", color: "text-amber-600 dark:text-amber-400", label: "Compare states", testId: "quick-action-compare-states" },
              ].map(({ href, icon: Icon, bg, color, label, testId }) => (
                <Link key={testId} href={href}>
                  <button
                    className="w-full flex flex-col items-start gap-2 rounded-lg border bg-card p-3 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                    data-testid={testId}
                  >
                    <div className={`w-7 h-7 rounded-md ${bg} flex items-center justify-center`}>
                      <Icon className={`w-3.5 h-3.5 ${color}`} />
                    </div>
                    <span className="text-xs font-medium leading-snug group-hover:text-primary transition-colors">{label}</span>
                  </button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── C: Documents Card — grouped by type ─────────────────── */}
        <Card className="shadow-sm border" data-testid="card-recent-documents">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                Documents
              </CardTitle>
              <Link href="/upload-document">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 px-2" data-testid="button-upload-new-doc">
                  <PlusCircle className="w-3.5 h-3.5" />
                  Upload
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <DocumentsSection
              documents={documents}
              isLoading={isLoadingWorkspace && !!user}
              askAIPath={askAIPath}
            />
          </CardContent>
        </Card>

        {/* ── D: Recent Conversations Card ──────────────────────── */}
        <Card className="shadow-sm border" data-testid="card-recent-conversations">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-primary" />
                Recent Conversations
              </CardTitle>
              {user && (
                <span className="text-[10px] text-muted-foreground leading-none">auto-saved</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!user ? (
              <EmptyState
                icon={MessageSquare}
                message="Sign in to save and resume conversations"
                ctaLabel="Ask Atlas"
                ctaHref={askAIPath}
                testId="empty-conversations-unauth"
              />
            ) : isLoadingWorkspace ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : threads.length > 0 ? (
              <ul className="space-y-2" data-testid="list-recent-conversations">
                {threads.map((thread) => {
                  const params = new URLSearchParams({ thread: thread.id });
                  if (thread.jurisdictionState) params.set("state", thread.jurisdictionState);
                  if (thread.jurisdictionCounty) params.set("county", thread.jurisdictionCounty);
                  return (
                    <li
                      key={thread.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                      data-testid={`conversation-item-${thread.id}`}
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                          {thread.title ?? "Custody Conversation"}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {thread.jurisdictionState && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />{thread.jurisdictionState}
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />{relativeTime(thread.createdAt)}
                          </span>
                        </div>
                      </div>
                      <Link href={`/ask?${params.toString()}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-shrink-0 text-xs gap-1 h-7 px-2.5"
                          data-testid={`button-resume-${thread.id}`}
                        >
                          <Play className="w-2.5 h-2.5" />
                          Resume
                        </Button>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={MessageSquare}
                message="Your conversations will appear here after you ask your first question"
                ctaLabel="Ask Atlas"
                ctaHref={askAIPath}
                testId="empty-recent-conversations"
              />
            )}
          </CardContent>
        </Card>

        {/* ── E: Case Timeline (full width) ───────────────────────── */}
        {user && (
          <TimelineSection
            events={timelineEvents}
            isLoading={isLoadingWorkspace && !!user}
          />
        )}

        {/* ── F: Case Summary (full width) ────────────────────────── */}
        {user && (
          <CaseSummarySection />
        )}

        {/* ── G: Custody Map Card ────────────────────────────────── */}
        <Card className="shadow-sm border bg-gradient-to-br from-blue-50 to-slate-50 dark:from-blue-950/20 dark:to-slate-900/20" data-testid="card-custody-map">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Map className="w-3.5 h-3.5 text-primary" />
              Custody Map
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-semibold text-foreground mb-1">Explore laws by state</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Explore custody laws across the United States and compare key legal differences between states.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/custody-map">
                <Button size="sm" className="gap-1.5" data-testid="button-open-map">
                  <Map className="w-3.5 h-3.5" />
                  Open Custody Map
                </Button>
              </Link>
              <Link href="/custody-map?mode=compare">
                <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-compare-states-map">
                  <GitCompare className="w-3.5 h-3.5" />
                  Compare states
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* ── H: Privacy & Trust Card ────────────────────────────── */}
        <Card className="shadow-sm border" data-testid="card-privacy-trust">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Privacy &amp; Trust
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2.5">
              {[
                { icon: FileText, label: "Secure document analysis", desc: "Documents are processed securely and never retained." },
                { icon: Lock, label: "Private AI guidance", desc: "Your questions are confidential and never shared." },
                { icon: Scale, label: "You control your uploads", desc: "Upload and delete documents on your own terms." },
              ].map(({ icon: Icon, label, desc }) => (
                <li key={label} className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Link href="/privacy">
              <Button variant="outline" size="sm" className="gap-1.5 w-full" data-testid="button-view-privacy">
                <ShieldCheck className="w-3.5 h-3.5" />
                View Privacy Policy
              </Button>
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
