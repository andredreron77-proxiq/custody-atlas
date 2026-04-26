import { Link } from "wouter";
import { Calendar, MapPin, Scale, ShieldCheck, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface GuidedSnapshotState {
  hearing_date: string | null;
  hearing_type:
    | "temporary_custody"
    | "final"
    | "status_conference"
    | "modification"
    | "contempt"
    | "ex_parte"
    | "mediation"
    | "unknown"
    | null;
  top_concern: string | null;
  concern_category?: string | null;
  current_schedule: string | null;
  order_status?: string | null;
  recent_changes: string[] | null;
  representation_status:
    | "has_attorney"
    | "pro_se_choice"
    | "pro_se_necessity"
    | null;
  child_safety_flag?: boolean;
  waypoints_complete?: number[];
}

function formatHearingType(value: GuidedSnapshotState["hearing_type"]): string {
  const labels: Record<NonNullable<GuidedSnapshotState["hearing_type"]>, string> = {
    temporary_custody: "Temporary custody",
    final: "Final hearing",
    status_conference: "Status conference",
    modification: "Modification",
    contempt: "Contempt",
    ex_parte: "Ex parte",
    mediation: "Mediation",
    unknown: "Unknown",
  };

  if (!value) return "Not specified";
  return labels[value] ?? "Not specified";
}

function formatHopeLine(status: GuidedSnapshotState["representation_status"]): string {
  if (status === "pro_se_necessity") {
    return "You're here before your hearing and paying attention. Most parents walk in cold. You won't.";
  }
  if (status === "has_attorney") {
    return "You have representation going in. That's more than most parents in your position.";
  }
  return "You came here before your hearing. That already puts you ahead.";
}

export function SnapshotCard({
  caseName,
  jurisdictionLabel,
  snapshot,
}: {
  caseName: string;
  jurisdictionLabel: string;
  snapshot: GuidedSnapshotState;
}) {
  const recentChanges = Array.isArray(snapshot.recent_changes) && snapshot.recent_changes.length > 0
    ? snapshot.recent_changes.join(", ")
    : "No recent changes noted";

  return (
    <div className="rounded-2xl border border-[#dcc98a] bg-[#fdf9ee] p-4 shadow-sm dark:border-[#5e5130] dark:bg-[#1f1a10]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b5922f]">
            Your Situation
          </p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">
            YOUR SITUATION — {caseName}
          </h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/80 text-[#b5922f]">
          <Target className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-card/70 p-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Hearing
          </div>
          <p className="mt-1 text-sm text-foreground">
            {snapshot.hearing_date ?? "Date not captured"}, {jurisdictionLabel}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/70 p-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Scale className="h-3.5 w-3.5" />
            Type
          </div>
          <p className="mt-1 text-sm text-foreground">{formatHearingType(snapshot.hearing_type)}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/70 p-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Your concern
          </div>
          <p className="mt-1 text-sm text-foreground">{snapshot.top_concern ?? "Not captured yet"}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/70 p-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Current arrangement
          </div>
          <p className="mt-1 text-sm text-foreground">{snapshot.current_schedule ?? "Not captured yet"}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-border/70 bg-card/70 p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recent changes
        </div>
        <p className="mt-1 text-sm text-foreground">{recentChanges}</p>
      </div>

      <div className="mt-4 rounded-xl border border-[#dcc98a] bg-background/70 p-3 dark:border-[#5e5130]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b5922f]">
          What's Working In Your Favor
        </p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">
          {formatHopeLine(snapshot.representation_status)}
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-border/70 bg-card/70 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b5922f]">
          What To Do This Week
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Atlas is building your action plan...
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" className="min-h-11" disabled>
          Save Snapshot
        </Button>
        <Link href="/upgrade">
          <Button type="button" className="min-h-11 w-full">
            Keep preparing with Pro — $19.99/mo
          </Button>
        </Link>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Situational guidance, not legal advice.
      </p>
    </div>
  );
}
