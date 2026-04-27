import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  MapPin, MessageSquare, FileSearch,
  ShieldCheck, FileText, ArrowRight, ChevronRight,
  Lightbulb, X,
  Clock, Loader2, CalendarDays, PlusCircle, Trash2,
  Sparkles, ChevronDown, TriangleAlert, Zap, AlertCircle,
  Activity,
  FolderOpen,
} from "lucide-react";
import { fetchUsageState } from "@/services/usageService";
import type { UsageState } from "@/services/usageService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  PageContainer,
  HeroPanel, HeroPanelHeader, HeroPanelContent, HeroPanelFooter,
  Panel, PanelHeader, PanelContent,
} from "@/components/app/ProductLayout";
import { useJurisdiction } from "@/hooks/useJurisdiction";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestRaw, apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-auth";
import { resolvePreferredFirstName, useUserProfile, WELCOME_FLOW_JUST_COMPLETED_KEY } from "@/hooks/use-user-profile";
import {
  deriveCaseActivityState,
  type CaseActivityState,
} from "@/lib/workspaceState";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { DocumentsPanel } from "@/components/workspace/DocumentsPanel";
import DismissibleWhatMattersNow from "@/components/DismissibleWhatMattersNow";
import type { RawSignal, UserTier } from "@/lib/signals";
import { classifyDateStatus } from "@shared/dateStatus";
import { resolveUSStateCode } from "@shared/usStates";

const PENDING_GUIDED_CONVERSATION_KEY = "pendingGuidedConversation";

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
  caseId?: string | null;
  duplicateOfDocumentId?: string | null;
  duplicate_of_document_id?: string | null;
  fileName: string;
  mimeType: string;
  docType: DocType;
  analysisJson: Record<string, unknown>;
  createdAt: string;
  hasStoragePath: boolean;
  isAnalysisAvailable: boolean;
  analysisStatus: "uploaded" | "analyzing" | "analyzed" | "failed";
  integrityIssue: "missing_analysis" | null;
  caseAssignment?: {
    status: "assigned" | "suggested" | "unassigned";
    caseId: string | null;
    suggestedCaseId: string | null;
    confidenceScore: number | null;
    reason: string | null;
    autoAssigned: boolean;
  };
}

interface WorkspaceTimelineEvent {
  id: string;
  eventDate: string;
  description: string;
  createdAt: string;
}

interface SignalsResponse {
  signals: RawSignal[];
}

interface WorkspaceData {
  threads: WorkspaceThread[];
  documents: WorkspaceDocument[];
  timelineEvents: WorkspaceTimelineEvent[];
}

interface CaseBrief {
  title: string;
  scope: {
    type: "case" | "general";
    caseId: string | null;
    caseTitle: string | null;
  };
  currentSituation: string;
  whatMattersMost: Array<{ priority: string; reason: string; level: "high" | "medium" }>;
  keyDatesAndDeadlines: Array<{ date: string; label: string; source: string; urgency: "upcoming" | "today" | "past" | "unknown" }>;
  risksWatchItems: string[];
  documentInsights: Array<{ documentId: string; fileName: string; insight: string; whyItMatters: string }>;
  missingInformationGaps: string[];
  recommendedNextActions: string[];
  evidenceBasis: Array<{
    documentId: string;
    fileName: string;
    docType: string;
    createdAt: string;
    caseId: string | null;
    facts: Record<string, string | null>;
    alerts: string[];
  }>;
}

