import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "wouter";
import {
  Upload, FileText, Image, AlertTriangle, CheckCircle2,
  Loader2, Scale, HelpCircle, Calendar, FileSearch,
  ArrowLeft, ArrowRight, X, ChevronRight, Lock, MessageSquare,
  MapPin, Send, BookOpen, TriangleAlert, ShieldAlert,
  Camera, RotateCcw, Check, Plus, ArrowUp, ArrowDown,
  ScanLine, GripVertical, Bot, User, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useJurisdiction } from "@/hooks/useJurisdiction";
import { ChildSupportImpactCard } from "@/components/app/ChildSupportImpactCard";
import { UpgradePromptCard } from "@/components/app/UpgradePromptCard";
import { TTSControls } from "@/components/app/TTSControls";
import { getAccessToken } from "@/lib/tokenStore";
import { formatJurisdictionLabel } from "@/lib/jurisdictionUtils";
import {
  PageContainer, PageIntro, ContextBar,
  HeroPanel, HeroPanelContent,
  InsetPanel, ActionRow as ProdActionRow,
} from "@/components/app/ProductLayout";
import { useQueryClient } from "@tanstack/react-query";
import type { DocumentAnalysisResult, DocumentQAResponse, ExtractedFacts } from "@shared/schema";

/* ── Constants ────────────────────────────────────────────────────────────── */

const ACCEPTED_PDF_TYPES = ["application/pdf"];
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
const ACCEPTED_ALL_TYPES = [...ACCEPTED_PDF_TYPES, ...ACCEPTED_IMAGE_TYPES];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const MAX_PAGES = 5;

const SUGGESTED_QUESTIONS = [
  "What does this mean in plain English?",
  "What are the most important parts of this document?",
  "What questions should I ask a lawyer about this?",
  "Does this document mention custody or visitation terms?",
  "Are there any deadlines or important dates in this document?",
];

/* ── Image processing helpers ─────────────────────────────────────────────── */

/**
 * Compresses an image file using the canvas API.
 * Files under 1.5 MB are returned unchanged.
 * Output is always JPEG for consistency with the OCR pipeline.
 */
