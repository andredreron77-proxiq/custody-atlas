import { Link } from "wouter";
import {
  ArrowRight, MapPin, Shield, FileSearch, MessageSquareText,
  ShieldCheck, Clock, Users, Quote, Map, BookOpen, Scale,
  CheckCircle,
} from "lucide-react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Design tokens (landing-page only) ────────────────────────────────────────
// Gold is used in 3 places: section overlines, quote marks, stat values.
// Everything else is navy (#0f172a) on warm white / light gray.
const GOLD = "#b5922f";
const NAVY = "#0f172a";

// ─── Data ─────────────────────────────────────────────────────────────────────

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const STATES_WITH_DATA_SET = new Set([
  "Alabama", "Alaska", "Arizona", "California", "Colorado",
  "Florida", "Georgia", "Illinois", "Indiana", "Louisiana",
  "Massachusetts", "Michigan", "Nevada", "New Jersey", "New York",
  "North Carolina", "Ohio", "Oklahoma", "Pennsylvania", "Texas",
  "Virginia", "Washington",
]);

const STATES_COVERED = Array.from(STATES_WITH_DATA_SET).sort();

// ─── Shared primitives ────────────────────────────────────────────────────────

/** Small gold uppercase label used above section headings */
function Overline({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3"
      style={{ color: GOLD }}
    >
      {children}
    </p>
  );
}

/** Thin gold rule used to give sections an editorial anchor */
function GoldRule() {
  return (
    <div
      className="w-8 h-[2px] mb-5 rounded-full"
      style={{ background: GOLD }}
      aria-hidden="true"
    />
  );
}

// ─── Mini map ─────────────────────────────────────────────────────────────────