interface CaseRecord {
  id: string;
  title: string;
  name?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RetroactiveDocumentReviewItem {
  documentId: string;
  fileName: string;
  status: "suggested" | "unassigned";
  suggestedCaseId: string | null;
  confidenceScore: number | null;
  reason: string;
}

interface CreateCaseResponse {
  case: { id: string };
  retroactiveDocumentReview?: {
    requiresReview: boolean;
    totalPreExistingDocuments: number;
    suggestedCount: number;
    unassignedCount: number;
    items: RetroactiveDocumentReviewItem[];
  };
}

/* ── Constants ────────────────────────────────────────────────────────────── */


/* ── Shared sub-components ────────────────────────────────────────────────── */

function AnalyzedBadge() {
  return (
    <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50">
      Analyzed
    </Badge>
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

function formatLongDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDaysUntil(dateStr: string): number | null {
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function CaseMemoryStrip({
  firstName,
  activeCase,
  nextHearingDate,
  lastThread,
  isReturningUser,
}: {
  firstName: string;
  activeCase: CaseRecord;
  nextHearingDate: string | null;
  lastThread: WorkspaceThread | null;
  isReturningUser: boolean;
}) {
  const caseName = (activeCase.name ?? activeCase.title)?.trim() || "Unnamed Case";
  const caseStatus = (activeCase.status ?? "active").replace(/[_-]+/g, " ").trim();
  const statusTone = caseStatus.toLowerCase() === "active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300"
    : "border-border bg-muted/40 text-muted-foreground";
  const hearingDays = nextHearingDate ? getDaysUntil(nextHearingDate) : null;
  const showHearingRow = hearingDays !== null && hearingDays >= 0 && hearingDays <= 30;
  const hearingTone = hearingDays !== null && hearingDays <= 7
    ? "text-red-700 dark:text-red-300"
    : hearingDays !== null && hearingDays <= 14
      ? "text-amber-700 dark:text-amber-300"
      : "text-foreground";
  const followUpHref = lastThread
    ? `/ask?case=${encodeURIComponent(activeCase.id)}&thread=${encodeURIComponent(lastThread.id)}`
    : null;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/[0.22] px-4 py-3.5 shadow-sm" data-testid="card-case-memory-strip">
      <p className="text-sm font-semibold text-foreground">
        {isReturningUser ? "Welcome back" : "Welcome"}, {firstName}
      </p>

      <div className="mt-3 space-y-2.5">
        <Link href={`/case/${activeCase.id}`}>
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-background/70 transition-colors cursor-pointer" data-testid="case-memory-active-case">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FolderOpen className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground truncate">{caseName}</span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusTone}`}>
                {caseStatus}
              </Badge>
            </div>
          </div>
        </Link>

        {showHearingRow && nextHearingDate && hearingDays !== null && (
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2" data-testid="case-memory-next-hearing">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <CalendarDays className={`w-4 h-4 ${hearingTone}`} />
            </div>
            <p className={`text-sm ${hearingTone}`}>
              Your next hearing is in {hearingDays} day{hearingDays === 1 ? "" : "s"} — {formatLongDate(nextHearingDate)}
            </p>
          </div>
        )}

        {lastThread && followUpHref && (
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2" data-testid="case-memory-last-thread">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground truncate">
                Last time you asked: &quot;{lastThread.title ?? "Custody conversation"}&quot;
              </p>
            </div>
            <Link href={followUpHref}>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 shrink-0" data-testid="button-case-memory-follow-up">
                Ask a follow-up
                <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Workspace state ──────────────────────────────────────────────────────────
 * Six tiers, evaluated in priority order.  Only one primary state is active.
 *
 *  loading              — workspace data still fetching
 *  empty                — no documents, no questions, no analysis
 *  documents_only       — documents uploaded but none fully analyzed
 *  stale_incomplete     — data exists but required context (jurisdiction) missing
 *  analyzed_no_questions — docs analyzed, no questions asked yet
 *  active_attention     — active case with risk/urgency signals detected
 *  active_case          — healthy active state: docs + analyses + questions
 * ─────────────────────────────────────────────────────────────────────────── */

type WorkspaceState = CaseActivityState;

/* Returns true if the document has a completed analysis. */
function isDocAnalyzed(doc: WorkspaceDocument): boolean {
  return doc.isAnalysisAvailable;
}

/* Keywords that indicate time-sensitive obligations or compliance requirements. */
const URGENCY_KEYWORDS = [
  "compli", "mandatory", "required within", "time-sensitive",
  "immediately", "promptly", "respond", "deadline", "failure to",
  "default judgment", "penalty", "respond within",
];

/* Returns true if a document's analysis contains urgency/risk signals. */
function docHasRiskSignals(doc: WorkspaceDocument): boolean {
  if (!isDocAnalyzed(doc)) return false;
  const dates = Array.isArray(doc.analysisJson.key_dates)
    ? (doc.analysisJson.key_dates as string[]).map((d) => d.toLowerCase())
    : [];
  const implications = Array.isArray(doc.analysisJson.possible_implications)
    ? (doc.analysisJson.possible_implications as string[]).map((i) => i.toLowerCase())
    : [];
  return URGENCY_KEYWORDS.some(
    (kw) => dates.some((d) => d.includes(kw)) || implications.some((i) => i.includes(kw)),
  );
}

function getTopDocumentSignal(doc: WorkspaceDocument): string | null {
  if (!isDocAnalyzed(doc)) return null;
  const keyDates = Array.isArray(doc.analysisJson.key_dates)
    ? (doc.analysisJson.key_dates as string[]).filter(Boolean)
    : [];
  const implications = Array.isArray(doc.analysisJson.possible_implications)
    ? (doc.analysisJson.possible_implications as string[]).filter(Boolean)
    : [];
  return keyDates[0] ?? implications[0] ?? null;
}

function getDocumentPriorityScore(doc: WorkspaceDocument): number {
  const createdAtMs = new Date(doc.createdAt).getTime();
  const hasSignal = getTopDocumentSignal(doc) ? 1 : 0;
  const hasRisk = docHasRiskSignals(doc) ? 1 : 0;
  return (hasRisk * 1_000_000_000_000) + (hasSignal * 100_000_000_000) + createdAtMs;
}


function getTopPriorityItems({
  workspaceState,
  scenario,
  documents,
  timelineEvents,
}: {
  workspaceState: WorkspaceState;
  scenario: StepScenario;
  documents: WorkspaceDocument[];
  timelineEvents: WorkspaceTimelineEvent[];
}) {
  const validDocuments = documents.filter((doc) => doc.isAnalysisAvailable);
  const riskDocuments = validDocuments.filter(docHasRiskSignals).slice(0, 2);
  const upcomingEvents = timelineEvents
    .filter((ev) => {
      const status = classifyDateStatus(ev.eventDate);
      return status === "upcoming" || status === "today";
    })
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
    .slice(0, 1);

  const items: Array<{ id: string; title: string; detail: string; href: string; tone: "urgent" | "default" }> = [];

  if (workspaceState === "active_attention") {
    items.push({
      id: "risk-review",
      title: "Review time-sensitive document items",
      detail: `${riskDocuments.length || 1} document${riskDocuments.length === 1 ? "" : "s"} may contain deadlines or compliance obligations`,
      href: "/ask",
      tone: "urgent",
    });
  }

  const step = STEP_CONFIGS[scenario];
  items.push({
    id: `scenario-${scenario}`,
    title: step.title,
    detail: step.description,
    href: step.ctaHref,
    tone: workspaceState === "active_attention" ? "urgent" : "default",
  });

  for (const event of upcomingEvents) {
    items.push({
      id: `event-${event.id}`,
      title: "Upcoming timeline event",
      detail: `${event.description} · ${formatEventDate(event.eventDate)}`,
      href: "#recent-activity",
      tone: "default",
    });
  }

  if (riskDocuments[0]) {
    items.push({
      id: `doc-${riskDocuments[0].id}`,
      title: "Open flagged document",
      detail: riskDocuments[0].fileName,
      href: `/document/${riskDocuments[0].id}`,
      tone: "default",
    });
  }

  const deduped = Array.from(new globalThis.Map<string, (typeof items)[number]>(items.map((item) => [item.id, item])).values());
  return deduped.slice(0, 3);
}

/* ── Next Best Step ───────────────────────────────────────────────────────── */

type StepScenario =
  | "no-jurisdiction"
  | "no-questions"
  | "no-document"
  | "review-conversations"
  | "pro-summarize"
  | "ask-about-docs"
  | "review-risks"
  | "continue-case"
  | "intake-pending";

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
    icon: MapPin, iconBg: "bg-primary/[0.08] dark:bg-primary/20", iconColor: "text-primary",
    title: "Set your location",
    description: "We'll use your state and county to provide jurisdiction-specific custody information.",
    ctaLabel: "Set Location", ctaHref: "/location", secondaryLabel: "Skip for now",
  },
  "no-questions": {
    icon: MessageSquare, iconBg: "bg-primary/[0.08] dark:bg-primary/20", iconColor: "text-primary",
    title: "Ask your first custody question",
    description: "Ask Atlas can help you understand custody laws that apply where you live, in plain English.",
    ctaLabel: "Ask Atlas", ctaHref: "/ask", secondaryLabel: "Skip for now",
  },
  "no-document": {
    icon: FileText, iconBg: "bg-primary/[0.08] dark:bg-primary/20", iconColor: "text-primary",
    title: "Upload a custody document",
    description: "Analyze a custody order or legal notice to get a plain-English explanation.",
    ctaLabel: "Analyze a Document", ctaHref: "/upload-document", secondaryLabel: "Skip for now",
  },
  "review-conversations": {
    icon: MessageSquare, iconBg: "bg-[#fdf9ee] dark:bg-amber-950/40", iconColor: "text-[#b5922f] dark:text-amber-400",
    title: "Continue where you left off",
    description: "Your conversations and documents are saved. Pick up your research from your last question.",
    ctaLabel: "Resume Conversation", ctaHref: "/ask", secondaryLabel: "Maybe later",
  },
  "pro-summarize": {
    icon: Sparkles, iconBg: "bg-[#fdf9ee] dark:bg-amber-950/40", iconColor: "text-[#b5922f] dark:text-amber-400",
    title: "Generate your workspace brief",
    description: "Generate a structured workspace brief across extracted facts, dates, risks, and document intelligence.",
    ctaLabel: "Generate Workspace Brief", ctaHref: "#case-brief", secondaryLabel: "Maybe later",
  },
  "ask-about-docs": {
    icon: MessageSquare, iconBg: "bg-primary/[0.08] dark:bg-primary/20", iconColor: "text-primary",
    title: "Ask Atlas about your analyzed documents",
    description: "Your documents are ready. Ask Atlas to explain key terms, flag obligations, or summarize what they mean for your case.",
    ctaLabel: "Ask About Your Documents", ctaHref: "/ask", secondaryLabel: "Maybe later",
  },
  "review-risks": {
    icon: AlertCircle, iconBg: "bg-amber-50 dark:bg-amber-950/40", iconColor: "text-amber-600 dark:text-amber-400",
    title: "Your documents contain items to review",
    description: "Atlas detected potential deadlines, compliance requirements, or time-sensitive items in your uploaded documents.",
    ctaLabel: "Review with Atlas", ctaHref: "/ask", secondaryLabel: "Dismiss",
  },
  "continue-case": {
    icon: Sparkles, iconBg: "bg-[#fdf9ee] dark:bg-amber-950/40", iconColor: "text-[#b5922f] dark:text-amber-400",
    title: "Continue your custody case",
    description: "Pick up where you left off — ask a follow-up question, review flagged items, or analyze a new document.",
    ctaLabel: "Resume Conversation", ctaHref: "/ask", secondaryLabel: "Maybe later",
  },
  "intake-pending": {
    icon: FileSearch, iconBg: "bg-primary/[0.08] dark:bg-primary/20", iconColor: "text-primary",
    title: "Finish analyzing your uploaded documents",
    description: "You have documents that haven't been fully analyzed yet. Open them to extract key dates, obligations, and insights.",
    ctaLabel: "Analyze Document", ctaHref: "/upload-document", secondaryLabel: "Skip for now",
  },
};

function NextBestStepPanel({ scenario, ctaHref }: { scenario: StepScenario; ctaHref: string }) {
  // hooks — all unconditional, called in same order every render
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
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Recommended Next Step</span>
      </div>
      <div className="relative rounded-xl border bg-card px-5 py-5 shadow-xs">
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
            <p className="text-[14px] text-foreground/75 leading-relaxed mb-3.5" data-testid="text-next-step-description">
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

/* ── Case Brief Section ───────────────────────────────────────────────────── */

function CaseBriefSection({
  caseIdParam,
  hasGeneralBriefContent,
  hasCases,
  firstCaseId,
  onCreateCase,
}: {
  caseIdParam?: string;
  hasGeneralBriefContent: boolean;
  hasCases: boolean;
  firstCaseId: string | null;
  onCreateCase: () => void;
}) {
  // hooks — all unconditional, called in same order every render
  const [, navigate] = useLocation();
  const [brief, setBrief] = useState<CaseBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const isCaseContext = !!caseIdParam;
  const briefLabel = isCaseContext ? "Case Brief" : "Workspace Brief";
  const showGenerateButton = isCaseContext || hasGeneralBriefContent;

  const briefMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequestRaw("POST", "/api/workspace/case-brief", caseIdParam ? { caseId: caseIdParam } : {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to generate case brief.");
      }
      return res.json() as Promise<CaseBrief>;
    },
    onSuccess: (data) => {
      setBrief(data);
      setError(null);
      setExpanded(false);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });
  const showGeneralEmptyState = !isCaseContext && !hasGeneralBriefContent && !briefMutation.isPending && !brief;
  const isGeneralContentError = !isCaseContext
    && error?.includes("No unassigned documents or activity found for a workspace brief.");

  return (
    <div id="case-brief" className="scroll-mt-4 h-full">
      <Panel testId="card-case-brief" className="h-full">
      <PanelHeader
        icon={Sparkles}
        label={briefLabel}
        action={
          brief ? (
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setOpen((v) => !v)}
              data-testid="button-toggle-brief"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
            </button>
          ) : undefined
        }
      />
      <PanelContent className="p-4">
        {!brief && !briefMutation.isPending && (
          <div className="flex flex-col items-center gap-2.5 py-1.5 text-center">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="text-sm font-semibold text-foreground">{briefLabel}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Build a structured brief from extracted facts, deadlines, risks, document alerts,
                and case activity.
              </p>
            </div>
            {error && !isGeneralContentError && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-left max-w-sm w-full">
                <TriangleAlert className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive leading-snug">{error}</p>
              </div>
            )}
            {showGenerateButton && (
              <Button
                onClick={() => briefMutation.mutate()}
                className="gap-2"
                data-testid="button-generate-brief"
              >
                <Sparkles className="w-4 h-4" />
                Generate {briefLabel}
              </Button>
            )}
            {showGeneralEmptyState && (
              <div className="w-full max-w-sm rounded-md border border-border/70 bg-muted/30 p-3.5 text-left space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">All documents are assigned to cases</p>
                  <p className="text-xs text-muted-foreground">Open a case to generate a case brief.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    if (hasCases && firstCaseId) {
                      navigate(`/case/${firstCaseId}`);
                      return;
                    }
                    onCreateCase();
                  }}
                  data-testid="button-open-case-for-brief"
                >
                  {hasCases ? "Open a case" : "Create a case"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}

        {briefMutation.isPending && (
          <div className="flex flex-col items-center gap-2.5 py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Compiling your structured {briefLabel.toLowerCase()}…</p>
          </div>
        )}

        {brief && open && (
          <div className="space-y-5" data-testid="section-brief-output">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1.5">Current situation</h3>
              <p className="text-[15px] text-foreground leading-relaxed">{brief.currentSituation}</p>
            </div>

            {brief.whatMattersMost.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">What matters most</h3>
                <ol className="space-y-1.5">
                  {brief.whatMattersMost.slice(0, expanded ? undefined : 3).map((item, i) => (
                    <li key={`${item.priority}-${i}`} className="text-[15px] text-foreground leading-relaxed">
                      <span className="font-semibold mr-1.5">{i + 1}.</span>
                      <span className="font-medium">{item.priority}</span>{" "}
                      <span className="text-muted-foreground">— {item.reason}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {brief.keyDatesAndDeadlines.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Key dates</h3>
                <ul className="space-y-1.5">
                  {brief.keyDatesAndDeadlines.slice(0, expanded ? undefined : 3).map((item, i) => (
                    <li key={`${item.date}-${i}`} className="text-[15px] text-foreground leading-relaxed">
                      <span className="font-medium">{item.date}</span> — {item.label}
                      {expanded && <span className="text-xs text-muted-foreground"> ({item.source})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {brief.risksWatchItems.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Top risk / watch item</h3>
                <p className="rounded-lg bg-muted/40 border px-3 py-2.5 text-[15px] text-foreground leading-relaxed">
                  {brief.risksWatchItems[0]}
                </p>
              </div>
            )}

            {brief.recommendedNextActions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Recommended next actions</h3>
                <ul className="space-y-1.5">
                  {brief.recommendedNextActions.slice(0, expanded ? undefined : 3).map((action, i) => (
                    <li key={`${action}-${i}`} className="text-[15px] text-foreground leading-relaxed">{action}</li>
                  ))}
                </ul>
              </div>
            )}

            {expanded && brief.documentInsights.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Document insights</h3>
                <ul className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {brief.documentInsights.map((insight) => (
                    <li key={insight.documentId} className="rounded-md border px-2.5 py-2">
                      <p className="text-sm font-semibold text-foreground">{insight.fileName}</p>
                      <p className="text-sm text-foreground mt-0.5">{insight.insight}</p>
                      <p className="text-xs text-muted-foreground mt-1">{insight.whyItMatters}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {expanded && brief.missingInformationGaps.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Missing information / gaps</h3>
                <ul className="space-y-1.5">
                  {brief.missingInformationGaps.map((gap, i) => (
                    <li key={`${gap}-${i}`} className="text-[15px] text-foreground leading-relaxed">{gap}</li>
                  ))}
                </ul>
              </div>
            )}

            {expanded && brief.evidenceBasis.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Evidence basis</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {brief.evidenceBasis.map((e) => e.fileName).join(", ")}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              {(brief.documentInsights.length > 0 || brief.missingInformationGaps.length > 0 || brief.evidenceBasis.length > 0) && (
                <button
                  className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                  onClick={() => setExpanded((value) => !value)}
                  data-testid="button-expand-brief"
                >
                  {expanded ? "Show less" : "Show more details"}
                </button>
              )}
              <button
                className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                onClick={() => { setBrief(null); }}
                data-testid="button-regenerate-brief"
              >
                Regenerate brief
              </button>
            </div>
          </div>
        )}
      </PanelContent>
    </Panel>
    </div>
  );
}

/* ── Documents — compact dashboard preview ────────────────────────────────── */

function DocumentsSection({
  documents, isLoading, askAIPath, caseNameById, onOpenDocumentSafely, cases, uploadEmptyMessage, currentUserId,
}: {
  documents: WorkspaceDocument[];
  isLoading: boolean;
  askAIPath: string;
  caseNameById: Record<string, string>;
  onOpenDocumentSafely: (documentId: string) => Promise<void>;
  cases: CaseRecord[];
  uploadEmptyMessage?: string;
  currentUserId?: string;
}) {
  // hooks — all unconditional, called in same order every render
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; fileName: string } | null>(null);

  const MAX_VISIBLE = 4;
  const canonicalDocuments = documents.filter((doc) => !(doc.duplicateOfDocumentId ?? doc.duplicate_of_document_id));

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      // apiRequestRaw attaches the Authorization: Bearer token that requireAuth needs.
      const res = await apiRequestRaw("DELETE", `/api/documents/${docId}`);
      // 404 means record is already gone — treat as success so UI stays consistent.
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not delete document. Please try again.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workspace"] });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      setPendingDelete(null);
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      setPendingDelete(null);
    },
  });
  const assignmentMutation = useMutation({
    mutationFn: async ({ docId, caseId }: { docId: string; caseId: string | null }) => {
      const res = await apiRequestRaw("PATCH", `/api/documents/${docId}/case-assignment`, { caseId });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not update case assignment.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workspace"] });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
    },
    onError: (err: Error) => {
      toast({ title: "Assignment update failed", description: err.message, variant: "destructive" });
    },
  });

  const orderedDocs = [...canonicalDocuments].sort((a, b) => getDocumentPriorityScore(b) - getDocumentPriorityScore(a));
  const hiddenCount = Math.max(0, orderedDocs.length - MAX_VISIBLE);
  const visibleDocs = orderedDocs.slice(0, MAX_VISIBLE);

  useEffect(() => {
    if (isLoading || canonicalDocuments.length === 0) return;

    const normalizeVisibleFileName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, " ");
    const summarySignature = (doc: WorkspaceDocument): string => {
      const summary = typeof (doc.analysisJson as Record<string, unknown>)?.summary === "string"
        ? ((doc.analysisJson as Record<string, unknown>).summary as string)
        : "";
      return summary
        .trim()
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
    };
    const grouping = new Map<string, WorkspaceDocument[]>();
    for (const doc of visibleDocs) {
      const normalizedName = normalizeVisibleFileName(doc.fileName);
      const groupKey = `${currentUserId ?? "unknown-user"}|${doc.caseId ?? "workspace"}|${normalizedName}`;
      const rows = grouping.get(groupKey) ?? [];
      rows.push(doc);
      grouping.set(groupKey, rows);
    }
    const duplicateVisible = Array.from(grouping.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([groupKey, rows]) => ({
        groupKey,
        rows: rows.map((doc) => ({
          id: doc.id,
          file_name: doc.fileName,
          user_id: currentUserId ?? null,
          duplicate_of_document_id: doc.duplicateOfDocumentId ?? doc.duplicate_of_document_id ?? null,
          case_workspace_grouping_key: `${currentUserId ?? "unknown-user"}|${doc.caseId ?? "workspace"}`,
          normalized_filename: normalizeVisibleFileName(doc.fileName),
          summary_signature: summarySignature(doc),
        })),
      }));
    if (duplicateVisible.length > 0) {
      console.warn("[trace][workspace] visible duplicate rows on render", duplicateVisible);
    }
  }, [canonicalDocuments.length, isLoading, visibleDocs, currentUserId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (canonicalDocuments.length === 0) {
    return (
      <EmptyState
        icon={FileSearch}
        message={uploadEmptyMessage ?? "Upload your first custody document"}
        ctaLabel="Analyze a document"
        ctaHref="/upload-document"
        testId="empty-recent-documents"
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="list-documents-grouped">
      <ul className="space-y-1.5">
        {visibleDocs.map((doc) => {
          const assignedCaseId = doc.caseId ?? null;
          const suggestedCaseId = doc.caseAssignment?.suggestedCaseId ?? null;
          const assignmentStatus = doc.caseAssignment?.status ?? (assignedCaseId ? "assigned" : "unassigned");
          const caseLabel = assignmentStatus === "assigned" && assignedCaseId
            ? `Assigned to ${caseNameById[assignedCaseId] ?? "Unnamed Case"}`
            : assignmentStatus === "suggested" && suggestedCaseId
              ? `Suggested for ${caseNameById[suggestedCaseId] ?? "Unnamed Case"}`
              : "Unassigned";
          const topSignal = getTopDocumentSignal(doc);
          const hasRisk = docHasRiskSignals(doc);
          return (
            <li
              key={doc.id}
              className="rounded-lg border px-2.5 py-2 hover:bg-muted/20 hover:border-border transition-all duration-150"
              data-testid={`doc-item-${doc.id}`}
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/60" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-5 truncate text-foreground">{doc.fileName}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[11px] h-6 px-1.5 text-muted-foreground hover:text-foreground"
                        data-testid={`button-review-doc-${doc.id}`}
                        disabled={!doc.isAnalysisAvailable}
                        onClick={() => onOpenDocumentSafely(doc.id)}
                      >
                        Review
                      </Button>
                      <Link href={`${askAIPath}${askAIPath.includes("?") ? "&" : "?"}document=${encodeURIComponent(doc.id)}`}>
                        <Button variant="ghost" size="sm" className="text-[11px] gap-1 h-6 px-1.5 text-primary/80 hover:text-primary" data-testid={`button-ask-doc-${doc.id}`}>
                          Ask
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1 text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingDelete({ id: doc.id, fileName: doc.fileName })}
                        disabled={deleteMutation.isPending && pendingDelete?.id === doc.id}
                        data-testid={`button-delete-doc-${doc.id}`}
                        aria-label={`Delete ${doc.fileName}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {doc.isAnalysisAvailable ? (
                      <AnalyzedBadge />
                    ) : (
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5">Analysis unavailable</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                      {caseLabel}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{relativeTime(doc.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={assignedCaseId ?? "unassigned"}
                      onValueChange={(value) => {
                        assignmentMutation.mutate({
                          docId: doc.id,
                          caseId: value === "unassigned" ? null : value,
                        });
                      }}
                    >
                      <SelectTrigger className="h-7 text-[11px] w-[220px]" data-testid={`select-case-assignment-${doc.id}`}>
                        <SelectValue placeholder="Assign to case" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {cases.map((caseItem) => (
                          <SelectItem key={caseItem.id} value={caseItem.id}>
                            {caseItem.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {doc.caseAssignment?.autoAssigned && doc.caseAssignment.status === "assigned" && (
                      <span className="text-[10px] text-muted-foreground">Auto-assigned (editable)</span>
                    )}
                  </div>
                  {topSignal && (
                    <p className={`text-[11px] truncate ${hasRisk ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
                      {hasRisk ? "Alert: " : "Key date: "}
                      {topSignal}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="pt-1 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {`Showing ${Math.min(orderedDocs.length, MAX_VISIBLE)} of ${orderedDocs.length} document${orderedDocs.length === 1 ? "" : "s"}`}
          {hiddenCount > 0 ? ` · ${hiddenCount} more` : ""}
        </p>
      </div>

      {/* ── Shared delete confirmation dialog ────────────────────────────── */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{pendingDelete?.fileName}</span>
              {" "}and all extracted analysis data will be permanently removed.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-delete-doc-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              disabled={deleteMutation.isPending}
              data-testid="btn-delete-doc-confirm"
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Deleting…</>
              ) : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── CaseSnapshotPanel ────────────────────────────────────────────────────── */


function QuickActionsPanel({ askAIPath }: { askAIPath: string }) {
  return (
    <Panel testId="panel-quick-actions" className="border-border/50 bg-card/70">
      <PanelHeader icon={Zap} label="Quick Actions" />
      <PanelContent className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 p-3">
        <Link href="/upload-document">
          <Button className="w-full justify-between h-9 text-sm" data-testid="button-upload-new-doc">
            Upload Document
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
        <Link href={askAIPath}>
          <Button variant="outline" className="w-full justify-between h-9 text-sm" data-testid="button-go-ask-atlas">
            Ask Atlas
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
        <Link href="/custody-map">
          <Button variant="outline" className="w-full justify-between h-9 text-sm" data-testid="button-view-custody-map">
            Custody Map
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </PanelContent>
    </Panel>
  );
}


/* ── TimelineAndActivityPanel ─────────────────────────────────────────────── */

function TimelineAndActivityPanel({
  events,
  threads,
  documents,
  isLoading,
  askAIPath,
  onOpenDocumentSafely,
}: {
  events: WorkspaceTimelineEvent[];
  threads: WorkspaceThread[];
  documents: WorkspaceDocument[];
  isLoading: boolean;
  askAIPath: string;
  onOpenDocumentSafely: (documentId: string) => Promise<void>;
}) {
  // hooks — all unconditional, called in same order every render
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

  type FeedItem =
    | { kind: "event"; sortKey: number; event: WorkspaceTimelineEvent }
    | { kind: "thread"; sortKey: number; thread: WorkspaceThread }
    | { kind: "document"; sortKey: number; document: WorkspaceDocument };

  const feed: FeedItem[] = [
    ...events.map((e) => ({
      kind: "event" as const,
      sortKey: new Date(e.eventDate.includes("T") ? e.eventDate : e.eventDate + "T12:00:00").getTime(),
      event: e,
    })),
    ...threads.slice(0, 6).map((t) => ({
      kind: "thread" as const,
      sortKey: new Date(t.createdAt).getTime(),
      thread: t,
    })),
    ...documents.slice(0, 6).map((d) => ({
      kind: "document" as const,
      sortKey: new Date(d.createdAt).getTime(),
      document: d,
    })),
  ].sort((a, b) => b.sortKey - a.sortKey).slice(0, 6);

  return (
    <Panel testId="card-timeline-activity" className="h-full">
      <PanelHeader
        icon={Clock}
        label="Recent Activity"
        action={
          !showForm ? (
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
          ) : undefined
        }
      />
      <PanelContent className="space-y-2.5 p-2.5">
        {/* Add event form */}
        {showForm && (
          <div className="rounded-lg border bg-muted/30 p-2.5 space-y-2.5" data-testid="form-add-event">
            <p className="text-xs font-semibold text-foreground">New timeline event</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tap-event-date" className="text-xs">Date</Label>
                <Input
                  id="tap-event-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="input-event-date"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tap-event-desc" className="text-xs">Description</Label>
                <Input
                  id="tap-event-desc"
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

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : feed.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="empty-timeline-activity">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Clock className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-xs text-muted-foreground leading-snug max-w-[220px]">
              Recent conversations and timeline events will appear here.
            </p>
            <Link href={askAIPath}>
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="empty-activity-cta">
                Ask a question <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        ) : (
          <ul className="space-y-0" data-testid="list-timeline-activity">
            {feed.map((item) => {
              if (item.kind === "event") {
                const ev = item.event;
                return (
                  <li
                    key={`event-${ev.id}`}
                    className="flex items-start gap-2.5 rounded-lg px-2 py-2 group hover:bg-muted/30 transition-colors"
                    data-testid={`timeline-event-${ev.id}`}
                  >
                    <div className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CalendarDays className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground leading-snug">{ev.description}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{formatEventDate(ev.eventDate)}</p>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                      onClick={() => deleteMutation.mutate(ev.id)}
                      disabled={deleteMutation.isPending}
                      aria-label="Delete event"
                      data-testid={`button-delete-event-${ev.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                );
              }

              if (item.kind === "thread") {
                const thread = item.thread;
                const params = new URLSearchParams({ thread: thread.id });
                if (thread.jurisdictionState) params.set("state", thread.jurisdictionState);
                if (thread.jurisdictionCounty) params.set("county", thread.jurisdictionCounty);
                return (
                  <Link key={`thread-${thread.id}`} href={`/ask?${params.toString()}`}>
                    <li
                      className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/30 cursor-pointer group"
                      data-testid={`conversation-item-${thread.id}`}
                    >
                      <div className="w-6 h-6 rounded-md bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                          {thread.title ?? "Custody Conversation"}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {thread.jurisdictionState && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />{thread.jurisdictionState}
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground">{relativeTime(thread.createdAt)}</span>
                        </div>
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary/60 transition-colors flex-shrink-0" />
                    </li>
                  </Link>
                );
              }

              const doc = item.document;
              const analyzed = isDocAnalyzed(doc);
              return (
                <li
                  key={`document-${doc.id}`}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-2 group ${doc.isAnalysisAvailable ? "hover:bg-muted/30 cursor-pointer" : "opacity-70 cursor-not-allowed"}`}
                  data-testid={`activity-document-${doc.id}`}
                  onClick={() => {
                    if (!doc.isAnalysisAvailable) return;
                    onOpenDocumentSafely(doc.id);
                  }}
                >
                    <div className="w-6 h-6 rounded-md bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                        {analyzed ? "Analyzed document" : "Uploaded document"}: {doc.fileName}
                      </p>
                      <span className="text-[11px] text-muted-foreground">{relativeTime(doc.createdAt)}</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary/60 transition-colors flex-shrink-0" />
                  </li>
              );
            })}
          </ul>
        )}

        {threads.length > 6 && (
          <Link href={askAIPath}>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs gap-1"
              data-testid="button-show-all-conversations"
            >
              View all {threads.length} conversations
            </Button>
          </Link>
        )}
      </PanelContent>
    </Panel>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function WorkspacePage() {
  // hooks — all unconditional, called in same order every render
  const [location] = useLocation();
  const [, navigate] = useLocation();
  const { jurisdiction } = useJurisdiction();
  const { user } = useCurrentUser();
  const { data: profile } = useUserProfile();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [isCreateCaseOpen, setIsCreateCaseOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState("");
  const [retroactivePrompt, setRetroactivePrompt] = useState<{
    caseId: string;
    suggestedCount: number;
    totalCount: number;
    items: RetroactiveDocumentReviewItem[];
  } | null>(null);
  const [isApplyingRetroactive, setIsApplyingRetroactive] = useState(false);
  const caseIdParam = new URLSearchParams(
    location.split("?")[1] || window.location.search.slice(1),
  ).get("case") ?? undefined;

  useEffect(() => {
    const pending = window.sessionStorage.getItem(PENDING_GUIDED_CONVERSATION_KEY);
    if (!pending) return;

    try {
      const parsed = JSON.parse(pending) as { conversationId?: string; caseId?: string };
      if (parsed.conversationId && parsed.caseId) {
        navigate(`/ask?case=${encodeURIComponent(parsed.caseId)}&conversation=${encodeURIComponent(parsed.conversationId)}`, { replace: true });
      }
    } catch (error) {
      console.error("[WorkspacePage] Failed to read pending guided conversation:", error);
    }
  }, [navigate]);

  const { data: usage } = useQuery<UsageState>({
    queryKey: ["/api/usage"],
    queryFn: fetchUsageState,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const isProUser = usage?.isAuthenticated && usage.tier === "pro";
  const signalTier: UserTier = usage?.tier === "pro" ? "pro" : "free";

  const { data: workspaceData, isLoading: isLoadingWorkspace } = useQuery<WorkspaceData | null>({
    queryKey: ["/api/workspace"],
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/workspace");
      if (!res.ok) return { threads: [], documents: [], timelineEvents: [] };
      const payload = await res.json() as WorkspaceData;
      const rawDocuments = Array.isArray(payload?.documents) ? payload.documents : [];
      const duplicateMarkedRows = rawDocuments.filter((doc) => !!(doc.duplicateOfDocumentId ?? doc.duplicate_of_document_id));
      if (duplicateMarkedRows.length > 0) {
        console.warn("[trace][workspace] duplicate-marked documents received from API (unexpected)", {
          count: duplicateMarkedRows.length,
          ids: duplicateMarkedRows.map((doc) => doc.id),
        });
      }
      return payload;
    },
  });
  const { data: casesData } = useQuery<{ cases: CaseRecord[] }>({
    queryKey: ["/api/cases"],
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const { data: caseSignalsData, isLoading: isLoadingCaseSignals } = useQuery<SignalsResponse>({
    queryKey: ["/api/signals", "case", caseIdParam],
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async () => {
      if (!caseIdParam) return { signals: [] };
      const res = await apiRequestRaw("GET", `/api/signals?caseId=${encodeURIComponent(caseIdParam ?? "")}`);
      if (res.status === 404) return { signals: [] };
      if (!res.ok) throw new Error("Failed to load case signals.");
      return res.json() as Promise<SignalsResponse>;
    },
  });
  const memoryCaseId = (() => {
    if (caseIdParam) return caseIdParam;
    const latest = [...(casesData?.cases ?? [])].sort((a, b) => {
      const left = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      const right = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      return left - right;
    })[0];
    return latest?.id ?? null;
  })();
  const { data: memoryCaseActions } = useQuery<{ actions: Array<unknown>; hearingDate: string | null }>({
    queryKey: ["/api/cases", "memory-strip", memoryCaseId, "actions"],
    enabled: !!user && !!memoryCaseId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${encodeURIComponent(memoryCaseId ?? "")}/actions`);
      if (!res.ok) return { actions: [], hearingDate: null };
      return res.json() as Promise<{ actions: Array<unknown>; hearingDate: string | null }>;
    },
  });

  const threads: WorkspaceThread[] = workspaceData?.threads ?? [];
  const documents: WorkspaceDocument[] = (workspaceData?.documents ?? []).filter(
    (doc) => !(doc.duplicateOfDocumentId ?? doc.duplicate_of_document_id),
  );
  const timelineEvents: WorkspaceTimelineEvent[] = workspaceData?.timelineEvents ?? [];
  const cases = casesData?.cases ?? [];
  const firstCaseId = cases[0]?.id ?? null;
  const activeCase = caseIdParam ? cases.find((c) => c.id === caseIdParam) ?? null : null;
  const latestCase = [...cases].sort((a, b) => {
    const left = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    const right = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    return left - right;
  })[0] ?? null;
  const memoryCase = activeCase ?? latestCase;
  const activeCaseName = (activeCase?.name ?? activeCase?.title)?.trim() || (caseIdParam ? "Unnamed Case" : null);
  const lastThread = threads[0] ?? null;
  const caseNameById = cases.reduce<Record<string, string>>((acc, c) => {
    acc[c.id] = (c.name ?? c.title)?.trim() || "Unnamed Case";
    return acc;
  }, {});
  const unassignedAnalyzableDocIds = new Set(
    documents.filter((doc) => !doc.caseId && doc.isAnalysisAvailable).map((doc) => doc.id),
  );
  const hasGeneralBriefContent = unassignedAnalyzableDocIds.size > 0 || threads.some(
    (thread) => !thread.documentId || unassignedAnalyzableDocIds.has(thread.documentId),
  );

  const createCaseMutation = useMutation({
    mutationFn: async () => {
      const resolvedStateCode = resolveUSStateCode(jurisdiction?.state) ?? "US";
      const payload = {
        title: newCaseName.trim(),
        caseType: "custody",
        stateCode: resolvedStateCode,
      };
      const res = await apiRequestRaw("POST", "/api/cases", payload);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errorIdSuffix = typeof body.errorId === "string" ? ` (ref: ${body.errorId})` : "";
        throw new Error((body.error ?? "Could not create case.") + errorIdSuffix);
      }
      return res.json() as Promise<CreateCaseResponse>;
    },
    onSuccess: (payload) => {
      qc.invalidateQueries({ queryKey: ["/api/cases"] });
      qc.invalidateQueries({ queryKey: ["/api/workspace"] });
      setIsCreateCaseOpen(false);
      setNewCaseName("");
      if (payload.retroactiveDocumentReview?.requiresReview) {
        setRetroactivePrompt({
          caseId: payload.case.id,
          suggestedCount: payload.retroactiveDocumentReview.suggestedCount,
          totalCount: payload.retroactiveDocumentReview.totalPreExistingDocuments,
          items: payload.retroactiveDocumentReview.items,
        });
        return;
      }
      navigate(`/case/${payload.case.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Case creation failed", description: err.message, variant: "destructive" });
    },
  });

  const attachSuggestedDocuments = async () => {
    if (!retroactivePrompt) return;
    const suggestedDocs = retroactivePrompt.items.filter((item) => item.status === "suggested");
    setIsApplyingRetroactive(true);
    try {
      const responses = await Promise.all(
        suggestedDocs.map((item) =>
          apiRequestRaw("PATCH", `/api/documents/${item.documentId}/case-assignment`, { caseId: retroactivePrompt.caseId }),
        ),
      );
      if (responses.some((res) => !res.ok)) {
        throw new Error("One or more document updates failed.");
      }
      qc.invalidateQueries({ queryKey: ["/api/workspace"] });
      toast({
        title: "Suggested documents attached",
        description: suggestedDocs.length > 0
          ? `${suggestedDocs.length} pre-existing documents were attached to your new case.`
          : "No documents had enough confidence to auto-suggest.",
      });
      setRetroactivePrompt(null);
      navigate(`/case/${retroactivePrompt.caseId}`);
    } catch {
      toast({
        title: "Could not attach suggested documents",
        description: "You can still review each document individually from Workspace.",
        variant: "destructive",
      });
    } finally {
      setIsApplyingRetroactive(false);
    }
  };

  // ── Workspace signals ────────────────────────────────────────────────────
  // Count unique analyzed docs (de-duplicate by fileName, keep latest per file
  // so re-analysis of the same document does not regress to "new user" state).
  // Note: plain Record used because the lucide Map icon shadows the built-in Map.
  const uniqueAnalyzed: Record<string, WorkspaceDocument> = {};
  for (const doc of documents) {
    if (isDocAnalyzed(doc)) {
      const existing = uniqueAnalyzed[doc.fileName];
      if (!existing || new Date(doc.createdAt) > new Date(existing.createdAt)) {
        uniqueAnalyzed[doc.fileName] = doc;
      }
    }
  }

  const documentCount = documents.length;
  const analyzedCount = Object.keys(uniqueAnalyzed).length;
  const conversationCount = threads.length;
  const hasJurisdiction = !!jurisdiction;
  const hasRisks = documents.some(docHasRiskSignals);

  const openDocumentSafely = async (documentId: string) => {
    const res = await apiRequestRaw("GET", `/api/documents/${documentId}`);
    if (res.ok) {
      navigate(`/document/${documentId}`);
      return;
    }
    const payload = await res.json().catch(() => ({}));
    if (res.status === 409 || payload?.code === "DOCUMENT_ANALYSIS_MISSING") {
      toast({
        title: "Analysis unavailable",
        description: "This document's analysis is missing. Remove it from Workspace to clean up broken entries.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Document unavailable",
      description: "We couldn't open this document right now.",
      variant: "destructive",
    });
  };

  const allTimestamps = [
    ...documents.map((d) => d.createdAt),
    ...threads.map((t) => t.createdAt),
  ];
  const latestActivityIso = allTimestamps.length > 0
    ? allTimestamps.reduce((a, b) => (a > b ? a : b))
    : null;
  const caseScopedDocuments = caseIdParam
    ? documents.filter((doc) => doc.caseId === caseIdParam)
    : [];
  const caseLatestActivityIso = caseScopedDocuments.length > 0
    ? caseScopedDocuments
      .map((doc) => doc.createdAt)
      .reduce((latest, current) => (latest > current ? latest : current))
    : latestActivityIso;
  const lastActivityDaysAgo = caseLatestActivityIso
    ? Math.max(0, Math.floor((Date.now() - new Date(caseLatestActivityIso).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Primary state — single source of truth for the whole page
  const derivedCaseActivity = deriveCaseActivityState({
    isLoading: isLoadingWorkspace && !!user,
    documentCount,
    analyzedDocumentCount: analyzedCount,
    questionCount: conversationCount,
    latestActivityIso,
    unresolvedRiskCount: hasRisks ? 1 : 0,
  });
  const workspaceState: WorkspaceState = derivedCaseActivity.state;

  // ── Scenario + recommended action ────────────────────────────────────────
  function resolveScenario(): { scenario: StepScenario; reason: string } {
    switch (workspaceState) {
      case "loading":
      case "empty":
        if (!hasJurisdiction) return { scenario: "no-jurisdiction", reason: "no_jurisdiction_and_empty" };
        return { scenario: "no-questions", reason: "no_data_at_all" };

      case "active_attention":
        return { scenario: "review-risks", reason: "risk_signals_detected" };

      case "documents_only":
        if (!hasJurisdiction) return { scenario: "no-jurisdiction", reason: "missing_jurisdiction_with_data" };
        return { scenario: "intake-pending", reason: "docs_not_analyzed" };

      case "analyzed_no_questions":
        if (!hasJurisdiction) return { scenario: "no-jurisdiction", reason: "missing_jurisdiction_with_data" };
        return { scenario: "ask-about-docs", reason: "analyzed_no_questions" };

      case "active_case":
        if (isProUser) return { scenario: "pro-summarize", reason: "pro_user_active" };
        return { scenario: "continue-case", reason: "active_healthy_case" };

      default:
        return { scenario: "no-questions", reason: "fallback" };
    }
  }

  const { scenario } = resolveScenario();

  // ── CTA href for the recommended action card ──────────────────────────────
  const scenarioCta = ((): string => {
    const jParams = jurisdiction
      ? `state=${encodeURIComponent(jurisdiction.state)}&county=${encodeURIComponent(jurisdiction.county)}&country=${encodeURIComponent(jurisdiction.country ?? "United States")}`
      : null;

    if (scenario === "no-jurisdiction") return "/location";
    if (scenario === "pro-summarize") return "#case-brief";
    if (scenario === "intake-pending") return "/upload-document";

    if (scenario === "ask-about-docs") {
      // Pre-select the most recently analyzed doc in Ask Atlas
      const latestDoc = Object.values(uniqueAnalyzed).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
      const base = jParams ? `/ask?${jParams}` : "/ask";
      return latestDoc ? `${base}${base.includes("?") ? "&" : "?"}document=${latestDoc.id}` : base;
    }

    // All conversation-resume scenarios
    const lastThread = threads[0];
    const threadParam = lastThread ? `thread=${lastThread.id}` : null;
    if (jParams) {
      return threadParam ? `/ask?${threadParam}&${jParams}` : `/ask?${jParams}`;
    }
    return threadParam ? `/ask?${threadParam}` : "/ask";
  })();

  const askAIPath = jurisdiction
    ? `/ask?state=${encodeURIComponent(jurisdiction.state)}&county=${encodeURIComponent(jurisdiction.county)}&country=${encodeURIComponent(jurisdiction.country ?? "United States")}`
    : "/ask";

  // Resume href — deeplinks to last conversation with jurisdiction preserved.
  const resumeHref = (() => {
    const lastThread = threads[0];
    if (!lastThread) return askAIPath;
    const p = new URLSearchParams({ thread: lastThread.id });
    if (lastThread.jurisdictionState) p.set("state", lastThread.jurisdictionState);
    if (lastThread.jurisdictionCounty) p.set("county", lastThread.jurisdictionCounty);
    return `/ask?${p.toString()}`;
  })();
  const preferredName = resolvePreferredFirstName({
    profileDisplayName: profile?.displayName,
    profileFullName: profile?.fullName,
    authMetadataName: user?.authMetadataName,
    authDisplayName: user?.fullName ?? user?.displayName,
    email: user?.email,
  });
  const uploadEmptyMessage = preferredName
    ? `${preferredName}, upload your first custody document`
    : "Upload your first custody document";
  const greetingName = preferredName || (user?.email?.split("@")[0] ?? "there");
  const profileCreatedAtMs = profile?.createdAt ? new Date(profile.createdAt).getTime() : Number.NaN;
  const isFreshProfile = Number.isFinite(profileCreatedAtMs) && Date.now() - profileCreatedAtMs <= 5 * 60 * 1000;
  const welcomeJustCompleted =
    typeof window !== "undefined" &&
    window.sessionStorage.getItem(WELCOME_FLOW_JUST_COMPLETED_KEY) === "1";
  const isReturningUserGreeting =
    !isFreshProfile &&
    !welcomeJustCompleted &&
    cases.length > 0 &&
    Boolean(profile?.createdAt);

  return (
    <PageContainer size="wide" className="max-w-[1320px] py-4 space-y-4" testId="page-workspace">

      {/* 1. Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
        <Link href="/">
          <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Home</span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
        <span className="text-foreground font-medium">Workspace</span>
      </nav>

      <WorkspaceHeader
        activeCaseName={activeCaseName}
        caseCount={cases.length}
        timelineEventCount={timelineEvents.length}
        activeCaseId={caseIdParam}
        preferredName={preferredName}
        cases={cases}
        onSelectCase={(nextCaseId) => {
          if (nextCaseId === "all") {
            navigate("/workspace");
            return;
          }
          navigate(`/case/${nextCaseId}`);
        }}
        onCreateCase={() => setIsCreateCaseOpen(true)}
      />

      <Dialog open={isCreateCaseOpen} onOpenChange={setIsCreateCaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Case</DialogTitle>
            <DialogDescription>
              Add a case to organize documents and prepare for your case dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="case-name">Case name</Label>
              <Input
                id="case-name"
                placeholder="e.g., Smith v. Jones"
                value={newCaseName}
                onChange={(e) => setNewCaseName(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateCaseOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newCaseName.trim() || createCaseMutation.isPending}
              onClick={() => createCaseMutation.mutate()}
            >
              {createCaseMutation.isPending ? "Creating…" : "Create Case"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!retroactivePrompt}
        onOpenChange={(open) => {
          if (!open && !isApplyingRetroactive) setRetroactivePrompt(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review pre-existing documents</DialogTitle>
            <DialogDescription>
              We found {retroactivePrompt?.totalCount ?? 0} documents uploaded before case management.
              {" "}
              They remain unassigned unless you attach them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium">
              {retroactivePrompt?.suggestedCount ?? 0} document(s) are suggested for this case.
            </p>
            <p className="text-xs text-muted-foreground">
              Confidence uses case number, court, party names, jurisdiction, and related dates when available.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              disabled={isApplyingRetroactive}
              onClick={() => {
                if (!retroactivePrompt) return;
                const caseId = retroactivePrompt.caseId;
                setRetroactivePrompt(null);
                navigate(`/case/${caseId}`);
              }}
            >
              Review individually
            </Button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={isApplyingRetroactive}
                onClick={() => {
                  setRetroactivePrompt(null);
                  toast({
                    title: "Skipped for now",
                    description: "Pre-existing documents remain unassigned and can be reviewed later in Workspace.",
                  });
                }}
              >
                Skip for now
              </Button>
              <Button disabled={isApplyingRetroactive} onClick={attachSuggestedDocuments}>
                {isApplyingRetroactive ? "Attaching…" : "Attach suggested documents"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 space-y-4">
          {memoryCase && (
            <CaseMemoryStrip
              firstName={greetingName}
              activeCase={memoryCase}
              nextHearingDate={memoryCaseActions?.hearingDate ?? null}
              lastThread={lastThread}
              isReturningUser={isReturningUserGreeting}
            />
          )}

          <Panel>
            <PanelHeader icon={Activity} label="What Matters Now" />
            <PanelContent className="p-3">
              <DismissibleWhatMattersNow
                rawSignals={caseSignalsData?.signals ?? []}
                tier={signalTier}
                totalDocuments={caseScopedDocuments.length || documents.length}
                lastActivityDaysAgo={lastActivityDaysAgo}
                loading={isLoadingCaseSignals}
              />
            </PanelContent>
          </Panel>

          <QuickActionsPanel askAIPath={askAIPath} />
        </div>

        <div className="xl:col-span-4 space-y-4">
          <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5 flex items-center gap-2" data-testid="card-privacy-trust">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-snug">
              Documents are analyzed privately and never retained. Your questions are confidential.
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch">
        <div id="documents" className="h-full">
          <DocumentsPanel groupedCaseCount={new Set(documents.map((doc) => doc.caseId ?? "unassigned")).size}>
            <DocumentsSection
              documents={documents}
              isLoading={isLoadingWorkspace && !!user}
              askAIPath={askAIPath}
              caseNameById={caseNameById}
              onOpenDocumentSafely={openDocumentSafely}
              cases={cases}
              uploadEmptyMessage={uploadEmptyMessage}
              currentUserId={user?.id}
            />
          </DocumentsPanel>
        </div>

        <div className="h-full">
          {user ? (
            <CaseBriefSection
              caseIdParam={caseIdParam}
              hasGeneralBriefContent={hasGeneralBriefContent}
              hasCases={cases.length > 0}
              firstCaseId={firstCaseId}
              onCreateCase={() => setIsCreateCaseOpen(true)}
            />
          ) : (
            <Panel testId="card-case-brief-unauth" className="h-full">
              <PanelHeader icon={Sparkles} label="Case Brief" />
              <PanelContent className="p-2.5">
                <EmptyState
                  icon={Sparkles}
                  message="Sign in to generate a structured case brief from your custody documents and activity"
                  ctaLabel="Ask Atlas"
                  ctaHref={askAIPath}
                  testId="empty-brief-unauth"
                />
              </PanelContent>
            </Panel>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 items-stretch">
        <div id="recent-activity" className="h-full">
          {user ? (
            <TimelineAndActivityPanel
              events={timelineEvents}
              threads={threads}
              documents={documents}
              isLoading={isLoadingWorkspace && !!user}
              askAIPath={askAIPath}
              onOpenDocumentSafely={openDocumentSafely}
            />
          ) : (
            <Panel testId="card-timeline-activity" className="h-full">
              <PanelHeader icon={Activity} label="Recent Activity" />
              <PanelContent className="p-2.5">
                <EmptyState
                  icon={MessageSquare}
                  message="Sign in to save conversations and track your case timeline"
                  ctaLabel="Ask Atlas"
                  ctaHref={askAIPath}
                  testId="empty-activity-unauth"
                />
              </PanelContent>
            </Panel>
          )}
        </div>
      </section>

    </PageContainer>
  );
}
