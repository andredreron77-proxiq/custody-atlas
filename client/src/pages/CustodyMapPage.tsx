import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { useTheme } from "next-themes";
import { Link } from "wouter";
import {
  Search, X, MessageSquare, Scale, Users, Gavel, MapPin,
  ArrowRight, Info, Loader2, ExternalLink, GitCompare, Map as MapIcon,
  ChevronDown, AlertTriangle, CheckCircle2, Lightbulb, ShieldAlert,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequestRaw } from "@/lib/queryClient";
import { JurisdictionContextHeader } from "@/components/app/JurisdictionContextHeader";
import { UpgradePromptCard } from "@/components/app/UpgradePromptCard";
import { useCurrentUser } from "@/hooks/use-auth";
import {
  fetchUsageState,
  getGuestQuestionsUsed,
  GUEST_QUESTION_LIMIT,
  incrementGuestQuestionsUsed,
  USAGE_QUERY_KEY,
} from "@/services/usageService";
import type { CustodyLawRecord, AILegalResponse } from "@shared/schema";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const IS_DEV = import.meta.env.DEV;
const NAVY = "#0f172a";
const GOLD = "#b5922f";
const WARM_BG = "#f9f8f6";

const ALL_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma",
  "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

const STATES_WITH_DATA = new Set(ALL_STATES);

function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!IS_DEV) {
      setVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, visible };
}

function DevReveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, visible } = useReveal();

  if (!IS_DEV) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(14px)",
        transition: `opacity 650ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 650ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function CountUp({ to, duration = 1200 }: { to: number; duration?: number }) {
  const { ref, visible } = useReveal<HTMLSpanElement>();
  const [value, setValue] = useState(IS_DEV ? 0 : to);

  useEffect(() => {
    if (!IS_DEV || !visible) return;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * to));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, to, duration]);

  return <span ref={ref}>{value}</span>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3"
      style={{ color: GOLD }}
    >
      {children}
    </p>
  );
}

function Divider() {
  return (
    <div
      className="w-8 h-[2px] rounded-full mb-5"
      style={{ background: GOLD }}
      aria-hidden="true"
    />
  );
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

function ExpandableText({
  text,
  maxLen = 180,
  testId,
}: {
  text: string;
  maxLen?: number;
  testId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isTruncated = text.length > maxLen;
  const displayed = expanded ? text : truncate(text, maxLen);

  return (
    <span>
      <span className="text-xs text-foreground leading-relaxed" data-testid={testId}>
        {displayed}
      </span>
      {isTruncated && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 text-[11px] font-medium text-primary hover:underline focus:outline-none whitespace-nowrap"
          data-testid={testId ? `${testId}-toggle` : undefined}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </span>
  );
}

const LAW_SECTIONS: { key: keyof CustodyLawRecord; label: string; icon: typeof Scale }[] = [
  { key: "custody_standard", label: "Custody Standard", icon: Scale },
  { key: "custody_types", label: "Custody Types", icon: Users },
  { key: "modification_rules", label: "Modification Rules", icon: Gavel },
  { key: "relocation_rules", label: "Relocation Rules", icon: MapPin },
  { key: "enforcement_options", label: "Enforcement Options", icon: ShieldAlert },
  { key: "mediation_requirements", label: "Mediation Requirements", icon: MessageSquare },
];

const COMPARISON_CHIPS = [
  "What are the key differences between these two states?",
  "Which state is more favorable for the primary caregiver?",
  "How do modification rules compare?",
  "How does relocation work in each state?",
  "Which state requires mediation before court hearings?",
];

const GUEST_DEMO_SCENARIOS = [
  {
    title: "Scenario 1 — Hearing prep (Georgia)",
    state: "Georgia",
    situation: "Hearing Prep",
    question:
      "I have a custody hearing in 2 weeks in Fulton County. I have the current order but haven't filed anything yet. What should I be doing right now?",
    response:
      "With two weeks until your hearing, the most important thing is to review your current order carefully and gather any documentation that supports your position — school records, medical records, communication logs. Georgia courts focus on the child's best interests, so be ready to speak to your involvement in daily life. If you haven't already, consider whether you need an attorney — two weeks is tight but not too late for a consultation.",
  },
  {
    title: "Scenario 2 — Relocation (Texas)",
    state: "Texas",
    situation: "Relocation",
    question:
      "My ex wants to move with our child from Texas to Colorado. Can they just do that?",
    response:
      "In Texas, a parent with primary custody generally cannot relocate with the child outside the geographic restriction in the custody order without court approval or the other parent's written agreement. If your order has a geographic restriction — which most Texas custody orders do — your ex would need to file a petition to modify it. You have the right to contest that petition. The court will decide based on what's in the child's best interests, not just what's convenient for either parent.",
  },
  {
    title: "Scenario 3 — Modification (California)",
    state: "California",
    situation: "Modification",
    question:
      "My 14-year-old wants to live with me instead of their mom. Does that matter to a California court?",
    response:
      "In California, a child's preference is taken seriously — especially at 14. The court is required to consider the wishes of a child who is mature enough to form an intelligent preference. That doesn't mean the child decides, but a 14-year-old's preference carries real weight. You would need to file a motion to modify custody and show there's been a change in circumstances. The child's preference would be one significant factor the judge considers.",
  },
] as const;

interface GuestExchange {
  id: string;
  question: string;
  answer: string;
  worthKnowing?: string | null;
}

type GuestMessage = {
  role: "user" | "assistant";
  content: string;
  keyPoint?: string | null;
};

type Mode = "explore" | "compare";

function openSignup() {
  window.dispatchEvent(new CustomEvent("custody-atlas:open-auth", { detail: { mode: "signup" } }));
}

function getStateFill(opts: {
  mode: Mode;
  stateName: string;
  selectedState: string | null;
  stateA: string | null;
  stateB: string | null;
  hoveredState: string | null;
  isDark?: boolean;
}) {
  const { mode, stateName, selectedState, stateA, stateB, hoveredState, isDark } = opts;
  const hasData = STATES_WITH_DATA.has(stateName);
  const darkBaseFill = "#5b8db8";
  const darkHoverFill = "#78a7ce";
  const darkSelectedFill = "#8fbbe0";
  const darkNoDataFill = "#2d3748";

  if (mode === "explore") {
    if (selectedState === stateName) return isDark ? darkSelectedFill : "#0f172a";
    if (hoveredState === stateName) return hasData
      ? (isDark ? darkHoverFill : "#334155")
      : (isDark ? "#4a5568" : "#94a3b8");
    if (hasData) return isDark ? darkBaseFill : "#c7d5f0";
    return isDark ? darkNoDataFill : "#e2e8f0";
  }

  // Compare mode
  if (stateA === stateName) return isDark ? darkSelectedFill : "#0f172a";
  if (stateB === stateName) return isDark ? "#f4c66f" : "#b5922f";
  if (hoveredState === stateName) return hasData
    ? (isDark ? darkHoverFill : "#334155")
    : (isDark ? "#4a5568" : "#94a3b8");
  if (hasData) return isDark ? darkBaseFill : "#c7d5f0";
  return isDark ? darkNoDataFill : "#e2e8f0";
}

/* ── StateInfoPanel ────────────────────────────────────────────────────
 *
 * Persistent side panel (desktop) / bottom sheet (mobile) that shows
 * state-level custody law information when a state is selected on the map.
 *
 * Behaviour:
 *   • Always rendered in explore mode — no mount/unmount flicker.
 *   • Empty state  → placeholder with quick-access chips.
 *   • State selected, data available → Quick Summary, Custody Standard,
 *     Child Preference Age (if field populated), Relocation Rules + actions.
 *   • State selected, no data → friendly "coming soon" with AI fallback.
 *   • Mobile: collapsible — collapses to a slim handle; auto-expands on
 *     state selection.
 *   • Desktop (lg+): always fully visible, no collapse handle shown.
 *
 * Data: fetched directly from /api/custody-laws/:state so the panel stays
 * decoupled from its parent; parent only passes the selected state name.
 * ──────────────────────────────────────────────────────────────────────── */
function StateInfoPanel({
  selectedState,
  onCompare,
  quickAccessStates,
  onQuickAccess,
}: {
  selectedState: string | null;
  /** Switch to compare mode with this state pre-loaded as State A. */
  onCompare: (stateName: string) => void;
  quickAccessStates: string[];
  onQuickAccess: (stateName: string) => void;
}) {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const hasData = selectedState ? STATES_WITH_DATA.has(selectedState) : false;

  const { data: law, isLoading } = useQuery<CustodyLawRecord>({
    queryKey: ["/api/custody-laws", selectedState ?? "__none__"],
    queryFn: async () => {
      const res = await fetch(`/api/custody-laws/${encodeURIComponent(selectedState!)}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: hasData && !!selectedState,
    staleTime: 5 * 60 * 1000,
  });

  // Auto-expand the mobile bottom sheet whenever a state is selected
  useEffect(() => {
    if (selectedState) setMobileExpanded(true);
  }, [selectedState]);

  const askAIPath = selectedState
    ? `/ask?state=${encodeURIComponent(selectedState)}&county=general&country=United%20States`
    : "";
  const fullDetailsPath = selectedState
    ? `/jurisdiction/${encodeURIComponent(selectedState)}/general`
    : "";

  return (
    <div
      className="bg-card border rounded-xl shadow-xs overflow-hidden flex flex-col"
      data-testid="panel-state-info"
    >

      {/* ── Mobile collapse handle (hidden on desktop) ──────────────── */}
      <button
        className="lg:hidden flex items-center justify-between px-4 py-3.5 border-b hover:bg-muted/30 transition-colors w-full text-left"
        onClick={() => setMobileExpanded((v) => !v)}
        aria-expanded={mobileExpanded}
        aria-controls="state-panel-body"
        data-testid="button-mobile-panel-toggle"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Scale className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-semibold text-sm truncate">
            {selectedState ? `${selectedState} Custody Law` : "Select a state to explore"}
          </span>
          {selectedState && (
            <Badge className={`text-[10px] flex-shrink-0 ${
              hasData
                ? "bg-primary/[0.1] text-primary border-primary/30 dark:bg-primary/20 dark:text-primary-foreground/80"
                : "bg-muted text-muted-foreground border-border"
            }`}>
              {hasData ? "Data available" : "Coming soon"}
            </Badge>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground flex-shrink-0 ml-3 transition-transform duration-200 ${
            mobileExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* ── Panel body ─────────────────────────────────────────────────
       *   Hidden on mobile when collapsed; always visible on desktop.
       * ─────────────────────────────────────────────────────────────── */}
      <div
        id="state-panel-body"
        className={mobileExpanded ? "block" : "hidden lg:block"}
      >

        {/* ── Empty state ─────────────────────────────────────────────── */}
        {!selectedState && (
          <div className="p-6 flex flex-col items-center justify-center text-center gap-5 min-h-[360px]">
            <div className="w-14 h-14 rounded-2xl border border-border bg-background dark:bg-muted/40 flex items-center justify-center shadow-xs">
              <Scale className="w-6 h-6 text-muted-foreground/70 dark:text-muted-foreground" />
            </div>
            <div>
              <p className="font-serif font-semibold text-base mb-1.5" data-testid="text-panel-empty-heading">
                Select a state on the map
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                to explore custody law.
              </p>
            </div>
            <div className="w-full space-y-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Quick access
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {quickAccessStates.map((s) => (
                  <button
                    key={s}
                    onClick={() => onQuickAccess(s)}
                    className="text-xs px-2.5 py-1 rounded-full bg-primary/[0.07] text-primary border border-primary/20 hover:bg-primary/[0.13] transition-colors dark:bg-primary/[0.18] dark:text-primary dark:border-primary/50 dark:hover:bg-primary/[0.28]"
                    data-testid={`quick-state-${s.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Loading ─────────────────────────────────────────────────── */}
        {selectedState && hasData && isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 p-10 min-h-[300px]">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Loading {selectedState} custody laws…
            </p>
          </div>
        )}

        {/* ── No data (coming soon) ────────────────────────────────────── */}
        {selectedState && !hasData && (
          <div className="p-5 space-y-4">
            <div className="pb-3 border-b">
              <h2 className="text-lg font-bold leading-tight" data-testid="text-panel-state-name">
                {selectedState} Custody Law
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                General statewide overview
              </p>
            </div>
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <Info className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px]">
                We're working on adding detailed custody law data for this state.
                You can still ask our AI general questions.
              </p>
            </div>
            <Link href={askAIPath}>
              <Button className="w-full gap-2 justify-center" data-testid="button-ask-ai-no-data">
                <MessageSquare className="w-4 h-4" />
                Ask Atlas About {selectedState}
              </Button>
            </Link>
          </div>
        )}

        {/* ── State data ──────────────────────────────────────────────── */}
        {selectedState && hasData && law && (
          <div className="p-5 space-y-4" data-testid={`panel-state-${selectedState.toLowerCase().replace(/\s+/g, "-")}`}>

            {/* Header row */}
            <div className="flex items-start justify-between gap-2 pb-3 border-b">
              <div className="min-w-0">
                <h2
                  className="text-lg font-bold leading-tight"
                  data-testid="text-panel-state-name"
                >
                  {selectedState} Custody Law
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">General statewide overview</p>
              </div>
              <Link href={fullDetailsPath} className="flex-shrink-0 mt-0.5">
                <Badge
                  className="text-[10px] bg-primary/[0.07] text-primary border-primary/20 dark:bg-primary/20 cursor-pointer hover:bg-primary/[0.13] transition-colors"
                  data-testid="badge-detailed-data"
                >
                  Full details ↗
                </Badge>
              </Link>
            </div>

            {/* Quick Summary — "At a Glance" blurb */}
            {law.quick_summary && (
              <div
                className="rounded-lg bg-muted/50 border px-3 py-2.5"
                data-testid="text-panel-quick-summary"
              >
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  At a Glance
                </p>
                <p className="text-xs leading-relaxed text-foreground">{law.quick_summary}</p>
              </div>
            )}

            {/* Law section cards */}
            <div className="space-y-2.5">

              {/* Custody Standard */}
              <div className="rounded-lg border-l-2 border-l-primary/40 border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Scale className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Custody Standard
                  </h3>
                </div>
                <ExpandableText
                  text={law.custody_standard}
                  maxLen={200}
                  testId="text-panel-custody-standard"
                />
              </div>

              {/* Child Preference Age — only when the field is populated */}
              {law.child_preference_age && (
                <div className="rounded-lg border-l-2 border-l-violet-400/40 border border-border bg-card p-3 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Users className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Child Preference Age
                    </h3>
                  </div>
                  <ExpandableText
                    text={law.child_preference_age}
                    maxLen={200}
                    testId="text-panel-child-preference"
                  />
                </div>
              )}

              {/* Relocation Rules */}
              <div className="rounded-lg border-l-2 border-l-orange-400/40 border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MapPin className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400 flex-shrink-0" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Relocation Rules
                  </h3>
                </div>
                <ExpandableText
                  text={law.relocation_rules}
                  maxLen={200}
                  testId="text-panel-relocation-rules"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-1">
              <Link href={fullDetailsPath}>
                <Button
                  className="w-full gap-2 justify-center"
                  data-testid="button-view-full-summary"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Full Law Summary
                </Button>
              </Link>
              <Link href={askAIPath}>
                <Button
                  variant="outline"
                  className="w-full gap-2 justify-center"
                  data-testid="button-ask-ai-state"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Ask Atlas About This State
                </Button>
              </Link>
              <Button
                variant="ghost"
                className="w-full gap-2 justify-center text-muted-foreground hover:text-foreground"
                onClick={() => onCompare(selectedState)}
                data-testid="button-compare-this-state"
              >
                <GitCompare className="w-3.5 h-3.5" />
                Compare Another State
              </Button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

/* ── Comparison AI inline chat section ────────────────────────────────── */
interface ComparisonAISectionProps {
  stateA: string;
  stateB: string;
}

function ComparisonAISection({ stateA, stateB }: ComparisonAISectionProps) {
  const [question, setQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState<AILegalResponse | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { data: usage } = useQuery({
    queryKey: USAGE_QUERY_KEY,
    queryFn: fetchUsageState,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const mutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequestRaw("POST", "/api/ask-comparison", {
        stateA,
        stateB,
        userQuestion: q,
      });
      if (res.status === 429) {
        setLimitReached(true);
        throw new Error("QUESTION_LIMIT_REACHED");
      }
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error ?? "Failed to get AI response.");
      }
      return res.json() as Promise<AILegalResponse>;
    },
    onSuccess: (data) => {
      setAiResponse(data);
      if (!user) {
        incrementGuestQuestionsUsed();
      }
      setLimitReached(false);
      queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
      setTimeout(() => {
        responseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    },
  });

  useEffect(() => {
    if (!usage) return;
    setLimitReached(
      usage.questionsLimit !== null && usage.questionsUsed >= usage.questionsLimit,
    );
  }, [usage]);

  const handleAsk = (q: string) => {
    if (!q.trim()) return;
    if (
      !user &&
      usage &&
      usage?.questionsLimit !== null &&
      usage.questionsUsed >= usage.questionsLimit
    ) {
      setLimitReached(true);
      return;
    }
    setQuestion(q);
    setAiResponse(null);
    mutation.mutate(q);
  };

  return (
    <div className="border-t pt-4 mt-2 space-y-3" data-testid="comparison-ai-section">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Ask Atlas about this comparison
        </p>
        {limitReached ? <UpgradePromptCard type="question" className="mb-3" /> : null}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {COMPARISON_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleAsk(chip)}
              disabled={mutation.isPending}
              className="text-xs px-2.5 py-1.5 rounded-full bg-primary/8 text-primary border border-primary/20 hover:bg-primary/15 transition-colors disabled:opacity-50 leading-tight text-left"
              data-testid={`chip-comparison-${chip.slice(0, 20).toLowerCase().replace(/\s+/g, "-")}`}
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Ask about differences between ${stateA} and ${stateB}…`}
            className="text-sm resize-none min-h-[72px]"
            disabled={mutation.isPending}
            data-testid="textarea-comparison-question"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAsk(question);
              }
            }}
          />
          <Button
            onClick={() => handleAsk(question)}
            disabled={mutation.isPending || !question.trim()}
            size="sm"
            className="self-end gap-1.5"
            data-testid="button-ask-comparison"
          >
            {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
          </Button>
        </div>
        {mutation.isError && (
          <p className="text-xs text-destructive mt-2">
            {limitReached ? "You've reached your question limit." : "Failed to get AI response. Please try again."}
          </p>
        )}
      </div>

      {mutation.isPending && (
        <div className="flex items-center gap-2 py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Comparing {stateA} and {stateB}…</span>
        </div>
      )}

      {aiResponse && !mutation.isPending && (
        <div ref={responseRef} className="space-y-3 pt-1" data-testid="comparison-ai-response">
          {/* Summary */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-sm leading-relaxed text-foreground">{aiResponse.summary}</p>
          </div>

          {aiResponse.prose_response && (
            <div className="rounded-lg border bg-card p-3 space-y-2">
              {aiResponse.prose_response
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-foreground">
                    {paragraph}
                  </p>
                ))}
            </div>
          )}

          {/* Key points */}
          {!aiResponse.prose_response && (aiResponse.key_points?.length ?? 0) > 0 && (
            <div className="rounded-lg border bg-card p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key Differences</span>
              </div>
              {(aiResponse.key_points ?? []).map((pt, i) => (
                <div key={i} className="flex gap-2">
                  <span className="w-1 h-1 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <p className="text-sm text-foreground leading-relaxed">{pt}</p>
                </div>
              ))}
            </div>
          )}

          {/* Cautions */}
          {aiResponse.cautions.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Watch Out</span>
              </div>
              {aiResponse.cautions.map((c, i) => (
                <p key={i} className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">{c}</p>
              ))}
            </div>
          )}

          {/* Questions for attorney */}
          {aiResponse.questions_to_ask_attorney.length > 0 && (
            <div className="rounded-lg border bg-card p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb className="w-3.5 h-3.5 text-violet-600" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ask Your Attorney</span>
              </div>
              {aiResponse.questions_to_ask_attorney.map((q, i) => (
                <p key={i} className="text-sm text-foreground leading-relaxed">
                  <span className="text-muted-foreground">{i + 1}.</span> {q}
                </p>
              ))}
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground leading-relaxed italic px-1">{aiResponse.disclaimer}</p>

          {/* Ask again */}
          <button
            onClick={() => { setAiResponse(null); setQuestion(""); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-reset-comparison-ai"
          >
            <RotateCcw className="w-3 h-3" />
            Ask another question
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Comparison panel (two states side by side) ───────────────────────── */
interface ComparisonPanelProps {
  stateA: string;
  stateB: string;
  onClearA: () => void;
  onClearB: () => void;
  onSwap: () => void;
}

function ComparisonPanel({ stateA, stateB, onClearA, onClearB, onSwap }: ComparisonPanelProps) {
  const hasDataA = STATES_WITH_DATA.has(stateA);
  const hasDataB = STATES_WITH_DATA.has(stateB);

  const { data: lawA, isLoading: loadingA } = useQuery<CustodyLawRecord>({
    queryKey: ["/api/custody-laws", stateA],
    queryFn: async () => {
      const res = await fetch(`/api/custody-laws/${encodeURIComponent(stateA)}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: hasDataA,
    staleTime: 5 * 60 * 1000,
  });

  const { data: lawB, isLoading: loadingB } = useQuery<CustodyLawRecord>({
    queryKey: ["/api/custody-laws", stateB],
    queryFn: async () => {
      const res = await fetch(`/api/custody-laws/${encodeURIComponent(stateB)}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: hasDataB,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = (hasDataA && loadingA) || (hasDataB && loadingB);

  return (
    <div data-testid="card-comparison-panel" className="space-y-4">
      {/* Panel header */}
      <div className="flex items-center gap-2 flex-wrap">
        <GitCompare className="w-4 h-4 text-primary" />
        <h2 className="font-bold text-base">State Comparison</h2>
        <button
          onClick={onSwap}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-swap-states"
          title="Swap states"
        >
          <RotateCcw className="w-3 h-3" />
          Swap
        </button>
      </div>

      {/* Explanatory text */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        Custody laws can differ between states. Compare rules to understand how custody laws may vary.
      </p>

      {/* Column headers */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 bg-primary/[0.08] dark:bg-primary/20 border border-primary/25 dark:border-primary/40 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
          <span className="font-semibold text-sm text-primary dark:text-primary-foreground/90 truncate flex-1">{stateA}</span>
          <button onClick={onClearA} className="text-primary/40 hover:text-primary flex-shrink-0" data-testid="button-clear-state-a">
            <X className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-amber-800 dark:text-amber-200 truncate flex-1">{stateB}</span>
          <button onClick={onClearB} className="text-amber-400 hover:text-amber-600 flex-shrink-0" data-testid="button-clear-state-b">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading law data…</span>
        </div>
      )}

      {/* Quick summary row — shown when both states have the field */}
      {!isLoading && (lawA?.quick_summary || lawB?.quick_summary) && (
        <div className="rounded-lg border bg-primary/5 border-primary/15 overflow-hidden" data-testid="comparison-row-quick-summary">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 border-b border-primary/15">
            <Scale className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">At a Glance</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-primary/15">
            <div className="p-2.5 min-h-[56px]">
              <p className="text-xs leading-relaxed text-foreground" data-testid="cell-a-quick-summary">
                {lawA?.quick_summary ?? <span className="text-muted-foreground italic">Not available</span>}
              </p>
            </div>
            <div className="p-2.5 min-h-[56px]">
              <p className="text-xs leading-relaxed text-foreground" data-testid="cell-b-quick-summary">
                {lawB?.quick_summary ?? <span className="text-muted-foreground italic">Not available</span>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Comparison rows */}
      {!isLoading && (
        <div className="space-y-3" data-testid="comparison-rows">
          {LAW_SECTIONS.map(({ key, label, icon: Icon }) => (
            <div key={key} className="rounded-lg border bg-card overflow-hidden" data-testid={`comparison-row-${key}`}>
              {/* Row header */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/40 border-b">
                <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
              </div>
              {/* Side-by-side cells */}
              <div className="grid grid-cols-2 divide-x">
                <div className="p-2.5 min-h-[64px] bg-primary/[0.04] dark:bg-primary/[0.08]">
                  {!hasDataA ? (
                    <span className="text-xs text-muted-foreground italic">Data coming soon</span>
                  ) : lawA ? (
                    <ExpandableText text={lawA[key] ?? ""} maxLen={150} testId={`cell-a-${key}`} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <div className="p-2.5 min-h-[64px] bg-[#fdf9ee]/70 dark:bg-amber-950/10">
                  {!hasDataB ? (
                    <span className="text-xs text-muted-foreground italic">Data coming soon</span>
                  ) : lawB ? (
                    <ExpandableText text={lawB[key] ?? ""} maxLen={150} testId={`cell-b-${key}`} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inline AI section */}
      {!isLoading && (
        <ComparisonAISection stateA={stateA} stateB={stateB} />
      )}
    </div>
  );
}

function GuestStateQAPanel({ selectedState }: { selectedState: string | null }) {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [guestMessages, setGuestMessages] = useState<GuestMessage[]>([]);
  const [questionsUsed, setQuestionsUsed] = useState(() => getGuestQuestionsUsed());
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isGuest = !user;
  const remainingQuestions = Math.max(0, GUEST_QUESTION_LIMIT - questionsUsed);
  const limitReached = isGuest && questionsUsed >= GUEST_QUESTION_LIMIT;
  const hasAskedFirstQuestion = guestMessages.some((message) => message.role === "user");
  const suggestionChips = selectedState
    ? [
        `What are ${selectedState}'s rules if my ex wants to move?`,
        `Can my child choose who to live with in ${selectedState}?`,
        `What should I expect at a ${selectedState} custody hearing?`,
      ]
    : [
        "What rights do I have if my ex wants to move?",
        "Can my child choose who to live with?",
        "What happens at a custody hearing?",
      ];
  const exchanges = guestMessages.reduce<GuestExchange[]>((items, message, index) => {
    if (message.role !== "user") return items;
    const answer = guestMessages[index + 1];
    items.push({
      id: `${index}`,
      question: message.content,
      answer: answer?.role === "assistant" ? answer.content : "",
      worthKnowing: answer?.role === "assistant" ? answer.keyPoint ?? null : null,
    });
    return items;
  }, []);

  useEffect(() => {
    setQuestionsUsed(getGuestQuestionsUsed());
  }, []);

  useEffect(() => {
    setGuestMessages([]);
    setQuestion("");
    setError(null);
  }, [selectedState]);

  const mutation = useMutation({
    mutationFn: async (userQuestion: string) => {
      if (!selectedState) {
        throw new Error("Select a state on the map to ask a question.");
      }

      const res = await apiRequestRaw("POST", "/api/ask", {
        question: userQuestion,
        userQuestion,
        jurisdiction: {
          state: selectedState,
          county: "statewide",
          country: "United States",
        },
        history: guestMessages.concat({ role: "user", content: userQuestion }).slice(-16),
        isGuest: true,
      });

      if (res.status === 429) {
        throw new Error("You've used your free questions.");
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Atlas couldn't answer right now. Please try again.");
      }

      return res.json() as Promise<AILegalResponse>;
    },
    onSuccess: (response, userQuestion) => {
      setGuestMessages((current) => [
        ...current,
        {
          role: "user",
          content: userQuestion,
        },
        {
          role: "assistant",
          content: response.summary,
          keyPoint: response.key_points?.[0] ?? null,
        }
      ]);
      setQuestion("");
      setError(null);
      if (isGuest) {
        const next = incrementGuestQuestionsUsed();
        setQuestionsUsed(next);
        queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
      }
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Atlas couldn't answer right now. Please try again.";
      setError(message);
      if (isGuest) {
        setQuestionsUsed(getGuestQuestionsUsed());
      }
    },
  });

  const handleSubmit = () => {
    if (!question.trim() || mutation.isPending || !selectedState || limitReached) return;
    setError(null);
    mutation.mutate(question.trim());
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-testid="card-guest-state-qa">
      <p
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: GOLD }}
      >
        TRY ATLAS FREE
      </p>
      <div className="max-w-2xl">
        <h2 className="font-serif text-2xl font-semibold leading-tight text-foreground">
          Have a custody question about {selectedState ?? "this state"}?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Get a real answer in plain English. No account needed.
        </p>
      </div>

      {!selectedState ? (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
          Select a state on the map to ask a question.
        </div>
      ) : limitReached ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-5 dark:border-amber-800/50 dark:bg-amber-950/20">
          <p className="text-sm leading-relaxed text-foreground">
            You've used your 3 free questions. Create a free account to get 10 questions total and save your conversations.
          </p>
          <Button className="mt-4 gap-2" onClick={openSignup} data-testid="button-guest-map-signup">
            Create Free Account
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={`Ask anything about custody in ${selectedState}...`}
              className="h-11 border-input bg-background"
              disabled={mutation.isPending}
              data-testid="input-guest-state-question"
            />
            <Button
              onClick={handleSubmit}
              disabled={mutation.isPending || !question.trim()}
              className="h-11 gap-2 px-5"
              data-testid="button-guest-state-question-submit"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Send
            </Button>
          </div>
          {!hasAskedFirstQuestion ? (
            <div className="flex flex-wrap gap-2" data-testid="guest-question-suggestions">
              {suggestionChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    setQuestion(chip);
                    inputRef.current?.focus();
                  }}
                  data-testid={`guest-suggestion-${chip.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}
          {isGuest ? (
            <p className="text-sm text-muted-foreground" data-testid="text-guest-questions-remaining">
              {remainingQuestions} of 3 free questions remaining
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" data-testid="text-guest-state-question-error">
              {error}
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-6 space-y-4" data-testid="guest-state-history">
        {exchanges.map((entry) => (
          <div key={entry.id} className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[90%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm leading-relaxed text-white shadow-sm sm:max-w-[80%] dark:bg-slate-800">
                {entry.question}
              </div>
            </div>
            {entry.answer ? (
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-muted/70 px-4 py-3 text-sm leading-relaxed text-foreground sm:max-w-[82%]">
                  {entry.answer}
                  {entry.worthKnowing ? (
                    <p className="mt-2 text-sm italic text-muted-foreground">
                      Worth knowing: {entry.worthKnowing}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ))}

        {mutation.isPending ? (
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-primary">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md bg-muted/70 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Atlas is thinking...
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScenarioPreviewSection() {
  return (
    <div className="space-y-5" data-testid="section-scenario-previews">
      <div className="max-w-2xl">
        <p
          className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: GOLD }}
        >
          SEE ATLAS IN ACTION
        </p>
        <h2 className="font-serif text-2xl font-semibold leading-tight text-foreground">
          See Atlas In Action
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {GUEST_DEMO_SCENARIOS.map((scenario) => (
          <Card
            key={scenario.title}
            className="border-border bg-card shadow-sm"
            data-testid={`card-scenario-${scenario.state.toLowerCase()}`}
          >
            <CardContent className="flex h-full flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">
                  {scenario.state}
                </Badge>
                <Badge className="border-slate-800 bg-slate-900 text-white hover:bg-slate-900">
                  {scenario.situation}
                </Badge>
              </div>

              <div className="flex justify-end">
                <div className="max-w-[92%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm leading-relaxed text-white">
                  {scenario.question}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-md bg-muted/70 px-4 py-3 text-sm leading-relaxed text-foreground">
                  {scenario.response}
                </div>
              </div>

              <button
                type="button"
                onClick={openSignup}
                className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                data-testid={`button-scenario-signup-${scenario.state.toLowerCase()}`}
              >
                Ask Atlas about your situation
                <ArrowRight className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ── State select dropdown (compare mode) ─────────────────────────────── */
interface StateSelectProps {
  value: string | null;
  onChange: (s: string | null) => void;
  placeholder: string;
  accentClass: string;
  testId: string;
}

function StateSelectDropdown({ value, onChange, placeholder, accentClass, testId }: StateSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? ALL_STATES.filter((s) => s.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : ALL_STATES.slice(0, 8);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative flex-1 min-w-[140px]">
      <button
        onClick={() => { setOpen((v) => !v); setQuery(""); }}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${
          value
            ? `${accentClass} border-current/30 bg-current/5`
            : "text-muted-foreground border-input bg-card hover:bg-muted/50"
        }`}
        data-testid={testId}
      >
        <span className="flex-1 truncate">{value || placeholder}</span>
        {value ? (
          <X
            className="w-3.5 h-3.5 flex-shrink-0 opacity-60 hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false); }}
          />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search state…"
              className="w-full text-sm bg-transparent outline-none px-1"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((state) => (
              <button
                key={state}
                onClick={() => { onChange(state); setOpen(false); setQuery(""); }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 text-left transition-colors"
                data-testid={`compare-option-${state.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <span>{state}</span>
                {STATES_WITH_DATA.has(state) ? (
                  <Badge className="text-[10px] bg-primary/[0.1] text-primary border-primary/25 ml-2 py-0">Data</Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground ml-2">Soon</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────── */
export default function CustodyMapPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [mode, setMode] = useState<Mode>("explore");

  // Explore mode state
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Compare mode state
  const [stateA, setStateA] = useState<string | null>(null);
  const [stateB, setStateB] = useState<string | null>(null);

  // Shared hover state
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  const filteredStates = searchQuery.trim()
    ? ALL_STATES.filter((s) => s.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8)
    : [];

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleStateClickExplore = (stateName: string) => {
    setSelectedState(stateName);
    setSearchQuery(stateName);
    if (panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const handleStateClickCompare = (stateName: string) => {
    if (stateName === stateA) {
      setStateA(stateB);
      setStateB(null);
    } else if (stateName === stateB) {
      setStateB(null);
    } else if (!stateA) {
      setStateA(stateName);
    } else if (!stateB) {
      setStateB(stateName);
    } else {
      // Both already set — rotate: old B becomes A, new click becomes B
      setStateA(stateB);
      setStateB(stateName);
    }
    if (panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const handleMapClick = (stateName: string) => {
    if (mode === "explore") handleStateClickExplore(stateName);
    else handleStateClickCompare(stateName);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSelectedState(null);
    setShowDropdown(false);
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    if (newMode === "explore") {
      setStateA(null);
      setStateB(null);
    } else {
      setSelectedState(null);
      setSearchQuery("");
      setShowDropdown(false);
    }
  };

  const showComparisonPanel = mode === "compare" && stateA && stateB;

  return (
    <div
      className={`max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 ${IS_DEV ? "relative" : ""}`}
      style={IS_DEV ? { background: `linear-gradient(180deg, ${WARM_BG} 0%, transparent 220px)` } : undefined}
    >
      {IS_DEV ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-56 rounded-[2rem]"
          style={{
            backgroundImage: "radial-gradient(circle at 50% 0%, rgba(181, 146, 47, 0.08), transparent 62%)",
          }}
        />
      ) : null}

      {/* Page header */}
      <DevReveal>
        <div className={IS_DEV ? "rounded-3xl border border-slate-200/80 bg-white/90 px-5 py-6 shadow-sm backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-950/85" : ""}>
          {IS_DEV ? (
            <>
              <Divider />
              <SectionLabel>Custody Map</SectionLabel>
            </>
          ) : null}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              {!IS_DEV ? (
                <span className="mb-2.5 inline-flex items-center rounded-full border border-[#dcc98a] bg-[#fdf9ee] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-[#b5922f] dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-400">
                  Custody Map
                </span>
              ) : null}
              <h1 className="font-serif text-2xl font-semibold leading-tight text-foreground md:text-3xl" data-testid="page-title">
                Custody Law Map
              </h1>
              <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
                {mode === "explore"
                  ? "Explore how custody laws differ across states. Click any state to see a summary."
                  : "Select two states on the map — or use the dropdowns — to compare custody laws side by side."}
              </p>
            </div>
            <div
              className={`flex gap-1 rounded-lg p-1 w-fit ${IS_DEV ? "border border-slate-200 bg-[#f8fafc] dark:border-slate-700 dark:bg-slate-900/70" : "bg-muted"}`}
              role="tablist"
              aria-label="Map mode"
            >
              <button
                role="tab"
                aria-selected={mode === "explore"}
                onClick={() => switchMode("explore")}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === "explore"
                    ? "bg-white dark:bg-card shadow-sm text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-explore"
              >
                <MapIcon className="w-3.5 h-3.5" />
                Explore
              </button>
              <button
                role="tab"
                aria-selected={mode === "compare"}
                onClick={() => switchMode("compare")}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === "compare"
                    ? "bg-white dark:bg-card shadow-sm text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-compare"
              >
                <GitCompare className="w-3.5 h-3.5" />
                Compare States
              </button>
            </div>
          </div>
        </div>
      </DevReveal>

      {/* ── Context header (shown when a state or pair is active) ────── */}
      {mode === "compare" && stateA && stateB && (
        <JurisdictionContextHeader
          mode="comparison"
          stateA={stateA}
          stateB={stateB}
        />
      )}
      {mode === "explore" && selectedState && (
        <JurisdictionContextHeader
          mode="jurisdiction"
          state={selectedState}
        />
      )}

      {/* ── EXPLORE MODE: Legend + Search ─────────────────────────────── */}
      {mode === "explore" && (
        <DevReveal delay={60}>
        <div className={`flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between ${IS_DEV ? "rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-950/85" : ""}`}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#c7d5f0] border border-[#9aafd8] dark:bg-[#5b8db8] dark:border-[#78a7ce] inline-block" />
              <span className="text-xs text-muted-foreground">Data available ({IS_DEV ? <CountUp to={STATES_WITH_DATA.size} /> : STATES_WITH_DATA.size} states)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#e2e8f0] border border-[#cbd5e1] dark:bg-[#2d3748] dark:border-[#4a5568] inline-block" />
              <span className="text-xs text-muted-foreground">Coming soon</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#0f172a] dark:bg-[#2563eb] inline-block" />
              <span className="text-xs text-muted-foreground">Selected</span>
            </div>
          </div>
          <div ref={searchRef} className="relative w-full sm:w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
                onFocus={() => searchQuery && setShowDropdown(true)}
                placeholder="Search your state…"
                className="pl-9 pr-9 text-sm bg-card"
                data-testid="input-search-state"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {showDropdown && filteredStates.length > 0 && (
              <div
                className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg z-50 overflow-hidden"
                data-testid="search-dropdown"
              >
                {filteredStates.map((state) => (
                  <button
                    key={state}
                    onClick={() => {
                      setSelectedState(state);
                      setSearchQuery(state);
                      setShowDropdown(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 text-left transition-colors"
                    data-testid={`search-option-${state.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <span>{state}</span>
                    {STATES_WITH_DATA.has(state) ? (
                      <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700/60 ml-2">Data</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground ml-2">Soon</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        </DevReveal>
      )}

      {/* ── COMPARE MODE: Two dropdowns + legend ──────────────────────── */}
      {mode === "compare" && (
        <DevReveal delay={60}>
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-xl border bg-card shadow-sm">
            <span className="text-sm font-medium text-muted-foreground flex-shrink-0">Compare:</span>
            <StateSelectDropdown
              value={stateA}
              onChange={setStateA}
              placeholder="Select State A"
              accentClass="text-blue-700 dark:text-blue-300"
              testId="select-state-a"
            />
            <span className="text-sm font-semibold text-muted-foreground flex-shrink-0">vs</span>
            <StateSelectDropdown
              value={stateB}
              onChange={setStateB}
              placeholder="Select State B"
              accentClass="text-amber-700 dark:text-amber-300"
              testId="select-state-b"
            />
            {(stateA || stateB) && (
              <Button
                variant="ghost" size="sm"
                onClick={() => { setStateA(null); setStateB(null); }}
                className="flex-shrink-0 gap-1.5 text-muted-foreground"
                data-testid="button-clear-comparison"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </Button>
            )}
          </div>

          <div className="flex items-center gap-4 flex-wrap text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#bfdbfe] border border-[#93c5fd] dark:bg-[#5b8db8] dark:border-[#78a7ce] inline-block" />
              <span className="text-muted-foreground">Data available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#1d4ed8] inline-block" />
              <span className="text-muted-foreground">State A</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#d97706] inline-block" />
              <span className="text-muted-foreground">State B</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#e2e8f0] border border-[#cbd5e1] dark:bg-[#2d3748] dark:border-[#4a5568] inline-block" />
              <span className="text-muted-foreground">Coming soon</span>
            </div>
            {!stateA && !stateB && (
              <span className="text-muted-foreground ml-1">
                · Click a state on the map, or use the dropdowns above
              </span>
            )}
          </div>
        </div>
        </DevReveal>
      )}

      {/* ── Map + Panel grid ───────────────────────────────────────────── */}
      <DevReveal delay={120}>
      <div className={`grid gap-5 items-start ${
        mode === "compare" && showComparisonPanel
          ? "grid-cols-1 lg:grid-cols-[1fr_460px]"
          : "grid-cols-1 lg:grid-cols-[1fr_360px]"
      }`}>

        {/* Map card */}
        <Card
          className={`overflow-hidden shadow-sm ${IS_DEV ? "border-slate-200/80 bg-white/95 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] dark:border-slate-700/70 dark:bg-slate-950/90" : ""}`}
          data-testid="card-map"
        >
          <CardContent className={`p-0 ${IS_DEV ? "relative" : ""}`}>
            {IS_DEV ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-40"
                style={{
                  backgroundImage: "radial-gradient(circle at 50% 0%, rgba(181, 146, 47, 0.08), transparent 70%)",
                }}
              />
            ) : null}

            <div className={IS_DEV ? "relative z-10" : ""}>
              {IS_DEV ? (
                <div className="px-4 pt-4 pb-2 border-b border-slate-200/80 bg-[#fbfaf7]/90 dark:border-slate-700/70 dark:bg-slate-950/85">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
                        Interactive Map
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {mode === "explore"
                          ? "Move across the map to preview each state, then click for a plain-English summary."
                          : "Select two states to compare how custody rules change across jurisdictions."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                        <span className="w-2 h-2 rounded-full" style={{ background: NAVY }} />
                        Select
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                        <span className="w-2 h-2 rounded-full" style={{ background: GOLD }} />
                        Preview
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Hover preview bar */}
              {hoveredState ? (
                <div className={`px-4 pt-3 pb-2 border-b flex items-center gap-2 ${IS_DEV ? "bg-white/90 border-slate-200/80 dark:border-slate-700/70 dark:bg-slate-950/85" : "bg-muted/30"}`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full ${IS_DEV ? "bg-amber-50 border border-amber-200 dark:border-amber-800/50 dark:bg-amber-950/30" : ""}`}>
                    <MapPin className={`w-3.5 h-3.5 ${IS_DEV ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`} />
                  </div>
                  <span className={`text-sm font-medium ${IS_DEV ? "text-slate-900 dark:text-slate-100" : ""}`} data-testid="text-hovered-state">{hoveredState}</span>
                  {mode === "compare" && stateA && stateB ? (
                    <span className="text-xs text-muted-foreground ml-1">· Click to rotate selection</span>
                  ) : mode === "compare" ? (
                    STATES_WITH_DATA.has(hoveredState)
                      ? <Badge className={`text-xs ml-1 ${IS_DEV ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-blue-100 text-blue-700 border-blue-200"}`}>Click to select</Badge>
                      : <span className="text-xs text-muted-foreground">· Coming soon</span>
                  ) : (
                    STATES_WITH_DATA.has(hoveredState)
                      ? <Badge className={`text-xs ml-1 ${IS_DEV ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-blue-100 text-blue-700 border-blue-200"}`}>Click to view</Badge>
                      : <span className="text-xs text-muted-foreground">· Coming soon</span>
                  )}
                </div>
              ) : (
                <div className={`px-4 pt-3 pb-2 border-b ${IS_DEV ? "bg-white/90 border-slate-200/80 dark:border-slate-700/70 dark:bg-slate-950/85" : "bg-muted/30"}`}>
                  <span className={`${IS_DEV ? "text-sm text-slate-600 dark:text-slate-300" : "text-xs text-muted-foreground"}`}>
                    {mode === "explore"
                      ? "Hover over a state to preview · Click to open details"
                      : "Click a state to select it for comparison · First click = State A, second = State B"}
                  </span>
                </div>
              )}

              <div className={IS_DEV ? "bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-3 sm:p-4 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_100%)]" : ""}>
                <div className={IS_DEV ? "rounded-2xl border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[inset_0_1px_0_rgba(148,163,184,0.12)]" : ""}>
                  <ComposableMap
                    projection="geoAlbersUsa"
                    style={{ width: "100%", height: "auto" }}
                    data-testid="svg-map"
                  >
                    <Geographies geography={GEO_URL}>
                      {({ geographies }: { geographies: Array<{ rsmKey: string; properties: { name: string } }> }) =>
                        geographies.map((geo: { rsmKey: string; properties: { name: string } }) => {
                          const stateName: string = geo.properties.name;
                          const fill = getStateFill({
                            mode,
                            stateName,
                            selectedState,
                            stateA,
                            stateB,
                            hoveredState,
                            isDark,
                          });
                          return (
                            <Geography
                              key={geo.rsmKey}
                              geography={geo}
                              fill={fill}
                              stroke="#ffffff"
                              strokeWidth={0.75}
                              style={{
                                default: {
                                  outline: "none",
                                  cursor: "pointer",
                                  transition: IS_DEV ? "fill 0.2s ease, transform 0.2s ease, filter 0.2s ease" : "fill 0.15s ease",
                                  filter: IS_DEV && hoveredState === stateName ? "drop-shadow(0 0 6px rgba(181, 146, 47, 0.22))" : "none",
                                },
                                hover: { outline: "none", cursor: "pointer", opacity: 0.9 },
                                pressed: { outline: "none", opacity: 0.8 },
                              }}
                              onClick={() => handleMapClick(stateName)}
                              onMouseEnter={() => setHoveredState(stateName)}
                              onMouseLeave={() => setHoveredState(null)}
                              data-testid={`state-${stateName.toLowerCase().replace(/\s+/g, "-")}`}
                              aria-label={stateName}
                            />
                          );
                        })
                      }
                    </Geographies>
                  </ComposableMap>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right panel */}
        <div ref={panelRef} data-testid="panel-container">

          {/* EXPLORE: persistent state info panel — always rendered */}
          {mode === "explore" && (
            <StateInfoPanel
              selectedState={selectedState}
              onCompare={(stateName) => {
                switchMode("compare");
                setStateA(stateName);
                setStateB(null);
              }}
              quickAccessStates={[...STATES_WITH_DATA].slice(0, 8)}
              onQuickAccess={handleStateClickExplore}
            />
          )}

          {/* COMPARE: comparison panel */}
          {mode === "compare" && showComparisonPanel && (
            <Card className="shadow-sm" data-testid="card-compare-panel">
              <CardContent className="p-5 max-h-[80vh] overflow-y-auto">
                <ComparisonPanel
                  stateA={stateA!}
                  stateB={stateB!}
                  onClearA={() => setStateA(null)}
                  onClearB={() => setStateB(null)}
                  onSwap={() => { const tmp = stateA; setStateA(stateB); setStateB(tmp); }}
                />
              </CardContent>
            </Card>
          )}

          {/* COMPARE: prompt to select states */}
          {mode === "compare" && !showComparisonPanel && (
            <Card className="shadow-sm border-dashed" data-testid="card-compare-empty">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-4 min-h-[300px]">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <GitCompare className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="font-semibold mb-1">
                    {stateA ? `Now select State B` : "Select two states to compare"}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {stateA
                      ? `State A is set to ${stateA}. Click a second state on the map or use the dropdown.`
                      : "Click any two states on the map, or use the dropdowns above."}
                  </p>
                </div>
                {stateA && (
                  <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-200">{stateA}</span>
                    <span className="text-xs text-blue-500 ml-1">selected as State A</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {[...STATES_WITH_DATA].slice(0, 8).map((state) => (
                    <button
                      key={state}
                      onClick={() => handleStateClickCompare(state)}
                      className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 disabled:opacity-40"
                      data-testid={`quick-compare-${state.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      </DevReveal>

      {mode === "explore" ? (
        <DevReveal delay={150}>
          <div className="space-y-8">
            <GuestStateQAPanel selectedState={selectedState} />
            <ScenarioPreviewSection />
            <p className="text-center text-xs text-muted-foreground">
              Scenario responses are illustrative examples. Atlas responses are general information only — not legal advice for your specific situation.
            </p>
          </div>
        </DevReveal>
      ) : null}

      {/* Trust message */}
      <DevReveal delay={180}>
      <div className={`rounded-xl border p-4 flex gap-3 items-start shadow-sm ${IS_DEV ? "bg-white/95 border-slate-200/80 dark:border-slate-700/70 dark:bg-slate-950/90" : "bg-card"}`} data-testid="card-trust-message">
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Info className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Custody laws vary by state. Custody Atlas provides plain-English explanations to help you understand
          the rules that may apply where you live. For advice specific to your situation, always consult a
          licensed family law attorney.
        </p>
      </div>
      </DevReveal>

      {/* Bottom CTAs */}
      <DevReveal delay={240}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className={`shadow-sm hover-elevate ${IS_DEV ? "border-slate-200/80 bg-white/95 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700/70 dark:bg-slate-950/90" : ""}`} data-testid="card-cta-ai">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Ask an AI question</p>
              <p className="text-xs text-muted-foreground">Get plain-English answers about custody law</p>
            </div>
            <Link href="/ask">
              <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" data-testid="button-cta-ask">
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card className={`shadow-sm hover-elevate ${IS_DEV ? "border-slate-200/80 bg-white/95 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700/70 dark:bg-slate-950/90" : ""}`} data-testid="card-cta-location">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Use my location</p>
              <p className="text-xs text-muted-foreground">Auto-detect your state and county</p>
            </div>
            <Link href="/location">
              <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" data-testid="button-cta-location">
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
      <p className="mt-3 text-xs text-muted-foreground leading-relaxed px-1">
        Questions or partnerships?{" "}
        <Link href="/contact" className="transition-colors hover:text-foreground">
          Contact us →
        </Link>
      </p>
      </DevReveal>

    </div>
  );
}
