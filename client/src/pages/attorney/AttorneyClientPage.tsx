import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AttorneyShell } from "@/components/attorney/AttorneyShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-auth";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useUsage } from "@/hooks/use-usage";
import { apiRequestRaw } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type AttorneyClientConnection = {
  id: string;
  attorney_user_id: string;
  client_user_id: string | null;
  invite_email: string;
  case_id: string | null;
  status: string;
  accepted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  client_display_name: string | null;
  client_email: string | null;
  case_title: string | null;
};

type AttorneyClientCaseBrief = {
  case: Record<string, unknown> | null;
  caseIntelligence: Record<string, unknown> | null;
  caseTimelineEvents: Record<string, unknown>[];
  documents: Record<string, unknown>[];
};

type TaskItem = {
  id: string;
  text: string;
  done: boolean;
};

function readString(record: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readNumber(record: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CL";
  if (parts.length === 1) return (parts[0][0] ?? "C").toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: unknown): string {
  const parsed = parseDate(value);
  if (!parsed) return "Not available";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeTime(value: Date | null): string {
  if (!value) return "No recent activity";
  const diffMs = Date.now() - value.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildNotesKey(attorneyUserId: string, clientUserId: string): string {
  return `attorney_${attorneyUserId}_client_${clientUserId}_notes`;
}

function buildTasksKey(attorneyUserId: string, clientUserId: string): string {
  return `attorney_${attorneyUserId}_client_${clientUserId}_tasks`;
}

export default function AttorneyClientPage() {
  const params = useParams<{ clientUserId: string }>();
  const clientUserId = typeof params.clientUserId === "string" ? params.clientUserId : "";
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useCurrentUser();
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const { usage, isLoading: usageLoading } = useUsage();
  const [notes, setNotes] = useState("");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskDraft, setTaskDraft] = useState("");
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const tasksRef = useRef<HTMLDivElement | null>(null);
  const documentsRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedLocalStateRef = useRef(false);

  const isAttorneyUser =
    (profile?.tier === "attorney_firm" || usage?.tier === "attorney_firm") &&
    !!user;

  useEffect(() => {
    if (authLoading || profileLoading || usageLoading) return;
    if (!isAttorneyUser) {
      navigate("/", { replace: true });
    }
  }, [authLoading, isAttorneyUser, navigate, profileLoading, usageLoading]);

  const clientsQuery = useQuery<{ clients: AttorneyClientConnection[] }>({
    queryKey: ["/api/attorney/clients"],
    enabled: isAttorneyUser,
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/attorney/clients");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Could not load attorney clients.");
      }
      return res.json();
    },
  });

  const caseBriefQuery = useQuery<AttorneyClientCaseBrief>({
    queryKey: ["/api/attorney/clients", clientUserId],
    enabled: isAttorneyUser && Boolean(clientUserId),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/attorney/clients/${clientUserId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Could not load client case data.");
      }
      return res.json();
    },
  });

  const connection = useMemo(() => {
    return (clientsQuery.data?.clients ?? []).find((item) => item.client_user_id === clientUserId) ?? null;
  }, [clientUserId, clientsQuery.data?.clients]);

  useEffect(() => {
    if (!user?.id || !clientUserId || hasLoadedLocalStateRef.current) return;
    hasLoadedLocalStateRef.current = true;

    if (typeof window === "undefined") return;
    const notesKey = buildNotesKey(user.id, clientUserId);
    const tasksKey = buildTasksKey(user.id, clientUserId);
    const savedNotes = window.localStorage.getItem(notesKey);
    const savedTasks = window.localStorage.getItem(tasksKey);

    setNotes(savedNotes ?? "");

    if (savedTasks) {
      try {
        const parsed = JSON.parse(savedTasks) as TaskItem[];
        if (Array.isArray(parsed)) {
          setTasks(parsed);
        }
      } catch {
        setTasks([]);
      }
    }
  }, [clientUserId, user?.id]);

  useEffect(() => {
    if (!user?.id || !clientUserId || !hasLoadedLocalStateRef.current || typeof window === "undefined") return;
    window.localStorage.setItem(buildNotesKey(user.id, clientUserId), notes);
  }, [clientUserId, notes, user?.id]);

  useEffect(() => {
    if (!user?.id || !clientUserId || !hasLoadedLocalStateRef.current || typeof window === "undefined") return;
    window.localStorage.setItem(buildTasksKey(user.id, clientUserId), JSON.stringify(tasks));
  }, [clientUserId, tasks, user?.id]);

  const caseBrief = caseBriefQuery.data;
  const caseRecord = caseBrief?.case ?? null;
  const caseIntelligence = caseBrief?.caseIntelligence ?? null;
  const timeline = caseBrief?.caseTimelineEvents ?? [];
  const documents = caseBrief?.documents ?? [];

  const clientName = connection?.client_display_name ?? connection?.client_email ?? "Client";
  const caseName = connection?.case_title ?? readString(caseRecord, ["title", "case_name"]) ?? "Untitled case";
  const county = readString(caseRecord, ["county_name", "countyName", "jurisdiction_county"]);
  const summary = readString(caseIntelligence, ["summary"]) ?? "No case summary is available yet for this client.";
  const caseStage = readString(caseIntelligence, ["case_stage"]) ?? readString(caseRecord, ["status"]) ?? "Not established";
  const courtName = readString(caseRecord, ["court_name", "courtName"]);

  const latestActivity = useMemo(() => {
    const dates = [
      parseDate(caseRecord?.updated_at ?? caseRecord?.updatedAt ?? null),
      parseDate(caseIntelligence?.updated_at ?? caseIntelligence?.updatedAt ?? null),
      ...timeline.map((event) => parseDate(event.updated_at ?? event.created_at ?? event.event_date ?? null)),
      ...documents.map((doc) => parseDate(doc.updated_at ?? doc.created_at ?? null)),
    ].filter((value): value is Date => value instanceof Date);

    return dates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  }, [caseIntelligence, caseRecord, documents, timeline]);

  const nextDeadline = useMemo(() => {
    const upcoming = timeline
      .map((event) => {
        const parsed = parseDate(event.event_date ?? event.eventDate ?? event.date);
        const label = readString(event as Record<string, unknown>, ["label", "title", "event_type"]) ?? "Upcoming event";
        return parsed ? { parsed, label } : null;
      })
      .filter((event): event is { parsed: Date; label: string } => event !== null)
      .filter((event) => event.parsed.getTime() >= Date.now())
      .sort((a, b) => a.parsed.getTime() - b.parsed.getTime());

    return upcoming[0] ?? null;
  }, [timeline]);

  const docsScore = Math.min(100, documents.length * 20);
  const clarityScore =
    (summary ? 40 : 0) +
    (timeline.length > 0 ? 30 : 0) +
    (Array.isArray(caseIntelligence?.active_issues_json) && caseIntelligence.active_issues_json.length > 0 ? 30 : 10);
  const overallScore = Math.round((docsScore + clarityScore + (nextDeadline ? 70 : 35)) / 3);

  const childName = readString(caseIntelligence, ["child_name", "childName"]) ?? readString(caseRecord, ["child_name", "childName"]);
  const childAge = readNumber(caseIntelligence, ["child_age", "childAge"]) ?? readNumber(caseRecord, ["child_age", "childAge"]);
  const opposingParty = readString(caseIntelligence, ["opposing_party_name", "opposing_party", "opposingPartyName"]) ?? readString(caseRecord, ["opposing_party_name", "opposingPartyName"]);
  const opposingRepresented = readString(caseIntelligence, ["opposing_represented", "opposingRepresented"]) ?? readString(caseRecord, ["opposing_represented", "opposingRepresented"]);

  const statusPills = [
    nextDeadline ? { label: `Next deadline ${formatDate(nextDeadline.parsed.toISOString())}`, tone: "red" as const } : null,
    documents.length > 0 ? { label: `${documents.length} document${documents.length === 1 ? "" : "s"}`, tone: "amber" as const } : null,
    { label: caseStage, tone: "slate" as const },
  ].filter((item): item is { label: string; tone: "red" | "amber" | "slate" } => item !== null);

  function scrollTo(ref: React.RefObject<HTMLElement | HTMLTextAreaElement | HTMLDivElement>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addTask(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTasks((current) => [
      { id: `${Date.now()}`, text: trimmed, done: false },
      ...current,
    ]);
    setTaskDraft("");
  }

  if (authLoading || profileLoading || usageLoading || !isAttorneyUser) {
    return (
      <AttorneyShell>
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      </AttorneyShell>
    );
  }

  return (
    <AttorneyShell backHref="/attorney" backLabel="‹ All clients">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-6">
          {caseBriefQuery.isLoading || clientsQuery.isLoading ? (
            <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
              <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading client workspace…
              </CardContent>
            </Card>
          ) : caseBriefQuery.error ? (
            <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
              <CardContent className="p-6 text-sm text-red-700 dark:text-red-300">
                {caseBriefQuery.error instanceof Error ? caseBriefQuery.error.message : "Could not load client workspace."}
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardContent className="p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-14 w-14">
                        <AvatarFallback className="bg-emerald-100 text-base font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {getInitials(clientName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                          {clientName}
                        </h1>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          {caseName}
                          {county ? ` · ${county} County` : ""}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {statusPills.map((pill) => (
                            <Badge
                              key={pill.label}
                              className={cn(
                                "border-0 px-2.5 py-1 text-[11px] font-medium",
                                pill.tone === "red"
                                  ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                  : pill.tone === "amber"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                    : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                              )}
                            >
                              {pill.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => scrollTo(messagesRef)}>
                        Message
                      </Button>
                      <Button type="button" variant="outline" onClick={() => tasksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                        Add task
                      </Button>
                      <Button type="button" variant="outline" onClick={() => notesRef.current?.focus()}>
                        Add note
                      </Button>
                      <Button type="button" variant="outline" onClick={() => scrollTo(documentsRef)}>
                        View documents
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-[0.16em] text-slate-500">Atlas Case Brief</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[15px] leading-7 text-slate-700 dark:text-slate-300">{summary}</p>
                </CardContent>
              </Card>

              <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-[0.16em] text-slate-500">Case Readiness</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {[
                    { label: "Overall", value: overallScore },
                    { label: "Docs", value: docsScore },
                    { label: "Situation clarity", value: Math.min(100, clarityScore) },
                  ].map((item) => (
                    <div key={item.label} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                        <span className="text-slate-500 dark:text-slate-400">{item.value}%</span>
                      </div>
                      <Progress value={item.value} className="h-2.5" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-[0.16em] text-slate-500">Legal Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {timeline.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400">No timeline events are available yet.</p>
                  ) : (
                    timeline.map((event, index) => (
                      <div key={`${event.id ?? index}`} className="rounded-xl border border-black/5 bg-black/[0.015] px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                          {readString(event as Record<string, unknown>, ["label", "title", "event_type"]) ?? "Event"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          {formatDate((event as Record<string, unknown>).event_date ?? (event as Record<string, unknown>).eventDate ?? (event as Record<string, unknown>).date)}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card ref={documentsRef} className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-[0.16em] text-slate-500">Documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {documents.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400">No documents have been shared for this case yet.</p>
                  ) : (
                    documents.map((document, index) => {
                      const documentRecord = document as Record<string, unknown>;
                      const title = readString(documentRecord, ["file_name", "title", "name"]) ?? `Document ${index + 1}`;
                      const documentId = readString(documentRecord, ["id"]);
                      return (
                        <div key={documentId ?? `${title}-${index}`} className="flex flex-col gap-3 rounded-xl border border-black/5 bg-black/[0.015] px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/[0.02]">
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{title}</p>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                              Uploaded {formatDate(documentRecord.created_at ?? documentRecord.createdAt)}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {documentId ? (
                              <Button type="button" variant="outline" onClick={() => navigate(`/document/${documentId}`)}>
                                View
                              </Button>
                            ) : null}
                            <Button type="button" variant="outline">
                              Request
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-[0.16em] text-slate-500">Attorney Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    ref={notesRef}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Private notes for this client. Saved locally on this device for now."
                    className="min-h-[180px]"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Saved locally on this device.</p>
                </CardContent>
              </Card>

              <Card ref={tasksRef} className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-[0.16em] text-slate-500">Tasks</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={taskDraft}
                      onChange={(event) => setTaskDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addTask(taskDraft);
                        }
                      }}
                      placeholder="Add a task for this client"
                    />
                    <Button type="button" onClick={() => addTask(taskDraft)}>Add task</Button>
                  </div>
                  <div className="space-y-2">
                    {tasks.length === 0 ? (
                      <p className="text-sm text-slate-600 dark:text-slate-400">No tasks yet.</p>
                    ) : (
                      tasks.map((task) => (
                        <label key={task.id} className="flex items-center gap-3 rounded-xl border border-black/5 px-3 py-2 text-sm dark:border-white/10">
                          <input
                            type="checkbox"
                            checked={task.done}
                            onChange={() => {
                              setTasks((current) => current.map((item) => (
                                item.id === task.id ? { ...item, done: !item.done } : item
                              )));
                            }}
                          />
                          <span className={cn(task.done ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-300")}>
                            {task.text}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card ref={messagesRef} className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardHeader>
                  <CardTitle className="text-sm uppercase tracking-[0.16em] text-slate-500">Messages</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Messaging coming soon.</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-[0.16em] text-slate-500">Client Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Email</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">{connection?.client_email ?? connection?.invite_email ?? "Not available"}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Member since</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">Not available</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Plan</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">Not available</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Engagement type</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">{connection?.status === "active" ? "Connected client" : "Pending invite"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-[0.16em] text-slate-500">Child</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Name</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">{childName ?? "Not available"}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Age</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">{childAge ?? "Not available"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-[0.16em] text-slate-500">Opposing Party</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Name</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">{opposingParty ?? "Not available"}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Represented</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">{opposingRepresented ?? "Not available"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-[0.16em] text-slate-500">Case Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Case name</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">{caseName}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Court</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">{courtName ?? "Not available"}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Stage</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">{caseStage}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Last active</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">{formatRelativeTime(latestActivity)}</p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </AttorneyShell>
  );
}
