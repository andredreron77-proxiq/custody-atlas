import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Link } from "wouter";
import { ChevronDown, Info, Loader2, MapPin, MessageSquare, Scale, Users, ExternalLink, GitCompare, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequestRaw } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-auth";
import {
  fetchUsageState,
  getGuestQuestionsUsed,
  GUEST_QUESTION_LIMIT,
  incrementGuestQuestionsUsed,
  USAGE_QUERY_KEY,
} from "@/services/usageService";
import type { AILegalResponse, CustodyLawRecord } from "@shared/schema";

export const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
export const GOLD = "hsl(var(--gold))";

export const ALL_STATES = [
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

export const STATES_WITH_DATA = new Set(ALL_STATES);
export const QUICK_ACCESS_STATES = [...STATES_WITH_DATA].slice(0, 8);

function openSignup() {
  window.dispatchEvent(new CustomEvent("custody-atlas:open-auth", { detail: { mode: "signup" } }));
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
          className="ml-1 whitespace-nowrap text-[11px] font-medium text-primary hover:underline focus:outline-none"
          data-testid={testId ? `${testId}-toggle` : undefined}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </span>
  );
}

export function ExploreStateMap({
  selectedState,
  hoveredState,
  onHoverStateChange,
  onStateClick,
}: {
  selectedState: string | null;
  hoveredState: string | null;
  onHoverStateChange: (stateName: string | null) => void;
  onStateClick: (stateName: string) => void;
}) {
  return (
    <ComposableMap
      projection="geoAlbersUsa"
      style={{ width: "100%", height: "auto" }}
      data-testid="svg-map"
    >
      <Geographies geography={GEO_URL}>
        {({ geographies }: { geographies: Array<{ rsmKey: string; properties: { name: string } }> }) =>
          geographies.map((geo: { rsmKey: string; properties: { name: string } }) => {
            const stateName = geo.properties.name;
            const hasData = STATES_WITH_DATA.has(stateName);
            const isSelected = selectedState === stateName;
            const isHovered = hoveredState === stateName;
            const fill = isSelected
              ? "hsl(var(--gold))"
              : isHovered
                ? (hasData ? "hsl(var(--gold) / 0.7)" : "hsl(var(--muted) / 0.5)")
                : hasData
                  ? "hsl(var(--muted-foreground) / 0.12)"
                  : "hsl(var(--muted) / 0.5)";

            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={fill}
                stroke={isSelected ? "hsl(var(--foreground))" : "hsl(var(--border))"}
                strokeWidth={isSelected ? 1 : 0.6}
                style={{
                  default: {
                    outline: "none",
                    cursor: "pointer",
                    transition: "fill 0.2s ease, filter 0.2s ease",
                    filter: isHovered ? "drop-shadow(0 0 6px hsl(var(--gold) / 0.22))" : "none",
                  },
                  hover: { outline: "none", cursor: "pointer", opacity: 0.9 },
                  pressed: { outline: "none", opacity: 0.8 },
                }}
                onClick={() => onStateClick(stateName)}
                onMouseEnter={() => onHoverStateChange(stateName)}
                onMouseLeave={() => onHoverStateChange(null)}
                data-testid={`state-${stateName.toLowerCase().replace(/\s+/g, "-")}`}
                aria-label={stateName}
              />
            );
          })
        }
      </Geographies>
    </ComposableMap>
  );
}

