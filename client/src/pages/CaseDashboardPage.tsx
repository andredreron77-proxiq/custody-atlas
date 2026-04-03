import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, Clock3, FileWarning, FileText, Info, TriangleAlert } from "lucide-react";
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
    nextKeyItems: Array<{ date: string; label: string }>;
    watchouts: string[];
    suggestedFocus: string;
  };
  timeline: Array<{ id: string; date: string; label: string; type: "hearing" | "filing" | "deadline" | "order" | "report" | "allegation" | "mediation"; isPast: boolean; isUpcoming: boolean }>;
  timelineMeta?: { visibleCount: number; totalCount: number; hasMore: boolean };
  documents: Array<{ id: string; title: string; status: string; tags: string[] }>;
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
  if (kind === "missing_document") return <FileWarning className="h-4 w-4 text-amber-600" />;
  if (kind === "overdue") return <TriangleAlert className="h-4 w-4 text-red-600" />;
  if (kind === "analysis_missing") return <FileText className="h-4 w-4 text-indigo-600" />;
  if (kind === "timeline_gap") return <Clock3 className="h-4 w-4 text-blue-600" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
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
    "What is my highest-priority next step?",
    "What deadline carries the most risk right now?",
    "What document should I add next for this case?",
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
    <div className="mx-auto w-full max-w-6xl space-y-3 px-3 py-3 md:px-4" data-testid="page-case-dashboard">
      <header className="sticky top-14 z-20 rounded-md border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-xl font-bold leading-tight">{data.case.title}</h1>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{data.case.caseType || "Case type not set"}</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{data.case.status}</Badge>
              <span>{data.case.stateCode || "State unknown"}{data.case.countyName ? ` • ${data.case.countyName}` : ""}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link href="/upload-document"><Button size="sm" className="h-8">Add Document</Button></Link>
            <Link href={`/ask?case=${data.case.id}`}><Button size="sm" variant="secondary" className="h-8">Ask Atlas</Button></Link>
          </div>
        </div>
      </header>

      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What Matters Now</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Stage</p>
            <p>{sentence(data.whatMattersNow.currentStage, "Case stage not yet established from available evidence.")}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next Key Items</p>
            {data.whatMattersNow.nextKeyItems.length > 0 ? (
              <ul className="space-y-1">
                {data.whatMattersNow.nextKeyItems.slice(0, 3).map((item) => (
                  <li key={`${item.date}-${item.label}`} className="text-sm">{formatDate(item.date)} — {item.label}</li>
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
            <p className="rounded-md bg-primary/10 px-2 py-1.5 font-medium">{sentence(data.whatMattersNow.suggestedFocus, "Focus on adding a document with court dates or filing obligations.")}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Timeline Card</CardTitle>
            </CardHeader>
            <CardContent id="timeline">
              {data.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timeline events available for this case.</p>
              ) : (
                <>
                <ol className="space-y-1.5 text-sm">
                  {(showFullTimeline ? data.timeline : data.timeline.slice(0, data.timelineMeta?.visibleCount ?? 8)).map((event) => (
                    <li key={event.id} className={`flex items-center justify-between rounded border px-2 py-1.5 ${event.isUpcoming ? "border-primary/40 bg-primary/5" : "border-border text-muted-foreground"}`}>
                      <span>{formatDate(event.date)}</span>
                      <span className="truncate pl-2 text-right">{event.label}</span>
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
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Documents Card</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents linked to this case.</p>
              ) : data.documents.map((doc) => (
                <div key={doc.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{doc.status}</Badge>
                      {doc.tags.slice(0, 3).map((tag) => <Badge key={tag} variant="outline" className="h-5 px-1.5 text-[10px]">{tag}</Badge>)}
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
            <CardHeader className="pb-2"><CardTitle className="text-base">Case Snapshot Card</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Situation</p>
                <p>{sentence(data.snapshot.currentSituation, "Current situation has not been synthesized yet.")}</p>
              </section>
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key Points</p>
                {data.snapshot.keyPoints.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {data.snapshot.keyPoints.slice(0, 4).map((point) => <li key={point}>{point}</li>)}
                  </ul>
                ) : <p className="text-muted-foreground">No key points available.</p>}
              </section>
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Things to Watch</p>
                {data.snapshot.thingsToWatch.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {data.snapshot.thingsToWatch.slice(0, 3).map((point) => <li key={point}>{point}</li>)}
                  </ul>
                ) : <p className="text-muted-foreground">No active watch items.</p>}
              </section>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Alerts Card</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.alerts.length > 0 ? data.alerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-2 rounded border px-2 py-1.5">
                  {alertIcon(alert.kind)}
                  <div className="space-y-1">
                    <p className="font-medium">{alert.title}</p>
                    <p>{alert.message}</p>
                    <p className="text-xs text-muted-foreground">Related: {alert.relatedItem}</p>
                    <p className="text-xs">{alert.recommendedAction}</p>
                    <Link href={alert.target.href}><Button size="sm" variant="outline" className="h-7">{alert.target.label}</Button></Link>
                  </div>
                </div>
              )) : (
                <div className="flex items-start gap-2 rounded border px-2 py-1.5 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <p>No active alerts right now.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Ask Atlas Panel</CardTitle></CardHeader>
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
