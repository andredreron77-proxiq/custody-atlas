import { useEffect } from "react";
import { useRoute, Link } from "wouter";
import {
  MessageSquare, Map, ChevronRight, BookOpen, ArrowRight,
  HelpCircle, Scale, CheckCircle2, MapPin, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/app/Header";
import {
  CUSTODY_QUESTIONS,
  getQuestionBySlug,
  type CustodyQuestion,
} from "@/data/custodyQuestions";

/* ── SEO helper (mirrors pattern from CustodyLawsStatePage) ────────────────── */

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

    return () => {
      document.title = "Custody Atlas";
    };
  }, [title, description]);
}

/* ── Category badge color mapping ──────────────────────────────────────────── */

const CATEGORY_COLORS: Record<string, string> = {
  "Child Preference": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "Relocation": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "Child Support": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  "Custody Basics": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Modification": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Enforcement": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "Parental Rights": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "Domestic Violence": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "Third-Party Custody": "bg-muted text-foreground/70 dark:bg-muted dark:text-muted-foreground",
};

function CategoryBadge({ category }: { category: string }) {
  const colorClass =
    CATEGORY_COLORS[category] ??
    "bg-primary/10 text-primary dark:bg-primary/20";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
      data-testid="badge-category"
    >
      <Scale className="w-3 h-3" />
      {category}
    </span>
  );
}

/* ── Related questions links ───────────────────────────────────────────────── */

