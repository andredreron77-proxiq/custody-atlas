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
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import {
  ArrowLeft, FileText, Calendar, Hash, Building2,
  User, Gavel, MapPin, BookOpen, Sparkles, Clock, MessageSquare,
  ChevronRight, AlertCircle, HelpCircle, Search,
  Eye, Download, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  DocObligationBadge,
  DocImplicationsSection,
  DocActionInsight,
  parseDocAnalysis,
  hasAnalysis,
} from "@/components/app/DocIntelPanel";

/* ── Types ────────────────────────────────────────────────────────────────── */

interface DocumentDetail {
  id: string;
  fileName: string;
  mimeType: string;
  pageCount: number;
  docType: string;
  analysisJson: Record<string, unknown>;
  caseId: string | null;
  createdAt: string;
  /** True when a storage_path exists for this document — enables View/Download. */
  hasStoragePath: boolean;
}

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
      <h2 className="text-sm font-semibold mb-3">Key facts extracted from this document</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-2">
            <Icon className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <dt className="text-[10px] text-muted-foreground uppercase tracking-wide leading-4">{label}</dt>
              <dd className="text-sm text-foreground leading-snug">{value}</dd>
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
      <h2 className="text-sm font-semibold mb-3">Key dates &amp; deadlines</h2>
      <ul className="space-y-1.5">
        {key_dates.map((date, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
            <Clock className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
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
    <section data-testid="doc-detail-summary">
      <h2 className="text-sm font-semibold mb-2">Summary</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
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
      <h2 className="text-sm font-semibold mb-3">Important terms in this document</h2>
      <ul className="space-y-1.5">
        {important_terms.map((term, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
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
      <h2 className="text-sm font-semibold mb-3">Questions to ask your attorney</h2>
      <ul className="space-y-2">
        {questions.map((q, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
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
      className="rounded-xl border bg-muted/30 p-5 space-y-4"
      data-testid="doc-detail-ask-panel"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Ask Atlas about this document</h2>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
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
              className="h-7 px-3 text-xs gap-1.5 border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/40"
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

/* ── Original File Access ─────────────────────────────────────────────────── */

/**
 * Calls the secure backend endpoint to get a short-lived signed URL,
 * then opens it in a new tab (view) or navigates to it (download).
 *
 * The signed URL expires in 90 seconds — sufficient for the browser to
 * initiate the request before Supabase rejects it.
 */
function useFileAction(docId: string) {
  const [viewLoading, setViewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const { toast } = useToast();

  async function fetchSignedUrl(mode: "view" | "download"): Promise<string | null> {
    const res = await fetch(`/api/documents/${docId}/${mode}`, {
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Unable to access the original file.");
    }
    const { signedUrl } = await res.json();
    return signedUrl as string;
  }

  async function handleView() {
    setViewLoading(true);
    try {
      const url = await fetchSignedUrl("view");
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast({
        title: "Cannot open file",
        description: err.message ?? "The original file is unavailable. It may not have been stored during upload.",
        variant: "destructive",
      });
    } finally {
      setViewLoading(false);
    }
  }

  async function handleDownload() {
    setDownloadLoading(true);
    try {
      const url = await fetchSignedUrl("download");
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast({
        title: "Cannot download file",
        description: err.message ?? "The original file is unavailable.",
        variant: "destructive",
      });
    } finally {
      setDownloadLoading(false);
    }
  }

  return { handleView, handleDownload, viewLoading, downloadLoading };
}

/**
 * View/Download section for the original uploaded file.
 * Clearly separate from Ask Atlas actions.
 * Shows a "not available" message when storagePath is absent (null).
 */
function OriginalFileSection({
  docId,
  hasStoragePath,
  fileName,
}: {
  docId: string;
  hasStoragePath: boolean;
  fileName: string;
}) {
  const { handleView, handleDownload, viewLoading, downloadLoading } = useFileAction(docId);

  return (
    <section
      className="rounded-xl border p-5 space-y-3"
      data-testid="doc-detail-original-file"
    >
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Original file</h2>
      </div>

      {hasStoragePath ? (
        <>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Access links are generated on demand and expire within 90 seconds.
            Your file is stored privately — no permanent public URL is created.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleView}
              disabled={viewLoading || downloadLoading}
              data-testid="btn-view-original"
            >
              {viewLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Eye className="w-3.5 h-3.5" />}
              View original
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleDownload}
              disabled={viewLoading || downloadLoading}
              data-testid="btn-download-original"
            >
              {downloadLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />}
              Download
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          The original file is not available. This may happen if the file was uploaded
          before storage was enabled, or if the upload did not complete successfully.
          The extracted text and analysis data above are still available.
        </p>
      )}
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

/* ── Main Page ────────────────────────────────────────────────────────────── */

export default function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [, navigate] = useLocation();

  const { data: doc, isLoading, isError } = useQuery<DocumentDetail>({
    queryKey: ["/api/documents", documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Document not found");
      const json = await res.json();
      return json.document as DocumentDetail;
    },
    enabled: !!documentId,
    retry: 1,
  });

  const analyzed = !!doc && hasAnalysis(doc.analysisJson);
  const typeLabel = doc ? (DOC_TYPE_LABELS[doc.docType] ?? "Document") : "";
  const typeColor = doc ? (DOC_TYPE_COLORS[doc.docType] ?? DOC_TYPE_COLORS.other) : "";

  const backHref = doc?.caseId ? `/case/${doc.caseId}` : "/workspace";
  const backLabel = doc?.caseId ? "Case Dashboard" : "Workspace";

  /* ── Error state ── */
  if (isError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto" />
        <p className="text-sm font-medium">Document not found</p>
        <p className="text-xs text-muted-foreground">
          This document may have been removed or you may not have access to it.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate("/workspace")} data-testid="btn-back-error">
          <ArrowLeft className="w-3 h-3 mr-1" />
          Back to Workspace
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-7">

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
          <header className="space-y-2" data-testid="doc-detail-header">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h1
                  className="text-base font-semibold leading-snug break-words"
                  data-testid="doc-detail-filename"
                >
                  {doc.fileName}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${typeColor}`}
                    data-testid="doc-detail-type-badge"
                  >
                    {typeLabel}
                  </span>
                  <span className="text-[11px] text-muted-foreground" data-testid="doc-detail-date">
                    Uploaded {shortDate(doc.createdAt)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {doc.pageCount === 1 ? "1 page" : `${doc.pageCount} pages`}
                  </span>
                  {analyzed && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 font-medium">
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
          <DocActionInsight
            analysisJson={doc.analysisJson}
            docType={doc.docType}
            className="text-sm not-italic text-muted-foreground border-l-2 border-amber-400/60 pl-3"
          />

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
              <section data-testid="doc-detail-implications">
                <h2 className="text-sm font-semibold mb-3">What this may require</h2>
                <DocImplicationsSection
                  analysisJson={doc.analysisJson}
                  maxItems={10}
                  className=""
                />
                <DocActionInsight
                  analysisJson={doc.analysisJson}
                  docType={doc.docType}
                  className="mt-2 text-sm"
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

          {/* ── Original file access (view + download) ── */}
          <OriginalFileSection
            docId={doc.id}
            hasStoragePath={doc.hasStoragePath}
            fileName={doc.fileName}
          />

          {/* ── Ask Atlas panel ── */}
          <AskAtlasPanel docId={doc.id} analyzed={analyzed} />

        </>
      )}
    </div>
  );
}