function MiniMapPreview() {
  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-gradient-to-br from-slate-50 to-white">
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
                  fill={hasData ? NAVY : "#dde3ec"}
                  stroke="#ffffff"
                  strokeWidth={0.7}
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
      <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm border border-slate-200">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-sm inline-block"
            style={{ background: NAVY }}
          />
          <span className="text-[10px] text-slate-500 font-medium">Data available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" />
          <span className="text-[10px] text-slate-500 font-medium">Coming soon</span>
        </div>
      </div>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="bg-white border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Left: copy */}
          <div>
            <div
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full border mb-8"
              style={{ color: GOLD, borderColor: "#e8d9ac", background: "#fdf8ed" }}
            >
              <Shield className="w-3 h-3" />
              AI-Powered Custody Guidance
            </div>

            <h1
              className="font-serif text-4xl md:text-5xl font-semibold leading-tight mb-5"
              style={{ color: NAVY }}
            >
              Understand custody law<br className="hidden sm:block" /> where you live
            </h1>

            <p className="text-slate-500 text-lg leading-relaxed mb-8 max-w-lg">
              Plain-English explanations of custody law for your state and county —
              so you can ask better questions and make informed decisions.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-3 mb-10">
              <Link href="/location">
                <Button
                  size="lg"
                  className="h-11 px-6 font-semibold text-white"
                  style={{ background: NAVY }}
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
                  className="h-11 px-4 text-slate-500 hover:text-slate-800"
                  data-testid="button-hero-secondary"
                >
                  Explore the Map
                  <ArrowRight className="w-4 h-4 opacity-50" />
                </Button>
              </Link>
            </div>

            {/* Trust strip */}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {[
                "Free to use",
                "No account required to start",
                `${STATES_WITH_DATA_SET.size} states covered`,
              ].map((item) => (
                <div key={item} className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="text-xs text-slate-500 font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: stat card panel */}
          <div className="space-y-3">
            {/* Large stat card */}
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-7 py-6">
              <p
                className="text-5xl font-serif font-semibold mb-1"
                style={{ color: NAVY }}
              >
                {STATES_WITH_DATA_SET.size}
              </p>
              <p className="text-sm text-slate-500">
                states with detailed custody law data
              </p>
            </div>

            {/* Two smaller cards side-by-side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-5">
                <p
                  className="text-3xl font-serif font-semibold mb-1"
                  style={{ color: NAVY }}
                >
                  6
                </p>
                <p className="text-xs text-slate-500">law categories per state</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-5">
                <p
                  className="text-3xl font-serif font-semibold mb-1"
                  style={{ color: GOLD }}
                >
                  Free
                </p>
                <p className="text-xs text-slate-500">no account to start</p>
              </div>
            </div>

            {/* Disclaimer note */}
            <div className="rounded-xl border border-slate-100 bg-white px-5 py-4 flex gap-3 items-start">
              <ShieldCheck className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Custody Atlas provides educational information only. It does not
                offer legal advice. Always consult a licensed attorney.
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: FileSearch,
    title: "Document Analysis",
    description:
      "Upload custody agreements and court orders. Get plain-language summaries and clause-by-clause breakdowns.",
  },
  {
    icon: MessageSquareText,
    title: "Ask Atlas AI",
    description:
      "Ask questions in plain English. Get clear explanations of legal concepts tailored to your state.",
  },
  {
    icon: MapPin,
    title: "State-Specific Insights",
    description:
      "Custody laws vary by state. Our interactive map shows exactly what applies where you live.",
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
      "Get guidance when you need it — not just during business hours. No appointments.",
  },
  {
    icon: Users,
    title: "Built for Parents",
    description:
      "Designed for the emotional weight of custody decisions. Every feature reduces stress.",
  },
];

function FeaturesSection() {
  return (
    <section className="py-20 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-xl mb-14">
          <GoldRule />
          <Overline>What you can do</Overline>
          <h2
            className="text-2xl md:text-3xl font-serif font-semibold leading-snug"
            style={{ color: NAVY }}
          >
            Tools built for parents navigating custody
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-100 rounded-2xl overflow-hidden border border-slate-100">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="bg-white p-7 hover:bg-slate-50/80 transition-colors"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 border border-slate-100"
                style={{ background: "#f7f6f3" }}
              >
                <feature.icon className="w-5 h-5 text-slate-500" />
              </div>
              <h3
                className="font-semibold text-sm mb-2"
                style={{ color: NAVY }}
              >
                {feature.title}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote:
      "After months of confusion, Atlas helped me understand exactly what my custody agreement meant. I finally felt prepared for my court date.",
    author: "Sarah M.",
    role: "Mother of 2 · Georgia",
  },
  {
    quote:
      "The document analysis found clauses in my agreement I didn't even know to look for. It saved me thousands in attorney fees.",
    author: "Michael T.",
    role: "Father of 1 · Texas",
  },
  {
    quote:
      "Being able to ask questions at 2am when I couldn't sleep, and actually get helpful answers — that meant everything.",
    author: "Jennifer R.",
    role: "Mother of 3 · California",
  },
];

function TestimonialsSection() {
  return (
    <section className="py-20 bg-white border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-xl mb-14">
          <GoldRule />
          <Overline>Parent stories</Overline>
          <h2
            className="text-2xl md:text-3xl font-serif font-semibold leading-snug"
            style={{ color: NAVY }}
          >
            Trusted by parents navigating hard decisions
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.author}
              className="rounded-2xl border border-slate-100 bg-slate-50 p-7 flex flex-col gap-4"
            >
              <Quote
                className="w-7 h-7 flex-shrink-0"
                style={{ color: GOLD, opacity: 0.5 }}
              />
              <p className="text-sm text-slate-600 leading-relaxed flex-1">
                {t.quote}
              </p>
              <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                  style={{ background: NAVY }}
                >
                  {t.author.split(" ")[0][0]}
                  {t.author.split(" ")[1][0]}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">{t.author}</p>
                  <p className="text-[10px] text-slate-400">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Map feature ──────────────────────────────────────────────────────────────

function MapSection() {
  return (
    <section className="py-20 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Map side */}
          <div className="order-1">
            <Link href="/custody-map" className="block group" aria-label="Open the Custody Law Map">
              <div className="relative">
                <MiniMapPreview />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl">
                  <div className="bg-white rounded-xl px-5 py-3 shadow-md flex items-center gap-2 border border-slate-200">
                    <Map className="w-4 h-4" style={{ color: NAVY }} />
                    <span className="text-sm font-semibold" style={{ color: NAVY }}>
                      Open interactive map
                    </span>
                    <ArrowRight className="w-4 h-4" style={{ color: NAVY }} />
                  </div>
                </div>
              </div>
            </Link>
            <p className="text-center text-xs text-slate-400 mt-2">
              Navy states have detailed custody data available
            </p>
          </div>

          {/* Text side */}
          <div className="order-2">
            <GoldRule />
            <Overline>Custody Map</Overline>
            <h2
              className="text-2xl md:text-3xl font-serif font-semibold leading-snug mb-4"
              style={{ color: NAVY }}
            >
              Explore custody laws across the United States
            </h2>

            <p className="text-slate-500 leading-relaxed mb-6">
              Custody laws vary significantly by state and county. Click any state
              to see a plain-English summary of its custody standard, modification
              rules, enforcement options, and more.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <Link href="/custody-map">
                <Button
                  size="lg"
                  className="h-10 px-5 font-semibold text-white"
                  style={{ background: NAVY }}
                  data-testid="button-cta-explore-map"
                >
                  <Map className="w-4 h-4" />
                  Explore the Custody Map
                </Button>
              </Link>
              <Link href="/location">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-10 px-5 text-slate-600 border-slate-200 hover:border-slate-400"
                >
                  <MapPin className="w-4 h-4" />
                  Use My Location
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap gap-5">
              {[
                { value: String(STATES_WITH_DATA_SET.size), label: "states with detailed data" },
                { value: "50", label: "states on the map" },
                { value: "6", label: "law categories per state" },
              ].map(({ value, label }) => (
                <div key={label}>
                  <p
                    className="text-2xl font-serif font-semibold"
                    style={{ color: GOLD }}
                  >
                    {value}
                  </p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

// ─── Disclaimer band ──────────────────────────────────────────────────────────

function DisclaimerSection() {
  return (
    <section className="border-y border-slate-100 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 border"
            style={{ background: "#f7f6f3", borderColor: "#e5e0d6" }}
          >
            <Scale className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h3
              className="font-semibold text-base mb-1"
              style={{ color: NAVY }}
            >
              Built to inform — not to replace your attorney
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Custody Atlas provides educational information only.
              It is not a law firm and does not offer legal advice or legal
              representation. Always consult a licensed family law attorney
              for advice specific to your situation.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 sm:ml-auto flex-shrink-0">
            {[
              { icon: BookOpen, label: "Educational only" },
              { icon: ShieldCheck, label: "No legal advice" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-slate-300" />
                <span className="text-xs text-slate-400">{label}</span>
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
    <section className="py-16 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mb-8">
          <GoldRule />
          <Overline>Coverage</Overline>
          <h2
            className="text-xl font-serif font-semibold"
            style={{ color: NAVY }}
          >
            States currently covered
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Detailed custody law data is available for {STATES_COVERED.length} states.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATES_COVERED.map((state) => (
            <Link
              key={state}
              href={`/jurisdiction/${encodeURIComponent(state)}/unknown`}
            >
              <Badge
                variant="outline"
                className="cursor-pointer text-xs py-1 px-3 border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors"
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

// ─── Bottom CTA ───────────────────────────────────────────────────────────────

function CTASection() {
  return (
    <section style={{ background: NAVY }} className="py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl">
          <p
            className="text-xs font-semibold uppercase tracking-[0.15em] mb-4"
            style={{ color: GOLD }}
          >
            Get started today
          </p>
          <h2 className="font-serif text-3xl md:text-4xl font-semibold text-white leading-tight mb-4">
            Find out what applies<br className="hidden sm:block" /> to your family
          </h2>
          <p className="text-white/50 mb-8 max-w-md text-base leading-relaxed">
            Start with your location. We'll show you the custody laws for your
            state and county in clear, plain language.
          </p>

          <div className="flex flex-col sm:flex-row items-start gap-3">
            <Link href="/location">
              <Button
                size="lg"
                className="h-11 px-6 font-semibold"
                style={{ background: "white", color: NAVY }}
                data-testid="button-cta-bottom"
              >
                <MapPin className="w-4 h-4" />
                Find My Custody Laws
              </Button>
            </Link>
            <Link href="/ask">
              <Button
                size="lg"
                variant="ghost"
                className="h-11 px-4 text-white/60 hover:text-white hover:bg-white/10"
                data-testid="button-cta-ask-atlas"
              >
                Try Ask Atlas
                <ArrowRight className="w-4 h-4 opacity-60" />
              </Button>
            </Link>
          </div>

          <p className="mt-8 text-xs text-white/30">
            No account required to start. Free to use.
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
      <TestimonialsSection />
      <MapSection />
      <DisclaimerSection />
      <StatesCoveredSection />
      <CTASection />
    </div>
  );
}
