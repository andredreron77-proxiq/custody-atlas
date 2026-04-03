import { useMemo } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Clock3,
  FileText,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequestRaw } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface CaseRecord {
  id: string;
  title: string;
  description: string | null;
  status: string;
}

interface CaseFactItem {
  id: number;
  factType: string;
  value: string;
}

interface CaseActionItem {
  id: number;
  title: string;
  description: string;
  status: "open" | "completed" | "dismissed";
  urgency: "overdue" | "urgent" | "soon" | "normal";
}

interface TimelineEvent {
  id: string;
  dateRaw: string;
  label: string;
  source: string;
  isPast: boolean;
  isUpcoming: boolean;
  isNext: boolean;
  isOverdue: boolean;
}

interface CaseDocument {
  id: string;
  fileName: string;
  docType: string;
  createdAt: string;
  analysisJson: Record<string, unknown>;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  closed: "Closed",
  on_hold: "On hold",
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getRiskSignals({
  actions,
  timeline,
  documents,
}: {
  actions: CaseActionItem[];
  timeline: TimelineEvent[];
  documents: CaseDocument[];
}): string[] {
  const risks: string[] = [];

  const urgentOpen = actions.find((action) => action.status === "open" && (action.urgency === "overdue" || action.urgency === "urgent"));
  if (urgentOpen) {
    risks.push(`Urgent task pending: ${urgentOpen.title}`);
  }

  const deadlineRisk = timeline.find((event) => event.isOverdue || event.isNext);
  if (deadlineRisk) {
    const timing = deadlineRisk.isOverdue ? "missed" : "approaching";
    risks.push(`${timing === "missed" ? "Missed" : "Upcoming"} deadline: ${deadlineRisk.label} (${deadlineRisk.dateRaw})`);
  }

  const implicationRisk = documents
    .flatMap((doc) => (Array.isArray(doc.analysisJson?.possible_implications)
      ? (doc.analysisJson.possible_implications as string[])
      : []))
    .find((item) => /risk|violation|penalt|non-?compli|default|contempt/i.test(item));

  if (implicationRisk) {
    risks.push(implicationRisk);
  }

  return risks.slice(0, 2);
}

export default function CaseDashboardPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [, navigate] = useLocation();

