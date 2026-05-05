import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Inbox, Loader2, Users } from "lucide-react";
import { AttorneyShell } from "@/components/attorney/AttorneyShell";
import { EmptyState, SectionLabel } from "@/components/app/PageShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/hooks/use-auth";
import { firstNameFromDisplayName, useUserProfile } from "@/hooks/use-user-profile";
import { useToast } from "@/hooks/use-toast";
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

type EnrichedClient = {
  connection: AttorneyClientConnection;
  caseBrief: AttorneyClientCaseBrief | null;
  clientName: string;
  county: string | null;
  nextDeadlineLabel: string | null;
  nextDeadlineDate: string | null;
  deadlineDaysAway: number | null;
  hasUnreadDocuments: boolean;
  lastActiveLabel: string;
  urgentSignal: {
    label: string;
    tone: "red" | "amber" | "slate";
  };
};

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(date: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((date.getTime() - startOfToday().getTime()) / msPerDay);
}

function readString(record: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CL";
  if (parts.length === 1) return (parts[0][0] ?? "C").toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function getUrgencyClasses(tone: EnrichedClient["urgentSignal"]["tone"]): string {
  if (tone === "red") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (tone === "amber") return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function getAccentClasses(tone: EnrichedClient["urgentSignal"]["tone"]): string {
  if (tone === "red") return "before:bg-red-500";
  if (tone === "amber") return "before:bg-amber-500";
  return "before:bg-slate-300";
}

function getClientName(connection: AttorneyClientConnection): string {
  return connection.client_display_name
    ?? connection.client_email
    ?? connection.invite_email
    ?? "Client";
}

function buildEnrichedClient(
  connection: AttorneyClientConnection,
  caseBrief: AttorneyClientCaseBrief | null,
): EnrichedClient {
  const clientName = getClientName(connection);
  const caseRecord = caseBrief?.case ?? null;
  const timelineEvents = caseBrief?.caseTimelineEvents ?? [];
  const documents = caseBrief?.documents ?? [];

  const upcomingEvents = timelineEvents
    .map((event) => {
      const eventDateValue = (event.event_date ?? event.eventDate ?? event.date) as unknown;
      const parsed = parseDate(eventDateValue);
      const label = typeof (event.label ?? event.title ?? event.event_type) === "string"
        ? String(event.label ?? event.title ?? event.event_type)
        : "Upcoming event";
      return parsed ? { parsed, label } : null;
    })
    .filter((entry): entry is { parsed: Date; label: string } => entry !== null)
    .filter((entry) => daysUntil(entry.parsed) >= 0)
    .sort((a, b) => a.parsed.getTime() - b.parsed.getTime());

  const nextDeadline = upcomingEvents[0] ?? null;
  const deadlineDaysAway = nextDeadline ? daysUntil(nextDeadline.parsed) : null;
  const hasUnreadDocuments = documents.some((doc) => {
    const createdAt = parseDate(doc.created_at ?? doc.createdAt);
    if (!createdAt) return false;
    return daysUntil(createdAt) >= -7;
  });

  let urgentSignal: EnrichedClient["urgentSignal"];
  if (connection.status === "pending" || !connection.client_user_id) {
    urgentSignal = { label: "Invite pending", tone: "amber" };
  } else if (deadlineDaysAway !== null && deadlineDaysAway <= 14) {
    urgentSignal = {
      label: deadlineDaysAway <= 0 ? "Deadline due now" : `Deadline in ${deadlineDaysAway} day${deadlineDaysAway === 1 ? "" : "s"}`,
      tone: "red",
    };
  } else if (hasUnreadDocuments) {
    urgentSignal = { label: "New documents", tone: "amber" };
  } else {
    urgentSignal = { label: "On track", tone: "slate" };
  }

  const activityDates = [
    parseDate(caseRecord?.updated_at ?? caseRecord?.updatedAt ?? null),
    parseDate(caseBrief?.caseIntelligence?.updated_at ?? caseBrief?.caseIntelligence?.updatedAt ?? null),
    ...timelineEvents.map((event) => parseDate(event.updated_at ?? event.created_at ?? event.event_date ?? null)),
    ...documents.map((doc) => parseDate(doc.updated_at ?? doc.created_at ?? null)),
  ].filter((value): value is Date => value instanceof Date);

  const latestActivity = activityDates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const county = readString(caseRecord, ["county_name", "countyName", "jurisdiction_county"]);

  return {
    connection,
    caseBrief,
    clientName,
    county,
    nextDeadlineLabel: nextDeadline?.label ?? null,
    nextDeadlineDate: nextDeadline ? nextDeadline.parsed.toISOString() : null,
    deadlineDaysAway,
    hasUnreadDocuments,
    lastActiveLabel: formatRelativeTime(latestActivity),
    urgentSignal,
  };
}

export default function AttorneyDashboardPage() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useCurrentUser();
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const { usage, isLoading: usageLoading } = useUsage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");

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

  const enrichedClientsQuery = useQuery<EnrichedClient[]>({
    queryKey: ["/api/attorney/clients", "enriched", clientsQuery.data?.clients?.map((client) => client.id).join(",") ?? ""],
    enabled: isAttorneyUser && Array.isArray(clientsQuery.data?.clients),
    queryFn: async () => {
      const clients = clientsQuery.data?.clients ?? [];
      const activeClients = clients.filter((client) => client.client_user_id);
      console.warn(
        "[attorney-dashboard] Using parallel per-client case brief fetches. Replace this with a dedicated attorney dashboard endpoint in a future iteration.",
      );

      const briefs = await Promise.all(
        activeClients.map(async (client) => {
          try {
            const res = await apiRequestRaw("GET", `/api/attorney/clients/${client.client_user_id}`);
            if (!res.ok) {
              return [client.id, null] as const;
            }
            const payload = await res.json() as AttorneyClientCaseBrief;
            return [client.id, payload] as const;
          } catch {
            return [client.id, null] as const;
          }
        }),
      );

      const briefMap = new Map<string, AttorneyClientCaseBrief | null>(briefs);
      return clients.map((client) => buildEnrichedClient(client, briefMap.get(client.id) ?? null));
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequestRaw("POST", "/api/attorney/clients/invite", { email });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Could not send invite.");
      }
      return res.json();
    },
    onSuccess: async () => {
      setInviteEmail("");
      await queryClient.invalidateQueries({ queryKey: ["/api/attorney/clients"] });
      toast({
        title: "Invite sent",
        description: "The client invitation has been created.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not send invite",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const attorneyName = firstNameFromDisplayName(profile?.displayName ?? user?.displayName ?? user?.email ?? "Attorney") || "Attorney";
  const enrichedClients = enrichedClientsQuery.data ?? [];
  const activeClients = enrichedClients.filter((client) => client.connection.status === "active" && client.connection.client_user_id);
  const clientsNeedingAttention = activeClients.filter((client) => client.urgentSignal.tone !== "slate");

  const nextDeadlineCard = useMemo(() => {
    const soonest = activeClients
      .filter((client) => client.nextDeadlineDate)
      .sort((a, b) => {
        const aTime = parseDate(a.nextDeadlineDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = parseDate(b.nextDeadlineDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })[0];

    if (!soonest || !soonest.nextDeadlineDate) {
      return { value: "None set", detail: "No upcoming deadlines tracked yet." };
    }

    const date = parseDate(soonest.nextDeadlineDate);
    return {
      value: date ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Scheduled",
      detail: soonest.clientName,
    };
  }, [activeClients]);

  if (authLoading || profileLoading || usageLoading || !isAttorneyUser) {
    return (
      <AttorneyShell>
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      </AttorneyShell>
    );
  }

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = inviteEmail.trim();
    if (!trimmed) return;
    await inviteMutation.mutateAsync(trimmed);
  }

  return (
    <AttorneyShell>
      <div className="mx-auto max-w-[680px] space-y-8">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Good morning, {attorneyName}.
          </h1>
          <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
            {clientsNeedingAttention.length} client{clientsNeedingAttention.length === 1 ? "" : "s"} need your attention today.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Card className="border-black/5 bg-white/85 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Active clients</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-50">{activeClients.length}</p>
            </CardContent>
          </Card>
          <Card className="border-black/5 bg-white/85 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Need attention</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-50">{clientsNeedingAttention.length}</p>
            </CardContent>
          </Card>
          <Card className="border-black/5 bg-white/85 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Next deadline</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-50">{nextDeadlineCard.value}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{nextDeadlineCard.detail}</p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionLabel>Needs Attention</SectionLabel>
          {clientsQuery.isLoading || enrichedClientsQuery.isLoading ? (
            <Card className="border-black/5 bg-white/85 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
              <CardContent className="flex items-center gap-3 p-5 text-sm text-slate-600 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading client priorities…
              </CardContent>
            </Card>
          ) : clientsNeedingAttention.length === 0 ? (
            <Card className="border-dashed border-black/10 bg-white/75 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
              <CardContent className="p-5 text-sm text-slate-600 dark:text-slate-400">
                No urgent items right now. New invites and deadlines will surface here.
              </CardContent>
            </Card>
          ) : (
            clientsNeedingAttention.map((client) => (
              <button
                key={client.connection.id}
                type="button"
                onClick={() => client.connection.client_user_id && navigate(`/attorney/client/${client.connection.client_user_id}`)}
                className={cn(
                  "relative w-full rounded-2xl border border-black/5 bg-white/90 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900/85",
                  "before:absolute before:bottom-3 before:left-0 before:top-3 before:w-1 before:rounded-full",
                  getAccentClasses(client.urgentSignal.tone),
                )}
              >
                <div className="flex items-center gap-4 p-5 pl-6">
                  <Avatar className="h-11 w-11">
                    <AvatarFallback className={cn("text-sm font-semibold", getUrgencyClasses(client.urgentSignal.tone))}>
                      {getInitials(client.clientName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{client.clientName}</p>
                      <Badge variant="outline" className="border-transparent bg-transparent px-0 text-[11px] text-slate-500 shadow-none">
                        {client.connection.case_title ?? "Untitled case"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {client.county ? `${client.county} County` : "County not available"} · Last active {client.lastActiveLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={cn("border-0 px-2.5 py-1 text-[11px] font-medium", getUrgencyClasses(client.urgentSignal.tone))}>
                      {client.urgentSignal.label}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
              </button>
            ))
          )}
        </section>

        <section className="space-y-3">
          <SectionLabel>All Clients</SectionLabel>
          {clientsQuery.isLoading || enrichedClientsQuery.isLoading ? (
            <Card className="border-black/5 bg-white/85 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
              <CardContent className="flex items-center gap-3 p-5 text-sm text-slate-600 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading clients…
              </CardContent>
            </Card>
          ) : clientsQuery.error ? (
            <Card className="border-black/5 bg-white/85 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
              <CardContent className="p-5 text-sm text-red-700 dark:text-red-300">
                {clientsQuery.error instanceof Error ? clientsQuery.error.message : "Could not load clients."}
              </CardContent>
            </Card>
          ) : enrichedClients.length === 0 ? (
            <Card className="border-dashed border-black/10 bg-white/75 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
              <CardContent className="p-4">
                <EmptyState
                  icon={Users}
                  title="Invite your first client to get started"
                  description="Once clients connect, Atlas will surface case briefs, deadlines, and document activity here."
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
              <CardContent className="p-0">
                <div className="divide-y divide-black/5 dark:divide-white/10">
                  {enrichedClients.map((client) => {
                    const clickable = Boolean(client.connection.client_user_id) && client.connection.status === "active";

                    return (
                      <button
                        key={client.connection.id}
                        type="button"
                        disabled={!clickable}
                        onClick={() => clickable && navigate(`/attorney/client/${client.connection.client_user_id}`)}
                        className={cn(
                          "flex w-full items-center gap-4 px-5 py-4 text-left transition",
                          clickable ? "hover:bg-black/[0.02] dark:hover:bg-white/[0.03]" : "cursor-default",
                        )}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className={cn("text-sm font-semibold", getUrgencyClasses(client.urgentSignal.tone))}>
                            {getInitials(client.clientName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{client.clientName}</p>
                          <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                            {client.connection.case_title ?? "Pending case assignment"}
                            {client.county ? ` · ${client.county} County` : ""}
                          </p>
                        </div>
                        <div className="hidden text-right sm:block">
                          <Badge className={cn("border-0 px-2.5 py-1 text-[11px] font-medium", getUrgencyClasses(client.urgentSignal.tone))}>
                            {client.urgentSignal.label}
                          </Badge>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{client.lastActiveLabel}</p>
                        </div>
                        {clickable ? <ChevronRight className="h-4 w-4 text-slate-400" /> : null}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <Card className="border-black/5 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/85">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-900 dark:text-slate-50">Invite a client</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleInviteSubmit}>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="client@example.com"
                className="h-11"
              />
              <Button type="submit" className="h-11 sm:px-5" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Send invite
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AttorneyShell>
  );
}
