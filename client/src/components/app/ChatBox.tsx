import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Send, Loader2, Bot, User, AlertTriangle,
  CheckCircle2, HelpCircle, Scale, ShieldAlert, ChevronRight,
  MessageSquare, RotateCcw, MapPin, Sparkles, UserCheck, BookmarkCheck,
  FileSearch, Zap, Search, CheckCheck, BookmarkPlus, Info, Upload, Calendar, Clock, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { ChatMessage, AILegalResponse, Jurisdiction, ConversationHistoryItem } from "@shared/schema";
import { apiRequestRaw } from "@/lib/queryClient";
import { UpgradePromptCard } from "./UpgradePromptCard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { registerChatBoxHandler, unregisterChatBoxHandler } from "@/lib/aiEntry";
import { trackEvent } from "@/lib/analytics";
import { formatJurisdictionLabel } from "@/lib/jurisdictionUtils";
import { MicButton } from "./MicButton";
import { TTSControls } from "./TTSControls";
import { useSpeechRecording } from "@/hooks/useSpeechRecording";
import { useCurrentUser } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  fetchUsageState,
  incrementGuestQuestionsUsed,
} from "@/services/usageService";

const THINKING_MESSAGES = [
  "Atlas is thinking...",
  "Looking into this for you...",
  "Give me just a moment...",
  "Pulling this together...",
  "Let me think through this...",
  "Working on it...",
];

interface ChatBoxProps {
  initialConversationId?: string;
  jurisdiction: Jurisdiction;
  initialQuestion?: string;
  initialMessages?: ChatMessage[];
  initialThreadId?: string;
  caseId?: string;
  documentId?: string;
  selectedDocumentIds?: string[];
  onSelectCase?: (caseId?: string) => void;
  answeringScopeLabel?: string;
  className?: string;
  onHasMessagesChange?: (hasMessages: boolean) => void;
  onMessageCountChange?: (count: number) => void;
  conversationType?: string;
  guidedProgressLabel?: string;
  guidedMemoryChips?: Array<{
    kind: "calendar" | "map" | "target";
    label: string;
  }>;
}

type CaseSelectionRequiredResponse = {
  type: "case_selection_required";
  message: string;
  cases: Array<{ id: string; name: string }>;
};

type JurisdictionMismatchInfo = {
  jurisdictionMismatch?: boolean;
  caseJurisdiction?: { state: string; county: string };
  askJurisdiction?: { state: string; county: string };
};

type AskAssistantResponse = AILegalResponse & {
  conversationId?: string;
  overageWarning?: boolean;
  questionsUsed?: number;
  questionsLimit?: number;
} & JurisdictionMismatchInfo;

type GuidedMessageMetadata = {
  guided_flow?: boolean;
  flow_type?: string;
};

type GuidedInsight = {
  type: "suggested_question" | "contradiction" | "assumption_challenge" | "action" | "deadline";
  text: string;
  reason: string;
};

type NextStepCardData =
  | {
      type: "upload";
      title: string;
      subtitle: string;
      cta: string;
      href: string;
      icon: typeof Upload;
    }
  | {
      type: "hearing";
      title: string;
      subtitle: string;
      cta: string;
      href: string;
      icon: typeof Calendar;
    }
  | {
      type: "attorney";
      title: string;
      subtitle: string;
      cta: string;
      href: string;
      icon: typeof Scale;
    }
  | {
      type: "deadline";
      title: string;
      subtitle: string;
      cta: string;
      dateLabel: string;
      icon: typeof Clock;
    };

function getSuggestedQuestions(state: string): string[] {
  const s = state || "my state";
  return [
    `How is custody decided in ${s}?`,
    "Can my ex move out of state with my child?",
    `How does child support work in ${s}?`,
    `What rights do fathers have in ${s}?`,
    `How do I modify a custody order in ${s}?`,
  ];
}

const FOLLOW_UP_QUESTIONS = [
  "Can I modify this custody order later?",
  "What should I document to protect my case?",
  "What role does a mediator play in this process?",
  "How long does the custody process typically take?",
  "What happens if we can't agree outside of court?",
];