function RelatedQuestions({ slugs }: { slugs: string[] }) {
  const related = slugs
    .map((s) => CUSTODY_QUESTIONS.find((q) => q.slug === s))
    .filter((q): q is CustodyQuestion => !!q);

  if (related.length === 0) return null;

  return (
    <Card data-testid="section-related-questions">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <HelpCircle className="w-3.5 h-3.5 text-primary" />
          </div>
          <CardTitle className="text-sm font-semibold">
            Related Questions
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-1 space-y-1">
        {related.map((q) => (
          <Link
            key={q.slug}
            href={`/custody-questions/${q.slug}`}
            className="flex items-center gap-2 py-2 text-sm text-foreground hover:text-primary transition-colors group border-b border-border/50 last:border-0"
            data-testid={`link-related-${q.slug}`}
          >
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
            <span className="leading-snug">{q.question}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

/* ── State links ───────────────────────────────────────────────────────────── */

function RelatedStateLinks({
  slugs,
  question,
}: {
  slugs: string[];
  question: string;
}) {
  if (slugs.length === 0) return null;

  const stateNameFromSlug = (slug: string) =>
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  return (
    <Card
      className="border-blue-200 dark:border-blue-800/40"
      data-testid="section-state-variation"
    >
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">
              Rules Vary by State
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Explore how specific states handle this issue
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-3">
        <div className="flex flex-wrap gap-2" data-testid="list-related-states">
          {slugs.map((slug) => {
            const name = stateNameFromSlug(slug);
            return (
              <Link
                key={slug}
                href={`/custody-laws/${slug}`}
                data-testid={`link-state-${slug}`}
              >
                <Badge
                  variant="outline"
                  className="gap-1 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
                >
                  <ArrowRight className="w-3 h-3" />
                  {name}
                </Badge>
              </Link>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Custody law is set by each state. The answer to "{question.toLowerCase().replace(/\?$/, "")}" may differ significantly depending on where you live. Select your state above for jurisdiction-specific information.
        </p>
        <Link href="/location">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 w-full sm:w-auto"
            data-testid="button-find-my-laws"
          >
            <MapPin className="w-3.5 h-3.5" />
            Find laws for my location
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

/* ── 404 fallback ─────────────────────────────────────────────────────────── */

function QuestionNotFound({ slug }: { slug: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-5">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
        <AlertCircle className="w-7 h-7 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold" data-testid="heading-not-found">
        Question Not Found
      </h1>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
        We couldn't find a question matching <code className="font-mono text-xs bg-muted px-1 rounded">{slug}</code>. Browse all common questions or ask our AI directly.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link href="/ask">
          <Button className="gap-2" data-testid="button-ask-ai-notfound">
            <MessageSquare className="w-4 h-4" />
            Ask Custody Atlas AI
          </Button>
        </Link>
        <Link href="/">
          <Button variant="outline" className="gap-2">
            <BookOpen className="w-4 h-4" />
            Browse Topics
          </Button>
        </Link>
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */

export default function CustodyQuestionsPage() {
  const [match, params] = useRoute("/custody-questions/:slug");
  const slug = params?.slug ?? "";
  const entry = getQuestionBySlug(slug);

  const pageTitle = entry
    ? `${entry.question} | Custody Atlas`
    : "Custody Question | Custody Atlas";

  const metaDesc = entry
    ? entry.metaDescription
    : "Learn how courts handle common custody questions and how rules vary by state.";

  useSEO(pageTitle, metaDesc);

  if (!match) return null;
  if (!entry) return <QuestionNotFound slug={slug} />;

  const askAIHref = `/ask`;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-7">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Custody Questions" },
          { label: entry.question },
        ]}
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="space-y-4" data-testid="section-hero">
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryBadge category={entry.category} />
          <Badge variant="outline" className="text-xs gap-1">
            <HelpCircle className="w-3 h-3" />
            Common Custody Question
          </Badge>
        </div>

        <h1
          className="text-2xl md:text-3xl font-bold tracking-tight leading-tight"
          data-testid="heading-question"
        >
          {entry.question}
        </h1>

        <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl" data-testid="text-hero-intro">
          Custody Atlas explains common custody questions in plain English. The rules can vary by state — after reading this overview, ask our AI for information specific to your jurisdiction.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={askAIHref}>
            <Button className="gap-2" data-testid="button-ask-ai-hero">
              <MessageSquare className="w-4 h-4" />
              Ask about this in your state
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

      {/* ── Quick Answer ─────────────────────────────────────────────── */}
      <div
        className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 space-y-1.5"
        data-testid="panel-quick-answer"
      >
        <p className="text-xs font-semibold text-primary uppercase tracking-wide">
          Quick Answer
        </p>
        <p className="text-sm leading-relaxed text-foreground font-medium" data-testid="text-quick-answer">
          {entry.quickAnswer}
        </p>
      </div>

      {/* ── Expanded Explanation ─────────────────────────────────────── */}
      <div className="space-y-4" data-testid="section-explanation">
        <div>
          <h2 className="text-lg font-bold mb-1">What Courts Consider</h2>
          <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-explanation-intro">
            {entry.explanation.intro}
          </p>
        </div>

        <div className="space-y-3" data-testid="list-key-factors">
          {entry.explanation.keyFactors.map((factor, i) => (
            <Card key={i} data-testid={`card-factor-${i}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold" data-testid={`factor-title-${i}`}>
                    {factor.title}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed" data-testid={`factor-detail-${i}`}>
                    {factor.detail}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── State Variation ──────────────────────────────────────────── */}
      <div className="space-y-3" data-testid="section-state-variation-wrapper">
        <p
          className="text-sm text-muted-foreground leading-relaxed"
          data-testid="text-state-variation"
        >
          {entry.stateVariation}
        </p>

        <RelatedStateLinks
          slugs={entry.relatedStateSlugs}
          question={entry.question}
        />
      </div>

      {/* ── Related Questions ────────────────────────────────────────── */}
      <RelatedQuestions slugs={entry.relatedQuestionSlugs} />

      {/* ── CTA ──────────────────────────────────────────────────────── */}
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
              Ask Custody Atlas about this issue in your state
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Get a plain-English answer tailored to the custody laws where you live.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
            <Link href={askAIHref}>
              <Button className="gap-2 w-full sm:w-auto" data-testid="button-ask-ai-cta">
                <MessageSquare className="w-4 h-4" />
                Ask a Question
              </Button>
            </Link>
            <Link href="/location">
              <Button variant="outline" className="gap-2 w-full sm:w-auto" data-testid="button-find-location-cta">
                <MapPin className="w-4 h-4" />
                Find My Laws
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* ── Map CTA ──────────────────────────────────────────────────── */}
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

      {/* ── Disclaimer ───────────────────────────────────────────────── */}
      <p
        className="text-xs text-muted-foreground/80 text-center leading-relaxed border-t border-border/40 pt-4"
        data-testid="text-page-disclaimer"
      >
        Custody Atlas provides educational information about child custody law. This page does not constitute legal advice. Laws change frequently and vary by jurisdiction. Always consult a licensed family law attorney for advice about your specific situation.
      </p>
    </div>
  );
}
