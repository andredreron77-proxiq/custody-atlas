import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ChevronDown, ChevronUp, Clock3, FileWarning, FileText, Gavel, Info, Lightbulb, Scale, TriangleAlert } from "lucide-react";
import CaseStrengthScore from "@/components/CaseStrengthScore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, apiRequestRaw, queryClient } from "@/lib/queryClient";
import { generateSuggestedFocus } from "@/lib/suggestedFocus";

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
    documentCompleteness: "Strong" | "Partial" | "Needs review" | "Not yet uploaded";
    immediateConcern: string;
  };
  snapshotMemory: {
    top_concern?: string | null;
    reason_for_more_time?: string | null;
    primary_concern?: string | null;
    opposing_request?: string | null;
    concern_category?: string | null;
    actions?: string[];
    hearing_date?: string | null;
    hearing_type?: string | null;
    savedAt?: string | null;
  } | null;
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
    kind: "missing_document" | "overdue_event" | "upcoming_deadline" | "conflict_detected" | "incomplete_case";
    title: string;
    message: string;
    impact: string;
    severity: "high" | "medium" | "info";
    state: "active" | "reviewed" | "resolved" | "dismissed" | "reopened";
    relatedItem: string;
    recommendedAction: string;
    allowedActions: Array<{ id: string; label: string }>;
    suggestedResolution?: { confidence: "medium"; prompt: string } | null;
    resolution?: {
      resolvedByDocumentId?: string | null;
      resolvedByEventId?: string | null;
      resolvedByUserId?: string | null;
      resolutionMethod?: "document" | "event" | "user" | "inferred" | null;
      resolutionNote?: string | null;
    } | null;
    target: { label: string; href: string; section: "timeline" | "document" | "add_document" | "ask_atlas" };
  }>;
};

type IntelligenceSeverity = "low" | "medium" | "high";
type IntelligenceDateKind = "hearing" | "deadline" | "filing" | "service" | "appointment" | "child_birthdate" | "other";

type CaseIntelligencePayload = {
  intelligence: {
    what_matters_now_json?: unknown;
    risks_json?: unknown;
    actions_json?: unknown;
    key_dates_json?: unknown;
  } | null;
};

type IntelligenceWhatMattersNow = {
  top_priority: string;
  reason: string;
  urgency: string;
};

type IntelligenceRisk = {
  id: string;
  title: string;
  description: string;
  severity: IntelligenceSeverity;
};

type IntelligenceAction = {
  risk_id: string;
  action: string;
};

