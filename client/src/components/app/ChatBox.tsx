import { useState, useRef, useEffect } from "react";
import {
  Send, Loader2, Bot, User, AlertTriangle, Sparkles,
  CheckCircle2, HelpCircle, Scale, ShieldAlert, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { ChatMessage, AILegalResponse, Jurisdiction } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface ChatBoxProps {
  jurisdiction: Jurisdiction;
}

const SUGGESTED_QUESTIONS = [
  "Can my ex move out of state with our child?",
  "What happens if visitation is denied?",
  "How do custody modifications usually work?",
  "What does 'best interests of the child' mean in my state?",
  "How do I get joint custody?",
];

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
  return (
    <div className="space-y-4">
      <div className="text-sm leading-relaxed text-foreground">
        {data.summary}
      </div>

      {data.key_points.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Key Points
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
    <div className="pt-2 space-y-1.5" data-testid="follow-up-chips">
      <p className="text-xs text-muted-foreground font-medium">Follow-up questions:</p>
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

export function ChatBox({ jurisdiction }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    try {
      const res = await apiRequest("POST", "/api/ask", {
        jurisdiction: {
          state: jurisdiction.state,
          county: jurisdiction.county,
        },
        userQuestion: trimmed,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }

      const data: AILegalResponse = await res.json();

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.summary,
        structured: data,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to get an answer. Please try again.";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
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

  const isLastMessageAssistant =
    messages.length > 0 && messages[messages.length - 1].role === "assistant";

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      {messages.length === 0 ? (
        /* Scrollable-centering pattern:
           outer = flex-1 overflow-y-auto (allows scroll when content is too tall)
           inner = min-h-full flex flex-col items-center justify-center (centers when content fits) */
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="min-h-full flex flex-col items-center justify-center text-center px-4 py-6 gap-5">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base mb-1">Ask About {jurisdiction.state} Custody Law</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Get plain-English explanations tailored to your questions.
              </p>
            </div>

            <div className="w-full max-w-lg space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Common Questions
              </p>
              <div className="flex flex-col gap-1.5">
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="text-left text-sm px-3.5 py-2 rounded-md border bg-background hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                    data-testid={`button-suggested-${i}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-md px-3 py-2 w-full max-w-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="text-xs text-amber-700 dark:text-amber-300">
                AI responses are for general information only — not legal advice.
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
          {messages.map((msg, i) => (
            <div
              key={i}
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
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-normal gap-1">
                          <Scale className="w-3 h-3" />
                          {jurisdiction.state} · {jurisdiction.county} County
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <StructuredResponse data={msg.structured} />
                    </CardContent>
                  </Card>

                  {i === messages.length - 1 && !isLoading && (
                    <FollowUpChips onSelect={sendMessage} disabled={isLoading} />
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
                      Analyzing {jurisdiction.state} custody law...
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <div className="flex-1 relative">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${jurisdiction.state} custody law... (Enter to send, Shift+Enter for new line)`}
            disabled={isLoading}
            className="resize-none min-h-[60px] max-h-32 pr-3"
            rows={2}
            data-testid="input-question"
          />
          {input.length > 0 && (
            <span className="absolute bottom-2 right-3 text-xs text-muted-foreground/60">
              {input.length}/2000
            </span>
          )}
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || input.trim().length < 5 || isLoading}
          data-testid="button-send"
          title="Send message"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </form>
    </div>
  );
}
