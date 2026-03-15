import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
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
import { apiRequest } from "@/lib/queryClient";
import { JurisdictionContextHeader } from "@/components/app/JurisdictionContextHeader";
import type { CustodyLawRecord, AILegalResponse } from "@shared/schema";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const STATES_WITH_DATA = new Set([
  "Alabama", "Alaska", "Arizona", "California", "Colorado",
  "Florida", "Georgia", "Illinois", "Indiana", "Louisiana",
  "Massachusetts", "Michigan", "Nevada", "New Jersey", "New York",
  "North Carolina", "Ohio", "Oklahoma", "Pennsylvania", "Texas",
  "Virginia", "Washington",
]);

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

type Mode = "explore" | "compare";

function getStateFill(opts: {
  mode: Mode;
  stateName: string;
  selectedState: string | null;
  stateA: string | null;
  stateB: string | null;
  hoveredState: string | null;
}) {
  const { mode, stateName, selectedState, stateA, stateB, hoveredState } = opts;
  const hasData = STATES_WITH_DATA.has(stateName);

  if (mode === "explore") {
    if (selectedState === stateName) return "#1d4ed8";
    if (hoveredState === stateName) return hasData ? "#3b82f6" : "#94a3b8";
    if (hasData) return "#bfdbfe";
    return "#e2e8f0";
  }

  // Compare mode
  if (stateA === stateName) return "#1d4ed8";
  if (stateB === stateName) return "#d97706";
  if (hoveredState === stateName) return hasData ? "#60a5fa" : "#94a3b8";
  if (hasData) return "#bfdbfe";
  return "#e2e8f0";
}

/* ── Single-state explore panel ───────────────────────────────────────── */
interface StateLawPanelProps {
  stateName: string;
  onClose: () => void;
}

