import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import {
  Upload, FileText, Image, AlertTriangle, CheckCircle2,
  Loader2, Scale, HelpCircle, Calendar, FileSearch,
  ArrowLeft, X, ChevronRight, Lock, MessageSquare,
  MapPin, Send, BookOpen, TriangleAlert, ShieldAlert,
  Camera, RotateCcw, Check, Shield, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useJurisdiction } from "@/hooks/useJurisdiction";
import { JurisdictionContextHeader } from "@/components/app/JurisdictionContextHeader";
import type { DocumentAnalysisResult, DocumentQAResponse } from "@shared/schema";

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

/* ── Small sub-components (unchanged from original) ──────────────────────── */

function AnalysisResultCard({ result }: { result: DocumentAnalysisResult }) {
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

      <div>
        <h3 className="text-sm font-semibold mb-2 text-foreground">Summary</h3>
        <p className="text-sm leading-relaxed text-muted-foreground" data-testid="text-summary">
          {result.summary}
        </p>
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

interface DocumentQASectionProps {
  result: DocumentAnalysisResult;
  jurisdiction: { state: string; county: string; country?: string } | null;
}

function DocumentQASection({ result, jurisdiction }: DocumentQASectionProps) {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [qaResponse, setQaResponse] = useState<DocumentQAResponse | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);
  const { toast } = useToast();

  const submitQuestion = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setQaError(null);

    try {
      const body: Record<string, unknown> = {
        documentAnalysis: result,
        extractedText: result.extractedText ?? "",
        userQuestion: trimmed,
      };
      if (jurisdiction) {
        body.jurisdiction = {
          state: jurisdiction.state,
          county: jurisdiction.county,
          country: jurisdiction.country ?? "United States",
        };
      }

      const res = await fetch("/api/ask-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      setQaResponse(data as DocumentQAResponse);
    } catch (err: any) {
      const message = err?.message || "Failed to get an answer. Please try again.";
      setQaError(message);
      toast({ title: "Question Failed", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = (q: string) => {
    setQuestion(q);
    submitQuestion(q);
  };

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

  return (
    <Card className="border-t-2 border-t-primary/30" data-testid="card-document-qa">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Ask About This Document
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Ask follow-up questions about this document's summary, terms, dates, or possible implications.
        </p>
        {jurisdiction?.state && (
          <div className="flex items-center gap-1.5 mt-1" data-testid="text-jurisdiction-badge">
            <MapPin className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              Answer tailored to {jurisdiction.state} law
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
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

        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your question about this document…"
            className="resize-none min-h-[80px] text-sm"
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
                Ask about this document
              </>
            )}
          </Button>
        </form>

        {qaError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5" data-testid="text-qa-error">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{qaError}</p>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center gap-2 py-4 text-center" data-testid="qa-loading">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing document and generating your answer…</p>
          </div>
        )}

        {qaResponse && !isLoading && (
          <div className="rounded-lg border bg-muted/20 p-4" data-testid="qa-response-container">
            <QAResponseCard response={qaResponse} />
          </div>
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
      className={`space-y-3 transition-opacity ${isDragOver ? "opacity-60" : "opacity-100"}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-testid="upload-selector"
    >
      <p className="text-sm text-muted-foreground text-center pb-1">
        How would you like to add your document?
      </p>

      {/* Upload PDF */}
      <button
        onClick={onPdf}
        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border bg-card hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99] transition-all text-left group"
        data-testid="button-upload-pdf"
      >
        <div className="w-12 h-12 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center flex-shrink-0">
          <FileText className="w-6 h-6 text-red-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm group-hover:text-primary transition-colors">
            Upload PDF
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            PDF files, up to {MAX_SIZE_MB}MB
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
      </button>

      {/* Take Photo / Scan */}
      <button
        onClick={onCamera}
        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border bg-card hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99] transition-all text-left group"
        data-testid="button-take-photo"
      >
        <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center flex-shrink-0">
          <Camera className="w-6 h-6 text-blue-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm group-hover:text-primary transition-colors">
            Take Photo / Scan Document
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Open your phone camera to photograph the document
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
      </button>

      {/* Upload Image */}
      <button
        onClick={onImage}
        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border bg-card hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99] transition-all text-left group"
        data-testid="button-upload-image"
      >
        <div className="w-12 h-12 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center flex-shrink-0">
          <Image className="w-6 h-6 text-violet-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm group-hover:text-primary transition-colors">
            Upload Image from Device
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            JPG or PNG — photos already saved on your device
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
      </button>

      {/* Drag hint — desktop only */}
      <p className="text-center text-xs text-muted-foreground/60 hidden sm:block">
        or drag and drop a file anywhere above
      </p>

      {/* Trust message */}
      <div
        className="flex items-center justify-center gap-2 pt-1"
        data-testid="text-trust-message"
      >
        <Shield className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          Your documents are processed securely and analyzed privately.
        </p>
      </div>
    </div>
  );
}

/* ── CameraPreviewView ─────────────────────────────────────────────────────
 *
 * Shows the captured photo before the user commits to using it.
 * "Retake" re-opens the camera input; "Use This Image" adds it to pages.
 * ──────────────────────────────────────────────────────────────────────── */
function CameraPreviewView({
  url,
  onUse,
  onRetake,
}: {
  url: string;
  onUse: () => void;
  onRetake: () => void;
}) {
  return (
    <div className="space-y-4" data-testid="camera-preview-view">
      <div className="flex items-center gap-2">
        <Camera className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">Photo Preview</p>
      </div>

      {/* Image preview */}
      <div className="rounded-xl overflow-hidden border bg-muted/20 flex items-center justify-center max-h-[55vh]">
        <img
          src={url}
          alt="Captured document"
          className="max-w-full max-h-[55vh] object-contain"
          data-testid="img-camera-preview"
        />
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={onRetake}
          className="gap-2"
          data-testid="button-retake-photo"
        >
          <RotateCcw className="w-4 h-4" />
          Retake Photo
        </Button>
        <Button
          onClick={onUse}
          className="gap-2"
          data-testid="button-use-photo"
        >
          <Check className="w-4 h-4" />
          Use This Image
        </Button>
      </div>
    </div>
  );
}

/* ── PagesReviewView ───────────────────────────────────────────────────────
 *
 * Review screen before analysis.
 *   • PDF: single file card with filename + size.
 *   • Images: scrollable thumbnail row with page numbers, remove buttons,
 *             and add-more controls (camera / gallery).
 * ──────────────────────────────────────────────────────────────────────── */
function PagesReviewView({
  pages,
  previews,
  isPDF,
  isAnalyzing,
  onAddCamera,
  onAddImage,
  onRemovePage,
  onClear,
  onAnalyze,
}: {
  pages: File[];
  previews: string[];
  isPDF: boolean;
  isAnalyzing: boolean;
  onAddCamera: () => void;
  onAddImage: () => void;
  onRemovePage: (index: number) => void;
  onClear: () => void;
  onAnalyze: () => void;
}) {
  const canAddMore = !isPDF && pages.length < MAX_PAGES;

  return (
    <div className="space-y-4" data-testid="pages-review">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {isPDF
            ? "Document ready to analyze"
            : `${pages.length} page${pages.length !== 1 ? "s" : ""} ready`}
        </p>
        <button
          onClick={onClear}
          disabled={isAnalyzing}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
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

      {/* Images: horizontal thumbnail strip */}
      {!isPDF && (
        <div
          className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
          data-testid="pages-thumbnail-strip"
        >
          {previews.map((url, i) => (
            <div
              key={i}
              className="relative flex-shrink-0"
              data-testid={`page-thumbnail-${i}`}
            >
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
          ))}

          {/* Add more page tiles */}
          {canAddMore && !isAnalyzing && (
            <div className="flex flex-col gap-2 flex-shrink-0">
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
      )}

      {/* Page count hint */}
      {canAddMore && !isPDF && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Plus className="w-3 h-3" />
          You can add up to {MAX_PAGES} pages. {pages.length}/{MAX_PAGES} added.
        </p>
      )}

      {/* Analyze CTA */}
      <Button
        onClick={onAnalyze}
        disabled={pages.length === 0 || isAnalyzing}
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
  // Document pages being prepared for submission
  const [pages, setPages] = useState<File[]>([]);
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);

  // Camera capture: the photo taken is held here until the user confirms it
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; url: string } | null>(null);

  // Drag-and-drop
  const [dragOver, setDragOver] = useState(false);

  // Analysis pipeline state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setResult(null);
    setError(null);
    e.target.value = "";
  };

  const handleImageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) { setError(err); e.target.value = ""; return; }
    setError(null);
    setResult(null);
    // Images are appended (clearing any PDF)
    const url = URL.createObjectURL(file);
    setPages((prev) => {
      const withoutPDF = prev.filter((p) => p.type !== "application/pdf");
      return [...withoutPDF, file];
    });
    setPagePreviews((prev) => {
      // If there was a PDF, clear previews first
      const cleanPrev = pages.some((p) => p.type === "application/pdf") ? [] : prev;
      return [...cleanPrev, url];
    });
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

  const confirmPhoto = () => {
    if (!pendingPhoto) return;
    setError(null);
    setResult(null);
    setPages((prev) => {
      const withoutPDF = prev.filter((p) => p.type !== "application/pdf");
      return [...withoutPDF, pendingPhoto.file];
    });
    setPagePreviews((prev) => {
      const cleanPrev = pages.some((p) => p.type === "application/pdf") ? [] : prev;
      return [...cleanPrev, pendingPhoto.url];
    });
    setPendingPhoto(null);
  };

  const retakePhoto = () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
    setPendingPhoto(null);
    // Re-open whichever camera input is relevant
    if (hasPages) {
      addCameraInputRef.current?.click();
    } else {
      cameraInputRef.current?.click();
    }
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

  const clearAll = () => {
    pagePreviews.forEach((url) => URL.revokeObjectURL(url));
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
    setPages([]);
    setPagePreviews([]);
    setPendingPhoto(null);
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
      } else {
        const url = URL.createObjectURL(file);
        setPages((prev) => [...prev.filter((p) => p.type !== "application/pdf"), file]);
        setPagePreviews((prev) => {
          const clean = pages.some((p) => p.type === "application/pdf") ? [] : prev;
          return [...clean, url];
        });
      }
    },
    [pages, pagePreviews],
  );

  /* ── Analysis ────────────────────────────────────────────────────────── */

  const analyzeDocument = async () => {
    if (pages.length === 0) return;
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
        // Multiple images: stack vertically into one JPEG
        fileToSubmit = await combineImagePages(pages);
      }

      const formData = new FormData();
      formData.append("file", fileToSubmit);

      const res = await fetch("/api/analyze-document", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      setResult(data as DocumentAnalysisResult);
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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/">
          <span className="hover:text-foreground cursor-pointer flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            Home
          </span>
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Analyze Document</span>
      </div>

      <JurisdictionContextHeader
        mode="document"
        state={jurisdiction?.state}
        county={jurisdiction?.county}
        documentName={pages[0]?.name ?? undefined}
        changeLocationHref="/location"
      />

      <div>
        <h1 className="text-2xl font-bold mb-1">Analyze a Custody Document</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Upload a custody order, parenting plan, or court notice.
          Our AI will extract the key information and explain it in plain English.
        </p>
      </div>

      {/* Privacy notice */}
      <div className="rounded-lg border bg-card p-4 flex gap-3 items-start" data-testid="card-privacy-notice">
        <div className="w-8 h-8 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold mb-1.5">Secure Document Analysis</p>
          <ul className="space-y-1">
            {[
              "Your files are analyzed privately and not shared with other users.",
              "Documents are used only to generate explanations and insights.",
              "Files are automatically deleted from our servers after analysis.",
              "You may close this page at any time to discard your upload.",
            ].map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Upload card ──────────────────────────────────────────────── */}
      <Card data-testid="card-upload">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {showCameraPreview
              ? "Preview Photo"
              : showReview
              ? "Ready to Analyze"
              : "Add Document"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Hidden file inputs — one per input mode */}
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf"
            onChange={handlePdfInput}
            className="hidden"
            data-testid="input-file-pdf"
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageInput}
            className="hidden"
            data-testid="input-file-image"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraInput}
            className="hidden"
            data-testid="input-camera"
          />
          <input
            ref={addImageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageInput}
            className="hidden"
            data-testid="input-add-image"
          />
          <input
            ref={addCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraInput}
            className="hidden"
            data-testid="input-add-camera"
          />

          {/* Selector (no file yet) */}
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

          {/* Camera preview (pending confirmation) */}
          {showCameraPreview && pendingPhoto && (
            <CameraPreviewView
              url={pendingPhoto.url}
              onUse={confirmPhoto}
              onRetake={retakePhoto}
            />
          )}

          {/* Pages review (before submission) */}
          {showReview && (
            <PagesReviewView
              pages={pages}
              previews={pagePreviews}
              isPDF={isPDF}
              isAnalyzing={isAnalyzing}
              onAddCamera={() => addCameraInputRef.current?.click()}
              onAddImage={() => addImageInputRef.current?.click()}
              onRemovePage={removePage}
              onClear={clearAll}
              onAnalyze={analyzeDocument}
            />
          )}

          {/* Error display */}
          {error && (
            <div
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5"
              data-testid="text-error"
            >
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Analysis loading state ───────────────────────────────────── */}
      {isAnalyzing && (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
              </div>
              <div>
                <p className="font-semibold mb-1" data-testid="text-analyzing">
                  Analyzing your document…
                </p>
                <p className="text-sm text-muted-foreground">
                  Extracting text and generating your plain-English explanation.
                  This usually takes 15–30 seconds.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Analysis result ──────────────────────────────────────────── */}
      {result && !isAnalyzing && (
        <Card data-testid="card-result">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-primary" />
              Document Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AnalysisResultCard result={result} />
          </CardContent>
        </Card>
      )}

      {/* ── Document Q&A ─────────────────────────────────────────────── */}
      {result && !isAnalyzing && (
        <DocumentQASection result={result} jurisdiction={jurisdiction} />
      )}

    </div>
  );
}