async function compressImage(
  file: File,
  maxDim = 2400,
  quality = 0.88,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 1.5 * 1024 * 1024) return file;

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<File>((resolve) => {
    canvas.toBlob(
      (blob) => {
        const outName = file.name.replace(/\.\w+$/, ".jpg");
        resolve(
          blob
            ? new File([blob], outName, { type: "image/jpeg" })
            : file,
        );
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Stacks multiple image pages vertically on a single canvas and returns
 * them as one JPEG file ready for the existing OCR pipeline.
 * Single-page input is still compressed via compressImage().
 */
async function combineImagePages(files: File[]): Promise<File> {
  if (files.length === 1) return compressImage(files[0]);

  const bitmaps = await Promise.all(files.map((f) => createImageBitmap(f)));
  const maxWidth = Math.max(...bitmaps.map((b) => b.width));
  const scale = Math.min(2400 / maxWidth, 1);
  const scaledWidth = Math.floor(maxWidth * scale);
  const totalHeight = bitmaps.reduce(
    (sum, b) => sum + Math.floor((b.height / b.width) * scaledWidth),
    0,
  );

  const canvas = document.createElement("canvas");
  canvas.width = scaledWidth;
  canvas.height = Math.min(totalHeight, 9600);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = 0;
  for (const bmp of bitmaps) {
    const scaledH = Math.floor((bmp.height / bmp.width) * scaledWidth);
    ctx.drawImage(bmp, 0, y, scaledWidth, scaledH);
    bmp.close();
    y += scaledH;
  }

  return new Promise<File>((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(
          blob
            ? new File([blob], "combined-document.jpg", { type: "image/jpeg" })
            : files[0],
        );
      },
      "image/jpeg",
      0.88,
    );
  });
}

/* ── Extracted Facts Card ─────────────────────────────────────────────────── */

const FACT_LABELS: Record<keyof ExtractedFacts, string> = {
  document_title: "Document Title",
  court_name:     "Court",
  court_address:  "Court Address",
  case_number:    "Case Number",
  judge_name:     "Judge",
  hearing_date:   "Hearing Date",
  filing_party:   "Filing Party",
  opposing_party: "Opposing Party",
};

function ExtractedFactsCard({ facts }: { facts: ExtractedFacts }) {
  const entries = (Object.keys(FACT_LABELS) as Array<keyof ExtractedFacts>)
    .map((k) => ({ key: k, label: FACT_LABELS[k], value: facts[k] }))
    .filter((e) => e.value);

  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4" data-testid="card-extracted-facts">
      <div className="flex items-center gap-2 mb-3">
        <FileSearch className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Key Document Facts</h3>
        <span className="text-xs text-muted-foreground ml-auto">Extracted directly from document</span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {entries.map(({ key, label, value }) => (
          <div key={key} className="flex flex-col gap-0.5" data-testid={`fact-${key}`}>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
            <dd className="text-sm text-foreground font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ── Analysis Result Card ─────────────────────────────────────────────────── */

function AnalysisResultCard({ result }: { result: DocumentAnalysisResult }) {
  const ttsText = [
    result.summary,
    ...(result.possible_implications.length > 0
      ? ["Possible implications: " + result.possible_implications.join(". ")]
      : []),
  ].join(" ");

  return (
    <div className="space-y-5" data-testid="card-analysis-result">
      <div className="flex items-center gap-3">
        <Badge className="text-sm px-3 py-1" data-testid="text-document-type">
          {result.document_type}
        </Badge>
        <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Analysis complete</span>
        </div>
      </div>

      {result.extracted_facts && <ExtractedFactsCard facts={result.extracted_facts} />}

      <div>
        <h3 className="text-sm font-semibold mb-2 text-foreground">Summary</h3>
        <p className="text-sm leading-relaxed text-muted-foreground" data-testid="text-summary">
          {result.summary}
        </p>
        <TTSControls text={ttsText} className="mt-3" />
      </div>

      {result.important_terms.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Scale className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-sm font-semibold">Important Terms & Provisions</h3>
          </div>
          <ul className="space-y-2">
            {result.important_terms.map((term, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" data-testid={`important-term-${i}`}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                <span className="leading-relaxed text-muted-foreground">{term}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.key_dates.length > 0 && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Key Dates
            </h3>
          </div>
          <ul className="space-y-1.5">
            {result.key_dates.map((date, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200" data-testid={`key-date-${i}`}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <span className="leading-relaxed">{date}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.possible_implications.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <FileSearch className="w-3.5 h-3.5 text-violet-500" />
            <h3 className="text-sm font-semibold">Possible Implications</h3>
          </div>
          <ul className="space-y-2">
            {result.possible_implications.map((impl, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" data-testid={`implication-${i}`}>
                <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-violet-400 flex-shrink-0" />
                <span className="leading-relaxed text-muted-foreground">{impl}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.questions_to_ask_attorney.length > 0 && (
        <div className="rounded-md border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Questions to Ask Your Attorney
            </h3>
          </div>
          <ul className="space-y-1.5">
            {result.questions_to_ask_attorney.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-blue-800 dark:text-blue-200" data-testid={`attorney-question-${i}`}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                <span className="leading-relaxed">{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-start gap-1.5 pt-2 border-t border-border">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground italic leading-relaxed">
          This analysis is for general informational purposes only and does not constitute legal advice.
          Always consult a licensed family law attorney before making decisions based on this information.
        </p>
      </div>
    </div>
  );
}

function QAResponseCard({ response }: { response: DocumentQAResponse }) {
  return (
    <div className="space-y-4 pt-1" data-testid="card-qa-response">
      <div>
        <p className="text-sm leading-relaxed text-foreground" data-testid="text-qa-answer">
          {response.answer}
        </p>
      </div>

      {response.keyPoints.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <BookOpen className="w-3.5 h-3.5 text-primary" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Key Points from the Document
            </h4>
          </div>
          <ul className="space-y-1.5">
            {response.keyPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" data-testid={`qa-key-point-${i}`}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                <span className="leading-relaxed text-muted-foreground">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {response.documentReferences.length > 0 && (
        <div className="rounded-md border border-muted bg-muted/30 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            From the Document
          </h4>
          <ul className="space-y-1.5">
            {response.documentReferences.map((ref, i) => (
              <li key={i} className="text-sm text-muted-foreground italic leading-relaxed" data-testid={`qa-doc-ref-${i}`}>
                "{ref}"
              </li>
            ))}
          </ul>
        </div>
      )}

      {response.questionsToAskAttorney.length > 0 && (
        <div className="rounded-md border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Questions to Ask an Attorney
            </h4>
          </div>
          <ul className="space-y-1.5">
            {response.questionsToAskAttorney.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-blue-800 dark:text-blue-200" data-testid={`qa-attorney-q-${i}`}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                <span className="leading-relaxed">{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {response.caution && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
          <TriangleAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed" data-testid="text-qa-caution">
            {response.caution}
          </p>
        </div>
      )}

      <div className="flex items-start gap-1.5 pt-2 border-t border-border">
        <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground italic leading-relaxed" data-testid="text-qa-disclaimer">
          {response.disclaimer}
        </p>
      </div>
    </div>
  );
}

interface DocQAMessage {
  role: "user" | "assistant";
  content: string;
  response?: DocumentQAResponse;
}

interface DocumentQASectionProps {
  result: DocumentAnalysisResult;
  jurisdiction: { state: string; county: string; country?: string } | null;
}

function DocumentQASection({ result, jurisdiction }: DocumentQASectionProps) {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [qaMessages, setQaMessages] = useState<DocQAMessage[]>([]);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaLimitReached, setQaLimitReached] = useState(false);
  const docContainerRef = useRef<HTMLDivElement>(null);
  const lastAssistantDocRef = useRef<HTMLDivElement>(null);
  const docJustSubmitted = useRef(false);
  const { toast } = useToast();

  // Scroll the container so the target element's top sits near the top of
  // the visible area (with a small breathing-room top offset).
  const scrollDocContainerToTop = (container: HTMLElement, el: HTMLElement, topPad = 12) => {
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const newScrollTop = container.scrollTop + (elRect.top - containerRect.top) - topPad;
    container.scrollTo({ top: newScrollTop, behavior: "smooth" });
  };

  useEffect(() => {
    if (!docJustSubmitted.current || qaMessages.length === 0) return;
    const lastMsg = qaMessages[qaMessages.length - 1];

    // Double rAF: first frame lets React paint, second frame waits for layout
    // to fully stabilise before measuring scroll positions.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (lastMsg.role === "assistant") {
          // Scroll so the new response card's top is near the top of the thread area.
          if (docContainerRef.current && lastAssistantDocRef.current) {
            scrollDocContainerToTop(docContainerRef.current, lastAssistantDocRef.current);
          }
          docJustSubmitted.current = false;
        } else {
          // User message just added — scroll to the bottom to show the loading spinner.
          if (docContainerRef.current) {
            docContainerRef.current.scrollTo({
              top: docContainerRef.current.scrollHeight,
              behavior: "smooth",
            });
          }
        }
      });
    });
  }, [qaMessages]);

  const submitQuestion = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || isLoading) return;

    // Snapshot history BEFORE adding the new user message
    const history = qaMessages
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));

    docJustSubmitted.current = true;
    setQaMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setQuestion("");
    setIsLoading(true);
    setQaError(null);

    try {
      const body: Record<string, unknown> = {
        documentAnalysis: result,
        extractedText: result.extractedText ?? "",
        userQuestion: trimmed,
        history: history.length > 0 ? history : undefined,
      };
      if (jurisdiction) {
        body.jurisdiction = {
          state: jurisdiction.state,
          county: jurisdiction.county,
          country: jurisdiction.country ?? "United States",
        };
      }

      const askHeaders: Record<string, string> = { "Content-Type": "application/json" };
      const askToken = getAccessToken();
      if (askToken) askHeaders["Authorization"] = `Bearer ${askToken}`;

      const res = await fetch("/api/ask-document", {
        method: "POST",
        headers: askHeaders,
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.status === 429) {
        setQaLimitReached(true);
        setQaMessages((prev) => prev.slice(0, -1));
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      const responseData = data as DocumentQAResponse;
      setQaMessages((prev) => [
        ...prev,
        { role: "assistant", content: responseData.answer, response: responseData },
      ]);
    } catch (err: any) {
      const message = err?.message || "Failed to get an answer. Please try again.";
      setQaError(message);
      setQaMessages((prev) => prev.slice(0, -1));
      toast({ title: "Question Failed", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = (q: string) => submitQuestion(q);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuestion(question);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitQuestion(question);
    }
  };

  const hasMessages = qaMessages.length > 0;

  const jurisdictionLabel = formatJurisdictionLabel(jurisdiction?.state ?? "", jurisdiction?.county ?? "");

  return (
    <Card className="border-t-2 border-t-primary/30" data-testid="card-document-qa">
      <CardHeader className="pb-3">
        {/* Two-row context bar: Conversation + Jurisdiction as separate labeled fields */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            {/* Row 1: Conversation */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground w-[72px] flex-shrink-0">Conversation</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <MessageSquare className="w-3 h-3 text-primary flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">Questions About This Document</span>
                {hasMessages && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 font-normal flex-shrink-0">
                    {Math.ceil(qaMessages.length / 2)} Q&amp;A
                  </Badge>
                )}
              </div>
            </div>
            {/* Row 2: Jurisdiction — only rendered when we have a usable label */}
            {jurisdictionLabel && (
              <div className="flex items-center gap-2 flex-wrap" data-testid="text-jurisdiction-badge">
                <span className="text-xs text-muted-foreground w-[72px] flex-shrink-0">Jurisdiction</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                  <span className="text-xs font-medium text-foreground">{jurisdictionLabel}</span>
                </div>
              </div>
            )}
          </div>
          {hasMessages && (
            <button
              onClick={() => { setQaMessages([]); setQaError(null); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 pt-0.5"
              data-testid="button-new-doc-thread"
              title="Clear conversation and start over"
            >
              <RotateCcw className="w-3 h-3" />
              New
            </button>
          )}
        </div>

        {!hasMessages && (
          <p className="text-sm text-muted-foreground mt-2">
            Ask follow-up questions about this document's terms, dates, or implications.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Suggested questions — shown only before first message */}
        {!hasMessages && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Suggested questions
            </p>
            <div className="flex flex-wrap gap-2" data-testid="suggested-questions">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSuggestedQuestion(q)}
                  disabled={isLoading}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/40 hover:bg-muted hover:border-primary/40 text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                  data-testid={`suggested-question-${q.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation thread */}
        {hasMessages && (
          <div ref={docContainerRef} className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
            {qaMessages.map((msg, i) => {
              const isLastAssistant = msg.role === "assistant" && i === qaMessages.length - 1;
              return (
              <div
                key={i}
                ref={isLastAssistant ? lastAssistantDocRef : null}
                data-testid={`doc-qa-message-${msg.role}-${i}`}
              >
                {msg.role === "user" ? (
                  <div className="flex items-start gap-2 flex-row-reverse">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div className="max-w-[82%] rounded-lg bg-primary text-primary-foreground px-3.5 py-2.5 text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 rounded-lg border bg-muted/20 p-3.5" data-testid={`doc-qa-response-${i}`}>
                      {msg.response ? (
                        <QAResponseCard response={msg.response} />
                      ) : (
                        <p className="text-sm">{msg.content}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              );
            })}

            {isLoading && (
              <div className="flex items-start gap-2" data-testid="qa-loading">
                <div className="w-7 h-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="rounded-lg border bg-muted/20 px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Analyzing document…</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {qaLimitReached && (
          <UpgradePromptCard type="document" className="mt-2" />
        )}

        {qaError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5" data-testid="text-qa-error">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{qaError}</p>
          </div>
        )}

        {/* Loading state (first message — no thread visible yet) */}
        {isLoading && !hasMessages && (
          <div className="flex flex-col items-center gap-2 py-4 text-center" data-testid="qa-loading-initial">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generating your answer…</p>
          </div>
        )}

        {/* Input form */}
        {!qaLimitReached && (
          <form onSubmit={handleSubmit} className="space-y-2">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasMessages ? "Ask a follow-up question…" : "Type your question about this document…"}
              className="resize-none min-h-[72px] text-sm"
              disabled={isLoading}
              data-testid="input-qa-question"
            />
            <Button
              type="submit"
              disabled={!question.trim() || isLoading}
              className="w-full gap-2"
              data-testid="button-ask-document"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Getting answer…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {hasMessages ? "Ask follow-up" : "Ask about this document"}
                </>
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/* ── UploadSelector ────────────────────────────────────────────────────────
 *
 * Three large, tap-friendly buttons for the three input modes.
 * Also handles drag-and-drop at the container level.
 * ──────────────────────────────────────────────────────────────────────── */
function UploadSelector({
  onPdf,
  onCamera,
  onImage,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  onPdf: () => void;
  onCamera: () => void;
  onImage: () => void;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={`space-y-2 transition-opacity ${isDragOver ? "opacity-50" : "opacity-100"}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-testid="upload-selector"
    >
      <p className="text-xs font-medium text-muted-foreground">
        Choose how to add your document
      </p>

      <ProdActionRow
        onClick={onPdf}
        icon={FileText}
        iconBg="bg-red-50 dark:bg-red-950/30"
        iconColor="text-red-500"
        title="Upload PDF"
        description={`Court orders, parenting plans, or notices — up to ${MAX_SIZE_MB}MB`}
        testId="button-upload-pdf"
      />

      <ProdActionRow
        onClick={onCamera}
        icon={Camera}
        iconBg="bg-blue-50 dark:bg-blue-950/30"
        iconColor="text-blue-500"
        title="Scan with Camera"
        description="Use your phone camera to photograph a physical document"
        testId="button-take-photo"
      />

      <ProdActionRow
        onClick={onImage}
        icon={Image}
        iconBg="bg-violet-50 dark:bg-violet-950/30"
        iconColor="text-violet-500"
        title="Upload Image from Device"
        description="JPG or PNG photo already saved on your device"
        testId="button-upload-image"
      />

      {/* Multi-page tip + drag hint in one compact row */}
      <div className="flex items-start gap-2 pt-1" data-testid="text-multipage-tip">
        <ScanLine className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground/70 leading-snug">
          Multi-page document? Scan or upload all pages together for a more accurate analysis.
          <span className="hidden sm:inline"> You can also drag and drop a file.</span>
        </p>
      </div>
    </div>
  );
}

/* ── CameraPreviewView ─────────────────────────────────────────────────────
 *
 * Shows the captured photo with three actions:
 *   1. Retake This Page      — discard and re-open camera
 *   2. Add Another Page      — keep this page and immediately capture next
 *   3. Continue to Review    — keep this page and proceed to review screen
 *
 * When the user is at the page limit, "Add Another Page" is hidden.
 * ──────────────────────────────────────────────────────────────────────── */
function CameraPreviewView({
  url,
  pageNumber,
  canAddMore,
  onRetake,
  onConfirmAndContinue,
  onConfirmAndAddAnother,
}: {
  url: string;
  pageNumber: number;
  canAddMore: boolean;
  onRetake: () => void;
  onConfirmAndContinue: () => void;
  onConfirmAndAddAnother: () => void;
}) {
  return (
    <div className="space-y-4" data-testid="camera-preview-view">

      {/* Header with page label */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold">
            Page {pageNumber} — Review Photo
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          {pageNumber > 1 ? `Adding to document` : "New document"}
        </Badge>
      </div>

      {/* Image preview */}
      <div className="rounded-xl overflow-hidden border bg-muted/20 flex items-center justify-center max-h-[52vh]">
        <img
          src={url}
          alt={`Captured page ${pageNumber}`}
          className="max-w-full max-h-[52vh] object-contain"
          data-testid="img-camera-preview"
        />
      </div>

      {/* Retake */}
      <Button
        variant="outline"
        onClick={onRetake}
        className="w-full gap-2"
        data-testid="button-retake-photo"
      >
        <RotateCcw className="w-4 h-4" />
        Retake This Page
      </Button>

      {/* Add another page (hidden at limit) */}
      {canAddMore && (
        <Button
          variant="outline"
          onClick={onConfirmAndAddAnother}
          className="w-full gap-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          data-testid="button-add-another-page"
        >
          <Camera className="w-4 h-4" />
          Add Another Page
        </Button>
      )}

      {/* Continue to review */}
      <Button
        onClick={onConfirmAndContinue}
        className="w-full gap-2"
        data-testid="button-use-photo"
        size="lg"
      >
        <Check className="w-4 h-4" />
        {pageNumber === 1 && !canAddMore
          ? "Use This Image"
          : "Continue to Review"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Make sure the page is in focus and clearly readable before continuing.
      </p>
    </div>
  );
}

/* ── PagesReviewView ───────────────────────────────────────────────────────
 *
 * Review screen before analysis.
 *   • PDF: single file card — no reordering needed.
 *   • Images: thumbnail cards with reorder (↑/↓), remove (×), and
 *             add-more controls (camera / gallery).
 * ──────────────────────────────────────────────────────────────────────── */

type SourceType = "pdf" | "images" | "camera-scan";

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  pdf: "PDF Document",
  images: "Uploaded Images",
  "camera-scan": "Camera Scan",
};

function PagesReviewView({
  pages,
  previews,
  isPDF,
  sourceType,
  isAnalyzing,
  analyzeDisabled = false,
  onAddCamera,
  onAddImage,
  onMoveUp,
  onMoveDown,
  onRemovePage,
  onClear,
  onAnalyze,
}: {
  pages: File[];
  previews: string[];
  isPDF: boolean;
  sourceType: SourceType;
  isAnalyzing: boolean;
  analyzeDisabled?: boolean;
  onAddCamera: () => void;
  onAddImage: () => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemovePage: (index: number) => void;
  onClear: () => void;
  onAnalyze: () => void;
}) {
  const canAddMore = !isPDF && pages.length < MAX_PAGES;

  return (
    <div className="space-y-4" data-testid="pages-review">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground">
            {isPDF
              ? "Document ready"
              : `${pages.length} page${pages.length !== 1 ? "s" : ""} ready`}
          </p>
          <Badge variant="secondary" className="text-xs font-normal" data-testid="text-source-type">
            {SOURCE_TYPE_LABELS[sourceType]}
          </Badge>
        </div>
        <button
          onClick={onClear}
          disabled={isAnalyzing}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 flex-shrink-0"
          data-testid="button-start-over"
        >
          Start over
        </button>
      </div>

      {/* PDF: simple file card */}
      {isPDF && (
        <div
          className="rounded-lg border bg-muted/30 p-4 flex items-center gap-3"
          data-testid="file-preview"
        >
          <FileText className="w-8 h-8 text-red-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid="text-filename">
              {pages[0].name}
            </p>
            <p className="text-xs text-muted-foreground">
              {(pages[0].size / 1024 / 1024).toFixed(2)} MB · PDF
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemovePage(0)}
            disabled={isAnalyzing}
            data-testid="button-clear-file"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Images: thumbnail cards with reorder controls */}
      {!isPDF && (
        <>
          {/* Reorder hint (only when >1 page) */}
          {pages.length > 1 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <GripVertical className="w-3.5 h-3.5" />
              Use the arrows to set the correct page order before analyzing.
            </p>
          )}

          <div
            className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
            data-testid="pages-thumbnail-strip"
          >
            {previews.map((url, i) => (
              <div
                key={i}
                className="flex flex-col gap-1 flex-shrink-0"
                data-testid={`page-thumbnail-${i}`}
              >
                {/* Thumbnail image */}
                <div className="relative">
                  <img
                    src={url}
                    alt={`Page ${i + 1}`}
                    className="w-24 h-28 object-cover rounded-lg border shadow-sm"
                  />
                  {/* Page number badge */}
                  <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
                    <span className="text-[10px] font-bold text-primary-foreground leading-none">
                      {i + 1}
                    </span>
                  </div>
                  {/* Remove button */}
                  {!isAnalyzing && (
                    <button
                      onClick={() => onRemovePage(i)}
                      className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-destructive/90 hover:bg-destructive flex items-center justify-center transition-colors shadow-sm"
                      aria-label={`Remove page ${i + 1}`}
                      data-testid={`button-remove-page-${i}`}
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  )}
                </div>

                {/* Reorder buttons — shown below thumbnail when >1 page */}
                {pages.length > 1 && !isAnalyzing && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => onMoveUp(i)}
                      disabled={i === 0}
                      className="flex-1 h-7 rounded border border-border bg-muted/40 hover:bg-muted hover:border-primary/40 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label={`Move page ${i + 1} earlier`}
                      data-testid={`button-move-up-${i}`}
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onMoveDown(i)}
                      disabled={i === pages.length - 1}
                      className="flex-1 h-7 rounded border border-border bg-muted/40 hover:bg-muted hover:border-primary/40 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label={`Move page ${i + 1} later`}
                      data-testid={`button-move-down-${i}`}
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Add-more tiles */}
            {canAddMore && !isAnalyzing && (
              <div className="flex flex-col gap-2 flex-shrink-0 mt-0">
                <button
                  onClick={onAddCamera}
                  className="w-24 h-[52px] rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1"
                  data-testid="button-add-page-camera"
                >
                  <Camera className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground leading-none">Camera</span>
                </button>
                <button
                  onClick={onAddImage}
                  className="w-24 h-[52px] rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1"
                  data-testid="button-add-page-gallery"
                >
                  <Image className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground leading-none">Gallery</span>
                </button>
              </div>
            )}
          </div>

          {/* Page count status */}
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Plus className="w-3 h-3" />
            {canAddMore
              ? `You can add up to ${MAX_PAGES} pages. ${pages.length}/${MAX_PAGES} added.`
              : `Maximum ${MAX_PAGES} pages reached.`}
          </p>
        </>
      )}

      {/* Analyze CTA */}
      <Button
        onClick={onAnalyze}
        disabled={pages.length === 0 || isAnalyzing || analyzeDisabled}
        className="w-full gap-2"
        data-testid="button-analyze-document"
        size="lg"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing document…
          </>
        ) : (
          <>
            <FileSearch className="w-4 h-4" />
            Analyze Document{pages.length > 1 ? ` (${pages.length} pages)` : ""}
          </>
        )}
      </Button>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */

export default function UploadDocumentPage() {
  // Read optional ?case= URL param so uploads can be tied to an active case.
  const activeCaseId: string | null = new URLSearchParams(window.location.search).get("case");

  // Document pages being prepared for submission
  const [pages, setPages] = useState<File[]>([]);
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);

  // Tracks how the document was sourced (set on first file added)
  const [sourceType, setSourceType] = useState<SourceType>("images");

  // Camera capture: the photo taken is held here until the user confirms it
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; url: string } | null>(null);

  // Drag-and-drop
  const [dragOver, setDragOver] = useState(false);

  // Analysis pipeline state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docLimitReached, setDocLimitReached] = useState(false);
  const queryClient = useQueryClient();

  // Hidden file input refs
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const addCameraInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const { jurisdiction } = useJurisdiction();

  // Derived state — drives which sub-view renders
  const isPDF = pages.length === 1 && pages[0].type === "application/pdf";
  const hasPages = pages.length > 0;
  const showCameraPreview = pendingPhoto !== null;
  const showSelector = !hasPages && !showCameraPreview;
  const showReview = hasPages && !showCameraPreview;

  // The page number the pending photo would become (1-indexed)
  const pendingPageNumber = pages.filter((p) => p.type !== "application/pdf").length + 1;
  // Whether "Add Another Page" should be offered in camera preview
  const cameraCanAddMore = pendingPageNumber < MAX_PAGES;

  /* ── Validation ──────────────────────────────────────────────────────── */

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_ALL_TYPES.includes(file.type)) {
      return `Unsupported file type "${file.type}". Please upload a PDF, JPG, or PNG.`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_SIZE_MB} MB.`;
    }
    return null;
  };

  /* ── File handlers ───────────────────────────────────────────────────── */

  const handlePdfInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) { setError(err); e.target.value = ""; return; }
    // PDFs replace everything
    pagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setPages([file]);
    setPagePreviews([]);
    setSourceType("pdf");
    setResult(null);
    setError(null);
    e.target.value = "";
  };

  const handleImageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) { setError(err); e.target.value = ""; return; }
    // Enforce page limit
    const imageCount = pages.filter((p) => p.type !== "application/pdf").length;
    if (imageCount >= MAX_PAGES) {
      setError(`Maximum ${MAX_PAGES} pages allowed. Remove a page before adding more.`);
      e.target.value = "";
      return;
    }
    setError(null);
    setResult(null);
    const url = URL.createObjectURL(file);
    setPages((prev) => {
      const withoutPDF = prev.filter((p) => p.type !== "application/pdf");
      return [...withoutPDF, file];
    });
    setPagePreviews((prev) => {
      const cleanPrev = pages.some((p) => p.type === "application/pdf") ? [] : prev;
      return [...cleanPrev, url];
    });
    // Set source type only on first image (don't override "camera-scan")
    if (pages.length === 0 || pages.every((p) => p.type === "application/pdf")) {
      setSourceType("images");
    }
    e.target.value = "";
  };

  // Camera: capture goes to pendingPhoto for preview/confirmation first
  const handleCameraInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) { setError(err); e.target.value = ""; return; }
    const url = URL.createObjectURL(file);
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
    setPendingPhoto({ file, url });
    e.target.value = "";
  };

  /* ── Camera preview actions ──────────────────────────────────────────── */

  // Shared helper: commits pendingPhoto to the pages array
  const _commitPendingPhoto = (photo: { file: File; url: string }) => {
    setError(null);
    setResult(null);
    setPages((prev) => {
      const withoutPDF = prev.filter((p) => p.type !== "application/pdf");
      return [...withoutPDF, photo.file];
    });
    setPagePreviews((prev) => {
      const cleanPrev = pages.some((p) => p.type === "application/pdf") ? [] : prev;
      return [...cleanPrev, photo.url];
    });
    // First camera capture sets source type; mixed (camera + gallery) stays "camera-scan"
    setSourceType((prev) =>
      prev === "pdf" || prev === "images" ? "camera-scan" : prev,
    );
  };

  // "Continue to Review" — commit photo and show the review screen
  const confirmPhotoAndContinue = () => {
    if (!pendingPhoto) return;
    _commitPendingPhoto(pendingPhoto);
    setPendingPhoto(null);
  };

  // "Add Another Page" — commit photo then immediately open camera for next page
  const confirmPhotoAndAddAnother = () => {
    if (!pendingPhoto) return;
    const currentImageCount = pages.filter((p) => p.type !== "application/pdf").length;
    if (currentImageCount >= MAX_PAGES - 1) {
      // Already at limit after this commit — commit and go to review
      toast({
        title: "Page limit reached",
        description: `Maximum ${MAX_PAGES} pages. Proceeding to review.`,
      });
      _commitPendingPhoto(pendingPhoto);
      setPendingPhoto(null);
      return;
    }
    _commitPendingPhoto(pendingPhoto);
    setPendingPhoto(null);
    // Small delay so state flushes before re-opening camera
    setTimeout(() => addCameraInputRef.current?.click(), 80);
  };

  // "Retake This Page" — discard and re-open camera
  const retakePhoto = () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
    setPendingPhoto(null);
    setTimeout(() => {
      if (hasPages) {
        addCameraInputRef.current?.click();
      } else {
        cameraInputRef.current?.click();
      }
    }, 80);
  };

  /* ── Page management ─────────────────────────────────────────────────── */

  const removePage = (idx: number) => {
    setPages((prev) => {
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
    setPagePreviews((prev) => {
      const url = prev[idx];
      if (url) URL.revokeObjectURL(url);
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  };

  // Swap a page with the one before (↑) or after (↓) it to reorder
  const movePage = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= pages.length) return;
    setPages((prev) => {
      const next = [...prev];
      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
      return next;
    });
    setPagePreviews((prev) => {
      const next = [...prev];
      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
      return next;
    });
  };

  const clearAll = () => {
    pagePreviews.forEach((url) => URL.revokeObjectURL(url));
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
    setPages([]);
    setPagePreviews([]);
    setPendingPhoto(null);
    setSourceType("images");
    setResult(null);
    setError(null);
  };

  /* ── Drag and drop ───────────────────────────────────────────────────── */

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const err = validateFile(file);
      if (err) { setError(err); return; }
      setError(null);
      setResult(null);
      if (file.type === "application/pdf") {
        pagePreviews.forEach((url) => URL.revokeObjectURL(url));
        setPages([file]);
        setPagePreviews([]);
        setSourceType("pdf");
      } else {
        const imageCount = pages.filter((p) => p.type !== "application/pdf").length;
        if (imageCount >= MAX_PAGES) {
          setError(`Maximum ${MAX_PAGES} pages allowed.`);
          return;
        }
        const url = URL.createObjectURL(file);
        setPages((prev) => [...prev.filter((p) => p.type !== "application/pdf"), file]);
        setPagePreviews((prev) => {
          const clean = pages.some((p) => p.type === "application/pdf") ? [] : prev;
          return [...clean, url];
        });
        if (pages.length === 0 || pages.every((p) => p.type === "application/pdf")) {
          setSourceType("images");
        }
      }
    },
    [pages, pagePreviews],
  );

  /* ── Analysis ────────────────────────────────────────────────────────── */

  const analyzeDocument = async () => {
    if (pages.length === 0) {
      setError("Please add at least one page before analyzing.");
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      let fileToSubmit: File;

      if (isPDF) {
        // PDF: send as-is
        fileToSubmit = pages[0];
      } else if (pages.length === 1) {
        // Single image: compress if oversized
        fileToSubmit = await compressImage(pages[0]);
      } else {
        // Multiple images: stack vertically into one JPEG preserving page order
        fileToSubmit = await combineImagePages(pages);
      }

      const formData = new FormData();
      formData.append("file", fileToSubmit);
      // Let the server know how many logical pages were combined
      formData.append("pageCount", String(isPDF ? 1 : pages.length));
      formData.append("sourceType", sourceType);
      // If a case is active (via ?case= URL param), tie this document to it
      // so extracted facts are upserted into case_facts automatically.
      if (activeCaseId) formData.append("caseId", activeCaseId);

      const headers: Record<string, string> = {};
      const token = getAccessToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/analyze-document", {
        method: "POST",
        headers,
        body: formData,
      });

      if (res.status === 429) {
        setDocLimitReached(true);
        queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      setResult(data as DocumentAnalysisResult);
      queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
    } catch (err: any) {
      const message = err?.message || "Failed to analyze document. Please try again.";
      setError(message);
      toast({ title: "Analysis Failed", description: message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <PageContainer size="narrow">

      {/* 1. Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
        <Link href="/">
          <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-back-home">
            Home
          </span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
        <span className="text-foreground font-medium">Analyze Document</span>
      </nav>

      {/* 2. Context bar: jurisdiction + private session + change */}
      <ContextBar
        testId="card-context-bar"
        left={
          <>
            <MapPin className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
            {jurisdiction ? (
              <span className="text-sm text-foreground font-medium truncate" data-testid="text-jurisdiction-label">
                {formatJurisdictionLabel(jurisdiction.state, jurisdiction.county)}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground" data-testid="text-no-jurisdiction">
                No location set
              </span>
            )}
            <Link href="/location">
              <button
                className="text-xs text-primary/70 hover:text-primary transition-colors flex-shrink-0 ml-0.5"
                data-testid="button-change-location-upload"
              >
                Change
              </button>
            </Link>
          </>
        }
        right={
          <div className="flex items-center gap-1.5" data-testid="card-privacy-notice">
            <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs text-muted-foreground">Private session</span>
          </div>
        }
      />

      {/* 3. Page intro: eyebrow + title + description */}
      <PageIntro
        eyebrow="Document Analysis"
        title="Analyze a Document"
        titleTestId="heading-upload-page"
        description="Upload a custody order or court notice. Our AI will extract key facts and explain them in plain English."
      />

      {/* 4. Primary upload card */}
      <HeroPanel testId="card-upload">
        <HeroPanelContent className="space-y-6">

          {/* Secure analysis reassurance */}
          <InsetPanel variant="success" className="flex items-start gap-3 p-3.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Secure, private analysis</p>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 leading-relaxed">
                Your documents are analyzed privately and never stored or shared. Files are deleted immediately after analysis.
              </p>
            </div>
          </InsetPanel>

          {/* Hidden file inputs */}
          <input ref={pdfInputRef} type="file" accept=".pdf" onChange={handlePdfInput} className="hidden" data-testid="input-file-pdf" />
          <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageInput} className="hidden" data-testid="input-file-image" />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleCameraInput} className="hidden" data-testid="input-camera" />
          <input ref={addImageInputRef} type="file" accept="image/*" onChange={handleImageInput} className="hidden" data-testid="input-add-image" />
          <input ref={addCameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleCameraInput} className="hidden" data-testid="input-add-camera" />

          {/* Upload selector */}
          {showSelector && (
            <UploadSelector
              onPdf={() => pdfInputRef.current?.click()}
              onCamera={() => cameraInputRef.current?.click()}
              onImage={() => imageInputRef.current?.click()}
              isDragOver={dragOver}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            />
          )}

          {/* Camera preview */}
          {showCameraPreview && pendingPhoto && (
            <CameraPreviewView
              url={pendingPhoto.url}
              pageNumber={pendingPageNumber}
              canAddMore={cameraCanAddMore}
              onRetake={retakePhoto}
              onConfirmAndContinue={confirmPhotoAndContinue}
              onConfirmAndAddAnother={confirmPhotoAndAddAnother}
              onConfirmDone={confirmPhotoDone}
            />
          )}

          {/* Pages review */}
          {showReview && (
            <PagesReviewView
              pages={pages}
              previews={pagePreviews}
              isPDF={isPDF}
              sourceType={sourceType}
              isAnalyzing={isAnalyzing}
              analyzeDisabled={docLimitReached}
              onAddCamera={() => addCameraInputRef.current?.click()}
              onAddImage={() => addImageInputRef.current?.click()}
              onMoveUp={(i) => movePage(i, i - 1)}
              onMoveDown={(i) => movePage(i, i + 1)}
              onRemovePage={removePage}
              onClear={clearAll}
              onAnalyze={analyzeDocument}
            />
          )}

          {/* Upgrade prompt */}
          {docLimitReached && (
            <UpgradePromptCard type="document" />
          )}

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5"
              data-testid="text-error"
            >
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

        </HeroPanelContent>
      </HeroPanel>

      {/* 5. Analysis results zone */}
      {(isAnalyzing || result) && (
        <div data-testid="section-analysis-results" className="space-y-4">

          {/* Zone header */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileSearch className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Analysis Results</p>
              {result && !isAnalyzing && (
                <p className="text-xs text-muted-foreground mt-0.5">{result.document_type}</p>
              )}
            </div>
          </div>

          {/* Loading */}
          {isAnalyzing && (
            <div className="rounded-2xl border border-border/60 bg-muted/30 flex flex-col items-center gap-4 text-center py-12 px-6" data-testid="text-analyzing">
              <Loader2 className="w-9 h-9 animate-spin text-primary" />
              <div>
                <p className="font-semibold mb-1">Analyzing your document…</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Extracting text and generating your plain-English explanation.
                  This usually takes 15–30 seconds.
                </p>
              </div>
            </div>
          )}

          {/* Tabbed results */}
          {result && !isAnalyzing && (
            <>
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="risks">Risks</TabsTrigger>
                  <TabsTrigger value="clauses">Clauses</TabsTrigger>
                </TabsList>

                {/* Summary tab */}
                <TabsContent value="summary" className="mt-4 space-y-3">
                  <Card className="shadow-sm border bg-card">
                    <CardContent className="pt-5 pb-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <Badge className="text-sm px-3 py-1" data-testid="text-document-type">
                          {result.document_type}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Analysis complete</span>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold mb-2 text-foreground">Summary</h3>
                        <p className="text-sm leading-relaxed text-muted-foreground" data-testid="text-summary">
                          {result.summary}
                        </p>
                        <TTSControls text={result.summary} className="mt-3" />
                      </div>
                    </CardContent>
                  </Card>
                  {result.extracted_facts && (
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                      <ExtractedFactsCard facts={result.extracted_facts} />
                    </div>
                  )}
                </TabsContent>

                {/* Risks tab */}
                <TabsContent value="risks" className="mt-4">
                  <Card className="shadow-sm border bg-card">
                    <CardContent className="pt-5 pb-5 space-y-5">
                      {result.possible_implications.length > 0 ? (
                        <div>
                          <div className="flex items-center gap-1.5 mb-3">
                            <FileSearch className="w-3.5 h-3.5 text-violet-500" />
                            <h3 className="text-sm font-semibold">Possible Implications</h3>
                          </div>
                          <ul className="space-y-2">
                            {result.possible_implications.map((impl, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm" data-testid={`implication-${i}`}>
                                <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-violet-400 flex-shrink-0" />
                                <span className="leading-relaxed text-muted-foreground">{impl}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No risk implications identified for this document.</p>
                      )}
                      {result.key_dates.length > 0 && (
                        <div className="rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Key Dates</h3>
                          </div>
                          <ul className="space-y-1.5">
                            {result.key_dates.map((date, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200" data-testid={`key-date-${i}`}>
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                                <span className="leading-relaxed">{date}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex items-start gap-1.5 pt-1 border-t border-border">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground italic leading-relaxed">
                          This analysis is for general informational purposes only and does not constitute legal advice.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Clauses tab */}
                <TabsContent value="clauses" className="mt-4">
                  <Card className="shadow-sm border bg-card">
                    <CardContent className="pt-5 pb-5 space-y-5">
                      {result.important_terms.length > 0 ? (
                        <div>
                          <div className="flex items-center gap-1.5 mb-3">
                            <Scale className="w-3.5 h-3.5 text-primary" />
                            <h3 className="text-sm font-semibold">Important Terms &amp; Provisions</h3>
                          </div>
                          <ul className="space-y-2">
                            {result.important_terms.map((term, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm" data-testid={`important-term-${i}`}>
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                                <span className="leading-relaxed text-muted-foreground">{term}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No specific terms or clauses identified.</p>
                      )}
                      {result.questions_to_ask_attorney.length > 0 && (
                        <div className="rounded-md border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Questions to Ask Your Attorney</h3>
                          </div>
                          <ul className="space-y-1.5">
                            {result.questions_to_ask_attorney.map((q, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-blue-800 dark:text-blue-200" data-testid={`attorney-question-${i}`}>
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                <span className="leading-relaxed">{q}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex items-start gap-1.5 pt-1 border-t border-border">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground italic leading-relaxed">
                          Always consult a licensed family law attorney before making decisions based on this analysis.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Child Support Impact Card */}
              {(() => {
                const haystack = [
                  result.document_type,
                  result.summary,
                  ...result.important_terms,
                  ...result.possible_implications,
                ].join(" ").toLowerCase();
                const mentionsSupport =
                  haystack.includes("child support") ||
                  haystack.includes("support order") ||
                  haystack.includes("support payment") ||
                  haystack.includes("support obligation") ||
                  haystack.includes("support modification") ||
                  haystack.includes("financial support");
                if (!mentionsSupport) return null;
                return (
                  <ChildSupportImpactCard
                    state={jurisdiction?.state}
                    county={jurisdiction?.county}
                    country={jurisdiction?.country ?? "United States"}
                  />
                );
              })()}

              {/* Document Q&A */}
              <DocumentQASection result={result} jurisdiction={jurisdiction} />
            </>
          )}

        </div>
      )}

    </PageContainer>
  );
}
