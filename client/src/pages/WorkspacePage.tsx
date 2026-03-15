import { Link } from "wouter";
import {
  LayoutDashboard, MapPin, MessageSquare, FileSearch, Map,
  GitCompare, ShieldCheck, Lock, FileText, ArrowRight,
  ChevronRight, BookOpen, Scale, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JurisdictionContextHeader } from "@/components/app/JurisdictionContextHeader";
import { useJurisdiction } from "@/hooks/useJurisdiction";

/* ── Placeholder types for recent activity ────────────────────────────────── */

interface RecentDocument {
  id: string;
  name: string;
  status: "analyzed" | "processing" | "error";
  analysisPath?: string;
}

interface RecentQuestion {
  id: string;
  question: string;
  state?: string;
}

/* ── Placeholder data — replace with real storage when available ─────────── */
const RECENT_DOCUMENTS: RecentDocument[] = [];
const RECENT_QUESTIONS: RecentQuestion[] = [];

/* ── Status badge ─────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: RecentDocument["status"] }) {
  if (status === "analyzed") {
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50">
        Analyzed
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
        Processing
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
      Error
    </Badge>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
function EmptyState({
  icon: Icon,
  message,
  ctaLabel,
  ctaHref,
  testId,
}: {
  icon: React.ElementType;
  message: string;
  ctaLabel: string;
  ctaHref: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6 text-center" data-testid={testId}>
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground leading-snug max-w-[180px]">{message}</p>
      <Link href={ctaHref}>
        <Button variant="outline" size="sm" className="gap-1.5" data-testid={`${testId}-cta`}>
          {ctaLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </Link>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function WorkspacePage() {
  const { jurisdiction, clearJurisdiction } = useJurisdiction();

  const lawPagePath = jurisdiction
    ? `/jurisdiction/${encodeURIComponent(jurisdiction.state)}/${encodeURIComponent(jurisdiction.county)}` +
      `?country=${encodeURIComponent(jurisdiction.country ?? "United States")}` +
      (jurisdiction.formattedAddress
        ? `&address=${encodeURIComponent(jurisdiction.formattedAddress)}`
        : "") +
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
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="heading-workspace">
            Case Workspace
          </h1>
        </div>
        <p className="text-muted-foreground text-sm ml-10">
          Your central place to understand custody law, analyze documents, and track your progress.
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
                  <p className="text-xl font-bold text-foreground" data-testid="text-workspace-state">
                    {jurisdiction.state}
                  </p>
                  {jurisdiction.county && (
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      data-testid="button-change-location-workspace"
                    >
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
              <Link href={askAIPath}>
                <button
                  className="w-full flex flex-col items-start gap-2 rounded-lg border bg-card p-3 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                  data-testid="quick-action-ask-ai"
                >
                  <div className="w-7 h-7 rounded-md bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-xs font-medium leading-snug group-hover:text-primary transition-colors">
                    Ask a custody question
                  </span>
                </button>
              </Link>

              <Link href="/upload-document">
                <button
                  className="w-full flex flex-col items-start gap-2 rounded-lg border bg-card p-3 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                  data-testid="quick-action-analyze-doc"
                >
                  <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                    <FileSearch className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-xs font-medium leading-snug group-hover:text-primary transition-colors">
                    Analyze a document
                  </span>
                </button>
              </Link>

              <Link href="/custody-map">
                <button
                  className="w-full flex flex-col items-start gap-2 rounded-lg border bg-card p-3 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                  data-testid="quick-action-explore-map"
                >
                  <div className="w-7 h-7 rounded-md bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center">
                    <Map className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <span className="text-xs font-medium leading-snug group-hover:text-primary transition-colors">
                    Explore custody map
                  </span>
                </button>
              </Link>

              <Link href="/custody-map?mode=compare">
                <button
                  className="w-full flex flex-col items-start gap-2 rounded-lg border bg-card p-3 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                  data-testid="quick-action-compare-states"
                >
                  <div className="w-7 h-7 rounded-md bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
                    <GitCompare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-xs font-medium leading-snug group-hover:text-primary transition-colors">
                    Compare states
                  </span>
                </button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* ── C: Recent Documents Card ───────────────────────────── */}
        <Card className="shadow-sm border" data-testid="card-recent-documents">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-primary" />
              Recent Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {RECENT_DOCUMENTS.length > 0 ? (
              <ul className="space-y-2" data-testid="list-recent-documents">
                {RECENT_DOCUMENTS.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    data-testid={`doc-item-${doc.id}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{doc.name}</span>
                      <StatusBadge status={doc.status} />
                    </div>
                    {doc.analysisPath && (
                      <Link href={doc.analysisPath}>
                        <Button variant="ghost" size="sm" className="flex-shrink-0 text-xs gap-1" data-testid={`button-view-doc-${doc.id}`}>
                          View analysis
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={FileSearch}
                message="Upload your first custody document"
                ctaLabel="Analyze a document"
                ctaHref="/upload-document"
                testId="empty-recent-documents"
              />
            )}
          </CardContent>
        </Card>

        {/* ── D: Recent Questions Card ───────────────────────────── */}
        <Card className="shadow-sm border" data-testid="card-recent-questions">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              Recent Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {RECENT_QUESTIONS.length > 0 ? (
              <ul className="space-y-2" data-testid="list-recent-questions">
                {RECENT_QUESTIONS.map((q) => (
                  <li
                    key={q.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    data-testid={`question-item-${q.id}`}
                  >
                    <p className="text-sm text-foreground leading-snug flex-1 min-w-0 line-clamp-2">
                      {q.question}
                    </p>
                    <Link href={askAIPath}>
                      <Button variant="ghost" size="sm" className="flex-shrink-0 text-xs gap-1" data-testid={`button-ask-follow-${q.id}`}>
                        Follow up
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={MessageSquare}
                message="Ask your first custody question"
                ctaLabel="Ask AI"
                ctaHref={askAIPath}
                testId="empty-recent-questions"
              />
            )}
          </CardContent>
        </Card>

        {/* ── E: Custody Map Card ────────────────────────────────── */}
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

        {/* ── F: Privacy & Trust Card ────────────────────────────── */}
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
