import { Link } from "wouter";
import {
  ArrowRight, MapPin, CheckCircle, Shield,
  FileSearch, MessageSquare, Map, LayoutDashboard,
  Upload, Zap, BadgeCheck,
  Scale, BookOpen,
} from "lucide-react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Palette (landing-page only) ──────────────────────────────────────────────
const NAVY  = "#0f172a";
const GOLD  = "#b5922f";
const WARM_BG = "#f9f8f6";  // warm off-white for alternating sections

// ─── Data ─────────────────────────────────────────────────────────────────────
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const STATES_WITH_DATA = new Set([
  "Alabama","Alaska","Arizona","California","Colorado","Florida","Georgia",
  "Illinois","Indiana","Louisiana","Massachusetts","Michigan","Nevada",
  "New Jersey","New York","North Carolina","Ohio","Oklahoma","Pennsylvania",
  "Texas","Virginia","Washington",
]);
const STATES_COVERED = Array.from(STATES_WITH_DATA).sort();

function openSignup() {
  window.dispatchEvent(new CustomEvent("custody-atlas:open-auth", { detail: { mode: "signup" } }));
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] px-3 py-1 rounded-full border mb-6"
      style={{ color: GOLD, borderColor: "#dcc98a", background: "#fdf9ee" }}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3"
      style={{ color: GOLD }}
    >
      {children}
    </p>
  );
}

function Divider() {
  return (
    <div
      className="w-8 h-[2px] rounded-full mb-5"
      style={{ background: GOLD }}
      aria-hidden="true"
    />
  );
}

// ─── Map preview (used in features section) ───────────────────────────────────
function MiniMap() {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: "100%", height: "auto", display: "block" }}
        aria-label="U.S. custody law coverage map"
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const hasData = STATES_WITH_DATA.has(geo.properties.name as string);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={hasData ? NAVY : "#e2e8f0"}
                  stroke="#ffffff"
                  strokeWidth={0.7}
                  style={{
                    default: { outline: "none" },
                    hover:   { outline: "none" },
                    pressed: { outline: "none" },
                  }}
                  tabIndex={-1}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-white/95 rounded-lg px-3 py-1.5 shadow-sm border border-slate-200">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: NAVY }} />
          <span className="text-[10px] text-slate-500 font-medium">Data available</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" />
          <span className="text-[10px] text-slate-500 font-medium">Coming soon</span>
        </span>
      </div>
    </div>
  );
}