function CautionsList({ cautions }: { cautions: string[] }) {
  if (!cautions || cautions.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Important Cautions
        </span>
      </div>
      <ul className="space-y-1">
        {cautions.map((c, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200"
            data-testid={`caution-item-${i}`}
          >
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
            <span className="leading-relaxed">{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SaveAsActionButton({
  caseId,
  title,
  description,
}: {
  caseId: string;
  title: string;
  description: string;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (saved || saving) return;
    setSaving(true);
    try {
      const res = await apiRequestRaw("POST", `/api/cases/${caseId}/actions`, {
        action_type: "chat_suggested",
        title: title.slice(0, 120),
        description: description.slice(0, 500),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      onClick={save}
      disabled={saving || saved}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors ${
        saved
          ? "bg-primary/10 text-primary cursor-default"
          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      data-testid="button-save-as-action"
    >
      {saving ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : saved ? (
        <BookmarkCheck className="w-3 h-3" />
      ) : (
        <BookmarkPlus className="w-3 h-3" />
      )}
      {saved ? "Saved to Actions" : "Save as Action"}
    </button>
  );
}

function StructuredResponse({
  data,
  caseId,
  onSelectSuggestedQuestion,
  showFollowUpChips,
  summaryAnimate,
  onSummaryAnimationComplete,
  isGuidedConversation = false,
}: {
  data: AILegalResponse;
  caseId?: string;
  onSelectSuggestedQuestion: (question: string) => void;
  showFollowUpChips?: boolean;
  summaryAnimate?: boolean;
  onSummaryAnimationComplete?: () => void;
  isGuidedConversation?: boolean;
}) {
  const isFact = data.intent === "FACT";
  const isAction = data.intent === "ACTION";
  const keyPoints = data.key_points ?? [];
  const proseResponse = data.prose_response?.trim() ?? "";
  const [confirmingValue, setConfirmingValue] = useState<string | null>(null);
  const [confirmedValues, setConfirmedValues] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isFact && summaryAnimate) {
      onSummaryAnimationComplete?.();
    }
  }, [isFact, onSummaryAnimationComplete, summaryAnimate]);

  async function confirmFact(factType: string, value: string) {
    if (!caseId || !factType) return;
    setConfirmingValue(value);
    try {
      const res = await apiRequestRaw("POST", `/api/cases/${caseId}/facts/confirm`, {
        fact_type: factType,
        value,
        source_name: "Confirmed by user",
      });
      if (res.ok) {
        setConfirmedValues((prev) => new Set([...prev, value]));
      }
    } catch {
      // silent
    } finally {
      setConfirmingValue(null);
    }
  }

  const canConfirm = !!caseId && !!data.factTypeKey;
  const proactiveInsights = data.proactive_insights?.slice(0, 2) ?? [];

  return (
    <div className="space-y-3">
      {isFact && (
        <div
          className={`rounded-md p-2.5 flex items-start gap-2 ${
            data.factConflict
              ? "bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50"
              : data.factSource
                ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50"
                : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50"
          }`}
          data-testid="fact-answer-banner"
        >
          {data.factConflict
            ? <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
            : data.factSource
              ? <FileSearch className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              : <Search className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          }
          <div className="min-w-0 flex-1">
            {data.factConflict && (
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide mb-0.5">
                Conflicting Values Found
              </p>
            )}
            <p className="text-sm font-semibold text-foreground leading-snug">{data.summary}</p>
            {data.factSource && !data.factConflict && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.factUserConfirmed
                  ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium"><CheckCheck className="w-3 h-3" />You confirmed this value</span>
                  : <>Extracted from: <span className="font-medium">{data.factSource}</span></>
                }
              </p>
            )}
            {data.factSource && !data.factConflict && canConfirm && !data.factUserConfirmed && data.factValue && (
              <button
                className={`mt-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors ${
                  confirmedValues.has(data.factValue)
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 cursor-default"
                    : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60"
                }`}
                onClick={() => !confirmedValues.has(data.factValue!) && confirmFact(data.factTypeKey ?? "", data.factValue!)}
                disabled={confirmedValues.has(data.factValue) || confirmingValue === data.factValue}
                data-testid="button-confirm-fact"
              >
                {confirmingValue === data.factValue ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                {confirmedValues.has(data.factValue) ? "Confirmed" : "Confirm this value"}
              </button>
            )}
            {data.factConflict && data.conflictOptions && canConfirm && (
              <div className="mt-2 space-y-1.5">
                {data.conflictOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-foreground/80 font-medium truncate max-w-[200px]">
                      "{opt.value}"
                    </span>
                    <button
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded transition-colors flex-shrink-0 ${
                        confirmedValues.has(opt.value)
                          ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 cursor-default"
                          : "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/60"
                      }`}
                      onClick={() => !confirmedValues.has(opt.value) && confirmFact(opt.factTypeKey ?? data.factTypeKey ?? "", opt.value)}
                      disabled={confirmedValues.has(opt.value) || confirmingValue === opt.value}
                      data-testid={`button-confirm-conflict-${i}`}
                    >
                      {confirmingValue === opt.value ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                      {confirmedValues.has(opt.value) ? "Confirmed" : "Confirm"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!isFact && (
        <div className="text-[14.5px] leading-[1.65] text-foreground">
          <AnimatedAssistantText
            content={data.summary}
            animate={Boolean(summaryAnimate)}
            onComplete={onSummaryAnimationComplete}
          />
        </div>
      )}

      {!isFact && !isGuidedConversation && proseResponse && (
        <div className="space-y-3">
          {proseResponse
            .split(/\n{2,}/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean)
            .map((paragraph, index) => (
              <p key={index} className="text-[14.5px] leading-[1.75] text-foreground/88">
                <AnimatedAssistantText content={paragraph} animate={false} />
              </p>
            ))}
        </div>
      )}

      {proactiveInsights.length > 0 && (
        <div className="space-y-2.5 border-t border-border pt-2.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span>Atlas noticed something</span>
          </div>
          <div className="space-y-2">
            {proactiveInsights.map((insight, index) => (
              <div
                key={`${insight.type}-${index}`}
                className={`rounded-lg border px-3 py-2.5 ${
                  insight.type === "contradiction"
                    ? "border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20"
                    : insight.type === "assumption_challenge"
                      ? "border-sky-200 dark:border-sky-800/50 bg-sky-50 dark:bg-sky-950/20"
                      : "border-border bg-muted/30"
                }`}
              >
                {insight.type === "suggested_question" ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">You might also want to ask:</p>
                    <button
                      type="button"
                      onClick={() => onSelectSuggestedQuestion(insight.text)}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-left text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{insight.text}</span>
                    </button>
                    <p className="text-xs leading-relaxed text-muted-foreground">{insight.reason}</p>
                  </div>
                ) : insight.type === "contradiction" ? (
                  <div className="space-y-1">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">
                        <span className="font-medium">Heads up:</span> {insight.text}
                      </p>
                    </div>
                    <p className="text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/80">{insight.reason}</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-start gap-2">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                      <p className="text-sm leading-relaxed text-sky-900 dark:text-sky-100">
                        <span className="font-medium">Consider this:</span> {insight.text}
                      </p>
                    </div>
                    <p className="text-xs leading-relaxed text-sky-800/80 dark:text-sky-200/80">{insight.reason}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showFollowUpChips && !isGuidedConversation && (
        <FollowUpChips onSelect={onSelectSuggestedQuestion} disabled={false} highlighted />
      )}

      {!isGuidedConversation && isAction && !proseResponse && keyPoints.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/55">
                Steps to Take
              </span>
            </div>
            {caseId && (
              <SaveAsActionButton
                caseId={caseId}
                title={data.summary.slice(0, 120)}
                description={keyPoints.slice(0, 5).join("; ")}
              />
            )}
          </div>
          <ol className="space-y-2 list-decimal list-inside">
            {keyPoints.map((point, i) => (
              <li key={i} className="text-[14.5px] leading-[1.75] text-foreground/85 pl-1" data-testid={`key-point-${i}`}>
                {point}
              </li>
            ))}
          </ol>
        </div>
      )}

      {!isGuidedConversation && !isAction && !proseResponse && keyPoints.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/55">
              {isFact ? "Details" : "Key Points"}
            </span>
          </div>
          <ul className="space-y-2">
            {keyPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2.5" data-testid={`key-point-${i}`}>
                <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="text-[14.5px] leading-[1.75] text-foreground/85">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isGuidedConversation && <CautionsList cautions={data.cautions} />}

      {!isGuidedConversation && data.questions_to_ask_attorney.length > 0 && (
        <div className="rounded-md border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-700/80 dark:text-blue-300/80">
              Questions to Ask Your Attorney
            </span>
          </div>
          <ul className="space-y-2">
            {data.questions_to_ask_attorney.map((q, i) => (
              <li key={i} className="flex items-start gap-2.5" data-testid={`attorney-question-${i}`}>
                <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                <span className="text-[14.5px] leading-[1.75] text-blue-900 dark:text-blue-100">{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-start gap-1.5 pt-1.5 border-t border-border">
        <Scale className="w-3 h-3 text-foreground/35 flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-foreground/50 italic leading-relaxed">{data.disclaimer}</p>
      </div>
    </div>
  );
}

function FollowUpChips({
  onSelect,
  disabled,
  highlighted = false,
}: {
  onSelect: (q: string) => void;
  disabled: boolean;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`space-y-2 rounded-lg border px-3 py-2.5 ${
        highlighted
          ? "border-primary/35 bg-primary/5 shadow-sm"
          : "border-border/60 bg-muted/20"
      }`}
      data-testid="follow-up-chips"
    >
      <p className="text-xs text-muted-foreground italic">
        Want to go deeper? Ask a follow-up about your situation.
      </p>
      <div className="flex flex-wrap gap-2">
        {FOLLOW_UP_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            disabled={disabled}
            className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              highlighted
                ? "border-primary/40 bg-background text-foreground/80 hover:border-primary/60 hover:bg-primary/5 hover:text-foreground"
                : "bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
            data-testid={`button-followup-${i}`}
          >
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function extractGuidedReplyChips(text: string): string[] {
  const normalized = text.toLowerCase();

  if (/\b(document|documents|paperwork|papers|order|served|upload|copy|filing)\b/.test(normalized)) {
    return ["Yes, I have it", "No, I don't have it yet", "I have some documents"];
  }

  if (/\b(other parent|ex\b|their parent|communication|talk to|co-parent|lawyers only)\b/.test(normalized)) {
    return ["We can communicate", "Communication is difficult", "Through lawyers only"];
  }

  if (/\b(live with|lives with|living situation|primary home|resides|share time equally)\b/.test(normalized)) {
    return ["Child lives with me", "Child lives with them", "We share time equally"];
  }

  if (/\b(hearing|date|when|deadline|how soon|timeline|this week|next week|month)\b/.test(normalized)) {
    return ["This week", "Within a month", "Already passed"];
  }

  return ["Tell me more", "What should I do next?", "I'm not sure"];
}

function extractDateLabel(text: string): string | null {
  const patterns = [
    /\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?/i,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function detectNextStepCard(
  message: ChatMessage,
  jurisdiction: Jurisdiction,
  caseId?: string,
): NextStepCardData | null {
  const summary = message.structured?.summary ?? message.content;
  const normalized = `${summary}\n${message.structured?.prose_response ?? ""}`.toLowerCase();
  const proactiveInsights = (message.structured?.proactive_insights ?? []) as GuidedInsight[];
  const actionInsight = proactiveInsights.find((insight) => insight.type === "action");
  const deadlineInsight = proactiveInsights.find((insight) => insight.type === "deadline");

  if (deadlineInsight || /\b(deadline|file by|due by|due date)\b/.test(normalized)) {
    return {
      type: "deadline",
      title: "Watch this deadline",
      subtitle: "Confirm your filing deadlines with the court",
      cta: "Review deadline",
      dateLabel: extractDateLabel(deadlineInsight?.text ?? normalized) ?? "Deadline mentioned",
      icon: Clock,
    };
  }

  if (actionInsight?.text.toLowerCase().includes("upload") || /\bupload\b/.test(normalized)) {
    return {
      type: "upload",
      title: "Upload the document",
      subtitle: "Atlas can analyze it and explain what it means",
      cta: "Upload document",
      href: "/upload-document",
      icon: Upload,
    };
  }

  if (/\bhearing\b/.test(normalized) && /\bprepare|preparation|prepared\b/.test(normalized)) {
    const params = new URLSearchParams();
    params.set("q", "I need help preparing for my hearing.");
    if (caseId) params.set("case", caseId);
    return {
      type: "hearing",
      title: "Build your hearing prep plan",
      subtitle: "Let's make sure you're ready for court",
      cta: "Continue hearing prep",
      href: `/ask?${params.toString()}`,
      icon: Calendar,
    };
  }

  if (/\b(attorney|lawyer)\b/.test(normalized)) {
    const params = new URLSearchParams();
    params.set("state", jurisdiction.state);
    params.set("county", jurisdiction.county);
    return {
      type: "attorney",
      title: "Find local legal support",
      subtitle: "Get guidance specific to your situation",
      cta: "See resources",
      href: `/resources?${params.toString()}`,
      icon: Scale,
    };
  }

  return null;
}

function AnimatedAssistantText({
  content,
  animate,
  onComplete,
}: {
  content: string;
  animate: boolean;
  onComplete?: () => void;
}) {
  const wordsRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  const [displayedText, setDisplayedText] = useState(animate ? "" : content);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    console.log("[guided reveal] effect start", { animate, contentLength: content.length });

    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!animate) {
      setDisplayedText(content);
      onCompleteRef.current?.();
      return;
    }

    const allWords = content.split(/\s+/).filter(Boolean);
    const animatedWords = allWords.slice(0, 150);
    const remainingText = allWords.slice(150).join(" ");

    wordsRef.current = animatedWords;
    indexRef.current = 0;
    setDisplayedText("");

    if (animatedWords.length === 0) {
      setDisplayedText(content);
      onCompleteRef.current?.();
      return;
    }

    intervalRef.current = window.setInterval(() => {
      console.log("[reveal] tick", indexRef.current);
      indexRef.current += 1;
      const nextText = wordsRef.current.slice(0, indexRef.current).join(" ");

      if (indexRef.current >= wordsRef.current.length) {
        const finalText = remainingText ? `${nextText} ${remainingText}` : nextText;
        setDisplayedText(finalText);
        if (intervalRef.current !== null) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        onCompleteRef.current?.();
        return;
      }

      setDisplayedText(nextText);
    }, 35);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [animate, content]);

  return <>{displayedText}</>;
}

function GuidedReplyChips({
  chips,
  visible,
  disabled,
  onSelect,
}: {
  chips: string[];
  visible: boolean;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-2 transition-opacity duration-300",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSelect(chip)}
          disabled={disabled}
          className="min-h-11 rounded-full border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

function NextStepCard({
  card,
  visible,
  onContinueHearingPrep,
}: {
  card: NextStepCardData;
  visible: boolean;
  onContinueHearingPrep?: () => void;
}) {
  const [, navigate] = useLocation();
  const [showDeadline, setShowDeadline] = useState(false);
  const Icon = card.icon;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3 shadow-sm transition-opacity duration-300",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{card.title}</p>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{card.subtitle}</p>
          {card.type === "deadline" && showDeadline ? (
            <div className="mt-3 inline-flex rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
              {card.dateLabel}
            </div>
          ) : null}
          <div className="mt-3">
            <Button
              type="button"
              size="sm"
              className="min-h-11"
              onClick={() => {
                if (card.type === "deadline") {
                  setShowDeadline(true);
                  return;
                }
                if (card.type === "hearing") {
                  onContinueHearingPrep?.();
                  return;
                }
                navigate(card.href);
              }}
            >
              {card.cta}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatBox({
  jurisdiction,
  initialQuestion,
  initialMessages,
  initialThreadId,
  initialConversationId,
  caseId,
  documentId,
  selectedDocumentIds,
  onSelectCase,
  answeringScopeLabel,
  className,
  onHasMessagesChange,
  onMessageCountChange,
  conversationType,
  guidedProgressLabel,
  guidedMemoryChips = [],
}: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(THINKING_MESSAGES[0]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [proOverageNotice, setProOverageNotice] = useState<{
    questionsUsed: number;
    questionsLimit: number;
  } | null>(null);
  const [savedToWorkspace, setSavedToWorkspace] = useState(!!initialThreadId || !!caseId);
  const [jurisdictionPreference, setJurisdictionPreference] = useState<"case" | "ask" | null>(null);
  const [dismissedMismatchMessageIds, setDismissedMismatchMessageIds] = useState<Set<string>>(new Set());
  const [pendingCaseSelection, setPendingCaseSelection] = useState<{
    message: string;
    question: string;
    cases: Array<{ id: string; name: string }>;
  } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const latestAssistantRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendRef = useRef<(q: string, forcedCaseId?: string) => void>(() => {});
  const threadIdRef = useRef<string | undefined>(initialThreadId);
  const conversationIdRef = useRef<string | undefined>(initialConversationId);
  const hydratedSourceRef = useRef<string>("");
  const hydratingMessagesRef = useRef(Boolean((initialMessages?.length ?? 0) > 0));
  const previousAutoScrollMessageCountRef = useRef(messages.length);
  const lastAnimatedAssistantIndexRef = useRef<number>(-1);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { data: usage } = useQuery({
    queryKey: ["/api/usage", "chatbox", user?.id ?? "anon"],
    enabled: true,
    staleTime: 30_000,
    retry: false,
    queryFn: fetchUsageState,
  });
  const isGuidedConversation = Boolean(conversationType?.startsWith("guided_"));

  const updateScrollState = () => {
    const container = messageListRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsNearBottom(distanceFromBottom <= 100);
  };

  useEffect(() => {
    if (!usage) return;
    if (usage.questionsLimit !== null && usage.questionsUsed >= usage.questionsLimit) {
      setLimitReached(true);
    } else {
      setLimitReached(false);
    }
  }, [usage]);

  useEffect(() => {
    if (!isLoading) return;
    const nextMessage = THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)] ?? THINKING_MESSAGES[0];
    setLoadingMessage(nextMessage);
  }, [isLoading]);

  const { state: micState, startRecording, stopRecording, cancelRecording } =
    useSpeechRecording({
      onTranscribed: (text) => {
        setInput((prev) => (prev.trim() ? `${prev} ${text}` : text));
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
      },
      onError: (msg) => {
        toast({ title: "Microphone error", description: msg, variant: "destructive" });
      },
    });

  useEffect(() => {
    if (messages.length === 0) return;
    if (messages.length === previousAutoScrollMessageCountRef.current) return;
    previousAutoScrollMessageCountRef.current = messages.length;
    if (!isNearBottom) return;
    const last = messages[messages.length - 1];
    const timer = setTimeout(() => {
      if (last.role === "assistant") {
        latestAssistantRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [isNearBottom, messages.length]);

  const ensureAndSave = async (
    userText: string,
    assistantText: string,
    structured?: Record<string, unknown>,
  ) => {
    if (!user) return;

    if (!threadIdRef.current) {
      try {
        const res = await apiRequestRaw("POST", "/api/threads", {
          threadType: "general",
          jurisdictionState: jurisdiction.state || undefined,
          jurisdictionCounty: jurisdiction.county || undefined,
          title: userText.slice(0, 120),
        });
        if (res.ok) {
          const data = await res.json();
          threadIdRef.current = data.threadId;
          setSavedToWorkspace(true);
          queryClient.invalidateQueries({ queryKey: ["/api/workspace"] });
        }
      } catch {
        return;
      }
    }

    if (!threadIdRef.current) return;

    try {
      await apiRequestRaw("POST", `/api/threads/${threadIdRef.current}/messages`, {
        role: "user",
        messageText: userText,
      });
      await apiRequestRaw("POST", `/api/threads/${threadIdRef.current}/messages`, {
        role: "assistant",
        messageText: assistantText,
        structuredResponseJson: structured,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace"] });
    } catch {
      // ignore
    }
  };

  const sendMessage = async (question: string, forcedCaseId?: string) => {
    const trimmed = question.trim();
    if (!trimmed || isLoading || isAnimating) return;

    if (!jurisdiction.state || !jurisdiction.county) {
      toast({
        title: "Jurisdiction Required",
        description: "Please select your state and county before asking a question.",
        variant: "destructive",
      });
      return;
    }

    if (trimmed.length < 5) {
      toast({
        title: "Question Too Short",
        description: "Please enter at least 5 characters.",
        variant: "destructive",
      });
      return;
    }

    if (
      !user &&
      usage &&
      usage?.questionsLimit !== null &&
      usage.questionsUsed >= usage.questionsLimit
    ) {
      setLimitReached(true);
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setIsLoading(true);
    setProOverageNotice(null);
    trackEvent("question_asked", {
      hasCase: Boolean(forcedCaseId ?? caseId),
      jurisdiction: jurisdiction.state,
      tier: usage?.tier ?? (user ? "free" : "anonymous"),
    });

    const historySnapshot: ConversationHistoryItem[] = messages
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await apiRequestRaw("POST", "/api/ask", {
        jurisdiction: {
          state: jurisdiction.state,
          county: jurisdiction.county,
        },
        userQuestion: trimmed,
        history: (forcedCaseId ?? caseId) ? undefined : historySnapshot.length > 0 ? historySnapshot : undefined,
        ...((forcedCaseId ?? caseId) ? { caseId: (forcedCaseId ?? caseId), conversationId: conversationIdRef.current } : {}),
        ...(documentId ? { documentId } : {}),
        ...(selectedDocumentIds !== undefined ? { selectedDocumentIds } : {}),
      });

      if (res.status === 429) {
        setLimitReached(true);
        setMessages((prev) => prev.slice(0, -1));
        queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }

      const rawData: AskAssistantResponse | CaseSelectionRequiredResponse = await res.json();

      if ((rawData as CaseSelectionRequiredResponse).type === "case_selection_required") {
        const selection = rawData as CaseSelectionRequiredResponse;
        setPendingCaseSelection({
          message: selection.message,
          question: trimmed,
          cases: selection.cases,
        });
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      const data = rawData as AskAssistantResponse;
      if ((forcedCaseId ?? caseId) && data.conversationId && !conversationIdRef.current) {
        conversationIdRef.current = data.conversationId;
        setSavedToWorkspace(true);
        queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      }

      if (data.overageWarning && typeof data.questionsUsed === "number" && typeof data.questionsLimit === "number") {
        setProOverageNotice({
          questionsUsed: data.questionsUsed,
          questionsLimit: data.questionsLimit,
        });
      }

      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.summary,
        structured: data,
        metadata: isGuidedConversation
          ? {
              guided_flow: true,
              flow_type: conversationType?.replace(/^guided_/, ""),
            }
          : undefined,
      }]);
      if (!user) {
        incrementGuestQuestionsUsed();
      }
      queryClient.invalidateQueries({ queryKey: ["/api/usage"] });

      if (!(forcedCaseId ?? caseId)) {
        ensureAndSave(trimmed, data.summary, data as unknown as Record<string, unknown>);
      }
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to get an answer. Please try again.";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  sendRef.current = sendMessage;

  useEffect(() => {
    registerChatBoxHandler(
      (q) => sendRef.current(q),
      () => wrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    return () => unregisterChatBoxHandler();
  }, []);

  useEffect(() => {
    if (!initialQuestion) return;
    const timer = setTimeout(() => sendRef.current(initialQuestion), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const sourceId = initialConversationId ?? initialThreadId ?? "";
    if (hydratedSourceRef.current !== sourceId) {
      hydratingMessagesRef.current = true;
      setMessages(initialMessages ?? []);
      hydratedSourceRef.current = sourceId;
      return;
    }

    if (sourceId && (initialMessages?.length ?? 0) > 0 && messages.length === 0) {
      hydratingMessagesRef.current = true;
      setMessages(initialMessages ?? []);
    }
  }, [initialConversationId, initialThreadId, initialMessages, messages.length]);

  useEffect(() => {
    conversationIdRef.current = initialConversationId;
  }, [caseId, initialConversationId]);

  useEffect(() => {
    if (!initialQuestion) {
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 150);
    }
  }, []);

  useEffect(() => {
    onHasMessagesChange?.(messages.length > 0);
  }, [messages.length, onHasMessagesChange]);

  useEffect(() => {
    onMessageCountChange?.(messages.length);
  }, [messages.length, onMessageCountChange]);

  useEffect(() => {
    const lastAssistantIndex = messages.reduce((last, message, index) => (
      message.role === "assistant" ? index : last
    ), -1);

    if (hydratingMessagesRef.current) {
      lastAnimatedAssistantIndexRef.current = lastAssistantIndex;
      setIsAnimating(false);
      hydratingMessagesRef.current = false;
      return;
    }

    if (!isGuidedConversation) {
      setIsAnimating(false);
      return;
    }

    if (lastAssistantIndex !== -1 && lastAssistantIndex !== lastAnimatedAssistantIndexRef.current) {
      setIsAnimating(true);
      lastAnimatedAssistantIndexRef.current = lastAssistantIndex;
      return;
    }

    if (lastAssistantIndex === -1) {
      setIsAnimating(false);
    }
  }, [isGuidedConversation, messages]);

  const clearConversation = () => {
    setMessages([]);
    setIsAnimating(false);
    lastAnimatedAssistantIndexRef.current = -1;
    setLimitReached(false);
    setProOverageNotice(null);
    setSavedToWorkspace(!!caseId);
    setIsNearBottom(true);
    threadIdRef.current = undefined;
    conversationIdRef.current = undefined;
    messageListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 350);
  };

  const jurisdictionLabel = formatJurisdictionLabel(jurisdiction.state, jurisdiction.county);
  const hasMessages = messages.length > 0;
  const lastAssistantIndex = messages.reduce((last, message, index) => (
    message.role === "assistant" ? index : last
  ), -1);
  const handleContinueHearingPrep = () => {
    setInput("What documents do I need for my hearing?");
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 150);
  };

  return (
    <div ref={wrapperRef} className={`flex min-h-0 flex-1 flex-col gap-4 ${className ?? ""}`}>
      <div
        ref={messageListRef}
        onScroll={updateScrollState}
        className="min-h-0 flex-1 overflow-y-auto pr-1"
        style={{ paddingBottom: "0.5rem" }}
      >
        {isGuidedConversation && (guidedProgressLabel || guidedMemoryChips.length > 0) && (
          <div className="mb-4 space-y-2">
            {guidedProgressLabel ? (
              <div className="border-l-2 border-[#b5922f] pl-2 text-center text-xs text-muted-foreground sm:text-left">
                {guidedProgressLabel}
              </div>
            ) : null}
            {guidedMemoryChips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {guidedMemoryChips.map((chip) => {
                  const Icon = chip.kind === "calendar" ? Calendar : chip.kind === "map" ? MapPin : Target;
                  return (
                    <div
                      key={`${chip.kind}-${chip.label}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
                    >
                      <Icon className="h-3 w-3" />
                      <span>{chip.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}

        {hasMessages && (
          <div className="rounded-lg border bg-muted/30 px-3 py-2.5 flex items-start justify-between gap-3 mb-4">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground w-[72px] flex-shrink-0">Conversation</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <MessageSquare className="w-3 h-3 text-primary/70 flex-shrink-0" />
                  <span className="text-xs font-medium text-foreground">General Custody Conversation</span>
                  <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 font-normal flex-shrink-0">
                    {Math.ceil(messages.length / 2)} Q&amp;A
                  </Badge>
                </div>
              </div>
              {jurisdictionLabel && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground w-[72px] flex-shrink-0">Jurisdiction</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-foreground">{jurisdictionLabel}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              {savedToWorkspace && (
                <span
                  className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400"
                  data-testid="badge-saved-to-workspace"
                  title="This conversation is saved to your Case Workspace"
                >
                  <BookmarkCheck className="w-3 h-3" />
                  Saved
                </span>
              )}
              <button
                onClick={clearConversation}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-new-conversation"
                title="Start a new conversation"
              >
                <RotateCcw className="w-3 h-3" />
                New
              </button>
            </div>
          </div>
        )}

        {!hasMessages && !caseId && (
          <div className="space-y-2" data-testid="suggested-questions">
            <p className="text-[11px] text-foreground/50 font-semibold uppercase tracking-wider px-0.5">
              Common questions
            </p>
            <div className="flex flex-col gap-1.5">
              {getSuggestedQuestions(jurisdiction.state).map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  disabled={isLoading || isAnimating}
                  className="text-left text-[14px] leading-snug px-4 py-2.5 rounded-lg border bg-background hover:bg-muted/50 hover:border-primary/30 transition-colors text-foreground/70 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 group"
                  data-testid={`button-suggested-${i}`}
                >
                  <ChevronRight className="w-3.5 h-3.5 text-foreground/30 group-hover:text-primary/60 flex-shrink-0 transition-colors" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasMessages && (
          <div className="space-y-3 pb-2">
            {messages.map((msg, i) => (
              (() => {
                const isAssistant = msg.role === "assistant";
                const animateAssistant =
                  isGuidedConversation &&
                  isAssistant &&
                  i === lastAssistantIndex;
                const revealComplete = !isAssistant || !isGuidedConversation || !animateAssistant || !isAnimating;
                const hasFutureUserReply = messages.slice(i + 1).some((entry) => entry.role === "user");
                const shouldShowGuidedAffordances =
                  isGuidedConversation &&
                  isAssistant &&
                  !hasFutureUserReply &&
                  !isLoading &&
                  revealComplete;
                const chipSourceText = isAssistant
                  ? [
                      msg.structured?.summary ?? "",
                      msg.structured?.prose_response ?? "",
                      msg.content ?? "",
                    ]
                      .filter(Boolean)
                      .join("\n")
                  : "";
                const chipOptions = isAssistant ? extractGuidedReplyChips(chipSourceText) : [];
                const nextStepCard = isAssistant && i >= 2 ? detectNextStepCard(msg, jurisdiction, caseId) : null;

                return (
                  <div
                    key={i}
                    ref={i === messages.length - 1 && msg.role === "assistant" ? latestAssistantRef : null}
                    className={`flex items-start gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    data-testid={`message-${msg.role}-${i}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    {msg.role === "user" ? (
                      <Card className="max-w-[80%] bg-primary text-primary-foreground border-primary/20">
                        <CardContent className="p-3.5">
                          <p className="text-sm leading-relaxed text-primary-foreground">{msg.content}</p>
                        </CardContent>
                      </Card>
                    ) : msg.structured ? (
                      <div className="w-full flex-1 min-w-0 space-y-1.5">
                    {(() => {
                      const structuredResponse = msg.structured as AskAssistantResponse;
                      return structuredResponse.jurisdictionMismatch &&
                        structuredResponse.caseJurisdiction &&
                        structuredResponse.askJurisdiction &&
                      !dismissedMismatchMessageIds.has(`${i}`) &&
                      jurisdictionPreference !== "ask" && (
                        <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-3">
                          <div className="flex items-start gap-2.5">
                            <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-amber-900 dark:text-amber-100 leading-relaxed">
                                This question was answered using your case jurisdiction ({structuredResponse.caseJurisdiction.county}, {structuredResponse.caseJurisdiction.state}) which differs from your Ask Atlas location ({structuredResponse.askJurisdiction.county}, {structuredResponse.askJurisdiction.state}).
                              </p>
                              <p className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-200/80">
                                Is this correct?
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setJurisdictionPreference("case");
                                    setDismissedMismatchMessageIds((prev) => new Set(prev).add(`${i}`));
                                  }}
                                >
                                  Yes, use case location
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
                                  onClick={() => {
                                    setJurisdictionPreference("ask");
                                    setDismissedMismatchMessageIds((prev) => new Set(prev).add(`${i}`));
                                    onSelectCase?.(undefined);
                                  }}
                                >
                                  Switch to {structuredResponse.askJurisdiction.county}, {structuredResponse.askJurisdiction.state}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                      <Card className="border-border shadow-sm" data-testid={`card-response-${i}`}>
                        <CardHeader className="px-3.5 pb-1.5 pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-xs font-normal gap-1">
                            <Scale className="w-3 h-3" />
                            {formatJurisdictionLabel(jurisdiction.state, jurisdiction.county)}
                          </Badge>
                          <TTSControls text={msg.structured.summary} defaultVoice="marin" />
                        </div>
                      </CardHeader>
                      <CardContent className="px-3.5 pb-3">
                        <StructuredResponse
                          data={msg.structured}
                          caseId={caseId}
                          showFollowUpChips={i === messages.length - 1 && !isLoading}
                          summaryAnimate={animateAssistant}
                          isGuidedConversation={isGuidedConversation}
                          onSummaryAnimationComplete={() => {
                            setIsAnimating(false);
                          }}
                          onSelectSuggestedQuestion={(question) => {
                            setInput(question);
                            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
                          }}
                        />
                      </CardContent>
                    </Card>

                    {msg.structured.resourcesAvailable && (
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-3">
                        <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                          Free and low-cost help may be available in your area.
                        </p>
                        <a
                          href={`/resources?state=${encodeURIComponent(jurisdiction.state)}&county=${encodeURIComponent(jurisdiction.county)}`}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                        >
                          See resources for {formatJurisdictionLabel(jurisdiction.state, jurisdiction.county)}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}

                    {i === messages.length - 1 && !isLoading && (
                      <>
                        {Math.ceil(messages.length / 2) >= 2 && (
                          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 px-3 py-2.5" data-testid="attorney-bridge">
                            <UserCheck className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                              Need help applying this to your situation? You can speak with a custody attorney for guidance specific to your case.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                        {shouldShowGuidedAffordances ? (
                          <div className="space-y-3 pt-1">
                            {nextStepCard ? <NextStepCard card={nextStepCard} visible={shouldShowGuidedAffordances} onContinueHearingPrep={handleContinueHearingPrep} /> : null}
                            <GuidedReplyChips
                              chips={chipOptions}
                              visible={shouldShowGuidedAffordances}
                              disabled={isLoading || isAnimating}
                              onSelect={(value) => {
                                setInput(value);
                                setTimeout(() => sendMessage(value), 0);
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="max-w-[85%] space-y-3">
                        <Card
                          className={`${
                            (msg.metadata as GuidedMessageMetadata | undefined)?.guided_flow || isGuidedConversation
                              ? "bg-muted/60 border-muted shadow-sm"
                              : ""
                          }`}
                        >
                          <CardContent
                            className={`${
                              (msg.metadata as GuidedMessageMetadata | undefined)?.guided_flow || isGuidedConversation
                                ? "p-4"
                                : "p-3.5"
                            }`}
                          >
                            <p className="text-sm leading-relaxed">
                              <AnimatedAssistantText
                                content={msg.content}
                                animate={animateAssistant}
                                onComplete={() => {
                                  setIsAnimating(false);
                                }}
                              />
                            </p>
                          </CardContent>
                        </Card>
                        {shouldShowGuidedAffordances ? (
                          <>
                            {nextStepCard ? <NextStepCard card={nextStepCard} visible={shouldShowGuidedAffordances} onContinueHearingPrep={handleContinueHearingPrep} /> : null}
                            <GuidedReplyChips
                              chips={chipOptions}
                              visible={shouldShowGuidedAffordances}
                              disabled={isLoading || isAnimating}
                              onSelect={(value) => {
                                setInput(value);
                                setTimeout(() => sendMessage(value), 0);
                              }}
                            />
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })()
            ))}

            {isLoading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-muted-foreground" />
                </div>
                <Card>
                  <CardContent className="p-3.5">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {loadingMessage}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            <div ref={bottomRef} className="h-px" />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-20 bg-background pb-2 pt-2">
        {!isNearBottom && hasMessages ? (
          <div className="mb-2 flex justify-center">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2 rounded-full"
              onClick={() => {
                bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
                setIsNearBottom(true);
              }}
            >
              Scroll to latest
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        <Card className="border-2 border-primary/15 shadow-md bg-card">
          <CardContent className="p-4 space-y-3">
            {!hasMessages && (
              <div className="flex items-start justify-between gap-2 pb-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Ask Atlas
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Plain-English custody law answers for {jurisdiction.state}
                    </p>
                  </div>
                </div>
                {user && (
                  <span
                    className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5"
                    data-testid="badge-workspace-autosave"
                    title="Conversations are automatically saved to your Case Workspace"
                  >
                    <BookmarkCheck className="w-3 h-3" />
                    Auto-saved
                  </span>
                )}
              </div>
            )}

            {limitReached && <UpgradePromptCard type="question" />}
            {proOverageNotice && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-3">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  You've used {proOverageNotice.questionsLimit} questions this month.
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  Additional questions are billed at $0.10 each. Your usage is tracked automatically.
                </p>
              </div>
            )}

            <div className="text-xs text-muted-foreground" data-testid="label-answering-scope">
              {answeringScopeLabel ?? "Answering from: General workspace (no case selected)"}
            </div>

            {pendingCaseSelection && (
              <div className="rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {pendingCaseSelection.message}
                </p>
                <div className="flex flex-wrap gap-2">
                  {pendingCaseSelection.cases.map((c) => (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onSelectCase?.(c.id);
                        setPendingCaseSelection(null);
                        setTimeout(() => sendMessage(pendingCaseSelection.question, c.id), 0);
                      }}
                      data-testid={`button-case-required-${c.id}`}
                    >
                      {c.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="relative">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    hasMessages
                      ? "Ask a follow-up question about your situation..."
                      : jurisdiction.state
                      ? `Ask a question about custody in ${jurisdiction.state}...`
                      : "Ask a question about child custody laws..."
                  }
                  disabled={isLoading || isAnimating || limitReached || !!pendingCaseSelection}
                  className="resize-none min-h-[72px] max-h-40 pr-3 text-sm"
                  rows={hasMessages ? 2 : 3}
                  data-testid="input-question"
                />
                {input.length > 0 && (
                  <span className="absolute bottom-2 right-3 text-xs text-muted-foreground/60 select-none">
                    {input.length}/2000
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertTriangle className="w-3 h-3 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    General information only — not legal advice
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <MicButton
                    state={micState}
                    onStart={startRecording}
                    onStop={stopRecording}
                    onCancel={cancelRecording}
                    disabled={isLoading || isAnimating || limitReached || !!pendingCaseSelection}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!input.trim() || input.trim().length < 5 || isLoading || isAnimating || limitReached || !!pendingCaseSelection}
                    data-testid="button-send"
                    title="Send message"
                    className="h-10 w-10"
                  >
                    {isLoading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
