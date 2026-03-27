import { Link } from "wouter";
import {
  ArrowRight, Shield, FileText, MessageSquare,
  FileSearch, MessageSquareText, MapPin, ShieldCheck, Clock, Users,
  Quote, Map, BookOpen, Scale, CheckCircle, HelpCircle, Globe,
} from "lucide-react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Constants ────────────────────────────────────────────────────────────────

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const STATES_WITH_DATA_SET = new Set([
  "Alabama", "Alaska", "Arizona", "California", "Colorado",
  "Florida", "Georgia", "Illinois", "Indiana", "Louisiana",
  "Massachusetts", "Michigan", "Nevada", "New Jersey", "New York",
  "North Carolina", "Ohio", "Oklahoma", "Pennsylvania", "Texas",
  "Virginia", "Washington",
]);

const STATES_COVERED = Array.from(STATES_WITH_DATA_SET).sort();

// ─── Mini map preview (existing, unchanged) ───────────────────────────────────

function MiniMapPreview() {
  return (
    <div className="relative rounded-xl overflow-hidden border border-blue-200 dark:border-blue-800/50 shadow-md bg-gradient-to-br from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-900">
      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: "100%", height: "auto", display: "block" }}
        aria-label="Preview of the U.S. custody law map"
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name: string = geo.properties.name;
              const hasData = STATES_WITH_DATA_SET.has(name);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={hasData ? "#3b82f6" : "#cbd5e1"}
                  stroke="#ffffff"
                  strokeWidth={0.6}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none" },
                    pressed: { outline: "none" },
                  }}
                  tabIndex={-1}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm border border-white/50">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
          <span className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">Data available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" />
          <span className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">Coming soon</span>
        </div>
      </div>
    </div>
  );
}

// ─── Hero section ─────────────────────────────────────────────────────────────

function QuickActionCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="p-5 rounded-lg bg-secondary border border-border">
      <div className="w-9 h-9 rounded-lg bg-[#0f172a]/10 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-[#0f172a] dark:text-foreground" />
      </div>
      <h3 className="font-medium text-foreground text-sm mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[#0f172a] pt-20 pb-16 lg:pt-28 lg:pb-24">
      {/* Subtle dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        aria-hidden="true"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)`,
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-sm text-white/70 mb-8">
            <Shield className="w-3.5 h-3.5" />
            <span>AI-Powered Custody Guidance</span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-semibold text-white leading-tight mb-6">
            Understand custody law where you live
          </h1>

          {/* Subtext */}
          <p className="text-base md:text-lg text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Navigate custody decisions with clarity. Our AI analyzes your documents,
            explains complex legal terms, and provides state-specific insights.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
            <Link href="/location">
              <Button
                size="lg"
                className="bg-white hover:bg-white/90 text-[#0f172a] font-medium px-6 h-11"
                data-testid="button-hero-primary"
              >
                <MapPin className="w-4 h-4" />
                Find Custody Laws Near Me
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/custody-map">
              <Button
                size="lg"
                variant="ghost"
                className="text-white/80 hover:text-white hover:bg-white/10 h-11 px-6"
                data-testid="button-hero-secondary"
              >
                Explore Custody Map
              </Button>
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-white/40">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>{STATES_WITH_DATA_SET.size} states covered</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span>Documents encrypted</span>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span>24/7 AI assistance</span>
            </div>
          </div>
        </div>

        {/* Product mockup */}
        <div className="mt-14 lg:mt-18 max-w-4xl mx-auto">
          <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl">
            {/* Browser chrome */}
            <div className="bg-[#060d18] px-4 py-3 flex items-center gap-2 border-b border-white/10">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
              </div>
              <div className="flex-1 ml-4">
                <div className="bg-white/10 rounded h-5 max-w-xs" />
              </div>
            </div>
            {/* App preview cards */}
            <div className="bg-background p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <QuickActionCard
                  icon={FileText}
                  title="Upload Document"
                  description="Analyze custody agreements"
                />
                <QuickActionCard
                  icon={MessageSquare}
                  title="Ask Atlas"
                  description="Get instant legal answers"
                />
                <QuickActionCard
                  icon={Shield}
                  title="View Your Cases"
                  description="Track your progress"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Features section ─────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: FileSearch,
    title: "Document Analysis",
    description:
      "Upload custody agreements and court orders. Get plain-language summaries, risk identification, and clause-by-clause breakdowns.",
  },
  {
    icon: MessageSquareText,
    title: "Ask Atlas AI",
    description:
      "Ask questions in plain English. Get clear explanations of legal concepts tailored to your situation.",
  },
  {
    icon: MapPin,
    title: "State-Specific Insights",
    description:
      "Custody laws vary by state. Our interactive map shows you exactly what applies where you live.",
  },
  {
    icon: ShieldCheck,
    title: "Private & Secure",
    description:
      "Your documents are encrypted and never shared. You control what gets stored.",
  },
  {
    icon: Clock,
    title: "Available 24/7",
    description:
      "Get guidance when you need it, not just during business hours. No appointments required.",
  },
  {
    icon: Users,
    title: "Built for Parents",
    description:
      "Designed for the emotional weight of custody decisions. Every feature reduces stress, not adds to it.",
  },
];