// ─── 1. HERO ──────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="bg-white border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pt-28 md:pb-32">

        {/* Centered, editorial */}
        <div className="max-w-3xl mx-auto text-center">
          <Eyebrow>
            <Shield className="w-3 h-3" />
            AI-Powered Custody Guidance
          </Eyebrow>

          {/* Brand name — visually dominant */}
          <h1
            className="font-serif text-5xl sm:text-6xl lg:text-7xl font-semibold leading-none tracking-tight mb-4"
            style={{ color: NAVY }}
          >
            Custody Atlas
          </h1>

          {/* Value proposition — secondary headline */}
          <p
            className="font-serif text-xl sm:text-2xl font-medium leading-snug mb-6 max-w-2xl mx-auto"
            style={{ color: "#334155" }}
          >
            Understand custody law where you live
          </p>

          {/* Supporting copy */}
          <p className="text-slate-400 text-base leading-relaxed mb-10 max-w-lg mx-auto">
            Make confident custody decisions with AI-powered,
            state-specific guidance.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
            <Button
              size="lg"
              className="h-11 px-7 font-semibold hover:opacity-90 transition-opacity"
              onClick={openSignup}
              data-testid="button-hero-primary"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Link href="/custody-map">
              <Button
                size="lg"
                variant="outline"
                className="h-11 px-6 text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 transition-colors"
                data-testid="button-hero-secondary"
              >
                <Map className="w-4 h-4" />
                Explore Custody Map
              </Button>
            </Link>
          </div>

          {/* Trust row */}
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
            {[
              "State-specific insights",
              "Secure document analysis",
              "Plain-English explanations",
            ].map((item) => (
              <span key={item} className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-slate-500">{item}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 2. CREDIBILITY STRIP ─────────────────────────────────────────────────────
const CREDIBILITY = [
  "Designed for real parents navigating custody",
  "Built to simplify complex legal decisions",
  "Private, secure, and easy to use",
];

function CredibilityStrip() {
  return (
    <section style={{ background: WARM_BG }} className="border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0 sm:divide-x sm:divide-slate-200">
          {CREDIBILITY.map((text) => (
            <div
              key={text}
              className="sm:px-8 first:pl-0 last:pr-0 text-center sm:text-left"
            >
              <p className="text-sm font-medium text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 3. CORE FEATURES ─────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: FileSearch,
    title: "Understand your custody agreement",
    description:
      "Upload documents and get clear explanations of key terms, risks, and implications.",
    href: "/upload-document",
  },
  {
    icon: MessageSquare,
    title: "Ask questions and get real answers",
    description:
      "Get instant, plain-English responses to your custody questions.",
    href: "/ask",
  },
  {
    icon: Map,
    title: "See how laws differ by state",
    description:
      "Explore custody laws where you live and understand what applies to your situation.",
    href: "/custody-map",
  },
  {
    icon: LayoutDashboard,
    title: "Track your case and decisions",
    description:
      "Keep everything organized in one place as you move through the process.",
    href: "/workspace",
  },
];

function FeaturesSection() {
  return (
    <section className="bg-white py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="max-w-xl mb-14">
          <Divider />
          <SectionLabel>Core features</SectionLabel>
          <h2
            className="font-serif text-2xl md:text-3xl font-semibold leading-snug"
            style={{ color: NAVY }}
          >
            Everything you need to navigate custody with clarity
          </h2>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-4xl">
          {FEATURES.map(({ icon: Icon, title, description, href }) => (
            <Link key={title} href={href} className="group block">
              <div className="h-full rounded-2xl border border-slate-100 bg-slate-50 p-7 hover:border-slate-300 hover:bg-white transition-all duration-200 cursor-pointer">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-5 border border-slate-200"
                  style={{ background: "white" }}
                >
                  <Icon className="w-5 h-5 text-slate-500 group-hover:text-slate-700 transition-colors" />
                </div>
                <h3
                  className="font-semibold text-base mb-2 group-hover:underline underline-offset-2"
                  style={{ color: NAVY }}
                >
                  {title}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 4. HOW IT WORKS ──────────────────────────────────────────────────────────
const STEPS = [
  {
    icon: Upload,
    number: "01",
    title: "Upload your document or ask a question",
    description: "Add a custody agreement, court order, or type any question you have.",
  },
  {
    icon: Zap,
    number: "02",
    title: "Get clear, structured insights instantly",
    description: "Our AI breaks down legal language into plain, understandable terms.",
  },
  {
    icon: BadgeCheck,
    number: "03",
    title: "Make informed decisions with confidence",
    description: "Walk away knowing what your agreement means and what to ask your attorney.",
  },
];

function HowItWorksSection() {
  return (
    <section style={{ background: WARM_BG }} className="py-20 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        <div className="text-center max-w-xl mx-auto mb-14">
          <Divider />
          <SectionLabel>How it works</SectionLabel>
          <h2
            className="font-serif text-2xl md:text-3xl font-semibold"
            style={{ color: NAVY }}
          >
            Simple, guided, and built for clarity
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {STEPS.map(({ icon: Icon, number, title, description }, idx) => (
            <div key={number} className="relative flex flex-col items-start">
              {/* Connector line on desktop */}
              {idx < STEPS.length - 1 && (
                <div
                  className="hidden md:block absolute top-5 left-[calc(100%_-_16px)] w-[calc(100%_-_32px)] h-px"
                  style={{ background: "#e2d9c4" }}
                  aria-hidden="true"
                />
              )}

              {/* Step number badge */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-5 border-2 relative z-10"
                style={{ background: "white", borderColor: "#e2d9c4", color: GOLD }}
              >
                {number}
              </div>

              <h3
                className="font-semibold text-base mb-2 leading-snug"
                style={{ color: NAVY }}
              >
                {title}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 5. DIFFERENTIATION ───────────────────────────────────────────────────────
const NO_LIST = [
  "No legal jargon overload",
  "No guesswork about your rights",
  "No need to navigate this alone",
];

function DifferentiationSection() {
  return (
    <section className="bg-white py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center">

          {/* Left: copy */}
          <div>
            <Divider />
            <SectionLabel>Why Custody Atlas</SectionLabel>
            <h2
              className="font-serif text-2xl md:text-3xl font-semibold mb-8 leading-snug"
              style={{ color: NAVY }}
            >
              Built for clarity,<br className="hidden sm:block" /> not complexity
            </h2>

            <ul className="space-y-5">
              {NO_LIST.map((item) => (
                <li key={item} className="flex items-start gap-4">
                  <div
                    className="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border"
                    style={{ background: "#fdf9ee", borderColor: "#e2d9c4" }}
                  >
                    <CheckCircle className="w-3.5 h-3.5" style={{ color: GOLD }} />
                  </div>
                  <span
                    className="text-base font-medium leading-snug"
                    style={{ color: NAVY }}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: map visual */}
          <div>
            <Link href="/custody-map" className="block group" aria-label="Explore the Custody Map">
              <div className="relative">
                <MiniMap />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl">
                  <div className="bg-white rounded-xl px-5 py-3 shadow-md flex items-center gap-2 border border-slate-200">
                    <Map className="w-4 h-4" style={{ color: NAVY }} />
                    <span className="text-sm font-semibold" style={{ color: NAVY }}>
                      Explore custody laws by state
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              </div>
              <p className="text-center text-xs text-slate-400 mt-2 group-hover:text-slate-600 transition-colors">
                {STATES_WITH_DATA.size} states with detailed custody data
              </p>
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
}

// ─── 6. STATES COVERED (SEO) ──────────────────────────────────────────────────
function StatesCoveredSection() {
  return (
    <section style={{ background: WARM_BG }} className="border-y border-slate-100 py-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-7">
          <div>
            <SectionLabel>Coverage</SectionLabel>
            <h2
              className="font-serif text-xl font-semibold"
              style={{ color: NAVY }}
            >
              States currently covered
            </h2>
          </div>
          <p className="text-sm text-slate-400 sm:mb-0.5">
            Detailed custody law data for {STATES_COVERED.length} states.
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
                className="cursor-pointer text-xs py-1 px-3 border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors bg-white"
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

// ─── 7. FINAL CTA ─────────────────────────────────────────────────────────────
function CTASection() {
  return (
    <section style={{ background: NAVY }} className="py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-5"
          style={{ color: GOLD }}
        >
          Get started today
        </p>

        <h2 className="font-serif text-3xl md:text-4xl font-semibold text-white leading-tight mb-4">
          Start understanding your custody<br className="hidden sm:block" /> options today
        </h2>

        <p className="text-white/50 text-base mb-10 max-w-md mx-auto leading-relaxed">
          Get clarity, confidence, and guidance — all in one place.
        </p>

        <Button
          size="lg"
          className="h-12 px-8 font-semibold text-base"
          style={{ background: "white", color: NAVY }}
          onClick={openSignup}
          data-testid="button-cta-bottom"
        >
          <MapPin className="w-4 h-4" />
          Get Started Free
        </Button>

        {/* Disclaimer note */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-center gap-6 text-xs text-white/30">
          <span className="flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5" />
            Not legal advice
          </span>
          <span className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Educational information only
          </span>
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Always consult a licensed attorney
          </span>
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
      <CredibilityStrip />
      <FeaturesSection />
      <HowItWorksSection />
      <DifferentiationSection />
      <StatesCoveredSection />
      <CTASection />
    </div>
  );
}
