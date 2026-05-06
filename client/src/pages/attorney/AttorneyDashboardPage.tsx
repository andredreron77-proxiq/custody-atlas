import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronRight, Loader2, Users } from "lucide-react";
import { EmptyState, SectionLabel } from "@/components/app/PageShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/hooks/use-auth";
import { firstNameFromDisplayName, initialsFromPreferredName, resolvePreferredDisplayName, useUserProfile } from "@/hooks/use-user-profile";
import { useToast } from "@/hooks/use-toast";
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
    tone: "red" | "amber" | "green" | "slate";
  };
  statusBucket: "active" | "hearing_soon" | "deadline_urgent" | "invite_pending";
};

type DashboardTaskItem = {
  id: string;
  text: string;
  done: boolean;
  clientName: string;
};

const ATTORNEY_NAV_ITEMS = [
  { label: "Clients", href: "/attorney", activeMatch: (pathname: string) => pathname === "/attorney" || pathname.startsWith("/attorney/") },
  { label: "Calendar" },
  { label: "Messages" },
  { label: "Profile" },
] as const;

const STATUS_COLORS: Record<EnrichedClient["statusBucket"], string> = {
  active: "oklch(0.66 0.13 154)",
  hearing_soon: "oklch(0.76 0.16 82)",
  deadline_urgent: "oklch(0.63 0.22 26)",
  invite_pending: "oklch(0.82 0.11 80)",
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

function getUrgencyBadgeClasses(tone: EnrichedClient["urgentSignal"]["tone"]): string {
  if (tone === "red") return "bg-[oklch(0.97_0.02_25)] text-[oklch(0.58_0.21_27)]";
  if (tone === "amber") return "bg-[oklch(0.98_0.02_86)] text-[oklch(0.63_0.14_79)]";
  if (tone === "green") return "bg-[oklch(0.97_0.02_154)] text-[oklch(0.5_0.13_154)]";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

function getAttentionBorderClasses(tone: EnrichedClient["urgentSignal"]["tone"]): string {
  if (tone === "red") return "border-l-[oklch(0.63_0.22_26)]";
  if (tone === "amber") return "border-l-[oklch(0.76_0.16_82)]";
  if (tone === "green") return "border-l-[oklch(0.66_0.13_154)]";
  return "border-l-slate-200";
}

function getClientName(connection: AttorneyClientConnection): string {
  return connection.client_display_name
    ?? connection.client_email
    ?? connection.invite_email
    ?? "Client";
}

function resolveAttorneyGreetingName(profileDisplayName: string | null | undefined, email: string | null | undefined): string {
  const preferredName = firstNameFromDisplayName(profileDisplayName);
  if (preferredName) return preferredName;

  if (email) {
    const localPart = email.split("@")[0]?.trim();
    if (localPart) {
      return `${localPart.charAt(0).toUpperCase()}${localPart.slice(1)}`;
    }
  }

  return "Counselor";
}

function buildTasksKey(attorneyUserId: string, clientUserId: string): string {
  return `attorney_${attorneyUserId}_client_${clientUserId}_tasks`;
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
      const normalizedType = typeof (event.event_type ?? event.type) === "string"
        ? String(event.event_type ?? event.type).toLowerCase()
        : "";
      return parsed ? { parsed, label, normalizedType } : null;
    })
    .filter((entry): entry is { parsed: Date; label: string; normalizedType: string } => entry !== null)
    .filter((entry) => daysUntil(entry.parsed) >= 0)
    .sort((a, b) => a.parsed.getTime() - b.parsed.getTime());

  const nextDeadline = upcomingEvents[0] ?? null;
  const deadlineDaysAway = nextDeadline ? daysUntil(nextDeadline.parsed) : null;
  const hasUnreadDocuments = documents.some((doc) => {
    const createdAt = parseDate(doc.created_at ?? doc.createdAt);
    if (!createdAt) return false;
    return daysUntil(createdAt) >= -7;
  });
  const hasUpcomingHearing = upcomingEvents.some((event) => {
    const label = event.label.toLowerCase();
    const daysAway = daysUntil(event.parsed);
    return daysAway <= 21 && (event.normalizedType.includes("hearing") || label.includes("hearing"));
  });

  let urgentSignal: EnrichedClient["urgentSignal"];
  let statusBucket: EnrichedClient["statusBucket"];

  if (connection.status === "pending" || !connection.client_user_id) {
    urgentSignal = { label: "Invite pending", tone: "amber" };
    statusBucket = "invite_pending";
  } else if (deadlineDaysAway !== null && deadlineDaysAway <= 14) {
    urgentSignal = {
      label: deadlineDaysAway <= 0 ? "Deadline due now" : `Deadline in ${deadlineDaysAway} day${deadlineDaysAway === 1 ? "" : "s"}`,
      tone: "red",
    };
    statusBucket = "deadline_urgent";
  } else if (hasUpcomingHearing) {
    urgentSignal = { label: "Hearing soon", tone: "amber" };
    statusBucket = "hearing_soon";
  } else if (hasUnreadDocuments) {
    urgentSignal = { label: "New documents", tone: "amber" };
    statusBucket = "hearing_soon";
  } else {
    urgentSignal = { label: "Active", tone: "green" };
    statusBucket = "active";
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
    statusBucket,
  };
}

