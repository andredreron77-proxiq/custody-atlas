import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ChevronDown, ChevronUp, Clock3, FileWarning, FileText, Gavel, Info, Scale, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiRequestRaw } from "@/lib/queryClient";

type CaseDashboardPayload = {
  case: {
    id: string;
    title: string;
    caseType: string | null;
    status: string;
    stateCode: string | null;
    countyName: string | null;
  };
  whatMattersNow: {
    currentStage: string;
    stageKey?: "approaching_hearing" | "between_pretrial_and_final" | "preparing_for_deadlines" | "early_intake";
    nextKeyItems: Array<{ date: string; label: string; whyThisMatters?: string }>;
    watchouts: string[];
    suggestedFocus: string;
  };
  timeline: Array<{ id: string; date: string; label: string; type: "hearing" | "filing" | "deadline" | "order" | "mediation"; status: "past" | "upcoming" | "overdue" | "future"; whyThisMatters?: string }>;
  timelineSecondary?: Array<{ id: string; date: string; label: string; type: "allegation" | "context"; status: "past" | "upcoming" | "overdue" | "future" }>;
  timelineMeta?: { visibleCount: number; totalCount: number; hasMore: boolean; secondaryCount?: number };
  documents: Array<{ id: string; title: string; status: string; tags: string[] }>;
  caseHealth: {
    currentPosture: string;
    urgency: "Low" | "Medium" | "High";
    documentCompleteness: "Strong" | "Partial" | "Needs review";
    immediateConcern: string;
  };
  snapshot: {
    currentSituation: string;
    keyPoints: string[];
    thingsToWatch: string[];
    fullCaseBrief: string;
    extractedFacts: string[];
    deepAnalysis: string[];
  };
  alerts: Array<{
    id: string;
    kind: "missing_document" | "no_recent_activity" | "timeline_gap" | "overdue" | "analysis_missing";
    title: string;
    message: string;
    impact: string;
    severity: "high" | "medium" | "info";
    relatedItem: string;
    recommendedAction: string;
    target: { label: string; href: string; section: "timeline" | "document" | "add_document" | "ask_atlas" };
  }>;
};