function StateLawPanel({ stateName, onClose }: StateLawPanelProps) {
  const hasData = STATES_WITH_DATA.has(stateName);

  const { data: law, isLoading } = useQuery<CustodyLawRecord>({
    queryKey: ["/api/custody-laws", stateName],
    queryFn: async () => {
      const res = await fetch(`/api/custody-laws/${encodeURIComponent(stateName)}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: hasData,
    staleTime: 5 * 60 * 1000,
  });

  const askAIPath = `/ask?state=${encodeURIComponent(stateName)}&county=general&country=United%20States`;
  const fullDetailsPath = `/jurisdiction/${encodeURIComponent(stateName)}/general`;

  return (
    <div className="flex flex-col h-full" data-testid={`panel-state-${stateName.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-foreground" data-testid="text-panel-state-name">
              {stateName}
            </h2>
            {hasData ? (
              <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                Detailed data available
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Coming soon</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasData ? "Custody law summary for this state" : "Data not yet available for this state"}
          </p>
        </div>
        <Button
          variant="ghost" size="icon" onClick={onClose}
          className="flex-shrink-0 -mt-1 -mr-1"
          data-testid="button-close-panel"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {!hasData && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-8">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Info className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm mb-1">Data coming soon for {stateName}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We're working on adding detailed custody law data for this state.
              You can still ask our AI general questions.
            </p>
          </div>
          <Link href={askAIPath}>
            <Button className="gap-2" data-testid="button-ask-ai-no-data">
              <MessageSquare className="w-4 h-4" />
              Ask AI About {stateName}
            </Button>
          </Link>
        </div>
      )}

      {hasData && isLoading && (
        <div className="flex-1 flex items-center justify-center gap-2 py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading custody laws…</span>
        </div>
      )}

      {hasData && law && (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* Quick summary blurb — shown when the field is present */}
          {law.quick_summary && (
            <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5" data-testid="text-panel-quick-summary">
              <p className="text-xs leading-relaxed text-foreground">{law.quick_summary}</p>
            </div>
          )}

          {/* Law section cards — first 4 with expandable text */}
          {LAW_SECTIONS.slice(0, 4).map(({ key, label, icon: Icon }, idx) => {
            const accentColors = [
              "text-primary border-l-primary/40",
              "text-blue-600 dark:text-blue-400 border-l-blue-400/40",
              "text-violet-600 dark:text-violet-400 border-l-violet-400/40",
              "text-orange-500 dark:text-orange-400 border-l-orange-400/40",
            ];
            const accent = accentColors[idx] ?? accentColors[0];
            const [iconColor, borderColor] = accent.split(" ");
            return (
              <div key={key} className={`rounded-lg border-l-2 border border-border bg-card p-3 shadow-sm ${borderColor}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
                </div>
                <ExpandableText text={law[key] ?? ""} maxLen={200} testId={`text-panel-${key}`} />
              </div>
            );
          })}

          <div className="flex flex-col gap-2 pt-1 pb-2">
            <Link href={askAIPath}>
              <Button className="w-full gap-2" data-testid="button-ask-ai-state">
                <MessageSquare className="w-4 h-4" />
                Ask about custody law in {stateName}
              </Button>
            </Link>
            <Link href={fullDetailsPath}>
              <Button variant="outline" className="w-full gap-2" data-testid="button-view-details">
                <ExternalLink className="w-4 h-4" />
                View full law details
              </Button>
            </Link>
          </div>
        </div>
      )}
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
  const responseRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest("POST", "/api/ask-comparison", {
        stateA,
        stateB,
        userQuestion: q,
      });
      return res.json() as Promise<AILegalResponse>;
    },
    onSuccess: (data) => {
      setAiResponse(data);
      setTimeout(() => {
        responseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    },
  });

  const handleAsk = (q: string) => {
    if (!q.trim()) return;
    setQuestion(q);
    setAiResponse(null);
    mutation.mutate(q);
  };

  return (
    <div className="border-t pt-4 mt-2 space-y-3" data-testid="comparison-ai-section">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Ask AI about this comparison
        </p>
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
          <p className="text-xs text-destructive mt-2">Failed to get AI response. Please try again.</p>
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

          {/* Key points */}
          {aiResponse.key_points.length > 0 && (
            <div className="rounded-lg border bg-card p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key Differences</span>
              </div>
              {aiResponse.key_points.map((pt, i) => (
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
        <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
          <span className="font-semibold text-sm text-blue-800 dark:text-blue-200 truncate flex-1">{stateA}</span>
          <button onClick={onClearA} className="text-blue-400 hover:text-blue-600 flex-shrink-0" data-testid="button-clear-state-a">
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
                <div className="p-2.5 min-h-[64px] bg-blue-50/40 dark:bg-blue-950/10">
                  {!hasDataA ? (
                    <span className="text-xs text-muted-foreground italic">Data coming soon</span>
                  ) : lawA ? (
                    <ExpandableText text={lawA[key]} maxLen={150} testId={`cell-a-${key}`} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <div className="p-2.5 min-h-[64px] bg-amber-50/40 dark:bg-amber-950/10">
                  {!hasDataB ? (
                    <span className="text-xs text-muted-foreground italic">Data coming soon</span>
                  ) : lawB ? (
                    <ExpandableText text={lawB[key]} maxLen={150} testId={`cell-b-${key}`} />
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
                  <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200 ml-2 py-0">Data</Badge>
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1" data-testid="heading-custody-map">
            Custody Law Map
          </h1>
          <p className="text-muted-foreground text-sm">
            {mode === "explore"
              ? "Explore how custody laws differ across states. Click any state to see a summary."
              : "Select two states on the map — or use the dropdowns — to compare custody laws side by side."}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit flex-shrink-0" role="tablist" aria-label="Map mode">
          <button
            role="tab"
            aria-selected={mode === "explore"}
            onClick={() => switchMode("explore")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "explore" ? "bg-white dark:bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
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
              mode === "compare" ? "bg-white dark:bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-compare"
          >
            <GitCompare className="w-3.5 h-3.5" />
            Compare States
          </button>
        </div>
      </div>

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
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#bfdbfe] border border-[#93c5fd] inline-block" />
              <span className="text-xs text-muted-foreground">Data available ({STATES_WITH_DATA.size} states)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#e2e8f0] border border-[#cbd5e1] inline-block" />
              <span className="text-xs text-muted-foreground">Coming soon</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#1d4ed8] inline-block" />
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
                      <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 ml-2">Data</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground ml-2">Soon</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── COMPARE MODE: Two dropdowns + legend ──────────────────────── */}
      {mode === "compare" && (
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
              <span className="w-3 h-3 rounded-sm bg-[#bfdbfe] border border-[#93c5fd] inline-block" />
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
              <span className="w-3 h-3 rounded-sm bg-[#e2e8f0] border border-[#cbd5e1] inline-block" />
              <span className="text-muted-foreground">Coming soon</span>
            </div>
            {!stateA && !stateB && (
              <span className="text-muted-foreground ml-1">
                · Click a state on the map, or use the dropdowns above
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Map + Panel grid ───────────────────────────────────────────── */}
      <div className={`grid gap-5 items-start ${
        mode === "compare" && showComparisonPanel
          ? "grid-cols-1 lg:grid-cols-[1fr_460px]"
          : "grid-cols-1 lg:grid-cols-[1fr_360px]"
      }`}>

        {/* Map card */}
        <Card className="overflow-hidden shadow-md" data-testid="card-map">
          <CardContent className="p-0">
            {/* Hover preview bar */}
            {hoveredState ? (
              <div className="px-4 pt-3 pb-1 border-b bg-muted/30 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium" data-testid="text-hovered-state">{hoveredState}</span>
                {mode === "compare" && stateA && stateB ? (
                  <span className="text-xs text-muted-foreground ml-1">· Click to rotate selection</span>
                ) : mode === "compare" ? (
                  STATES_WITH_DATA.has(hoveredState)
                    ? <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 ml-1">Click to select</Badge>
                    : <span className="text-xs text-muted-foreground">· Coming soon</span>
                ) : (
                  STATES_WITH_DATA.has(hoveredState)
                    ? <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 ml-1">Click to view</Badge>
                    : <span className="text-xs text-muted-foreground">· Coming soon</span>
                )}
              </div>
            ) : (
              <div className="px-4 pt-3 pb-1 border-b bg-muted/30">
                <span className="text-xs text-muted-foreground">
                  {mode === "explore"
                    ? "Hover over a state to preview · Click to open details"
                    : "Click a state to select it for comparison · First click = State A, second = State B"}
                </span>
              </div>
            )}

            <ComposableMap
              projection="geoAlbersUsa"
              style={{ width: "100%", height: "auto" }}
              data-testid="svg-map"
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const stateName: string = geo.properties.name;
                    const fill = getStateFill({
                      mode,
                      stateName,
                      selectedState,
                      stateA,
                      stateB,
                      hoveredState,
                    });
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke="#ffffff"
                        strokeWidth={0.75}
                        style={{
                          default: { outline: "none", cursor: "pointer", transition: "fill 0.15s ease" },
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
          </CardContent>
        </Card>

        {/* Right panel */}
        <div ref={panelRef} data-testid="panel-container">

          {/* EXPLORE: single-state panel */}
          {mode === "explore" && selectedState && (
            <Card className="shadow-md" data-testid="card-state-panel">
              <CardContent className="p-5 min-h-[400px] flex flex-col">
                <StateLawPanel
                  stateName={selectedState}
                  onClose={() => { setSelectedState(null); setSearchQuery(""); }}
                />
              </CardContent>
            </Card>
          )}

          {/* EXPLORE: empty state */}
          {mode === "explore" && !selectedState && (
            <Card className="shadow-sm border-dashed" data-testid="card-panel-empty">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-4 min-h-[300px]">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Scale className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="font-semibold mb-1">Select a state</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Click any state on the map or use the search bar to explore custody laws.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Quick access — states with data
                  </p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {[...STATES_WITH_DATA].slice(0, 8).map((state) => (
                      <button
                        key={state}
                        onClick={() => handleStateClickExplore(state)}
                        className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                        data-testid={`quick-state-${state.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {state}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* COMPARE: comparison panel */}
          {mode === "compare" && showComparisonPanel && (
            <Card className="shadow-md" data-testid="card-compare-panel">
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

      {/* Trust message */}
      <div className="rounded-xl border bg-card p-4 flex gap-3 items-start shadow-sm" data-testid="card-trust-message">
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Info className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Custody laws vary by state. Custody Atlas provides plain-English explanations to help you understand
          the rules that may apply where you live. For advice specific to your situation, always consult a
          licensed family law attorney.
        </p>
      </div>

      {/* Bottom CTAs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="shadow-sm hover-elevate" data-testid="card-cta-ai">
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
        <Card className="shadow-sm hover-elevate" data-testid="card-cta-location">
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

    </div>
  );
}