function FeaturesSection() {
  return (
    <section className="py-20 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-2xl md:text-3xl font-serif font-semibold text-foreground mb-3">
            Everything you need to navigate custody
          </h2>
          <p className="text-muted-foreground">
            AI-powered tools designed specifically for parents facing custody challenges.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="p-6 rounded-xl bg-card border border-border hover:border-foreground/20 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-4">
                <feature.icon className="w-5 h-5 text-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Trust / testimonials section ─────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote:
      "After months of confusion, Atlas helped me understand exactly what my custody agreement meant. I finally felt prepared for my court date.",
    author: "Sarah M.",
    role: "Mother of 2, Georgia",
  },
  {
    quote:
      "The document analysis feature found clauses in my agreement I didn't even know to look for. It saved me thousands in attorney fees.",
    author: "Michael T.",
    role: "Father of 1, Texas",
  },
  {
    quote:
      "Being able to ask questions at 2am when I couldn't sleep, and actually get helpful answers — that meant everything to me.",
    author: "Jennifer R.",
    role: "Mother of 3, California",
  },
];

function TrustSection() {
  return (
    <section className="py-20 bg-secondary/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl md:text-3xl font-serif font-semibold text-foreground mb-3">
            Trusted by parents nationwide
          </h2>
          <p className="text-muted-foreground">
            Thousands of parents have used Custody Atlas to understand their rights
            and make informed decisions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.author}
              className="p-6 rounded-xl bg-card border border-border"
            >
              <Quote className="w-8 h-8 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-foreground leading-relaxed mb-5">{t.quote}</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#0f172a] flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                  {t.author.split(" ")[0][0]}
                  {t.author.split(" ")[1][0]}
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{t.author}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Custody Map feature highlight ────────────────────────────────────────────

function MapSection() {
  return (
    <section className="bg-white dark:bg-card border-y">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

          {/* Text side */}
          <div className="order-2 lg:order-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                <Map className="w-5 h-5 text-white" />
              </div>
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                New Feature
              </Badge>
            </div>

            <h2 className="text-2xl md:text-3xl font-bold mb-4 leading-tight">
              Explore Custody Laws Across the United States
            </h2>

            <p className="text-muted-foreground leading-relaxed mb-3">
              Custody laws can vary significantly from state to state.
              Use the Custody Atlas map to explore custody rules where you live.
            </p>

            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Click any state to see a plain-English summary of its custody standard,
              custody types, modification rules, and more — then jump straight to the
              AI to ask follow-up questions.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/custody-map">
                <Button size="lg" className="gap-2 w-full sm:w-auto" data-testid="button-cta-explore-map">
                  <Map className="w-4 h-4" />
                  Explore the Custody Map
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/location">
                <Button size="lg" variant="outline" className="gap-2 w-full sm:w-auto">
                  <MapPin className="w-4 h-4" />
                  Use My Location Instead
                </Button>
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {[
                { value: String(STATES_WITH_DATA_SET.size), label: "states with detailed data" },
                { value: "50", label: "states on the map" },
                { value: "6", label: "law categories per state" },
              ].map(({ value, label }) => (
                <div key={label} className="flex items-center gap-2 bg-muted/60 rounded-full px-3 py-1.5">
                  <span className="text-sm font-bold text-primary">{value}</span>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Map preview side */}
          <div className="order-1 lg:order-2">
            <Link href="/custody-map" className="block group" aria-label="Open the Custody Law Map">
              <div className="relative">
                <MiniMapPreview />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl bg-blue-900/10 backdrop-blur-[1px]">
                  <div className="bg-white/95 dark:bg-slate-900/95 rounded-xl px-5 py-3 shadow-lg flex items-center gap-2 border">
                    <Map className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Open interactive map</span>
                    <ArrowRight className="w-4 h-4 text-primary" />
                  </div>
                </div>
              </div>
            </Link>
            <p className="text-center text-xs text-muted-foreground mt-2">
              Blue states have detailed custody data available
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Disclaimer / trust card ──────────────────────────────────────────────────

function DisclaimerSection() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 w-full">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col items-center text-center gap-5 p-8 rounded-xl border bg-card shadow-sm">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-3">Built to inform, not to replace your attorney</h2>
            <p className="text-muted-foreground leading-relaxed">
              Custody Atlas provides educational information to help you understand custody law and
              prepare better questions for a licensed attorney.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-1">
            {[
              { icon: BookOpen, label: "Educational content only" },
              { icon: ShieldCheck, label: "No legal advice given" },
              { icon: Scale, label: "Always consult a lawyer" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1.5"
              >
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── States covered ───────────────────────────────────────────────────────────

function StatesCoveredSection() {
  return (
    <section className="bg-white dark:bg-card border-t">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 w-full">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold mb-2">States Currently Covered</h2>
          <p className="text-muted-foreground text-sm">
            Detailed custody law data is available for {STATES_COVERED.length} states.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {STATES_COVERED.map((state) => (
            <Link
              key={state}
              href={`/jurisdiction/${encodeURIComponent(state)}/unknown`}
            >
              <Badge
                variant="secondary"
                className="cursor-pointer text-xs py-1 px-3"
                data-testid={`badge-state-${state.toLowerCase().replace(/\s/g, "-")}`}
              >
                {state}
              </Badge>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Bottom CTA section ───────────────────────────────────────────────────────

function CTASection() {
  return (
    <section className="py-20 bg-[#0f172a]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-serif font-semibold text-white mb-4">
            Ready to understand your custody situation?
          </h2>
          <p className="text-white/60 mb-8 max-w-lg mx-auto">
            Join thousands of parents making informed custody decisions
            with AI-powered insights. No credit card required.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/location">
              <Button
                size="lg"
                className="bg-white hover:bg-white/90 text-[#0f172a] font-medium px-6 h-11"
                data-testid="button-cta-bottom"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/ask">
              <Button
                size="lg"
                variant="ghost"
                className="text-white/80 hover:text-white hover:bg-white/10 h-11 px-6"
                data-testid="button-cta-ask-atlas"
              >
                Try Ask Atlas
              </Button>
            </Link>
          </div>

          <p className="mt-6 text-xs text-white/40 flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Your data is encrypted and never shared
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <FeaturesSection />
      <TrustSection />
      <MapSection />
      <DisclaimerSection />
      <StatesCoveredSection />
      <CTASection />
    </div>
  );
}
