import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User, AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { ChatMessage, Jurisdiction } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface ChatBoxProps {
  jurisdiction: Jurisdiction;
}

const SUGGESTED_QUESTIONS = [
  "What does 'best interests of the child' mean in my state?",
  "How do I get joint custody?",
  "Can I move to another state with my child?",
  "How do I modify a custody order?",
  "What happens if the other parent violates the custody order?",
];

export function ChatBox({ jurisdiction }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (question: string) => {
    if (!question.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: question.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/ask", {
        jurisdiction,
        question: question.trim(),
      });
      const data = await res.json();

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.answer,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to get an answer. Please try again.";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
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

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8 gap-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-2">Ask About Custody Law</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Get plain-English explanations of {jurisdiction.state} custody laws tailored to your specific questions.
            </p>
          </div>

          <div className="w-full max-w-lg space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Suggested Questions</p>
            <div className="flex flex-col gap-2">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="text-left text-sm px-4 py-2.5 rounded-md border bg-background hover-elevate transition-colors text-muted-foreground hover:text-foreground"
                  data-testid={`button-suggested-${i}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-700 dark:text-amber-300">
              AI responses are for general information only, not legal advice.
            </span>
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
                {msg.role === "user" ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              <Card
                className={`max-w-[80%] ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground border-primary/20"
                    : ""
                }`}
              >
                <CardContent className="p-3.5">
                  <p
                    className={`text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user" ? "text-primary-foreground" : ""
                    }`}
                  >
                    {msg.content}
                  </p>
                </CardContent>
              </Card>
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
                    <span className="text-sm text-muted-foreground">Analyzing {jurisdiction.state} custody law...</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask about custody law in ${jurisdiction.state}...`}
          disabled={isLoading}
          className="resize-none min-h-[60px] max-h-32"
          rows={2}
          data-testid="input-question"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || isLoading}
          data-testid="button-send"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
