import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ChevronDown, ChevronUp, Clock3, FileWarning, FileText, Gavel, Info, Lightbulb, Scale, TriangleAlert } from "lucide-react";
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
    riskScore: number;
    riskLevel: "Low" | "Moderate" | "Elevated" | "High";
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
  if (kind === "missing_document") return <FileWarning className="h-4 w-4 text-[hsl(var(--semantic-amber))]" />;
  if (kind === "overdue") return <TriangleAlert className="h-4 w-4 text-[hsl(var(--semantic-red))]" />;
  if (kind === "analysis_missing") return <FileText className="h-4 w-4 text-[hsl(var(--semantic-blue))]" />;
  if (kind === "timeline_gap") return <Clock3 className="h-4 w-4 text-[hsl(var(--semantic-blue))]" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

function timelineTypeIcon(type: "hearing" | "filing" | "deadline" | "order" | "mediation" | "allegation" | "context", status: "past" | "upcoming" | "overdue" | "future") {
  const tone = status === "overdue"
    ? "text-[hsl(var(--semantic-red))]"
    : status === "upcoming"
      ? "text-[hsl(var(--semantic-amber))]"
      : "text-muted-foreground";
  if (type === "hearing") return <Gavel className={`h-4 w-4 ${tone}`} />;
  if (type === "deadline") return <CalendarClock className={`h-4 w-4 ${tone}`} />;
  if (type === "order") return <Scale className={`h-4 w-4 ${tone}`} />;
  if (type === "mediation") return <Clock3 className={`h-4 w-4 ${tone}`} />;
  return <FileText className={`h-4 w-4 ${tone}`} />;
}

function timelineStatusClass(status: "past" | "upcoming" | "overdue" | "future"): string {
  if (status === "overdue") return "border-[hsl(var(--semantic-red)/0.45)] bg-[hsl(var(--semantic-red)/0.12)] text-foreground";
  if (status === "upcoming") return "border-[hsl(var(--semantic-amber)/0.45)] bg-[hsl(var(--semantic-amber)/0.12)] text-foreground";
  if (status === "past") return "border-border bg-muted/40 text-muted-foreground";
  return "border-border bg-muted/60 text-foreground";
}

function urgencyBadgeClass(value: "Low" | "Medium" | "High"): string {
  if (value === "High") return "bg-[hsl(var(--semantic-red)/0.16)] text-[hsl(var(--semantic-red))] border-[hsl(var(--semantic-red)/0.5)]";
  if (value === "Medium") return "bg-[hsl(var(--semantic-amber)/0.16)] text-[hsl(var(--semantic-amber))] border-[hsl(var(--semantic-amber)/0.5)]";
  return "bg-[hsl(var(--semantic-green)/0.16)] text-[hsl(var(--semantic-green))] border-[hsl(var(--semantic-green)/0.5)]";
}

function completenessBadgeClass(value: "Strong" | "Partial" | "Needs review"): string {
  if (value === "Needs review") return "bg-[hsl(var(--semantic-red)/0.16)] text-[hsl(var(--semantic-red))] border-[hsl(var(--semantic-red)/0.5)]";
  if (value === "Partial") return "bg-[hsl(var(--semantic-amber)/0.16)] text-[hsl(var(--semantic-amber))] border-[hsl(var(--semantic-amber)/0.5)]";
  return "bg-[hsl(var(--semantic-green)/0.16)] text-[hsl(var(--semantic-green))] border-[hsl(var(--semantic-green)/0.5)]";
}

function riskBadgeClass(value: "Low" | "Moderate" | "Elevated" | "High"): string {
  if (value === "High") return "bg-[hsl(var(--semantic-red)/0.16)] text-[hsl(var(--semantic-red))] border-[hsl(var(--semantic-red)/0.5)]";
  if (value === "Elevated") return "bg-[hsl(var(--semantic-amber)/0.16)] text-[hsl(var(--semantic-amber))] border-[hsl(var(--semantic-amber)/0.5)]";
  if (value === "Moderate") return "bg-[hsl(var(--semantic-blue)/0.16)] text-[hsl(var(--semantic-blue))] border-[hsl(var(--semantic-blue)/0.5)]";
  return "bg-[hsl(var(--semantic-green)/0.16)] text-[hsl(var(--semantic-green))] border-[hsl(var(--semantic-green)/0.5)]";
}

function riskProgressClass(value: "Low" | "Moderate" | "Elevated" | "High"): string {
  if (value === "High") return "bg-[hsl(var(--semantic-red))]";
  if (value === "Elevated") return "bg-[hsl(var(--semantic-amber))]";
  if (value === "Moderate") return "bg-[hsl(var(--semantic-blue))]";
  return "bg-[hsl(var(--semantic-green))]";
}