  const { data: caseData, isLoading: caseLoading } = useQuery<{ case: CaseRecord }>({
    queryKey: ["/api/cases", caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}`);
      if (!res.ok) throw new Error("Failed to load case");
      return res.json();
    },
  });

  const { data: casesData } = useQuery<{ cases: Array<{ id: string; title: string }> }>({
    queryKey: ["/api/cases"],
    staleTime: 30_000,
  });

  const { data: actionsData } = useQuery<{ actions: CaseActionItem[] }>({
    queryKey: ["/api/cases", caseId, "actions"],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/actions`);
      if (!res.ok) return { actions: [] };
      return res.json();
    },
  });

  const { data: factsData } = useQuery<{ facts: CaseFactItem[] }>({
    queryKey: ["/api/cases", caseId, "facts"],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/facts`);
      if (!res.ok) return { facts: [] };
      return res.json();
    },
  });

  const { data: timelineData } = useQuery<{ timeline: TimelineEvent[] }>({
    queryKey: ["/api/cases", caseId, "timeline"],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/timeline`);
      if (!res.ok) return { timeline: [] };
      return res.json();
    },
  });

  const { data: documentsData } = useQuery<{ documents: CaseDocument[] }>({
    queryKey: ["/api/cases", caseId, "documents"],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/documents`);
      if (!res.ok) return { documents: [] };
      return res.json();
    },
  });

  const caseRecord = caseData?.case;
  const actions = actionsData?.actions ?? [];
  const facts = factsData?.facts ?? [];
  const timeline = timelineData?.timeline ?? [];
  const documents = documentsData?.documents ?? [];

  const upcomingDeadlines = useMemo(
    () => timeline.filter((event) => event.isUpcoming).slice(0, 2),
    [timeline],
  );
  const openActions = useMemo(() => actions.filter((action) => action.status === "open"), [actions]);
  const topRiskItems = useMemo(() => getRiskSignals({ actions, timeline, documents }), [actions, timeline, documents]);

  const recommendedAction =
    openActions.find((action) => action.urgency === "overdue" || action.urgency === "urgent")?.title
    ?? upcomingDeadlines[0]?.label
    ?? "Ask Atlas what to prepare next for this case";

  const hearingFact = facts.find((fact) => fact.factType === "hearing_date")?.value;
  const snapshot = `${documents.length} document${documents.length === 1 ? "" : "s"} linked, ${openActions.length} open action${openActions.length === 1 ? "" : "s"}.`
    + `${hearingFact ? ` Next hearing recorded for ${hearingFact}.` : " No hearing date has been confirmed yet."}`;

  const askHref = `/ask?case=${encodeURIComponent(caseId ?? "")}`;

  if (caseLoading || !caseRecord) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-sm text-muted-foreground">Loading case dashboard…</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6" data-testid="page-case-dashboard">
      <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
        <Link href="/workspace">
          <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Workspace</span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
        <span className="text-foreground font-medium truncate">{caseRecord.title}</span>
      </nav>

      <header className="rounded-xl border bg-card px-4 py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="heading-case-name">{caseRecord.title}</h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="outline">{STATUS_LABELS[caseRecord.status] ?? caseRecord.status}</Badge>
              <span className="text-xs text-muted-foreground">Case dashboard</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={caseRecord.id}
              onValueChange={(nextCaseId) => navigate(`/case/${nextCaseId}`)}
            >
              <SelectTrigger className="w-[220px] h-8" data-testid="select-case-dashboard-nav">
                <SelectValue placeholder="Switch case" />
              </SelectTrigger>
              <SelectContent>
                {(casesData?.cases ?? []).map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>{entry.title || "Untitled Case"}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Link href="/workspace">
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />
                Workspace
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border bg-card p-4 space-y-3" data-testid="section-what-matters-now">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">What Matters Now</h2>
          <ul className="space-y-2 text-sm">
            <li><span className="font-medium">Current status:</span> {STATUS_LABELS[caseRecord.status] ?? caseRecord.status}</li>
            <li>
              <span className="font-medium">Next deadlines:</span>{" "}
              {upcomingDeadlines.length > 0
                ? upcomingDeadlines.map((event) => `${event.dateRaw} — ${event.label}`).join(" • ")
                : "No upcoming deadlines extracted yet."}
            </li>
            <li><span className="font-medium">Top risk:</span> {topRiskItems[0] ?? "No urgent risk signal detected."}</li>
            <li><span className="font-medium">Recommended next action:</span> {recommendedAction}</li>
          </ul>
        </article>

        <article className="rounded-xl border bg-card p-4 space-y-3" data-testid="section-case-snapshot">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Case Snapshot</h2>
          <p className="text-sm leading-6 text-muted-foreground">{snapshot}</p>
        </article>
      </section>

      <section className="rounded-xl border bg-card p-4 space-y-4" data-testid="section-timeline">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary/80" />
          <h2 className="font-semibold">Timeline</h2>
        </div>

        <div className="space-y-3">
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No timeline events yet.</p>
          ) : timeline.map((event) => (
            <div key={event.id} className={cn(
              "rounded-lg border px-3 py-2",
              event.isPast ? "bg-muted/30 border-border" : "bg-primary/5 border-primary/20",
            )}>
              <div className="flex items-start gap-2">
                <Clock3 className={cn("w-4 h-4 mt-0.5", event.isPast ? "text-muted-foreground" : "text-primary")} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{event.label}</p>
                  <p className="text-xs text-muted-foreground">{event.dateRaw} · {event.source}</p>
                </div>
                <Badge variant={event.isPast ? "secondary" : "default"} className="ml-auto">
                  {event.isPast ? "Completed" : "Upcoming"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border bg-card p-4 space-y-3" data-testid="section-risks">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <h2 className="font-semibold">Risks / Watch Items</h2>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {(topRiskItems.length > 0 ? topRiskItems : ["No active watch items right now."]).map((risk) => (
              <li key={risk} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-600" />
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-xl border bg-card p-4 space-y-3" data-testid="section-ask-atlas-case-aware">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary/80" />
            <h2 className="font-semibold">Ask Atlas</h2>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Case-aware</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Atlas answers on this page are scoped to <span className="font-medium text-foreground">{caseRecord.title}</span> and the documents linked to this case.
          </p>
          <Link href={askHref}>
            <Button size="sm" className="gap-1.5" data-testid="button-ask-atlas-case-context">
              <MessageSquare className="w-3.5 h-3.5" />
              Ask about this case
            </Button>
          </Link>
        </article>
      </section>

      <section className="rounded-xl border bg-card p-4 space-y-3" data-testid="section-case-documents">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary/80" />
          <h2 className="font-semibold">Documents</h2>
          <Badge variant="outline">{documents.length}</Badge>
        </div>

        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents linked to this case yet.</p>
        ) : (
          <ul className="divide-y">
            {documents.map((document) => (
              <li key={document.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{document.fileName}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(document.createdAt)} · {document.docType}</p>
                </div>
                <Link href={`/document/${document.id}`}>
                  <Button size="sm" variant="outline">Open</Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
