/**
 * PublicQAPage.tsx
 *
 * Public, indexable Q&A page for a single custody law question.
 * Route: /q/:stateSlug/:topic/:slug
 *
 * No auth required — this page is fully public and SEO-optimised.
 */

import { useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, MessageSquare, ChevronRight, ArrowLeft,
  BookOpen, Loader2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Breadcrumb } from "@/components/app/Header";
import { AIResponseCard } from "@/components/app/AIResponseCard";
import type { AILegalResponse, PublicQuestion } from "@shared/schema";

/* ── Topic display labels ──────────────────────────────────────────────────── */

const TOPIC_LABELS: Record<string, string> = {
  "child-support": "Child Support",
  "relocation": "Relocation",
  "modification": "Modification",
  "enforcement": "Enforcement",
  "mediation": "Mediation",
  "child-preference": "Child Preference",
  "parenting-time": "Parenting Time",
  "custody-basics": "Custody Basics",
};

/* ── SEO helper ────────────────────────────────────────────────────────────── */

function useSEO(title: string, description: string) {
  useEffect(() => {
    document.title = title;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement("meta");
        const [attrName, attrVal] = attr.split("=");
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };

    setMeta('meta[name="description"]', "name=description", description);
    setMeta('meta[property="og:title"]', "property=og:title", title);
    setMeta('meta[property="og:description"]', "property=og:description", description);
    setMeta('meta[name="robots"]', "name=robots", "index, follow");

    return () => {
      document.title = "Custody Atlas";
    };
  }, [title, description]);
}

/* ── Slug → state name ─────────────────────────────────────────────────────── */

function slugToStateName(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/* ── Response shape ────────────────────────────────────────────────────────── */

interface PublicQADetailResponse {
  question: PublicQuestion;
  related: Array<Pick<PublicQuestion, "id" | "state" | "stateSlug" | "topic" | "slug" | "questionText" | "seoTitle">>;
  topicLabels: Record<string, string>;
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function PublicQAPage() {
  const [, params] = useRoute("/q/:stateSlug/:topic/:slug");
  const stateSlug = params?.stateSlug ?? "";
  const topic = params?.topic ?? "";
  const slug = params?.slug ?? "";
  const stateName = slugToStateName(stateSlug);

  const { data, isLoading, isError } = useQuery<PublicQADetailResponse>({
    queryKey: ["/api/public-questions", stateSlug, topic, slug],
    queryFn: async () => {
      const res = await fetch(`/api/public-questions/${stateSlug}/${topic}/${slug}`);
      if (!res.ok) throw new Error("Question not found");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
    retry: false,
  });

  const question = data?.question;
  const related = data?.related ?? [];
  const topicLabel = TOPIC_LABELS[topic] ?? "Custody Law";

  const seoTitle = question?.seoTitle ?? `${topicLabel} in ${stateName} | Custody Atlas`;
  const seoDescription = question?.seoDescription ?? `General custody law information for ${stateName}.`;

  useSEO(seoTitle, seoDescription);

  const aiResponse: AILegalResponse | null = question
    ? (question.responseJson as unknown as AILegalResponse)
    : null;

  const askAIPath = `/ask?state=${encodeURIComponent(stateName)}&q=${encodeURIComponent(question?.questionText ?? "")}`;
  const lawPagePath = `/custody-laws/${stateSlug}`;
  const statePath = `/custody-laws/${stateSlug}`;

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 flex items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (isError || !question || !aiResponse) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto" />
        <h1 className="text-xl font-bold">Question not found</h1>
        <p className="text-muted-foreground text-sm">
          This Q&amp;A page may have been removed or is no longer public.
        </p>
        <Link href={lawPagePath}>
          <Button variant="outline" className="gap-2 mt-2">
            <ArrowLeft className="w-4 h-4" />
            View {stateName} Custody Law
          </Button>
        </Link>
      </div>
    );
  }

  const hasCounty = question.county && question.county.trim() !== "";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: `${stateName} Custody Law`, href: statePath },
          { label: topicLabel },
        ]}
      />

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs" data-testid="badge-topic">
            {topicLabel}
          </Badge>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 text-emerald-500" />
            <span data-testid="text-jurisdiction">
              {hasCounty ? `${question.county} County, ${question.state}` : question.state}
            </span>
          </div>
        </div>

        <h1
          className="text-2xl md:text-3xl font-bold leading-snug"
          data-testid="heading-question"
        >
          {question.questionText}
        </h1>

        <p className="text-sm text-muted-foreground">
          General information about {topicLabel.toLowerCase()} in {question.state} —
          not legal advice. Laws may vary.
        </p>
      </div>

      {/* AI Answer */}
      <div>
        <h2 className="sr-only">Answer</h2>
        <AIResponseCard response={aiResponse} />
      </div>

      {/* CTA — Ask a follow-up */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10" data-testid="section-cta">
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="font-semibold leading-snug" data-testid="text-cta-heading">
              Have a follow-up question?
            </p>
            <p className="text-sm text-muted-foreground">
              Ask Custody Atlas for personalised information tailored to {question.state} law.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            <Link href={askAIPath}>
              <Button className="gap-2" size="sm" data-testid="button-ask-followup">
                <MessageSquare className="w-3.5 h-3.5" />
                Ask a Question
              </Button>
            </Link>
            <Link href={lawPagePath}>
              <Button variant="outline" size="sm" className="gap-2" data-testid="button-view-laws">
                <BookOpen className="w-3.5 h-3.5" />
                {stateName} Law Summary
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Related questions */}
      {related.length > 0 && (
        <div data-testid="section-related">
          <h2 className="text-base font-semibold mb-3">
            Related Questions in {question.state}
          </h2>
          <div className="divide-y divide-border/60 rounded-lg border">
            {related.map((q) => (
              <Link
                key={q.id}
                href={`/q/${q.stateSlug}/${q.topic}/${q.slug}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors first:rounded-t-lg last:rounded-b-lg"
                data-testid={`link-related-${q.id}`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <ChevronRight className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                    {q.questionText}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  {TOPIC_LABELS[q.topic] ?? q.topic}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer footer */}
      <p className="text-xs text-muted-foreground text-center leading-relaxed border-t border-border/40 pt-4">
        Custody Atlas provides general educational information about custody law. This page does
        not constitute legal advice. Consult a licensed family law attorney for guidance specific
        to your situation.
      </p>
    </div>
  );
}
