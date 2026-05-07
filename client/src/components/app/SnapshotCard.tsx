import { useEffect, useState } from "react";
import { Calendar, MapPin, Scale, ShieldCheck, Target } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { apiRequestRaw } from "@/lib/queryClient";
import UpgradeModal from "@/components/app/UpgradeModal";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useUsage } from "@/hooks/use-usage";

export interface GuidedSnapshotState {
  situation_summary?: string | null;
  primary_concern?: string | null;
  concern_category?: "safety" | "stability" | "access" | "financial" | "process" | "other" | string | null;
  current_arrangement?: string | null;
  reason_for_more_time?: string | null;
  change_category?: "schedule_change" | "relocation" | "child_needs" | "parent_availability" | "safety_concern" | "other" | null;
  coparent_stance?: "supportive" | "resistant" | "unknown" | null;
  prior_court_involvement?: boolean | null;
  document_type?:
    | "motion"
    | "petition"
    | "summons"
    | "order_to_show_cause"
    | "subpoena"
    | "unknown"
    | null;
  opposing_request?: string | null;
  response_deadline?: string | null;
  knows_deadline?: boolean | null;
  coparent_relationship?: "cooperative" | "high_conflict" | "no_contact" | "unknown" | null;
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

function formatConcernCategory(value: GuidedSnapshotState["concern_category"]): string {
  const labels: Record<string, string> = {
    safety: "Child Safety",
    stability: "Stability",
    access: "Parenting Access",
    financial: "Financial",
    process: "Understanding the Process",
    other: "General",
  };

  if (!value) return "Not captured yet";
  return labels[value] ?? "Not captured yet";
}

function formatDocumentType(value: GuidedSnapshotState["document_type"]): string {
  const labels: Record<NonNullable<GuidedSnapshotState["document_type"]>, string> = {
    motion: "Motion",
    petition: "Petition",
    summons: "Summons",
    order_to_show_cause: "Order to show cause",
    subpoena: "Subpoena",
    unknown: "Unknown",
  };

  if (!value) return "Not specified";
  return labels[value] ?? "Not specified";
}

function capitalizeFirst(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function truncateText(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function formatCoparentRelationship(value: GuidedSnapshotState["coparent_relationship"]): string {
  const labels: Record<NonNullable<GuidedSnapshotState["coparent_relationship"]>, string> = {
    high_conflict: "High Conflict",
    cooperative: "Cooperative",
    no_contact: "No Contact",
    unknown: "Unknown",
  };

  if (!value) return "Not captured yet";
  return labels[value] ?? "Not captured yet";
}

function formatCoparentStance(value: GuidedSnapshotState["coparent_stance"]): string {
  const labels: Record<NonNullable<GuidedSnapshotState["coparent_stance"]>, string> = {
    supportive: "Supportive",
    resistant: "Resistant",
    unknown: "Unknown",
  };

  if (!value) return "Not captured yet";
  return labels[value] ?? "Not captured yet";
}

function formatOrderStatus(value: GuidedSnapshotState["order_status"]): string {
  const labels: Record<NonNullable<GuidedSnapshotState["order_status"]>, string> = {
    court_order: "Court Order",
    written_agreement: "Written Agreement",
    informal: "Informal",
    none: "No Formal Order",
  };

  if (!value) return "Not captured yet";
  return labels[value] ?? "Not captured yet";
}

function formatPriorCourtInvolvement(value: GuidedSnapshotState["prior_court_involvement"]): string {
  if (value === true) return "Yes";
  if (value === false) return "First Time";
  return "Not captured yet";
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

function formatHopeLine(
  status: GuidedSnapshotState["representation_status"],
  isRespondToFilingSnapshot: boolean,
  isFiguringItOutSnapshot: boolean,
): string {
  if (isFiguringItOutSnapshot) {
    return "You're getting oriented before this situation gets further away from you. That matters.";
  }
  if (isRespondToFilingSnapshot) {
    return "You're getting ahead of this before the court does. That already puts you in a stronger position.";
  }
  if (status === "pro_se_necessity") {
    return "You're here before your hearing and paying attention. Most parents walk in cold. You won't.";
  }
  if (status === "has_attorney") {
    return "You have representation going in. That's more than most parents in your position.";
  }
  return "You came here before your hearing. That already puts you ahead.";
}

export function SnapshotCard({
  caseId,
  conversationId,
  caseName,
  jurisdictionLabel,
  snapshot,
  actions,
  initiallySaved = false,
}: {
  caseId?: string;
  conversationId?: string;
  caseName: string;
  jurisdictionLabel: string;
  snapshot: GuidedSnapshotState;
  actions?: string[];
  initiallySaved?: boolean;
}) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    initiallySaved ? "saved" : "idle",
  );
  const [, navigate] = useLocation();
  const { usage } = useUsage();
  const { data: profile } = useUserProfile();
  const isProUser = (usage?.tier === "pro" || profile?.tier === "pro")
    && (usage?.isAuthenticated === true || !!profile);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const isMoreTimeSnapshot = Boolean(
    snapshot.current_arrangement
    || snapshot.reason_for_more_time
    || snapshot.coparent_stance
    || snapshot.prior_court_involvement !== undefined,
  );
  const isRespondToFilingSnapshot = Boolean(
    snapshot.document_type || snapshot.opposing_request || snapshot.response_deadline || snapshot.coparent_relationship,
  );
  const isFiguringItOutSnapshot = Boolean(
    snapshot.situation_summary
    || snapshot.primary_concern
    || (
      snapshot.concern_category
      && !isMoreTimeSnapshot
      && !isRespondToFilingSnapshot
    ),
  );
  const recentChanges = Array.isArray(snapshot.recent_changes) && snapshot.recent_changes.length > 0
    ? snapshot.recent_changes.join(", ")
    : "No recent changes noted";

  useEffect(() => {
    if (initiallySaved) {
      setSaveState("saved");
    }
  }, [initiallySaved]);

  const canSave = Boolean(caseId && conversationId) && saveState !== "saving" && saveState !== "saved";

  const handleSave = async () => {
    if (!caseId || !conversationId || saveState === "saving") return;
    setSaveState("saving");
    try {
      const res = await apiRequestRaw("POST", `/api/cases/${caseId}/snapshot`, {
        conversationId,
        snapshotState: snapshot,
        actions: Array.isArray(actions) ? actions : [],
      });
      if (!res.ok) {
        throw new Error(`Snapshot save failed (${res.status})`);
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const handleAskAtlasQuestion = () => {
    if (typeof window === "undefined") return;
    const input = document.querySelector("textarea");
    if (input instanceof HTMLTextAreaElement) {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => input.focus({ preventScroll: true }), 150);
    }
  };

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

      {isMoreTimeSnapshot ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              Arrangement
            </div>
            <p className="mt-1 text-sm text-foreground">
              {snapshot.current_arrangement ? truncateText(snapshot.current_arrangement) : "Not captured yet"}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Scale className="h-3.5 w-3.5" />
              Order status
            </div>
            <p className="mt-1 text-sm text-foreground">{formatOrderStatus(snapshot.order_status)}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Reason
            </div>
            <p className="mt-1 text-sm text-foreground">
              {snapshot.reason_for_more_time ? truncateText(snapshot.reason_for_more_time) : "Not captured yet"}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              Other parent
            </div>
            <p className="mt-1 text-sm text-foreground">{formatCoparentStance(snapshot.coparent_stance)}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3 sm:col-span-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Prior court involvement
            </div>
            <p className="mt-1 text-sm text-foreground">{formatPriorCourtInvolvement(snapshot.prior_court_involvement)}</p>
          </div>
        </div>
      ) : isRespondToFilingSnapshot ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Scale className="h-3.5 w-3.5" />
              Document
            </div>
            <p className="mt-1 text-sm text-foreground">{formatDocumentType(snapshot.document_type)}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Deadline
            </div>
            <p className="mt-1 text-sm text-foreground">{snapshot.response_deadline ?? "Deadline not captured"}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Their request
            </div>
            <p className="mt-1 text-sm text-foreground">
              {snapshot.opposing_request ? capitalizeFirst(snapshot.opposing_request) : "Not captured yet"}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              Relationship
            </div>
            <p className="mt-1 text-sm text-foreground">{formatCoparentRelationship(snapshot.coparent_relationship)}</p>
          </div>
        </div>
      ) : isFiguringItOutSnapshot ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-card/70 p-3 sm:col-span-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              Situation
            </div>
            <p className="mt-1 text-sm text-foreground">
              {snapshot.situation_summary ? snapshot.situation_summary : "Not captured yet"}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Scale className="h-3.5 w-3.5" />
              Order status
            </div>
            <p className="mt-1 text-sm text-foreground">{formatOrderStatus(snapshot.order_status)}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Top concern
            </div>
            <p className="mt-1 text-sm text-foreground">
              {snapshot.primary_concern ? truncateText(snapshot.primary_concern) : "Not captured yet"}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3 sm:col-span-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              Concern type
            </div>
            <p className="mt-1 text-sm text-foreground">{formatConcernCategory(snapshot.concern_category)}</p>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}

      <div className="mt-4 rounded-xl border border-[#dcc98a] bg-background/70 p-3 dark:border-[#5e5130]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b5922f]">
          What's Working In Your Favor
        </p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">
          {formatHopeLine(snapshot.representation_status, isRespondToFilingSnapshot, isFiguringItOutSnapshot)}
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-border/70 bg-card/70 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b5922f]">
          What To Do This Week
        </p>
        {Array.isArray(actions) && actions.length > 0 ? (
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-foreground">
            {actions.map((action, index) => (
              <li key={`${index}-${action}`} className="leading-relaxed">
                {action}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Atlas is building your action plan...
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={!canSave} onClick={handleSave}>
          {saveState === "saving"
            ? "Saving..."
            : saveState === "saved"
              ? "Saved ✓"
              : saveState === "error"
                ? "Save failed — try again"
                : "Save Snapshot"}
        </Button>
        {usage && !isProUser && (
          <Button type="button" className="min-h-11 w-full" onClick={() => setUpgradeOpen(true)}>
            Keep preparing with Pro — $19.99/mo
          </Button>
        )}
      </div>

      {saveState === "saved" ? (
        <div className="mt-4 rounded-xl border border-border/70 bg-card/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b5922f]">
            What's Next
          </p>
          <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">
            Your case snapshot is saved. Here's what to do next.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Button
              type="button"
              className="min-h-11 w-full"
              onClick={() => caseId && navigate(`/case/${caseId}`)}
              disabled={!caseId}
            >
              View My Case Dashboard
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => caseId ? navigate(`/case/${caseId}?upload=true`) : navigate("/workspace")}
            >
              Upload a Document
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              onClick={handleAskAtlasQuestion}
            >
              Ask Atlas a Question
            </Button>
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-muted-foreground">
        Situational guidance, not legal advice.
      </p>
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}
