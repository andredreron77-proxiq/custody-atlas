import { useState, useRef, useEffect } from "react";
import {
  Send, Loader2, Bot, User, AlertTriangle,
  CheckCircle2, HelpCircle, Scale, ShieldAlert, ChevronRight,
  MessageSquare, RotateCcw, MapPin, Sparkles, UserCheck, BookmarkCheck,
  FileSearch, Zap, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { ChatMessage, AILegalResponse, Jurisdiction, ConversationHistoryItem } from "@shared/schema";
import { apiRequestRaw } from "@/lib/queryClient";
import { UpgradePromptCard } from "./UpgradePromptCard";
import { useQueryClient } from "@tanstack/react-query";
import { registerChatBoxHandler, unregisterChatBoxHandler } from "@/lib/aiEntry";
import { formatJurisdictionLabel } from "@/lib/jurisdictionUtils";
import { MicButton } from "./MicButton";
import { TTSControls } from "./TTSControls";
import { useSpeechRecording } from "@/hooks/useSpeechRecording";
import { useCurrentUser } from "@/hooks/use-auth";

interface ChatBoxProps {
  jurisdiction: Jurisdiction;
  /**
   * If provided, the ChatBox will auto-submit this question once on mount.
   * Used by the AI Entry Funnel when navigating from a CTA button on another page.
   */
  initialQuestion?: string;
  /** Pre-populated messages when resuming a saved conversation thread. */
  initialMessages?: ChatMessage[];
  /** The thread ID to continue saving into when resuming a thread. */
  initialThreadId?: string;
  /**
   * When provided, messages are saved to the case's conversations/messages
   * tables instead of (and NOT also into) the legacy threads/thread_messages.
   * The server enforces ownership — this value is only used to route the request.
   */
  caseId?: string;
}

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
    <div className="rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Important Cautions
        </span>
      </div>
      <ul className="space-y-1.5">
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

function StructuredResponse({ data }: { data: AILegalResponse }) {
  const isFact = data.intent === "FACT";
  const isAction = data.intent === "ACTION";

  return (
    <div className="space-y-4">
      {/* ── FACT mode: direct answer banner ── */}
      {isFact && (
        <div
          className={`rounded-md p-3 flex items-start gap-2.5 ${
            data.factSource
              ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50"
              : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50"
          }`}
          data-testid="fact-answer-banner"
        >
          {data.factSource
            ? <FileSearch className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            : <Search className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          }
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug">{data.summary}</p>
            {data.factSource && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Extracted from: <span className="font-medium">{data.factSource}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Default summary (non-FACT) ── */}
      {!isFact && (
        <div className="text-sm leading-relaxed text-foreground">{data.summary}</div>
      )}

      {/* ── ACTION mode: numbered steps header ── */}
      {isAction && data.key_points.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Steps to Take
            </span>
          </div>
          <ol className="space-y-1.5 list-decimal list-inside">
            {data.key_points.map((point, i) => (
              <li key={i} className="text-sm leading-relaxed pl-1" data-testid={`key-point-${i}`}>
                {point}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── FACT / EXPLANATION: bullet key points ── */}
      {!isAction && data.key_points.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isFact ? "Details" : "Key Points"}
            </span>
          </div>
          <ul className="space-y-1.5">
            {data.key_points.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" data-testid={`key-point-${i}`}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CautionsList cautions={data.cautions} />

      {data.questions_to_ask_attorney.length > 0 && (
        <div className="rounded-md border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Questions to Ask Your Attorney
            </span>
          </div>
          <ul className="space-y-1.5">
            {data.questions_to_ask_attorney.map((q, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-blue-800 dark:text-blue-200"
                data-testid={`attorney-question-${i}`}
              >
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                <span className="leading-relaxed">{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-start gap-1.5 pt-1 border-t border-border">
        <Scale className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground italic leading-relaxed">{data.disclaimer}</p>
      </div>
    </div>
  );
}

function FollowUpChips({
  onSelect,
  disabled,
}: {
  onSelect: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="pt-3 space-y-2.5" data-testid="follow-up-chips">
      <p className="text-xs text-muted-foreground italic">
        Want to go deeper? Ask a follow-up about your situation.
      </p>
      <div className="flex flex-wrap gap-2">
        {FOLLOW_UP_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            disabled={disabled}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border bg-background hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
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

export function ChatBox({ jurisdiction, initialQuestion, initialMessages, initialThreadId, caseId }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [savedToWorkspace, setSavedToWorkspace] = useState(!!initialThreadId || !!caseId);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const _sendRef = useRef<(q: string) => void>(() => {});
  const threadIdRef = useRef<string | undefined>(initialThreadId);
  // Tracks the active conversation ID when using the case-based path
  const conversationIdRef = useRef<string | undefined>(undefined);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();

  // Voice recording (speech-to-text)
  const { state: micState, startRecording, stopRecording, cancelRecording } =
    useSpeechRecording({
      onTranscribed: (text) => {
        setInput((prev) => (prev.trim() ? prev + " " + text : text));
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
      },
      onError: (msg) => {
        toast({ title: "Microphone error", description: msg, variant: "destructive" });
      },
    });

  // After a new assistant message renders, scroll it into view via the page.
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        lastAssistantRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, [messages]);

  /**
   * Fire-and-forget: create thread if needed, then append both messages.
   * All errors are silently swallowed — saves never block the UI.
   */
  const ensureAndSave = async (
    userText: string,
    assistantText: string,
    structured?: Record<string, unknown>,
  ) => {
    if (!user) return;

    // Create thread on first message of a new conversation
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
        return; // thread creation failed — skip saving messages
      }
    }

    if (!threadIdRef.current) return;

    // Append user message then assistant message (order matters)
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
      // Refresh workspace cache so it reflects the new thread
      queryClient.invalidateQueries({ queryKey: ["/api/workspace"] });
    } catch {
      // silently ignore save errors
    }
  };

  const sendMessage = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

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

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

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
        // When using a case, the server loads history from the messages table.
        // We still send client history on the legacy path (no caseId).
        history: caseId ? undefined : historySnapshot.length > 0 ? historySnapshot : undefined,
        // Case context — when present, the server handles persistence
        ...(caseId ? { caseId, conversationId: conversationIdRef.current } : {}),
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

      const data: AILegalResponse & { conversationId?: string } = await res.json();

      // Track conversation ID returned by the server for subsequent messages
      if (caseId && data.conversationId && !conversationIdRef.current) {
        conversationIdRef.current = data.conversationId;
        setSavedToWorkspace(true);
        queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.summary,
        structured: data,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      queryClient.invalidateQueries({ queryKey: ["/api/usage"] });

      // When using a case, the server has already persisted the messages.
      // Only call ensureAndSave on the legacy (no-case) path.
      if (!caseId) {
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

  _sendRef.current = sendMessage;

  useEffect(() => {
    registerChatBoxHandler(
      (q) => _sendRef.current(q),
      () => wrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    return () => unregisterChatBoxHandler();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialQuestion) return;
    const timer = setTimeout(() => _sendRef.current(initialQuestion), 300);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus input on mount so users can type immediately
  useEffect(() => {
    if (!initialQuestion) {
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 150);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clearConversation = () => {
    setMessages([]);
    setLimitReached(false);
    setSavedToWorkspace(!!caseId); // keep "Saved" indicator when a case is still active
    threadIdRef.current = undefined;
    conversationIdRef.current = undefined;
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 350);
  };

  const jurisdictionLabel = formatJurisdictionLabel(jurisdiction.state, jurisdiction.county);
  const hasMessages = messages.length > 0;

  return (
    <div ref={wrapperRef} className="flex flex-col gap-4">

      {/* ── Sticky zone: context bar + input (pinned below nav when active) ─── */}
      <div className={hasMessages ? "sticky top-16 z-20 bg-background pb-3 flex flex-col gap-2" : "contents"}>

      {/* ── Conversation context bar ───────────────────────────────────────── */}
      {hasMessages && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 flex items-start justify-between gap-3">
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

      {/* ── Input card — always at the top, the primary interaction ───────── */}
      <Card className="border-2 border-primary/15 shadow-md bg-card">
        <CardContent className="p-4 space-y-3">
          {/* Heading row — only on empty state */}
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

          {/* Upgrade prompt if limit hit */}
          {limitReached && <UpgradePromptCard type="question" />}

          {/* Textarea + controls */}
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
                disabled={isLoading || limitReached}
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
              {/* Disclaimer */}
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertTriangle className="w-3 h-3 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                <span className="text-[11px] text-muted-foreground leading-tight">
                  General information only — not legal advice
                </span>
              </div>

              {/* Mic + Send */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <MicButton
                  state={micState}
                  onStart={startRecording}
                  onStop={stopRecording}
                  onCancel={cancelRecording}
                  disabled={isLoading || limitReached}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || input.trim().length < 5 || isLoading || limitReached}
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

      </div>{/* end sticky zone */}

      {/* ── Suggested questions — visible only on empty state ─────────────── */}
      {!hasMessages && (
        <div className="space-y-2" data-testid="suggested-questions">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide px-0.5">
            Common questions
          </p>
          <div className="flex flex-col gap-1.5">
            {getSuggestedQuestions(jurisdiction.state).map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q)}
                disabled={isLoading}
                className="text-left text-sm px-4 py-2.5 rounded-lg border bg-background hover:bg-muted/50 hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 group"
                data-testid={`button-suggested-${i}`}
              >
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary/60 flex-shrink-0 transition-colors" />
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Conversation thread — grows downward below the input ───────────── */}
      {hasMessages && (
        <div className="space-y-4 pb-8">
          {messages.map((msg, i) => {
            const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
            return (
              <div
                key={i}
                ref={isLastAssistant ? lastAssistantRef : null}
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
                  <div className="max-w-[88%] space-y-2 flex-1 min-w-0">
                    <Card className="border-border shadow-sm" data-testid={`card-response-${i}`}>
                      <CardHeader className="pb-2 pt-3.5 px-4">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-xs font-normal gap-1">
                            <Scale className="w-3 h-3" />
                            {formatJurisdictionLabel(jurisdiction.state, jurisdiction.county)}
                          </Badge>
                          <TTSControls text={msg.structured.summary} defaultVoice="marin" />
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <StructuredResponse data={msg.structured} />
                      </CardContent>
                    </Card>

                    {i === messages.length - 1 && !isLoading && (
                      <>
                        <FollowUpChips onSelect={sendMessage} disabled={isLoading} />
                        {/* Attorney bridge — shown after 2+ questions */}
                        {Math.ceil(messages.length / 2) >= 2 && (
                          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 px-3.5 py-3" data-testid="attorney-bridge">
                            <UserCheck className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                              Need help applying this to your situation? You can speak with a custody attorney for guidance specific to your case.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <Card className="max-w-[85%]">
                    <CardContent className="p-3.5">
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })}

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
                      Generating your answer…
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
