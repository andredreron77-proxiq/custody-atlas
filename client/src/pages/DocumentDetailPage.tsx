/**
 * DocumentDetailPage
 *
 * A focused review view for a single uploaded document.
 * Shows all extracted intelligence without requiring the user to ask questions.
 *
 * Route: /document/:documentId
 * Data:  GET /api/documents/:documentId
 */

import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, FileText, Calendar, Hash, Building2,
  User, Gavel, MapPin, BookOpen, Sparkles, Clock, MessageSquare,
  ChevronRight, AlertCircle, HelpCircle, Search,
  Upload, Loader2, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DocObligationBadge,
  DocActionInsight,
  parseDocAnalysis,
  hasAnalysis,
} from "@/components/app/DocIntelPanel";
import { apiRequestRaw } from "@/lib/queryClient";
import {
  fetchDocumentDetail,
  type DocumentDetail,
  type DocumentMissingAnalysisError,
} from "@/lib/documentDetailApi";

/* ── Types ────────────────────────────────────────────────────────────────── */

const DOC_TYPE_LABELS: Record<string, string> = {
  custody_order:  "Custody Order",
  communication:  "Communication",
  financial:      "Financial",
  other:          "Document",
};

const DOC_TYPE_COLORS: Record<string, string> = {
  custody_order: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400",
  communication: "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400",
  financial:     "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400",
  other:         "bg-muted text-muted-foreground",
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

/* ── Quick Actions ────────────────────────────────────────────────────────── */

const QUICK_ACTIONS = [
  {
    id: "key-dates",
    icon: Clock,
    label: "Key dates",
    question: "What are all the key dates, deadlines, and important dates in this document?",
  },
  {
    id: "summarize",
    icon: BookOpen,
    label: "Summarize",
    question: "Summarize this document in plain English. What does it say and what does it mean for me?",
  },
  {
    id: "deadlines",
    icon: Search,
    label: "Find deadlines",
    question: "What response deadlines, compliance dates, or time-sensitive requirements are in this document?",
  },
] as const;

/* ── Extracted Facts Grid ─────────────────────────────────────────────────── */

interface FactRow { icon: typeof Calendar; label: string; value: string }

function ExtractedFactsSection({ analysisJson }: { analysisJson: Record<string, unknown> }) {
  const { extracted_facts: ef } = parseDocAnalysis(analysisJson);
  if (!ef) return null;

  const rows: FactRow[] = [];
  if (ef.document_title)   rows.push({ icon: FileText,  label: "Document title",  value: ef.document_title });
  if (ef.case_number)      rows.push({ icon: Hash,       label: "Case number",     value: ef.case_number });
  if (ef.court_name)       rows.push({ icon: Building2,  label: "Court",           value: ef.court_name });
  if (ef.court_address)    rows.push({ icon: MapPin,     label: "Court address",   value: ef.court_address });
  if (ef.judge_name)       rows.push({ icon: Gavel,      label: "Judge",           value: ef.judge_name });
  if (ef.filing_party)     rows.push({ icon: User,       label: "Filing party",    value: ef.filing_party });
  if (ef.opposing_party)   rows.push({ icon: User,       label: "Opposing party",  value: ef.opposing_party });
  if (ef.hearing_date)     rows.push({ icon: Calendar,   label: "Hearing date",    value: ef.hearing_date });
  if (ef.filing_date)      rows.push({ icon: Calendar,   label: "Filing date",     value: ef.filing_date });
  if (ef.effective_date)   rows.push({ icon: Calendar,   label: "Effective date",  value: ef.effective_date });

  if (rows.length === 0) return null;

  return (
    <section data-testid="doc-detail-facts">
      <h2 className="text-lg font-semibold mb-4">Key facts extracted from this document</h2>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-lg border bg-card px-4 py-3 flex items-start gap-3">
            <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
              <dd className="text-base text-foreground leading-relaxed break-words">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ── Key Dates Section ────────────────────────────────────────────────────── */

function KeyDatesSection({ analysisJson }: { analysisJson: Record<string, unknown> }) {
  if (!hasAnalysis(analysisJson)) return null;
  const { key_dates } = parseDocAnalysis(analysisJson);
  if (!key_dates || key_dates.length === 0) return null;

  return (
    <section data-testid="doc-detail-key-dates">
      <h2 className="text-lg font-semibold mb-4">Key dates &amp; deadlines</h2>
      <ul className="space-y-3">
        {key_dates.map((date, i) => (
          <li key={i} className="flex items-start gap-2 text-base text-foreground leading-relaxed">
            <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
            <span>{date}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Summary Section ──────────────────────────────────────────────────────── */

function SummarySection({ analysisJson }: { analysisJson: Record<string, unknown> }) {
  if (!hasAnalysis(analysisJson)) return null;
  const { summary } = parseDocAnalysis(analysisJson);
  if (!summary) return null;

  return (
    <section data-testid="doc-detail-summary" className="space-y-3 py-1">
      <h2 className="text-lg font-semibold">Summary</h2>
      <p className="text-base leading-relaxed max-w-2xl text-foreground">{summary}</p>
    </section>
  );
}

/* ── Important Terms ──────────────────────────────────────────────────────── */

function ImportantTermsSection({ analysisJson }: { analysisJson: Record<string, unknown> }) {
  if (!hasAnalysis(analysisJson)) return null;
  const { important_terms } = parseDocAnalysis(analysisJson);
  if (!important_terms || important_terms.length === 0) return null;

  return (
    <section data-testid="doc-detail-terms">
      <h2 className="text-lg font-semibold mb-4">Important terms in this document</h2>
      <ul className="space-y-3">
        {important_terms.map((term, i) => (
          <li key={i} className="flex items-start gap-2 text-base text-foreground leading-relaxed">
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0 mt-2" />
            <span>{term}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Questions to Ask Attorney ────────────────────────────────────────────── */

function QuestionsSection({ analysisJson }: { analysisJson: Record<string, unknown> }) {
  if (!hasAnalysis(analysisJson)) return null;
  const raw = analysisJson.questions_to_ask_attorney;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const questions = raw as string[];

  return (
    <section data-testid="doc-detail-questions">
      <h2 className="text-lg font-semibold mb-4">Questions to ask your attorney</h2>
      <ul className="space-y-3">
        {questions.map((q, i) => (
          <li
            key={i}
            className="group flex items-start gap-3 rounded-lg border border-border/70 bg-card px-4 py-3 text-base text-foreground leading-relaxed transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <HelpCircle className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0 mt-1 transition-colors" />
            <span>{q}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Ask Atlas Panel ──────────────────────────────────────────────────────── */

function AskAtlasPanel({ docId, analyzed }: { docId: string; analyzed: boolean }) {
  const askBase = `/ask?document=${encodeURIComponent(docId)}`;

  return (
    <section
      className="rounded-xl border bg-muted/30 p-6 space-y-4"
      data-testid="doc-detail-ask-panel"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="text-lg font-semibold">Ask Atlas about this document</h2>
      </div>

      <p className="text-base leading-relaxed text-foreground/90">
        Atlas answers questions using the text and facts extracted from this specific document.
        {analyzed
          ? " Analysis is complete — Atlas has the full document context."
          : " This document hasn't been analyzed yet — Atlas will use general knowledge."}
      </p>

      {/* Primary ask button */}
      <Link href={askBase}>
        <Button
          className="w-full gap-2"
          data-testid="btn-ask-about-doc"
        >
          <MessageSquare className="w-4 h-4" />
          Ask about this document
        </Button>
      </Link>

      {/* Quick action buttons */}
      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map(({ id, icon: Icon, label, question }) => (
          <Link
            key={id}
            href={`${askBase}&q=${encodeURIComponent(question)}`}
          >
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-sm gap-1.5 border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/40"
              data-testid={`btn-quick-${id}`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </Button>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Analysis Retention Note ──────────────────────────────────────────────── */

/**
 * Custody Atlas is an intelligence-only system — original files are never
 * retained after upload. This card communicates that model clearly and
 * positively, without any error or "missing file" language.
 */
function AnalysisRetentionNote({ fileName }: { fileName: string }) {
  const [, navigate] = useLocation();

  return (
    <section
      className="rounded-xl border p-5 space-y-3"
      data-testid="doc-detail-analysis-retention"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary/70" />
        <h2 className="text-sm font-semibold">Analysis retained</h2>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Original files are not stored after analysis — your document was processed,
        key information was extracted, and the source file was discarded. Everything
        above reflects the full intelligence captured from{" "}
        <span className="font-medium text-foreground">{fileName}</span>.
      </p>
      <div className="pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-xs text-muted-foreground hover:text-foreground h-7 px-2"
          onClick={() => navigate("/workspace")}
          data-testid="btn-analyze-another"
        >
          <Upload className="w-3.5 h-3.5" />
          Analyze another document
        </Button>
      </div>
    </section>
  );
}

/* ── Delete Document ──────────────────────────────────────────────────────── */

/**
 * Confirmation dialog + delete button for the document.
 *
 * Behavior:
 *   1. User clicks "Delete document" → AlertDialog opens.
 *   2. Dialog shows a clear warning: all extracted intelligence and data will be removed.
 *   3. On "Delete permanently" → calls DELETE /api/documents/:id.
 *   4. On success → invalidates document caches, navigates back (case dashboard or workspace).
 *   5. On failure → shows error toast; dialog closes so the user can retry.
 *
 * The AlertDialogAction is styled with bg-destructive so it reads as a
 * deliberately dangerous action, clearly distinct from the Ask Atlas CTA.
 */
function DeleteDocumentSection({
  docId,
  fileName,
  backHref,
}: {
  docId: string;
  fileName: string;
  backHref: string;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // apiRequestRaw attaches the Authorization: Bearer token that requireAuth needs.
      const res = await apiRequestRaw("DELETE", `/api/documents/${docId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Deletion failed. Please try again.");
      }
      return res.json();
    },
    onSuccess: () => {
      // Invalidate any document list queries so the deleted doc disappears
      qc.invalidateQueries({ queryKey: ["/api/workspace"] });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      qc.removeQueries({ queryKey: ["/api/documents", docId] });
      navigate(backHref);
    },
    onError: (err: Error) => {
      toast({
        title: "Could not delete document",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <section
      className="rounded-xl border border-dashed border-destructive/30 p-5 space-y-3"
      data-testid="doc-detail-delete-section"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-destructive/80">Delete this document</h2>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
            Permanently removes all extracted intelligence, analysis, and insights for this document.
            This cannot be undone.
          </p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive/60 flex-shrink-0"
              data-testid="btn-delete-doc-trigger"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this document?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    This will permanently remove <span className="font-medium text-foreground">{fileName}</span> from your account, including:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>All extracted facts, dates, and case information</li>
                    <li>The AI analysis and insights</li>
                    <li>The document text used in Ask Atlas sessions</li>
                  </ul>
                  <p className="text-xs font-medium text-destructive/80">
                    This action cannot be undone.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="btn-delete-cancel">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid="btn-delete-confirm"
              >
                {deleteMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Deleting…
                  </span>
                ) : (
                  "Delete permanently"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}

/* ── Loading Skeleton ─────────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-2/3 bg-muted rounded" />
      <div className="h-4 w-1/4 bg-muted rounded" />
      <div className="space-y-2">
        <div className="h-3 w-full bg-muted rounded" />
        <div className="h-3 w-5/6 bg-muted rounded" />
        <div className="h-3 w-4/6 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 bg-muted rounded" />
        ))}
      </div>
    </div>
  );
}

/* ── Document Not Found State ─────────────────────────────────────────────── */

/**
 * Shown when GET /api/documents/:id returns a 404 (file gone or access denied).
 * Unlike a plain error screen, it offers a one-click "Remove from workspace"
 * action that calls DELETE so the orphaned DB record is also cleaned up.
 *
 * The DELETE call succeeds on 404 too (no record = already clean), so
 * clicking "Remove" always leaves the workspace in a consistent state.
 */
function DocumentNotFoundState({ documentId }: { documentId: string }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const removeMutation = useMutation({
    mutationFn: async () => {
      // apiRequestRaw attaches the Authorization: Bearer token that requireAuth needs.
      const res = await apiRequestRaw("DELETE", `/api/documents/${documentId}`);
      // 404 = already deleted — that's fine, still navigate away.
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not remove document.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workspace"] });
      qc.invalidateQueries({ queryKey: ["/api/documents"] });
      qc.removeQueries({ queryKey: ["/api/documents", documentId] });
      navigate("/workspace");
    },
    onError: (err: Error) => {
      toast({ title: "Could not remove document", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-5">
      <AlertCircle className="w-10 h-10 text-muted-foreground/40 mx-auto" />
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">This document is no longer available</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
          This document's analysis could not be found. You can safely remove the entry from your workspace.
        </p>
      </div>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/workspace")}
          data-testid="btn-back-to-workspace-error"
        >
          <ArrowLeft className="w-3 h-3 mr-1" />
          Back to Workspace
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          data-testid="btn-remove-unavailable-doc"
        >
          {removeMutation.isPending ? (
            <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Removing…</>
          ) : (
            <><Trash2 className="w-3 h-3 mr-1.5" />Remove from workspace</>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */

export default function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [missingAnalysis, setMissingAnalysis] = useState<DocumentMissingAnalysisError | null>(null);

  const { data: doc, isLoading, isError } = useQuery<DocumentDetail>({
    queryKey: ["/api/documents", documentId],
    queryFn: async () => {
      console.info("[trace][detail] route documentId=", documentId);
      const result = await fetchDocumentDetail(documentId ?? "");
      console.info("[trace][detail] api response", {
        routeDocumentId: documentId,
        responseDocumentId: result.document?.id,
        code: result.missingAnalysis?.code,
      });
      if (result.missingAnalysis) {
        setMissingAnalysis(result.missingAnalysis);
        throw new Error("Document analysis unavailable");
      }
      return result.document;
    },
    enabled: !!documentId,
    retry: 1,
  });

  const analyzed = !!doc && hasAnalysis(doc.analysisJson);
  const typeLabel = doc ? (DOC_TYPE_LABELS[doc.docType] ?? "Document") : "";
  const typeColor = doc ? (DOC_TYPE_COLORS[doc.docType] ?? DOC_TYPE_COLORS.other) : "";

  const backHref = doc?.caseId ? `/case/${doc.caseId}` : "/workspace";
  const backLabel = doc?.caseId ? "Case Dashboard" : "Workspace";

  /* ── Error state — document not found or inaccessible ── */
  if (missingAnalysis?.code === "DOCUMENT_ANALYSIS_MISSING") {
    return <DocumentNotFoundState documentId={documentId ?? ""} />;
  }

  if (isError) {
    return (
      <DocumentNotFoundState documentId={documentId ?? ""} />
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

      {/* ── Breadcrumb / back ── */}
      <div className="flex items-center gap-2">
        <Link href={backHref}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            data-testid="btn-back-to-case"
          >
            <ArrowLeft className="w-3 h-3" />
            {isLoading ? "Back" : backLabel}
          </Button>
        </Link>
        <span className="text-muted-foreground/40 text-xs">/</span>
        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
          {isLoading ? "Loading…" : (doc?.fileName ?? "Document")}
        </span>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : !doc ? null : (
        <>
          {/* ── Document header ── */}
          <header className="space-y-4" data-testid="doc-detail-header">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h1
                  className="text-2xl font-semibold leading-tight break-words"
                  data-testid="doc-detail-filename"
                >
                  {doc.fileName}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${typeColor}`}
                    data-testid="doc-detail-type-badge"
                  >
                    {typeLabel}
                  </span>
                  <span className="text-sm text-muted-foreground" data-testid="doc-detail-date">
                    Uploaded {shortDate(doc.createdAt)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {doc.pageCount === 1 ? "1 page" : `${doc.pageCount} pages`}
                  </span>
                  {analyzed && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                      Analyzed
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Obligation badges prominently in header area */}
            <DocObligationBadge analysisJson={doc.analysisJson} />
          </header>

          {/* ── Action insight ── */}
          <div className="rounded-lg border border-amber-200/70 bg-amber-50/50 dark:bg-amber-950/15 p-4">
            <DocActionInsight
              analysisJson={doc.analysisJson}
              docType={doc.docType}
              className="text-base not-italic text-foreground leading-relaxed"
            />
          </div>

          <Separator />

          {/* ── Summary ── */}
          <SummarySection analysisJson={doc.analysisJson} />

          {analyzed && (
            <>
              <Separator />
              {/* ── Key facts grid ── */}
              <ExtractedFactsSection analysisJson={doc.analysisJson} />

              <Separator />
              {/* ── Key dates ── */}
              <KeyDatesSection analysisJson={doc.analysisJson} />

              <Separator />
              {/* ── What this may require ── */}
              <section data-testid="doc-detail-implications" className="rounded-lg border bg-muted/30 p-5">
                <h2 className="text-lg font-semibold mb-4">What this may require</h2>
                <ul className="space-y-3">
                  {(parseDocAnalysis(doc.analysisJson).possible_implications ?? []).slice(0, 10).map((impl, i) => (
                    <li key={i} className="flex items-start gap-3 text-base text-foreground leading-relaxed">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                      <span>{impl}</span>
                    </li>
                  ))}
                </ul>
                <DocActionInsight
                  analysisJson={doc.analysisJson}
                  docType={doc.docType}
                  className="mt-5 text-base text-foreground leading-relaxed"
                />
              </section>

              <Separator />
              {/* ── Important terms ── */}
              <ImportantTermsSection analysisJson={doc.analysisJson} />

              <Separator />
              {/* ── Questions to ask attorney ── */}
              <QuestionsSection analysisJson={doc.analysisJson} />
            </>
          )}

          {!analyzed && (
            <div
              className="rounded-lg border border-dashed p-6 text-center space-y-2"
              data-testid="doc-detail-not-analyzed"
            >
              <Sparkles className="w-6 h-6 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                This document hasn't been analyzed yet.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Analysis runs automatically after upload. If this document was just uploaded, check back shortly.
              </p>
            </div>
          )}

          <Separator />

          {/* ── Analysis retention note (intelligence-only model) ── */}
          <AnalysisRetentionNote fileName={doc.fileName} />

          {/* ── Ask Atlas panel ── */}
          <AskAtlasPanel docId={doc.id} analyzed={analyzed} />

          {/* ── Delete document (destructive zone, clearly separated) ── */}
          <DeleteDocumentSection
            docId={doc.id}
            fileName={doc.fileName}
            backHref={backHref}
          />

        </>
      )}
    </div>
  );
}
