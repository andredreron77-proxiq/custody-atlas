import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import {
  Upload, FileText, Image, AlertTriangle, CheckCircle2,
  Loader2, Scale, HelpCircle, Calendar, FileSearch,
  ArrowLeft, X, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { DocumentAnalysisResult } from "@shared/schema";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf") return <FileText className="w-8 h-8 text-red-500" />;
  return <Image className="w-8 h-8 text-blue-500" />;
}

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

export default function UploadDocumentPage() {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Unsupported file type "${file.type}". Please upload a PDF, JPG, or PNG.`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${MAX_SIZE_MB}MB.`;
    }
    return null;
  };

  const handleFile = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      return;
    }
    setError(null);
    setResult(null);
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const clearFile = () => {
    setSelectedFile(null);
    setResult(null);
    setError(null);
  };

  const analyzeDocument = async () => {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

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

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
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

      <div>
        <h1 className="text-2xl font-bold mb-1">Analyze a Custody Document</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Upload a custody order, parenting plan, or other custody-related document.
          Our AI will extract the text and explain it in plain English.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedFile ? (
            <div
              className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-upload"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                onChange={handleInputChange}
                className="hidden"
                data-testid="input-file"
              />
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-sm mb-1">
                Drop your document here, or <span className="text-primary">browse</span>
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, JPG, or PNG — up to {MAX_SIZE_MB}MB
              </p>
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/30 p-4 flex items-center gap-3" data-testid="file-preview">
              <FileIcon mimeType={selectedFile.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="text-filename">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {selectedFile.type.split("/")[1].toUpperCase()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={clearFile}
                disabled={isAnalyzing}
                data-testid="button-clear-file"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5" data-testid="text-error">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Button
            onClick={analyzeDocument}
            disabled={!selectedFile || isAnalyzing}
            className="w-full gap-2"
            data-testid="button-analyze"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing document...
              </>
            ) : (
              <>
                <FileSearch className="w-4 h-4" />
                Analyze Document
              </>
            )}
          </Button>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>OCR text extraction</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>AI-powered analysis</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Files deleted after analysis</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAnalyzing && (
        <Card data-testid="card-loading">
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div>
              <p className="font-medium text-sm">Analyzing your document</p>
              <p className="text-xs text-muted-foreground mt-1">
                Extracting text with OCR, then analyzing with AI — this may take 15–30 seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
