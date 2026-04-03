import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, FileText, Sparkles, TriangleRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequestRaw } from "@/lib/queryClient";

type CaseRecord = {
  id: string;
  title: string;
  caseType?: string | null;
  status: string;
  jurisdictionState?: string | null;
  jurisdictionCounty?: string | null;
  stateCode?: string | null;
};

type CaseDocument = {
  id: string;
  fileName: string;
  createdAt: string;
  analysisJson: Record<string, unknown>;
};

type TimelineEvent = {
  id: string;
  dateRaw: string;
  label: string;
  source: string;
  isUpcoming: boolean;
  isOverdue: boolean;
  isNext: boolean;
};

type CaseAction = {
  id: number;
  actionType: string;
  actionData: { title?: string; description?: string; status?: string } | null;
  createdAt: string;
};

type CaseBrief = {
  currentSituation: string;
  recommendedNextActions: string[];
};

function toTitleCase(input: string | null | undefined): string {
  if (!input) return "Unknown";
  return input
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getDocumentFlags(doc: CaseDocument): string[] {
  const analysis = doc.analysisJson ?? {};
  const alerts = Array.isArray((analysis as any).document_alerts)
    ? (analysis as any).document_alerts.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  const implications = Array.isArray((analysis as any).possible_implications)
    ? (analysis as any).possible_implications.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
    : [];

  return [...alerts, ...implications].slice(0, 3);
}

function getDocumentStatus(doc: CaseDocument): string {
  const status = (doc.analysisJson as any)?.analysis_status;
  if (typeof status === "string" && status.trim()) return status;
  return "analyzed";
}

export default function CaseDashboardPage() {
  const { caseId } = useParams<{ caseId: string }>();

  const caseQuery = useQuery<{ case: CaseRecord }>({
    queryKey: ["/api/cases", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}`);
      if (!res.ok) throw new Error("Failed to load case.");
      return res.json();
    },
  });

  const docsQuery = useQuery<{ documents: CaseDocument[] }>({
    queryKey: ["/api/cases", caseId, "documents"],
    enabled: !!caseId,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/documents`);
      if (!res.ok) throw new Error("Failed to load case documents.");
      return res.json();
    },
  });

  const timelineQuery = useQuery<{ events: TimelineEvent[] }>({
    queryKey: ["/api/cases", caseId, "timeline"],
    enabled: !!caseId,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/timeline`);
      if (!res.ok) throw new Error("Failed to load case timeline.");
      return res.json();
    },
  });

  const actionsQuery = useQuery<{ actions: CaseAction[] }>({
    queryKey: ["/api/cases", caseId, "actions"],
    enabled: !!caseId,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/actions`);
      if (!res.ok) throw new Error("Failed to load case actions.");
      return res.json();
    },
  });

  const briefQuery = useQuery<CaseBrief>({
    queryKey: ["/api/workspace/case-brief", caseId],
    enabled: !!caseId,
    retry: false,
    queryFn: async () => {
      const res = await apiRequestRaw("POST", "/api/workspace/case-brief", { caseId });
      if (!res.ok) throw new Error("Case brief unavailable.");
      return res.json();
    },
  });

  const documents = docsQuery.data?.documents ?? [];
  const timelineEvents = timelineQuery.data?.events ?? [];
  const actions = actionsQuery.data?.actions ?? [];

  const whatMattersNow = useMemo(() => {
    const nextDeadlines = timelineEvents
      .filter((event) => event.isUpcoming || event.isNext)
      .slice(0, 3)
      .map((event) => `${event.dateRaw} — ${event.label}`);

    const overdueDeadlines = timelineEvents
      .filter((event) => event.isOverdue)
      .slice(0, 2)
      .map((event) => `Overdue: ${event.dateRaw} — ${event.label}`);

    const docRisks = documents
      .flatMap((doc) => getDocumentFlags(doc).map((flag) => `${doc.fileName}: ${flag}`))
      .slice(0, 3);

    const keyRisks = [...overdueDeadlines, ...docRisks].slice(0, 5);

    const openAction = actions.find((action) => (action.actionData?.status ?? "open") === "open");
    const recommendedNextAction = openAction?.actionData?.title
      ?? nextDeadlines[0]
      ?? "Analyze your next document to extract deadlines and court facts.";

    return { nextDeadlines, keyRisks, recommendedNextAction };
  }, [actions, documents, timelineEvents]);

  const caseRecord = caseQuery.data?.case;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6" data-testid="page-case-dashboard">
      <nav className="text-sm text-muted-foreground">
        <Link href="/workspace">Workspace</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Case Dashboard</span>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{caseRecord?.title ?? "Case"}</CardTitle>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">Type: {toTitleCase(caseRecord?.caseType)}</Badge>
            <Badge variant="secondary">Status: {toTitleCase(caseRecord?.status)}</Badge>
            <Badge variant="secondary">
              Jurisdiction: {caseRecord?.jurisdictionState ?? caseRecord?.stateCode ?? "Unknown"}
              {caseRecord?.jurisdictionCounty ? `, ${caseRecord.jurisdictionCounty}` : ""}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="w-4 h-4" />What Matters Now</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-medium mb-1">Next deadlines</p>
              {whatMattersNow.nextDeadlines.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1">
                  {whatMattersNow.nextDeadlines.map((deadline) => <li key={deadline}>{deadline}</li>)}
                </ul>
              ) : <p className="text-muted-foreground">No upcoming deadlines extracted yet.</p>}
            </div>

            <div>
              <p className="font-medium mb-1">Key risks</p>
              {whatMattersNow.keyRisks.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1">
                  {whatMattersNow.keyRisks.map((risk) => <li key={risk}>{risk}</li>)}
                </ul>
              ) : <p className="text-muted-foreground">No deterministic risk signals detected.</p>}
            </div>

            <div className="rounded-md border p-3 bg-muted/20">
              <p className="font-medium mb-1">Recommended next action</p>
              <p>{whatMattersNow.recommendedNextAction}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4" />Case Brief</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            {briefQuery.isSuccess ? (
              <>
                <p>{briefQuery.data.currentSituation}</p>
                {briefQuery.data.recommendedNextActions.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1">
                    {briefQuery.data.recommendedNextActions.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Brief unavailable until documents or case activity are present.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" />Documents</CardTitle>
          <Link href="/upload-document"><Button size="sm">Analyze new document</Button></Link>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {documents.length === 0 ? (
            <p className="text-muted-foreground">No documents linked to this case yet.</p>
          ) : documents.map((doc) => {
            const flags = getDocumentFlags(doc);
            return (
              <div key={doc.id} className="rounded-md border p-3 space-y-1">
                <p className="font-medium">{doc.fileName}</p>
                <p className="text-xs text-muted-foreground">Status: {toTitleCase(getDocumentStatus(doc))}</p>
                <p className="text-xs">Key flags: {flags.length > 0 ? flags.join(" • ") : "None"}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><TriangleRight className="w-4 h-4" />Case Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {timelineEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No timeline events extracted yet.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {timelineEvents.map((event) => (
                <li key={event.id} className="rounded-md border p-3">
                  <p className="font-medium">{event.dateRaw} — {event.label}</p>
                  <p className="text-xs text-muted-foreground">{event.source}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Ask Atlas</CardTitle>
        </CardHeader>
        <CardContent className="text-sm flex flex-wrap items-center gap-3">
          <p className="text-muted-foreground">Ask questions in case-aware mode. Atlas will be scoped to this case.</p>
          <Link href={`/ask-ai?case=${caseId}`}><Button size="sm" variant="secondary">Open Ask Atlas for this case</Button></Link>
        </CardContent>
      </Card>
    </div>
  );
}