export function StateInfoPanel({
  selectedState,
  onCompare,
  quickAccessStates,
  onQuickAccess,
  variant = "map",
}: {
  selectedState: string | null;
  onCompare?: (stateName: string) => void;
  quickAccessStates?: string[];
  onQuickAccess?: (stateName: string) => void;
  variant?: "map" | "landing";
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

  useEffect(() => {
    if (selectedState) setMobileExpanded(true);
  }, [selectedState]);

  const askAIPath = selectedState
    ? `/ask?state=${encodeURIComponent(selectedState)}&county=general&country=United%20States`
    : "";
  const fullDetailsPath = variant === "landing"
    ? (selectedState ? `/custody-map` : "")
    : (selectedState ? `/jurisdiction/${encodeURIComponent(selectedState)}/general` : "");

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="panel-state-info">
      <button
        className="flex w-full items-center justify-between border-b px-4 py-3.5 text-left transition-colors hover:bg-muted/30 lg:hidden"
        onClick={() => setMobileExpanded((v) => !v)}
        aria-expanded={mobileExpanded}
        aria-controls="state-panel-body"
        data-testid="button-mobile-panel-toggle"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Scale className="h-4 w-4 flex-shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold">
            {selectedState ? `${selectedState} Custody Law` : "Select a state to explore"}
          </span>
          {selectedState ? (
            <Badge className={`text-[10px] ${hasData ? "border-border bg-secondary text-primary" : "border-border bg-muted text-muted-foreground"}`}>
              {hasData ? "Data available" : "Coming soon"}
            </Badge>
          ) : null}
        </div>
        <ChevronDown className={`ml-3 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${mobileExpanded ? "rotate-180" : ""}`} />
      </button>

      <div id="state-panel-body" className={mobileExpanded ? "block" : "hidden lg:block"}>
        {!selectedState ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-5 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background shadow-xs">
              <Scale className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="mb-1.5 font-serif text-base font-semibold" data-testid="text-panel-empty-heading">
                {variant === "landing" ? "Click a state to see custody law in your area." : "Select a state on the map"}
              </p>
              {variant === "landing" ? null : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  to explore custody law.
                </p>
              )}
            </div>
            {variant === "map" && quickAccessStates?.length && onQuickAccess ? (
              <div className="w-full space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Quick access
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {quickAccessStates.map((s) => (
                    <button
                      key={s}
                      onClick={() => onQuickAccess(s)}
                      className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary"
                      data-testid={`quick-state-${s.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {selectedState && hasData && isLoading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading {selectedState} custody laws…</p>
          </div>
        ) : null}

        {selectedState && !hasData ? (
          <div className="space-y-4 p-5">
            <div className="border-b pb-3">
              <h2 className="text-lg font-bold leading-tight" data-testid="text-panel-state-name">
                {selectedState} Custody Law
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">General statewide overview</p>
            </div>
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Info className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="max-w-[260px] text-sm leading-relaxed text-muted-foreground">
                We're working on adding detailed custody law data for this state. You can still ask our AI general questions.
              </p>
            </div>
            {variant === "map" ? (
              <Link href={askAIPath}>
                <Button className="w-full justify-center gap-2" data-testid="button-ask-ai-no-data">
                  <MessageSquare className="h-4 w-4" />
                  Ask Atlas About {selectedState}
                </Button>
              </Link>
            ) : (
              <Link href="/custody-map">
                <Button className="w-full justify-center gap-2" data-testid="button-view-full-details-no-data">
                  <ExternalLink className="h-4 w-4" />
                  View Full Details
                </Button>
              </Link>
            )}
          </div>
        ) : null}

        {selectedState && hasData && law ? (
          <div className="space-y-4 p-5" data-testid={`panel-state-${selectedState.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className="flex items-start justify-between gap-2 border-b pb-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-tight" data-testid="text-panel-state-name">
                  {selectedState} Custody Law
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">General statewide overview</p>
              </div>
              <Link href={fullDetailsPath} className="mt-0.5 flex-shrink-0">
                <Badge
                  className="cursor-pointer border-border bg-secondary text-[10px] text-primary transition-colors hover:bg-accent"
                  data-testid="badge-detailed-data"
                >
                  {variant === "landing" ? "View Full Details →" : "Full details ↗"}
                </Badge>
              </Link>
            </div>

            {law.quick_summary ? (
              <div className="rounded-lg border bg-muted/50 px-3 py-2.5" data-testid="text-panel-quick-summary">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  At a Glance
                </p>
                <p className="text-xs leading-relaxed text-foreground">{law.quick_summary}</p>
              </div>
            ) : null}

            <div className="space-y-2.5">
              <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Custody Standard
                  </h3>
                </div>
                <ExpandableText text={law.custody_standard} maxLen={variant === "landing" ? 180 : 200} testId="text-panel-custody-standard" />
              </div>

              {law.child_preference_age ? (
                <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Child Preference Age
                    </h3>
                  </div>
                  <ExpandableText text={law.child_preference_age} maxLen={variant === "landing" ? 180 : 200} testId="text-panel-child-preference" />
                </div>
              ) : null}

              <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Relocation Rules
                  </h3>
                </div>
                <ExpandableText text={law.relocation_rules} maxLen={variant === "landing" ? 180 : 200} testId="text-panel-relocation-rules" />
              </div>
            </div>

            {variant === "map" ? (
              <div className="space-y-2 pt-1">
                <Link href={fullDetailsPath}>
                  <Button className="w-full justify-center gap-2" data-testid="button-view-full-summary">
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Full Law Summary
                  </Button>
                </Link>
                <Link href={askAIPath}>
                  <Button variant="outline" className="w-full justify-center gap-2" data-testid="button-ask-ai-state">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Ask Atlas About This State
                  </Button>
                </Link>
                {onCompare ? (
                  <Button
                    variant="ghost"
                    className="w-full justify-center gap-2 text-muted-foreground hover:text-foreground"
                    onClick={() => onCompare(selectedState)}
                    data-testid="button-compare-this-state"
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    Compare Another State
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type GuestMessage = {
  role: "user" | "assistant";
  content: string;
  keyPoint?: string | null;
};

interface GuestExchange {
  id: string;
  question: string;
  answer: string;
  worthKnowing?: string | null;
}

export function GuestStateQAPanel({
  selectedState,
  heading,
  subtext,
  emptyPrompt,
  embedded = false,
}: {
  selectedState: string | null;
  heading?: string;
  subtext?: string;
  emptyPrompt?: string;
  embedded?: boolean;
}) {
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
        { role: "user", content: userQuestion },
        { role: "assistant", content: response.summary, keyPoint: response.key_points?.[0] ?? null },
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
    <div className={embedded ? "" : "rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"} data-testid={embedded ? "card-guest-state-qa-embedded" : "card-guest-state-qa"}>
      {embedded ? null : (
        <>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
            ASK ATLAS — FREE
          </p>
          <div className="max-w-2xl">
            <h2 className="font-serif text-2xl font-semibold leading-tight text-foreground">
              {heading ?? `Have a custody question about ${selectedState ?? "this state"}?`}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {subtext ?? "Get a real answer in plain English. No account needed."}
            </p>
          </div>
        </>
      )}

      {!selectedState ? (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
          {emptyPrompt ?? "Select a state on the map to ask a question."}
        </div>
      ) : limitReached ? (
        <div
          className="mt-5 rounded-xl border px-4 py-5"
          style={{
            borderColor: "hsl(var(--gold))",
            backgroundColor: "hsl(var(--gold) / 0.08)",
          }}
        >
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
              className="h-11 border-transparent bg-muted text-foreground"
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
            <p className="text-sm text-foreground" data-testid="text-guest-state-question-error">
              {error}
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-6 space-y-4" data-testid="guest-state-history">
        {exchanges.map((entry) => (
          <div key={entry.id} className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[90%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm sm:max-w-[80%]">
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