function sentence(input: string, fallback: string): string {
  const normalized = (input || "").trim();
  if (!normalized) return fallback;
  return normalized;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function alertIcon(kind: CaseDashboardPayload["alerts"][number]["kind"]) {
  if (kind === "missing_document") return <FileWarning className="h-4 w-4 text-amber-300" />;
  if (kind === "overdue") return <TriangleAlert className="h-4 w-4 text-red-300" />;
  if (kind === "analysis_missing") return <FileText className="h-4 w-4 text-blue-300" />;
  if (kind === "timeline_gap") return <Clock3 className="h-4 w-4 text-blue-300" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

function timelineTypeIcon(type: "hearing" | "filing" | "deadline" | "order" | "mediation" | "allegation" | "context", status: "past" | "upcoming" | "overdue" | "future") {
  const tone = status === "overdue" ? "text-red-300" : status === "upcoming" ? "text-amber-300" : "text-slate-400";
  if (type === "hearing") return <Gavel className={`h-4 w-4 ${tone}`} />;
  if (type === "deadline") return <CalendarClock className={`h-4 w-4 ${tone}`} />;
  if (type === "order") return <Scale className={`h-4 w-4 ${tone}`} />;
  if (type === "mediation") return <Clock3 className={`h-4 w-4 ${tone}`} />;
  return <FileText className={`h-4 w-4 ${tone}`} />;
}

function timelineStatusClass(status: "past" | "upcoming" | "overdue" | "future"): string {
  if (status === "overdue") return "border-red-500/50 bg-red-500/10 text-red-100";
  if (status === "upcoming") return "border-amber-400/45 bg-amber-400/10 text-amber-100";
  if (status === "past") return "border-slate-600/60 bg-slate-900/40 text-slate-300";
  return "border-slate-600/60 bg-slate-800/40 text-slate-200";
}

function urgencyBadgeClass(value: "Low" | "Medium" | "High"): string {
  if (value === "High") return "bg-red-500/20 text-red-100 border-red-400/60";
  if (value === "Medium") return "bg-amber-500/20 text-amber-100 border-amber-400/60";
  return "bg-emerald-500/20 text-emerald-100 border-emerald-400/60";
}

function completenessBadgeClass(value: "Strong" | "Partial" | "Needs review"): string {
  if (value === "Needs review") return "bg-red-500/20 text-red-100 border-red-400/60";
  if (value === "Partial") return "bg-amber-500/20 text-amber-100 border-amber-400/60";
  return "bg-emerald-500/20 text-emerald-100 border-emerald-400/60";
}

function alertToneClass(severity: "high" | "medium" | "info"): string {
  if (severity === "high") return "border-l-red-400 border-red-500/35 bg-red-500/10";
  if (severity === "medium") return "border-l-amber-400 border-amber-500/35 bg-amber-500/10";
  return "border-l-blue-400 border-blue-500/35 bg-blue-500/10";
}

export default function CaseDashboardPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [expanded, setExpanded] = useState(false);
  const [showFullTimeline, setShowFullTimeline] = useState(false);

  const dashboardQuery = useQuery<CaseDashboardPayload>({
    queryKey: ["/api/cases", caseId, "dashboard"],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/dashboard`);
      if (!res.ok) throw new Error("Failed to load case dashboard.");
      return res.json();
    },
  });

  const data = dashboardQuery.data;

  const suggestedPrompts = useMemo(() => [
    "What should I handle next?",
    "Which deadline needs attention first?",
    "What document should I upload next?",
  ], []);

  if (dashboardQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-4" data-testid="page-case-dashboard">
        <Card><CardContent className="py-8 text-sm text-muted-foreground">Loading case dashboard…</CardContent></Card>
      </div>
    );
  }

  if (dashboardQuery.isError || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-4" data-testid="page-case-dashboard">
        <Card><CardContent className="py-8 text-sm text-muted-foreground">Unable to load this case dashboard.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 bg-[#0F172A] px-3 py-3 text-slate-50 md:px-4" data-testid="page-case-dashboard">
      <header className="sticky top-14 z-20 rounded-md border border-slate-700 bg-[#111827]/95 px-3 py-2 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-xl font-bold leading-tight">{data.case.title}</h1>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
              <span>{data.case.caseType || "Case type not set"}</span>
              <Badge variant="secondary" className="h-5 border-slate-600 bg-slate-700 px-1.5 text-[10px] text-slate-100">{data.case.status}</Badge>
              <span>{data.case.stateCode || "State unknown"}{data.case.countyName ? ` • ${data.case.countyName}` : ""}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link href="/upload-document"><Button size="sm" className="h-8 bg-blue-600 text-white hover:bg-blue-500">Add Document</Button></Link>
            <Link href={`/ask?case=${data.case.id}`}><Button size="sm" variant="secondary" className="h-8 border-slate-600 bg-slate-700 text-slate-100 hover:bg-slate-600">Ask Atlas</Button></Link>
          </div>
        </div>
      </header>

      <Card className="border border-blue-500/40 bg-gradient-to-br from-[#111827] via-[#111827] to-[#1F2937] shadow-lg shadow-blue-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What Matters Now</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Current Stage</p>
            <p>{sentence(data.whatMattersNow.currentStage, "Case stage is still being established.")}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Next Key Items</p>
            {data.whatMattersNow.nextKeyItems.length > 0 ? (
              <ul className="space-y-1">
                {data.whatMattersNow.nextKeyItems.slice(0, 3).map((item) => (
                  <li key={`${item.date}-${item.label}`} className="text-sm">
                    <p>{formatDate(item.date)} — {item.label}</p>
                    {item.whyThisMatters ? <p className="text-xs text-slate-400">{item.whyThisMatters}</p> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-slate-400">No upcoming key items.</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Watchouts</p>
            {data.whatMattersNow.watchouts.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {data.whatMattersNow.watchouts.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : <p className="text-slate-400">No active watchouts.</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Suggested Focus</p>
            <p className="rounded-md border border-blue-500/40 bg-blue-500/15 px-2 py-1.5 font-medium text-blue-100">{sentence(data.whatMattersNow.suggestedFocus, "Add a core filing with court dates or filing obligations.")}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <Card className="border-slate-700 bg-[#111827]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Legal Timeline</CardTitle>
            </CardHeader>
            <CardContent id="timeline">
              {data.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timeline events available for this case.</p>
              ) : (
                <>
                <ol className="space-y-1.5 text-sm">
                  {(showFullTimeline ? data.timeline : data.timeline.slice(0, data.timelineMeta?.visibleCount ?? 8)).map((event) => (
                    <li key={event.id} className={`rounded border px-2 py-1.5 ${timelineStatusClass(event.status)}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          {timelineTypeIcon(event.type, event.status)}
                          {formatDate(event.date)}
                        </span>
                        <span className="truncate pl-2 text-right">{event.label}</span>
                      </div>
                      {event.whyThisMatters ? <p className="pl-6 pt-0.5 text-xs text-slate-400">{event.whyThisMatters}</p> : null}
                    </li>
                  ))}
                </ol>
                {data.timelineMeta?.hasMore ? (
                  <div className="mt-2">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setShowFullTimeline((value) => !value)}>
                      {showFullTimeline ? "Show fewer items" : `View full timeline (${data.timelineMeta.totalCount})`}
                    </Button>
                  </div>
                ) : null}
                {data.timelineSecondary && data.timelineSecondary.length > 0 ? (
                  <Collapsible className="mt-3">
                    <CollapsibleTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-7 px-0 text-xs text-slate-400">
                        Context & allegations ({data.timelineMeta?.secondaryCount ?? data.timelineSecondary.length})
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 space-y-1.5">
                      {data.timelineSecondary.map((event) => (
                        <div key={event.id} className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${timelineStatusClass(event.status)}`}>
                          <span className="flex items-center gap-1.5">
                            {timelineTypeIcon(event.type, event.status)}
                            {formatDate(event.date)}
                          </span>
                          <span className="truncate pl-2 text-right">{event.label}</span>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-700 bg-[#111827]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents linked to this case.</p>
              ) : data.documents.map((doc) => (
                <div key={doc.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="h-5 border-slate-600 bg-slate-700 px-1.5 text-[10px] text-slate-100">{doc.status}</Badge>
                      {doc.tags.slice(0, 3).map((tag) => <Badge key={tag} variant="outline" className="h-5 border-slate-600 px-1.5 text-[10px] text-slate-300">{tag}</Badge>)}
                    </div>
                  </div>
                  <Link href={`/document/${doc.id}`}><Button size="sm" variant="ghost" className="h-7 px-2 text-slate-200 hover:bg-slate-700/60">View</Button></Link>
                </div>
              ))}
              <div className="pt-1">
                <Link href="/upload-document"><Button size="sm" variant="outline" className="h-7 border-slate-600 bg-slate-700/30 text-slate-100 hover:bg-slate-700">+ Add Document</Button></Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <Card className="border-slate-700 bg-[#111827]">
            <CardHeader className="pb-2"><CardTitle className="text-base">Case Health</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Current posture</p>
                <p>{sentence(data.caseHealth.currentPosture, "Case posture is still being assessed.")}</p>
              </section>
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Urgency</p>
                <Badge variant="outline" className={urgencyBadgeClass(data.caseHealth.urgency)}>
                  {data.caseHealth.urgency}
                </Badge>
              </section>
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Document completeness</p>
                <Badge variant="outline" className={completenessBadgeClass(data.caseHealth.documentCompleteness)}>
                  {data.caseHealth.documentCompleteness}
                </Badge>
              </section>
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Immediate concern</p>
                <p>{sentence(data.caseHealth.immediateConcern, "No immediate concern identified.")}</p>
              </section>
            </CardContent>
          </Card>

          <Card className="border-slate-700 bg-[#111827]">
            <CardHeader className="pb-2"><CardTitle className="text-base">Alerts</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.alerts.length > 0 ? data.alerts.map((alert) => (
                <div key={alert.id} className={`flex items-start gap-2 rounded border border-l-4 px-2 py-1.5 ${alertToneClass(alert.severity)}`}>
                  {alertIcon(alert.kind)}
                  <div className="space-y-1">
                    <p className="font-medium">{alert.title}</p>
                    <p>{alert.message}</p>
                    <p className="text-xs text-slate-300">{alert.impact}</p>
                    <p className="text-xs text-slate-400">Related: {alert.relatedItem}</p>
                    <p className="text-xs">{alert.recommendedAction}</p>
                    <Link href={alert.target.href}><Button size="sm" variant="outline" className="h-7 border-slate-500 bg-slate-800/40 text-slate-100 hover:bg-slate-700">{alert.target.label}</Button></Link>
                  </div>
                </div>
              )) : (
                <div className="flex items-start gap-2 rounded border border-slate-600 px-2 py-1.5 text-slate-400">
                  <AlertTriangle className="h-4 w-4" />
                  <p>No alerts require attention right now.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-slate-700 bg-[#111827]">
        <CardHeader className="pb-2"><CardTitle className="text-base">Ask Atlas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Ask about this case…" aria-label="Ask about this case" />
          <div className="flex flex-wrap gap-1.5">
            {suggestedPrompts.map((prompt) => (
              <Link key={prompt} href={`/ask?case=${data.case.id}&q=${encodeURIComponent(prompt)}`}>
                <Button variant="outline" size="sm" className="h-7 border-slate-600 bg-slate-800/30 text-xs text-slate-100 hover:bg-slate-700">{prompt}</Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <Card className="border-slate-700 bg-[#111827]">
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="h-8 justify-between px-0 text-base font-semibold">
                <span>Expandable Section</span>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-3 text-sm">
              <section>
                <p className="mb-1 font-semibold">Full Case Brief</p>
                <p className="text-muted-foreground">{sentence(data.snapshot.fullCaseBrief, "No full brief available yet.")}</p>
              </section>
              <section>
                <p className="mb-1 font-semibold">Extracted Facts</p>
                {data.snapshot.extractedFacts.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {data.snapshot.extractedFacts.map((fact) => <li key={fact}>{fact}</li>)}
                  </ul>
                ) : <p className="text-muted-foreground">No extracted facts available.</p>}
              </section>
              <section>
                <p className="mb-1 font-semibold">Deep analysis</p>
                {data.snapshot.deepAnalysis.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {data.snapshot.deepAnalysis.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : <p className="text-muted-foreground">No deep analysis available.</p>}
              </section>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