type IntelligenceKeyDate = {
  raw: string;
  parsedDate: string | null;
  kind: IntelligenceDateKind;
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
  if (kind === "overdue_event") return <TriangleAlert className="h-4 w-4 text-[hsl(var(--semantic-red))]" />;
  if (kind === "upcoming_deadline") return <Clock3 className="h-4 w-4 text-[hsl(var(--semantic-blue))]" />;
  if (kind === "conflict_detected") return <AlertTriangle className="h-4 w-4 text-[hsl(var(--semantic-red))]" />;
  if (kind === "incomplete_case") return <FileText className="h-4 w-4 text-[hsl(var(--semantic-blue))]" />;
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

function completenessBadgeClass(value: "Strong" | "Partial" | "Needs review" | "Not yet uploaded"): string {
  if (value === "Needs review") return "bg-[hsl(var(--semantic-red)/0.16)] text-[hsl(var(--semantic-red))] border-[hsl(var(--semantic-red)/0.5)]";
  if (value === "Not yet uploaded") return "bg-[hsl(var(--semantic-blue)/0.16)] text-[hsl(var(--semantic-blue))] border-[hsl(var(--semantic-blue)/0.5)]";
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

function alertStateBadgeClass(state: "active" | "reviewed" | "resolved" | "dismissed" | "reopened"): string {
  if (state === "resolved") return "bg-[hsl(var(--semantic-green)/0.16)] text-[hsl(var(--semantic-green))] border-[hsl(var(--semantic-green)/0.5)]";
  if (state === "reviewed") return "bg-[hsl(var(--semantic-blue)/0.16)] text-[hsl(var(--semantic-blue))] border-[hsl(var(--semantic-blue)/0.5)]";
  if (state === "reopened") return "bg-[hsl(var(--semantic-amber)/0.16)] text-[hsl(var(--semantic-amber))] border-[hsl(var(--semantic-amber)/0.5)]";
  if (state === "dismissed") return "bg-muted text-muted-foreground border-border";
  return "bg-[hsl(var(--semantic-red)/0.16)] text-[hsl(var(--semantic-red))] border-[hsl(var(--semantic-red)/0.5)]";
}

function intelligenceUrgencyBadgeClass(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high") return "bg-[hsl(var(--semantic-red)/0.16)] text-[hsl(var(--semantic-red))] border-[hsl(var(--semantic-red)/0.5)]";
  if (normalized === "medium") return "bg-[hsl(var(--semantic-amber)/0.16)] text-[hsl(var(--semantic-amber))] border-[hsl(var(--semantic-amber)/0.5)]";
  return "bg-[hsl(var(--semantic-blue)/0.16)] text-[hsl(var(--semantic-blue))] border-[hsl(var(--semantic-blue)/0.5)]";
}

function intelligenceSeverityBadgeClass(value: IntelligenceSeverity): string {
  if (value === "high") return "bg-[hsl(var(--semantic-red)/0.16)] text-[hsl(var(--semantic-red))] border-[hsl(var(--semantic-red)/0.5)]";
  if (value === "medium") return "bg-[hsl(var(--semantic-amber)/0.16)] text-[hsl(var(--semantic-amber))] border-[hsl(var(--semantic-amber)/0.5)]";
  return "bg-[hsl(var(--semantic-green)/0.16)] text-[hsl(var(--semantic-green))] border-[hsl(var(--semantic-green)/0.5)]";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatSnapshotHearingType(value?: string | null): string {
  const labels: Record<string, string> = {
    temporary_custody: "Temporary custody",
    final: "Final hearing",
    status_conference: "Status conference",
    modification: "Modification hearing",
    contempt: "Contempt hearing",
    ex_parte: "Emergency hearing",
    mediation: "Mediation",
    unknown: "Hearing type not specified",
  };

  if (!value) return "";
  return labels[value] ?? value.replace(/_/g, " ");
}

export default function CaseDashboardPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [showFullTimeline, setShowFullTimeline] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [showAskAtlasPanel, setShowAskAtlasPanel] = useState(false);
  const [askAtlasQuestion, setAskAtlasQuestion] = useState("");
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const alertRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const dashboardQuery = useQuery<CaseDashboardPayload>({
    queryKey: ["/api/cases", caseId, "dashboard"],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/dashboard`);
      if (!res.ok) throw new Error("Failed to load case dashboard.");
      return res.json();
    },
  });
  const intelligenceQuery = useQuery<CaseIntelligencePayload>({
    queryKey: ["/api/cases", caseId, "intelligence"],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const res = await apiRequestRaw("POST", `/api/cases/${caseId}/intelligence`);
      if (!res.ok) throw new Error("Failed to load case intelligence.");
      return res.json();
    },
  });

  const data = dashboardQuery.data;
  const intelligenceRecord = intelligenceQuery.data?.intelligence;
  const intelligenceWhatMatters = useMemo<IntelligenceWhatMattersNow | null>(() => {
    if (!intelligenceRecord || !isRecord(intelligenceRecord.what_matters_now_json)) return null;
    const source = intelligenceRecord.what_matters_now_json;
    return {
      top_priority: typeof source.top_priority === "string" ? source.top_priority.trim() : "",
      reason: typeof source.reason === "string" ? source.reason.trim() : "",
      urgency: typeof source.urgency === "string" ? source.urgency.trim() : "Medium",
    };
  }, [intelligenceRecord]);
  const snapshotConcernFallback = useMemo(() => {
    const topConcern =
      (typeof data?.snapshotMemory?.top_concern === "string" ? data.snapshotMemory.top_concern.trim() : "")
      || (typeof data?.snapshotMemory?.reason_for_more_time === "string" ? data.snapshotMemory.reason_for_more_time.trim() : "")
      || (typeof data?.snapshotMemory?.primary_concern === "string" ? data.snapshotMemory.primary_concern.trim() : "")
      || (typeof data?.snapshotMemory?.opposing_request === "string" ? data.snapshotMemory.opposing_request.trim() : "");
    if (!topConcern) return null;
    const category = typeof data?.snapshotMemory?.concern_category === "string"
      ? data.snapshotMemory.concern_category
      : null;
    const urgency = category === "safety"
      ? "High"
      : category === "fairness_fear" || category === "resource_gap"
        ? "Medium"
        : "Low";
    return {
      top_priority: topConcern,
      reason: "Based on your conversation with Atlas.",
      urgency,
    };
  }, [data?.snapshotMemory]);
  const intelligenceRisks = useMemo<IntelligenceRisk[]>(() => {
    if (!intelligenceRecord || !Array.isArray(intelligenceRecord.risks_json)) return [];
    return intelligenceRecord.risks_json
      .filter(isRecord)
      .map((risk, index): IntelligenceRisk => {
        const severityRaw = typeof risk.severity === "string" ? risk.severity.trim().toLowerCase() : "low";
        const severity: IntelligenceSeverity = severityRaw === "high" || severityRaw === "medium" || severityRaw === "low" ? severityRaw : "low";
        return {
          id: typeof risk.id === "string" ? risk.id : `risk-${index}`,
          title: typeof risk.title === "string" ? risk.title.trim() : "Untitled risk",
          description: typeof risk.description === "string" ? risk.description.trim() : "",
          severity,
        };
      })
      .filter((risk) => risk.title)
      .slice(0, 3);
  }, [intelligenceRecord]);
  const intelligenceActions = useMemo<IntelligenceAction[]>(() => {
    if (!intelligenceRecord || !Array.isArray(intelligenceRecord.actions_json)) return [];
    return intelligenceRecord.actions_json
      .filter(isRecord)
      .map((action, index) => ({
        risk_id: typeof action.risk_id === "string" ? action.risk_id : `action-${index}`,
        action: typeof action.action === "string" ? action.action.trim() : "",
      }))
      .filter((action) => action.action)
      .slice(0, 4);
  }, [intelligenceRecord]);
  const snapshotActions = useMemo(() => (
    Array.isArray(data?.snapshotMemory?.actions)
      ? data.snapshotMemory.actions.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
      : []
  ), [data?.snapshotMemory]);
  const intelligenceKeyDates = useMemo<IntelligenceKeyDate[]>(() => {
    if (!intelligenceRecord || !Array.isArray(intelligenceRecord.key_dates_json)) return [];
    const kindPriority: IntelligenceDateKind[] = ["hearing", "deadline", "filing", "service", "appointment"];
    const acceptedKinds = new Set(kindPriority);
    const filtered = intelligenceRecord.key_dates_json
      .filter(isRecord)
      .map((entry) => {
        const kindValue = typeof entry.kind === "string" ? entry.kind.trim().toLowerCase() : "other";
        const kind: IntelligenceDateKind = kindValue === "hearing"
          || kindValue === "deadline"
          || kindValue === "filing"
          || kindValue === "service"
          || kindValue === "appointment"
          || kindValue === "child_birthdate"
          ? kindValue
          : "other";
        return {
          raw: typeof entry.raw === "string" ? entry.raw.trim() : "",
          parsedDate: typeof entry.parsedDate === "string" ? entry.parsedDate : null,
          kind,
        };
      })
      .filter((entry) => entry.raw && acceptedKinds.has(entry.kind));

    return filtered
      .sort((a, b) => {
        const kindRank = kindPriority.indexOf(a.kind) - kindPriority.indexOf(b.kind);
        if (kindRank !== 0) return kindRank;
        return (Date.parse(a.parsedDate ?? "") || Number.MAX_SAFE_INTEGER) - (Date.parse(b.parsedDate ?? "") || Number.MAX_SAFE_INTEGER);
      })
      .slice(0, 5);
  }, [intelligenceRecord]);
  const snapshotKeyDate = useMemo(() => {
    const raw = typeof data?.snapshotMemory?.hearing_date === "string" ? data.snapshotMemory.hearing_date : "";
    if (!raw) return null;
    return {
      raw,
      kindLabel: "Hearing Date",
      subLabel: formatSnapshotHearingType(typeof data?.snapshotMemory?.hearing_type === "string" ? data.snapshotMemory.hearing_type : null),
      parsedDate: raw,
    };
  }, [data?.snapshotMemory]);

  const alertActionMutation = useMutation({
    mutationFn: async (payload: { alertId: string; actionId: string; confirmSuggested?: boolean }) => {
      await apiRequest("POST", `/api/cases/${caseId}/alerts/${payload.alertId}/actions`, {
        actionId: payload.actionId,
        confirmSuggested: payload.confirmSuggested ?? false,
        resolutionNote: resolutionNotes[payload.alertId]?.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/cases", caseId, "dashboard"] });
    },
  });

  const suggestedPrompts = useMemo(() => [
    "What should I handle next?",
    "Which deadline needs attention first?",
    "What document should I upload next?",
  ], []);

  const submitAskAtlasQuestion = (question?: string) => {
    if (!caseId) return;
    const params = new URLSearchParams({ case: caseId });
    const trimmedQuestion = question?.trim();
    if (trimmedQuestion) {
      params.set("q", trimmedQuestion);
    }
    navigate(`/ask?${params.toString()}`);
  };

  const handleAskAtlasSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitAskAtlasQuestion(askAtlasQuestion);
  };

  const handleAskAtlasKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitAskAtlasQuestion(askAtlasQuestion);
  };

  const suggestedFocus = useMemo(() => {
    if (!data) return null;
    const upcomingHearingDays = data.timeline
      .filter((item) => item.type === "hearing")
      .map((item) => new Date(item.date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      .filter((days) => days >= 0)
      .sort((a, b) => a - b)[0] ?? null;
    const upcomingDeadlineDays = data.timeline
      .filter((item) => item.type === "deadline")
      .map((item) => new Date(item.date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      .filter((days) => days >= 0)
      .sort((a, b) => a - b)[0] ?? null;

    return generateSuggestedFocus({
      alerts: data.alerts,
      riskScore: data.caseHealth.riskScore,
      immediateConcern: data.caseHealth.immediateConcern,
      hearingDaysUntil: upcomingHearingDays,
      deadlineDaysUntil: upcomingDeadlineDays,
      documentCompleteness: data.caseHealth.documentCompleteness,
      timeline: data.timeline,
    });
  }, [data]);

  const handleSuggestedAction = () => {
    if (!suggestedFocus) return;
    if (suggestedFocus.actionType === "navigate") {
      document.getElementById(suggestedFocus.actionTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (suggestedFocus.actionType === "upload") {
      setShowUploadModal(true);
      return;
    }
    if (suggestedFocus.actionType === "create_event") {
      setShowCreateEventModal(true);
      return;
    }
    if (suggestedFocus.actionType === "ask_atlas") {
      setShowAskAtlasPanel(true);
      return;
    }
    if (suggestedFocus.actionType === "review_alert") {
      if (suggestedFocus.actionTarget === "overdue_item") {
        document.getElementById("timeline")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const node = alertRefs.current[suggestedFocus.actionTarget];
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        node.focus();
      }
    }
  };

  const suggestedFocusLabel = useMemo(() => {
    if (!suggestedFocus) return "Open";
    if (suggestedFocus.actionType === "navigate") return "Go to section";
    if (suggestedFocus.actionType === "upload") return "Upload document";
    if (suggestedFocus.actionType === "create_event") return "Create event";
    if (suggestedFocus.actionType === "ask_atlas") return "Ask Atlas";
    if (suggestedFocus.actionTarget === "overdue_item") return "Review overdue item";
    return "Review alert";
  }, [suggestedFocus]);

  const handleCreateEventSubmit = (event: FormEvent) => {
    event.preventDefault();
    setShowCreateEventModal(false);
    setNewEventTitle("");
    setNewEventDate("");
  };

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

      <Card className="border border-[hsl(var(--semantic-blue)/0.35)] bg-gradient-to-br from-card via-card to-muted/60 shadow-lg shadow-[hsl(var(--semantic-blue)/0.1)]" data-testid="section-what-matters-now">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What Matters Now</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-md border border-[hsl(var(--semantic-blue)/0.25)] bg-[hsl(var(--semantic-blue)/0.08)] p-3 md:col-span-2">
            {intelligenceQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading case intelligence…</p>
            ) : (intelligenceWhatMatters && intelligenceWhatMatters.top_priority) || snapshotConcernFallback ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold">{(intelligenceWhatMatters ?? snapshotConcernFallback)!.top_priority}</p>
                  <Badge variant="outline" className={intelligenceUrgencyBadgeClass((intelligenceWhatMatters ?? snapshotConcernFallback)!.urgency)}>
                    {(intelligenceWhatMatters ?? snapshotConcernFallback)!.urgency || "Medium"} urgency
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {sentence((intelligenceWhatMatters ?? snapshotConcernFallback)!.reason, "No clear reason is available yet.")}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Intelligence is not available for this case yet. Add or analyze documents to improve guidance.
              </p>
            )}
          </div>
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
                <span className="font-semibold">{suggestedFocus?.title ?? sentence(data.whatMattersNow.suggestedFocus, "Add a core filing with court dates or filing obligations.")}</span>
              </p>
              <p className="pl-5 text-sm text-muted-foreground">{suggestedFocus?.description ?? "Review your current case signals to prioritize your next action."}</p>
              <Button size="sm" className="mt-2 h-7" onClick={handleSuggestedAction}>{suggestedFocusLabel}</Button>
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
          <CaseStrengthScore caseId={data.case.id} />

          <Card data-testid="section-top-risks">
            <CardHeader className="pb-2"><CardTitle className="text-base">Top Risks</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {intelligenceRisks.length > 0 ? intelligenceRisks.map((risk) => (
                <div key={risk.id} className="space-y-1 rounded border border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{risk.title}</p>
                    <Badge variant="outline" className={intelligenceSeverityBadgeClass(risk.severity)}>
                      {risk.severity}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">{sentence(risk.description, "No additional detail was provided.")}</p>
                </div>
              )) : (
                <p className="text-muted-foreground">No major risks are flagged right now.</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="section-recommended-actions">
            <CardHeader className="pb-2"><CardTitle className="text-base">Recommended Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {intelligenceActions.length > 0 || snapshotActions.length > 0 ? (
                <>
                  {intelligenceActions.length === 0 && snapshotActions.length > 0 ? (
                    <p className="text-xs font-medium text-muted-foreground">Based on your conversation with Atlas</p>
                  ) : null}
                  <ul className="space-y-1.5">
                    {(intelligenceActions.length > 0 ? intelligenceActions : snapshotActions.map((action, index) => ({ risk_id: `snapshot-${index}`, action }))).map((action) => (
                    <li key={action.risk_id} className="rounded border border-border bg-muted/40 px-2 py-1.5">
                      {action.action}
                    </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-muted-foreground">No recommended actions yet. Intelligence will update as more case details are available.</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="section-key-dates">
            <CardHeader className="pb-2"><CardTitle className="text-base">Key Dates</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {intelligenceKeyDates.length > 0 || snapshotKeyDate ? (
                <ul className="space-y-1.5">
                  {(intelligenceKeyDates.length > 0 ? intelligenceKeyDates : [snapshotKeyDate!]).map((date, index) => (
                    <li key={`${date.raw}-${index}`} className="flex items-start justify-between gap-2 rounded border border-border px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate">{date.raw}</p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {"kind" in date ? date.kind : date.kindLabel}
                          {"subLabel" in date && date.subLabel ? ` • ${date.subLabel}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {date.parsedDate ? formatDate(date.parsedDate) : "Date TBD"}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No high-priority dates are available yet.</p>
              )}
            </CardContent>
          </Card>

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
            <CardContent id="alerts" className="space-y-2 text-sm">
              {data.alerts.length > 0 ? data.alerts.map((alert) => (
                <div
                  key={alert.id}
                  id={`alert-${alert.id}`}
                  ref={(node) => { alertRefs.current[alert.id] = node; }}
                  tabIndex={-1}
                  className={`flex items-start gap-2 rounded border border-l-4 px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${alertToneClass(alert.severity)}`}
                >
                  {alertIcon(alert.kind)}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{alert.title}</p>
                      <Badge variant="outline" className={alertStateBadgeClass(alert.state)}>{alert.state.replace("_", " ")}</Badge>
                    </div>
                    <p>{alert.message}</p>
                    <p className="text-xs text-muted-foreground">{alert.impact}</p>
                    <p className="text-xs text-muted-foreground">Related: {alert.relatedItem}</p>
                    <p className="text-xs">{alert.recommendedAction}</p>
                    {alert.suggestedResolution?.confidence === "medium" ? (
                      <div className="rounded border border-[hsl(var(--semantic-amber)/0.5)] bg-[hsl(var(--semantic-amber)/0.1)] p-2 text-xs">
                        <p className="mb-1">{alert.suggestedResolution.prompt}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={alertActionMutation.isPending}
                          onClick={() => alertActionMutation.mutate({ alertId: alert.id, actionId: "mark_resolved", confirmSuggested: true })}
                        >
                          Confirm resolution
                        </Button>
                      </div>
                    ) : null}
                    <Textarea
                      placeholder="Optional resolution note…"
                      value={resolutionNotes[alert.id] ?? ""}
                      onChange={(event) => setResolutionNotes((prev) => ({ ...prev, [alert.id]: event.target.value }))}
                      className="min-h-[64px] text-xs"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {alert.allowedActions.map((action) => (
                        <Button
                          key={action.id}
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={alertActionMutation.isPending}
                          onClick={() => alertActionMutation.mutate({ alertId: alert.id, actionId: action.id })}
                        >
                          {action.label}
                        </Button>
                      ))}
                      {alert.state !== "active" && alert.state !== "reopened" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          disabled={alertActionMutation.isPending}
                          onClick={() => alertActionMutation.mutate({ alertId: alert.id, actionId: "reopen" })}
                        >
                          Reopen
                        </Button>
                      ) : null}
                      <Link href={alert.target.href}><Button size="sm" variant="secondary" className="h-7">{alert.target.label}</Button></Link>
                    </div>
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
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleAskAtlasSubmit}>
            <Input
              placeholder="Ask about this case…"
              aria-label="Ask about this case"
              value={askAtlasQuestion}
              onChange={(event) => setAskAtlasQuestion(event.target.value)}
              onKeyDown={handleAskAtlasKeyDown}
            />
            <Button type="submit" disabled={!askAtlasQuestion.trim()} className="sm:self-start">
              Ask Atlas
            </Button>
          </form>
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

      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>Add a case file to resolve document-related risk.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Link href="/upload-document"><Button onClick={() => setShowUploadModal(false)}>Open upload flow</Button></Link>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateEventModal} onOpenChange={setShowCreateEventModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create event</DialogTitle>
            <DialogDescription>Log an event outcome to keep the timeline accurate.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleCreateEventSubmit}>
            <Input value={newEventTitle} onChange={(event) => setNewEventTitle(event.target.value)} placeholder="Event title" required />
            <Input value={newEventDate} onChange={(event) => setNewEventDate(event.target.value)} type="date" required />
            <DialogFooter>
              <Button type="submit">Save event</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showAskAtlasPanel} onOpenChange={setShowAskAtlasPanel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask Atlas</DialogTitle>
            <DialogDescription>Open Ask Atlas with this case preselected.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Link href={`/ask?case=${data.case.id}`}><Button onClick={() => setShowAskAtlasPanel(false)}>Open Ask Atlas</Button></Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