function AttorneyTopNav({
  displayName,
  initials,
}: {
  displayName: string;
  initials: string;
}) {
  const [location] = useLocation();

  return (
    <div className="border-b border-black/8 bg-[#f7f3ed]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1220px] items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.66_0.13_154)] shadow-[0_0_0_4px_rgba(63,161,106,0.12)]" />
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
            Custody Atlas · Attorney Portal
          </p>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {ATTORNEY_NAV_ITEMS.map((item) => {
            if (!item.href) {
              return (
                <span key={item.label} className="rounded-full px-3 py-1.5 text-sm text-slate-400">
                  {item.label}
                </span>
              );
            }

            const isActive = item.activeMatch(location);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-black/[0.04] hover:text-slate-900",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
            <p className="text-xs text-slate-500">Attorney account</p>
          </div>
          <Avatar className="h-10 w-10 border border-black/8 bg-white">
            <AvatarFallback className="bg-[oklch(0.97_0.02_154)] text-sm font-semibold text-[oklch(0.48_0.12_154)]">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </div>
  );
}

export default function AttorneyDashboardPage() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useCurrentUser();
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");

  const isAttorneyUser =
    profile?.tier === "attorney_firm" && !!user;

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!isAttorneyUser) {
      navigate("/", { replace: true });
    }
  }, [authLoading, isAttorneyUser, navigate, profileLoading]);

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

  const attorneyDisplayName = resolvePreferredDisplayName({
    profileDisplayName: profile?.displayName,
    profileFullName: profile?.fullName,
    authMetadataName: user?.authMetadataName,
    authDisplayName: user?.displayName,
    email: user?.email,
  }) ?? "Attorney";
  const attorneyFirstName = resolveAttorneyGreetingName(profile?.displayName, user?.email);
  const attorneyInitials = initialsFromPreferredName({
    profileDisplayName: profile?.displayName,
    profileFullName: profile?.fullName,
    authMetadataName: user?.authMetadataName,
    authDisplayName: user?.displayName,
    email: user?.email,
  });

  const enrichedClients = enrichedClientsQuery.data ?? [];
  const activeClients = enrichedClients.filter((client) => client.connection.status === "active" && client.connection.client_user_id);
  const clientsNeedingAttention = activeClients.filter((client) => client.urgentSignal.tone === "red" || client.urgentSignal.tone === "amber");

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

  const chartData = useMemo(() => {
    const buckets = {
      active: 0,
      hearing_soon: 0,
      deadline_urgent: 0,
      invite_pending: 0,
    };

    for (const client of enrichedClients) {
      buckets[client.statusBucket] += 1;
    }

    return [
      { name: "Active", value: buckets.active, color: STATUS_COLORS.active },
      { name: "Hearing Soon", value: buckets.hearing_soon, color: STATUS_COLORS.hearing_soon },
      { name: "Deadline Urgent", value: buckets.deadline_urgent, color: STATUS_COLORS.deadline_urgent },
      { name: "Invite Pending", value: buckets.invite_pending, color: STATUS_COLORS.invite_pending },
    ].filter((item) => item.value > 0);
  }, [enrichedClients]);

  const upcomingDeadlines = useMemo(() => {
    return activeClients
      .filter((client) => client.nextDeadlineDate)
      .sort((a, b) => {
        const aTime = parseDate(a.nextDeadlineDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = parseDate(b.nextDeadlineDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, 6);
  }, [activeClients]);

  const quickTasks = useMemo(() => {
    if (typeof window === "undefined" || !user?.id) return [];
    const items: DashboardTaskItem[] = [];

    for (const client of activeClients) {
      const clientId = client.connection.client_user_id;
      if (!clientId) continue;

      const raw = window.localStorage.getItem(buildTasksKey(user.id, clientId));
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw) as Array<{ id: string; text: string; done: boolean }>;
        for (const task of parsed ?? []) {
          if (!task || typeof task.text !== "string") continue;
          items.push({
            id: `${clientId}:${task.id}`,
            text: task.text,
            done: Boolean(task.done),
            clientName: client.clientName,
          });
        }
      } catch {
        continue;
      }
    }

    return items.filter((item) => !item.done).slice(0, 6);
  }, [activeClients, user?.id]);

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = inviteEmail.trim();
    if (!trimmed) return;
    await inviteMutation.mutateAsync(trimmed);
  }

  if (authLoading || profileLoading || !isAttorneyUser) {
    return (
      <div className="min-h-screen bg-[#f7f3ed]">
        <AttorneyTopNav displayName={attorneyDisplayName} initials={attorneyInitials} />
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[oklch(0.66_0.13_154)] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f3ed] text-slate-900 dark:bg-[#101418] dark:text-slate-100">
      <AttorneyTopNav displayName={attorneyDisplayName} initials={attorneyInitials} />

      <div className="mx-auto flex max-w-[1220px] gap-8 px-6 py-8">
        <div className="min-w-0 flex-1 space-y-8">
          <section className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Good morning, {attorneyFirstName}.
            </h1>
            <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
              {clientsNeedingAttention.length} client{clientsNeedingAttention.length === 1 ? "" : "s"} need your attention today.
            </p>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardContent className="p-5">
                  <SectionLabel>Active Clients</SectionLabel>
                  <p className="mt-4 text-3xl font-semibold">{activeClients.length}</p>
                </CardContent>
              </Card>
              <Card className="border-[oklch(0.9_0.03_26)] bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardContent className="p-5">
                  <SectionLabel className="text-[oklch(0.58_0.21_27)]">Need Attention</SectionLabel>
                  <p className="mt-4 text-3xl font-semibold text-[oklch(0.58_0.21_27)]">{clientsNeedingAttention.length}</p>
                </CardContent>
              </Card>
              <Card className="border-[oklch(0.92_0.02_82)] bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardContent className="p-5">
                  <SectionLabel className="text-[oklch(0.63_0.14_79)]">Next Deadline</SectionLabel>
                  <p className="mt-4 text-2xl font-semibold text-[oklch(0.63_0.14_79)]">{nextDeadlineCard.value}</p>
                  <p className="mt-1 text-sm text-slate-500">{nextDeadlineCard.detail}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-200">Case status breakdown</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {chartData.length === 0 ? (
                  <div className="flex h-[210px] items-center justify-center text-sm text-slate-500">
                    No client status data yet.
                  </div>
                ) : (
                  <div className="h-[210px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={74}
                          stroke="none"
                          paddingAngle={2}
                        >
                          {chartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [`${value}`, name]}
                          contentStyle={{
                            borderRadius: 16,
                            border: "1px solid rgba(15,23,42,0.08)",
                            boxShadow: "0 8px 30px rgba(15,23,42,0.08)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      {chartData.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span className="text-slate-600 dark:text-slate-300">{entry.name}</span>
                          <span className="ml-auto font-medium text-slate-900 dark:text-slate-100">{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <SectionLabel>Needs Attention</SectionLabel>
            {clientsQuery.isLoading || enrichedClientsQuery.isLoading ? (
              <Card className="border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardContent className="flex items-center gap-3 p-5 text-sm text-slate-600 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading client priorities…
                </CardContent>
              </Card>
            ) : clientsNeedingAttention.length === 0 ? (
              <Card className="border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardContent className="p-5 text-sm text-slate-600 dark:text-slate-400">
                  Nothing urgent right now. New deadlines and document activity will appear here.
                </CardContent>
              </Card>
            ) : (
              clientsNeedingAttention.map((client) => (
                <div
                  key={client.connection.id}
                  className={cn(
                    "rounded-2xl border border-black/6 border-l-4 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/85",
                    getAttentionBorderClasses(client.urgentSignal.tone),
                  )}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{client.clientName}</p>
                        <Badge className={cn("border-0 px-2.5 py-1 text-[11px] font-medium shadow-none", getUrgencyBadgeClasses(client.urgentSignal.tone))}>
                          {client.urgentSignal.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {client.connection.case_title ?? "Untitled case"}
                        {client.county ? ` · ${client.county} County` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => client.connection.client_user_id && navigate(`/attorney/client/${client.connection.client_user_id}`)}
                      disabled={!client.connection.client_user_id}
                    >
                      Review now
                    </Button>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="space-y-3">
            <SectionLabel>All Clients</SectionLabel>
            {clientsQuery.isLoading || enrichedClientsQuery.isLoading ? (
              <Card className="border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardContent className="flex items-center gap-3 p-5 text-sm text-slate-600 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading clients…
                </CardContent>
              </Card>
            ) : clientsQuery.error ? (
              <Card className="border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardContent className="p-5 text-sm text-red-700 dark:text-red-300">
                  {clientsQuery.error instanceof Error ? clientsQuery.error.message : "Could not load clients."}
                </CardContent>
              </Card>
            ) : enrichedClients.length === 0 ? (
              <Card className="border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardContent className="p-4">
                  <EmptyState
                    icon={Users}
                    title="Invite your first client to get started"
                    description="Once a client connects, Atlas will surface case briefs, deadlines, and documents here."
                  />
                </CardContent>
              </Card>
            ) : (
              <Card className="border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
                <CardContent className="p-0">
                  <div className="divide-y divide-black/6 dark:divide-white/10">
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
                          <Avatar className="h-11 w-11 border border-black/6 bg-white">
                            <AvatarFallback className={cn("text-sm font-semibold", getUrgencyBadgeClasses(client.urgentSignal.tone))}>
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
                            <Badge className={cn("border-0 px-2.5 py-1 text-[11px] font-medium shadow-none", getUrgencyBadgeClasses(client.urgentSignal.tone))}>
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

          <Card className="border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
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
                  className="h-11 border-black/8 bg-[#faf8f4]"
                />
                <Button type="submit" className="h-11 bg-slate-900 text-white hover:bg-slate-800 sm:px-5" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Send invite
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <aside className="w-[280px] shrink-0 space-y-5">
          <Card className="border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-900 dark:text-slate-50">Upcoming Deadlines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingDeadlines.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No upcoming deadlines tracked yet.</p>
              ) : (
                upcomingDeadlines.map((client) => (
                  <div key={client.connection.id} className="rounded-xl border border-black/6 bg-[#faf8f4] px-3 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">{client.clientName}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{client.nextDeadlineLabel ?? "Upcoming event"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[oklch(0.63_0.14_79)]">
                          {client.nextDeadlineDate ? new Date(client.nextDeadlineDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Soon"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-black/6 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/85">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-900 dark:text-slate-50">Quick Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quickTasks.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No local quick tasks yet.</p>
              ) : (
                quickTasks.map((task) => (
                  <div key={task.id} className="rounded-xl border border-black/6 bg-[#faf8f4] px-3 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{task.text}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{task.clientName}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
