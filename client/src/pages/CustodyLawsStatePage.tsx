import { useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Scale, Users, Gavel, MapPin, MessageSquare, ArrowRight,
  Loader2, Map, HelpCircle, ChevronRight, BookOpen, RefreshCw,
  AlertCircle, Baby,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LawSectionCard } from "@/components/app/LawSectionCard";
import { ChildSupportImpactCard } from "@/components/app/ChildSupportImpactCard";
import { Breadcrumb } from "@/components/app/Header";
import type { CustodyLawRecord } from "@shared/schema";

/* ── Slug helpers ──────────────────────────────────────────────────────────── */

/** Convert a URL slug like "new-jersey" → "New Jersey" */
function slugToStateName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Convert a state name like "New Jersey" → "new-jersey" (for canonical links) */
function stateNameToSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

/* ── SEO helper ────────────────────────────────────────────────────────────── */

function useSEO(title: string, description: string) {
  useEffect(() => {
    document.title = title;

    let metaDesc = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    );
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", description);

    let ogTitle = document.querySelector<HTMLMetaElement>(
      'meta[property="og:title"]'
    );
    if (!ogTitle) {
      ogTitle = document.createElement("meta");
      ogTitle.setAttribute("property", "og:title");
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute("content", title);

    let ogDesc = document.querySelector<HTMLMetaElement>(
      'meta[property="og:description"]'
    );
    if (!ogDesc) {
      ogDesc = document.createElement("meta");
      ogDesc.setAttribute("property", "og:description");
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute("content", description);

    return () => {
      document.title = "Custody Atlas";
    };
  }, [title, description]);
}

/* ── Common questions ──────────────────────────────────────────────────────── */

interface FAQ {
  question: string;
  answer: string;
  testId: string;
}

function buildFAQs(state: string, law: CustodyLawRecord): FAQ[] {
  const childPrefAnswer = law.child_preference_age
    ? `In ${state}, courts may consider the child's preference starting at ${law.child_preference_age}. The weight given to that preference depends on the child's maturity and judgment.`
    : `${state} courts may consider a child's preference as one factor in determining custody, but the weight given depends on the child's age and maturity. There is no fixed age at which a child's preference becomes controlling.`;

  return [
    {
      question: `Can a child choose which parent to live with in ${state}?`,
      answer: childPrefAnswer,
      testId: "faq-child-preference",
    },
    {
      question: `How is child custody determined in ${state}?`,
      answer: `${state} uses the "best interests of the child" standard. ${law.custody_standard.split(".")[0]}.`,
      testId: "faq-how-determined",
    },
    {
      question: `Can a parent move away with a child in ${state}?`,
      answer: `Relocation rules in ${state} set requirements that must be met before a parent can move with a child. ${law.relocation_rules.split(".")[0]}.`,
      testId: "faq-relocation",
    },
    {
      question: `How can custody be modified in ${state}?`,
      answer: `${law.modification_rules.split(".")[0]}. A court must find that a material change in circumstances has occurred since the last order.`,
      testId: "faq-modification",
    },
  ];
}

/* ── FAQ item ──────────────────────────────────────────────────────────────── */

function FAQItem({ faq }: { faq: FAQ }) {
  return (
    <div
      className="flex items-start gap-3 py-4 border-b border-border/60 last:border-0"
      data-testid={faq.testId}
    >
      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <HelpCircle className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold leading-snug">{faq.question}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {faq.answer}
        </p>
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */

export default function CustodyLawsStatePage() {
  const [match, params] = useRoute("/custody-laws/:stateSlug");

  const stateSlug = params?.stateSlug ?? "";
  const stateName = slugToStateName(stateSlug);

  // Derive the Ask AI path (uses "General" as the county sentinel for state-level context)
  const askAIPath =
    `/ask?state=${encodeURIComponent(stateName)}&county=General&country=United+States`;

  // Derive the jurisdiction path (law summary page)
  const jurisdictionPath =
    `/jurisdiction/${encodeURIComponent(stateName)}/General?country=United+States`;

  const { data: law, isLoading, error } = useQuery<CustodyLawRecord>({
    queryKey: ["/api/custody-laws", stateName],
    queryFn: async () => {
      const res = await fetch(`/api/custody-laws/${encodeURIComponent(stateName)}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("unsupported_state");
        throw new Error("Failed to fetch");
      }
      return res.json();
    },
    enabled: !!stateName,
  });

  const isUnsupported =
    error instanceof Error && error.message === "unsupported_state";

  const pageTitle = law
    ? `${stateName} Custody Laws | Custody Atlas`
    : `Custody Laws | Custody Atlas`;

  const metaDesc = `Understand ${stateName} custody laws in plain English. Learn about custody standards, modification rules, relocation laws, and more — explained by Custody Atlas.`;

  useSEO(pageTitle, metaDesc);

  if (!match) return null;

  const faqs = law ? buildFAQs(stateName, law) : [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Custody Laws by State" },
          { label: `${stateName}` },
        ]}
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="space-y-3" data-testid="section-hero">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1 text-xs" data-testid="badge-state-code">
            <MapPin className="w-3 h-3" />
            {law?.state_code ?? stateSlug.toUpperCase().slice(0, 2)}
          </Badge>
          <Badge variant="outline" className="gap-1 text-xs">
            <Scale className="w-3 h-3" />
            Custody Law Overview
          </Badge>
        </div>

        <h1
          className="text-3xl md:text-4xl font-bold tracking-tight"
          data-testid="heading-state-laws"
        >
          {stateName} Custody Laws
        </h1>

        <p className="text-muted-foreground text-base leading-relaxed max-w-2xl" data-testid="text-hero-intro">
          Custody Atlas explains {stateName} custody laws in plain English to help parents understand the rules that apply where they live. This overview covers the custody standard courts use, how custody can be modified, and what happens if a parent wants to relocate.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={askAIPath}>
            <Button className="gap-2" data-testid="button-ask-ai-hero">
              <MessageSquare className="w-4 h-4" />
              Ask about {stateName} custody law
            </Button>
          </Link>
          <Link href="/custody-map">
            <Button variant="outline" className="gap-2" data-testid="button-view-map-hero">
              <Map className="w-4 h-4" />
              View Custody Map
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {isLoading && (
        <div
          className="flex items-center justify-center py-20 gap-3"
          data-testid="loading-state-laws"
        >
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-muted-foreground">
            Loading {stateName} custody laws…
          </span>
        </div>
      )}

      {/* ── Unsupported state ─────────────────────────────────────────── */}
      {isUnsupported && (
        <Card
          className="border-amber-200 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/10"
          data-testid="card-unsupported-state"
        >
          <CardContent className="p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="space-y-2">
              <p className="font-semibold">
                Detailed data for {stateName} is coming soon
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We haven't added a full custody law summary for {stateName} yet,
                but our AI can still answer questions about custody law in your
                state.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={askAIPath}>
                  <Button size="sm" className="gap-1.5" data-testid="button-ask-ai-unsupported">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Ask AI About {stateName}
                  </Button>
                </Link>
                <Link href="/custody-map">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Map className="w-3.5 h-3.5" />
                    Explore the Map
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Generic fetch error ───────────────────────────────────────── */}
      {error && !isUnsupported && (
        <Card className="border-destructive/30 bg-destructive/5" data-testid="card-fetch-error">
          <CardContent className="p-5 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">
                Failed to load law data
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 mt-2 px-0"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Law content ───────────────────────────────────────────────── */}
      {law && !isLoading && (
        <>
          {/* At-a-glance summary */}
          {law.quick_summary && (
            <div
              className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4"
              data-testid="panel-quick-summary"
            >
              <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1.5">
                At a Glance
              </p>
              <p className="text-sm leading-relaxed text-foreground">
                {law.quick_summary}
              </p>
            </div>
          )}

          {/* Child preference age — shown as an info callout when present */}
          {law.child_preference_age && (
            <div
              className="flex items-start gap-3 rounded-xl border border-violet-200 dark:border-violet-800/40 bg-violet-50/40 dark:bg-violet-950/10 px-5 py-4"
              data-testid="panel-child-preference"
            >
              <div className="w-8 h-8 rounded-md bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Baby className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide mb-1">
                  Child Preference Age
                </p>
                <p className="text-sm text-foreground leading-relaxed">
                  In {stateName}, courts may give significant weight to a child's
                  custody preference starting at{" "}
                  <span className="font-semibold">{law.child_preference_age}</span>.
                  The child's maturity and reasoning are also considered.
                </p>
              </div>
            </div>
          )}

          {/* Law section cards */}
          <div className="space-y-3" data-testid="section-law-cards">
            <h2 className="text-lg font-bold">
              {stateName} Custody Law — Key Sections
            </h2>

            <LawSectionCard
              title="Custody Standard"
              content={law.custody_standard}
              icon={Scale}
              defaultExpanded
              accentColor="text-primary"
              testId="card-seo-custody-standard"
            />
            <LawSectionCard
              title="Custody Types"
              content={law.custody_types}
              icon={Users}
              defaultExpanded
              accentColor="text-blue-600 dark:text-blue-400"
              testId="card-seo-custody-types"
            />
            <LawSectionCard
              title="Modification Rules"
              content={law.modification_rules}
              icon={Gavel}
              accentColor="text-violet-600 dark:text-violet-400"
              testId="card-seo-modification-rules"
            />
            <LawSectionCard
              title="Relocation Rules"
              content={law.relocation_rules}
              icon={MapPin}
              accentColor="text-orange-600 dark:text-orange-400"
              testId="card-seo-relocation-rules"
            />
          </div>

          {/* Common questions / FAQ */}
          <Card data-testid="section-faq">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <HelpCircle className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Common Questions About {stateName} Custody Law
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Plain-English answers based on {stateName} statutes
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4 pt-2">
              <div className="divide-y divide-border/60">
                {faqs.map((faq) => (
                  <FAQItem key={faq.testId} faq={faq} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Child support impact card */}
          <ChildSupportImpactCard
            state={stateName}
            county="General"
            country="United States"
          />

          {/* CTA section */}
          <Card
            className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5"
            data-testid="section-cta"
          >
            <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-semibold leading-snug" data-testid="text-cta-heading">
                  Ask Custody Atlas about custody law in {stateName}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Get plain-English answers to your specific custody questions, tailored to {stateName} law.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                <Link href={askAIPath}>
                  <Button className="gap-2 w-full sm:w-auto" data-testid="button-ask-ai-cta">
                    <MessageSquare className="w-4 h-4" />
                    Ask a Question
                  </Button>
                </Link>
                <Link href={jurisdictionPath}>
                  <Button variant="outline" className="gap-2 w-full sm:w-auto" data-testid="button-full-law-summary">
                    <BookOpen className="w-4 h-4" />
                    Full Law Summary
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Map CTA */}
          <div
            className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 px-5 py-4"
            data-testid="section-map-cta"
          >
            <div className="flex items-center gap-3">
              <Map className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  Explore custody laws across all states
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Interactive U.S. custody law map with state-by-state summaries
                </p>
              </div>
            </div>
            <Link href="/custody-map">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 flex-shrink-0"
                data-testid="button-explore-map"
              >
                Explore Map
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>

          {/* Disclaimer */}
          <p
            className="text-xs text-muted-foreground/80 text-center leading-relaxed border-t border-border/40 pt-4"
            data-testid="text-page-disclaimer"
          >
            Custody Atlas provides educational information about custody law in {stateName}. This page does not constitute legal advice. Consult a licensed family law attorney for advice about your specific situation.
          </p>
        </>
      )}
    </div>
  );
}