function alertToneClass(severity: "high" | "medium" | "info"): string {
  if (severity === "high") return "border-l-[hsl(var(--semantic-red))] border-[hsl(var(--semantic-red)/0.4)] bg-[hsl(var(--semantic-red)/0.1)]";
  if (severity === "medium") return "border-l-[hsl(var(--semantic-amber))] border-[hsl(var(--semantic-amber)/0.4)] bg-[hsl(var(--semantic-amber)/0.1)]";
  return "border-l-[hsl(var(--semantic-blue))] border-[hsl(var(--semantic-blue)/0.4)] bg-[hsl(var(--semantic-blue)/0.1)]";
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
    <div className="mx-auto w-full max-w-6xl space-y-3 bg-background px-3 py-3 text-foreground md:px-4" data-testid="page-case-dashboard">
      <header className="sticky top-14 z-20 rounded-md border border-border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-xl font-bold leading-tight">{data.case.title}</h1>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{data.case.caseType || "Case type not set"}</span>
              <Badge variant="secondary" className="h-5 border-border px-1.5 text-[10px]">{data.case.status}</Badge>
              <span>{data.case.stateCode || "State unknown"}{data.case.countyName ? ` • ${data.case.countyName}` : ""}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link href="/upload-document"><Button size="sm" className="h-8 bg-[hsl(var(--semantic-blue))] text-white hover:bg-[hsl(var(--semantic-blue)/0.9)]">Add Document</Button></Link>
            <Link href={`/ask?case=${data.case.id}`}><Button size="sm" variant="secondary" className="h-8 border-border">Ask Atlas</Button></Link>
          </div>
        </div>
      </header>

      <Card className="border border-[hsl(var(--semantic-blue)/0.35)] bg-gradient-to-br from-card via-card to-muted/60 shadow-lg shadow-[hsl(var(--semantic-blue)/0.1)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What Matters Now</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Stage</p>
            <p>{sentence(data.whatMattersNow.currentStage, "Case stage is still being established.")}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next Key Items</p>
            {data.whatMattersNow.nextKeyItems.length > 0 ? (
              <ul className="space-y-1">
                {data.whatMattersNow.nextKeyItems.slice(0, 3).map((item) => (
                  <li key={`${item.date}-${item.label}`} className="text-sm">
                    <p>{formatDate(item.date)} — {item.label}</p>
                    {item.whyThisMatters ? <p className="text-xs text-muted-foreground">{item.whyThisMatters}</p> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted-foreground">No upcoming key items.</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Watchouts</p>
            {data.whatMattersNow.watchouts.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {data.whatMattersNow.watchouts.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : <p className="text-muted-foreground">No active watchouts.</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested Focus</p>
            <div className="rounded-md border border-[rgba(59,130,246,0.20)] bg-[rgba(59,130,246,0.06)] px-2 py-1.5 text-foreground dark:border-[rgba(59,130,246,0.25)] dark:bg-[rgba(59,130,246,0.08)] dark:shadow-[inset_0_1px_0_rgba(147,197,253,0.08)]">
              <p className="flex items-start gap-1.5 font-medium">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgba(59,130,246,0.7)] dark:text-[rgba(147,197,253,0.72)]" aria-hidden="true" />
                <span>{sentence(data.whatMattersNow.suggestedFocus, "Add a core filing with court dates or filing obligations.")}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <Card>
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
                      {event.whyThisMatters ? <p className="pl-6 pt-0.5 text-xs text-muted-foreground">{event.whyThisMatters}</p> : null}
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
                      <Button size="sm" variant="ghost" className="h-7 px-0 text-xs text-muted-foreground">
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

          <Card>
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
                      <Badge variant="secondary" className="h-5 border-border px-1.5 text-[10px]">{doc.status}</Badge>
                      {doc.tags.slice(0, 3).map((tag) => <Badge key={tag} variant="outline" className="h-5 border-border px-1.5 text-[10px] text-muted-foreground">{tag}</Badge>)}
                    </div>
                  </div>
                  <Link href={`/document/${doc.id}`}><Button size="sm" variant="ghost" className="h-7 px-2">View</Button></Link>
                </div>
              ))}
              <div className="pt-1">
                <Link href="/upload-document"><Button size="sm" variant="outline" className="h-7">+ Add Document</Button></Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Case Health</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current posture</p>
                <p>{sentence(data.caseHealth.currentPosture, "Case posture is still being assessed.")}</p>
              </section>
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Urgency</p>
                <Badge variant="outline" className={urgencyBadgeClass(data.caseHealth.urgency)}>
                  {data.caseHealth.urgency}
                </Badge>
              </section>
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk level</p>
                <div className="space-y-2">
                  <Badge variant="outline" className={riskBadgeClass(data.caseHealth.riskLevel)}>
                    {data.caseHealth.riskLevel} ({data.caseHealth.riskScore}/100)
                  </Badge>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${riskProgressClass(data.caseHealth.riskLevel)}`}
                      style={{ width: `${Math.max(0, Math.min(100, data.caseHealth.riskScore))}%` }}
                    />
                  </div>
                </div>
              </section>
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document completeness</p>
                <Badge variant="outline" className={completenessBadgeClass(data.caseHealth.documentCompleteness)}>
                  {data.caseHealth.documentCompleteness}
                </Badge>
              </section>
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Immediate concern</p>
                <p>{sentence(data.caseHealth.immediateConcern, "No immediate concern identified.")}</p>
              </section>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Alerts</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.alerts.length > 0 ? data.alerts.map((alert) => (
                <div key={alert.id} className={`flex items-start gap-2 rounded border border-l-4 px-2 py-1.5 ${alertToneClass(alert.severity)}`}>
                  {alertIcon(alert.kind)}
                  <div className="space-y-1">
                    <p className="font-medium">{alert.title}</p>
                    <p>{alert.message}</p>
                    <p className="text-xs text-muted-foreground">{alert.impact}</p>
                    <p className="text-xs text-muted-foreground">Related: {alert.relatedItem}</p>
                    <p className="text-xs">{alert.recommendedAction}</p>
                    <Link href={alert.target.href}><Button size="sm" variant="outline" className="h-7">{alert.target.label}</Button></Link>
                  </div>
                </div>
              )) : (
                <div className="flex items-start gap-2 rounded border border-border px-2 py-1.5 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <p>No alerts require attention right now.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Ask Atlas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Ask about this case…" aria-label="Ask about this case" />
          <div className="flex flex-wrap gap-1.5">
            {suggestedPrompts.map((prompt) => (
              <Link key={prompt} href={`/ask?case=${data.case.id}&q=${encodeURIComponent(prompt)}`}>
                <Button variant="outline" size="sm" className="h-7 text-xs">{prompt}</Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <Card>
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
