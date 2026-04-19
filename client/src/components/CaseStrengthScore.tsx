import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, MinusCircle, RefreshCcw, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequestRaw } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type CaseStrength = "weak" | "moderate" | "strong";

export interface CaseStrengthReport {
  score: CaseStrength;
  percentage: number;
  summary: string;
  factors: Array<{
    factor: string;
    impact: "positive" | "negative" | "neutral";
    detail: string;
  }>;
  disclaimer: string;
}

interface CaseStrengthScoreProps {
  caseId: string;
}

const CONFIRM_KEY_PREFIX = "custody-atlas:case-strength-confirmed:";

function ringColor(score: CaseStrength): string {
  if (score === "weak") return "#ef4444";
  if (score === "moderate") return "#f59e0b";
  return "#22c55e";
}

function textColor(score: CaseStrength): string {
  if (score === "weak") return "text-red-300";
  if (score === "moderate") return "text-amber-300";
  return "text-emerald-300";
}

function confirmKey(caseId: string): string {
  return `${CONFIRM_KEY_PREFIX}${caseId}`;
}

function LoadingSkeleton() {
  return (
    <Card className="border-white/10 bg-slate-950/80">
      <CardHeader className="pb-3">
        <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-64 animate-pulse rounded bg-white/10" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="mx-auto h-40 w-40 animate-pulse rounded-full border border-white/10 bg-white/[0.04]" />
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-white/10" />
        </div>
      </CardContent>
    </Card>
  );
}

export function CaseStrengthScore({ caseId }: CaseStrengthScoreProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsConfirmed(window.localStorage.getItem(confirmKey(caseId)) === "1");
  }, [caseId]);

  const query = useQuery<CaseStrengthReport>({
    queryKey: ["/api/cases", caseId, "strength"],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", `/api/cases/${caseId}/strength`);
      if (!res.ok) {
        throw new Error("Failed to load case strength.");
      }
      return res.json();
    },
    staleTime: 60_000,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequestRaw("POST", `/api/cases/${caseId}/strength/refresh`);
      if (!res.ok) {
        throw new Error("Failed to refresh case strength.");
      }
      return res.json() as Promise<CaseStrengthReport>;
    },
    onSuccess: (data) => {
      query.refetch();
      toast({
        title: "Case strength refreshed",
        description: data.summary,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not refresh score",
        description: err?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const progress = useMemo(() => {
    const percentage = query.data?.percentage ?? 0;
    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (percentage / 100) * circumference;
    return { radius, circumference, dashOffset };
  }, [query.data?.percentage]);

  if (query.isLoading) {
    return <LoadingSkeleton />;
  }

  if (query.isError || !query.data) {
    return (
      <Card className="border-white/10 bg-slate-950/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-50">Case Strength</CardTitle>
          <CardDescription className="text-slate-400">
            We could not analyze your current case position yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => query.refetch()} className="border-white/15 text-slate-100 hover:bg-white/10">
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const report = query.data;

  if (!isConfirmed) {
    return (
      <Card className="border-white/10 bg-slate-950/85">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-50">Case Strength</CardTitle>
          <CardDescription className="text-slate-400">
            This score is based on your uploaded documents. Does it reflect your current situation?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className={`text-sm font-semibold uppercase tracking-[0.18em] ${textColor(report.score)}`}>
              Current score: {report.score}
            </p>
            <p className="mt-2 text-sm text-slate-300">{report.summary}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(confirmKey(caseId), "1");
                }
                setIsConfirmed(true);
              }}
              className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            >
              Yes, looks right
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/upload-document?case=${encodeURIComponent(caseId)}`)}
              className="border-white/15 text-slate-100 hover:bg-white/10"
            >
              No, I need to add documents
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-slate-950/85">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-slate-50">Case Strength</CardTitle>
            <CardDescription className="mt-1 text-slate-400">
              A document-based read on how strong your current case position looks.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="border-white/15 text-slate-100 hover:bg-white/10"
          >
            {refreshMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Refresh score
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex h-44 w-44 items-center justify-center">
            <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
              <circle cx="70" cy="70" r={progress.radius} stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
              <circle
                cx="70"
                cy="70"
                r={progress.radius}
                stroke={ringColor(report.score)}
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={progress.circumference}
                strokeDashoffset={progress.dashOffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-semibold text-slate-50">{report.percentage}%</p>
              <p className={`mt-1 text-sm font-bold uppercase tracking-[0.24em] ${textColor(report.score)}`}>
                {report.score}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Badge variant="outline" className={`border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${textColor(report.score)} ${report.score === "weak" ? "border-red-400/40 bg-red-500/10" : report.score === "moderate" ? "border-amber-400/40 bg-amber-500/10" : "border-emerald-400/40 bg-emerald-500/10"}`}>
              {report.score}
            </Badge>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-300">{report.summary}</p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03]">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <p className="text-sm font-medium text-slate-100">What this score is reacting to</p>
              <p className="mt-1 text-xs text-slate-400">{report.factors.length} factor{report.factors.length === 1 ? "" : "s"} assessed</p>
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {expanded ? (
            <div className="space-y-3 border-t border-white/10 px-4 py-4">
              {report.factors.map((factor, index) => (
                <div key={`${factor.factor}-${index}`} className="flex items-start gap-3 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-3">
                  {factor.impact === "positive" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  ) : factor.impact === "negative" ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                  ) : (
                    <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-100">{factor.factor}</p>
                    <p className="text-sm leading-relaxed text-slate-400">{factor.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <p className="text-xs leading-relaxed text-slate-500">{report.disclaimer}</p>
      </CardContent>
    </Card>
  );
}

export default CaseStrengthScore;
