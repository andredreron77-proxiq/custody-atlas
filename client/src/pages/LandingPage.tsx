import { Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, MapPin, CheckCircle, Shield,
  FileSearch, MessageSquare, Map, LayoutDashboard,
  Upload, Zap, BadgeCheck,
  Scale, BookOpen,
} from "lucide-react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Palette ──────────────────────────────────────────────────────────────────
const NAVY  = "#0f172a";
const GOLD  = "#b5922f";
const WARM_BG = "#f9f8f6";

// ─── Data ─────────────────────────────────────────────────────────────────────
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const STATES_WITH_DATA = new Set([
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado",
  "Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho",
  "Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana",
  "Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
  "New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma",
  "Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington",
  "West Virginia","Wisconsin","Wyoming",
]);
const STATES_COVERED = Array.from(STATES_WITH_DATA).sort();

function openSignup() {
  window.dispatchEvent(new CustomEvent("custody-atlas:open-auth", { detail: { mode: "signup" } }));
}

// ─── Scroll reveal hook ───────────────────────────────────────────────────────
function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, visible };
}

// ─── Animated number counter ──────────────────────────────────────────────────
function CountUp({ to, duration = 1200 }: { to: number; duration?: number }) {
  const { ref, visible } = useReveal<HTMLSpanElement>();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * to));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, to, duration]);

  return <span ref={ref}>{value}</span>;
}

// ─── Reveal wrapper ───────────────────────────────────────────────────────────
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 700ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 700ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
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

// ─── Map preview ──────────────────────────────────────────────────────────────
function MiniMap() {
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white transition-shadow duration-300 hover:shadow-lg">
      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: "100%", height: "auto", display: "block" }}
        aria-label="U.S. custody law coverage map"
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name = geo.properties.name as string;
              const hasData = STATES_WITH_DATA.has(name);
              const isHovered = hoveredState === name;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={hasData ? (isHovered ? GOLD : NAVY) : "#e2e8f0"}
                  stroke="#ffffff"
                  strokeWidth={0.7}
                  onMouseEnter={() => hasData && setHoveredState(name)}
                  onMouseLeave={() => setHoveredState(null)}
                  style={{
                    default: { outline: "none", transition: "fill 200ms ease" },
                    hover:   { outline: "none", cursor: hasData ? "pointer" : "default" },
                    pressed: { outline: "none" },
                  }}
                  tabIndex={-1}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Legend */}
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

      {/* Hovered state name */}
      <div
        className="absolute top-3 right-3 bg-white/95 rounded-lg px-3 py-1.5 shadow-sm border border-slate-200 transition-all duration-200"
        style={{
          opacity: hoveredState ? 1 : 0,
          transform: hoveredState ? "translateY(0)" : "translateY(-4px)",
          pointerEvents: "none",
        }}
      >
        <span className="text-xs font-semibold" style={{ color: NAVY }}>
          {hoveredState}
        </span>
      </div>
    </div>
  );
}

// ─── 1. HERO ──────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative bg-white border-b border-slate-100 overflow-hidden">
      {/* Subtle background accent */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 0%, rgba(181, 146, 47, 0.05), transparent 60%)`,
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal>
            <Eyebrow>
              <Shield className="w-3 h-3" />
              AI-Powered Custody Guidance
            </Eyebrow>
          </Reveal>

          <Reveal delay={80}>
            <h1
              className="font-serif text-5xl sm:text-6xl lg:text-7xl font-semibold leading-none tracking-tight mb-4"
              style={{ color: NAVY }}
            >
              Custody Atlas
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p
              className="font-serif text-xl sm:text-2xl font-medium leading-snug mb-6 max-w-2xl mx-auto"
              style={{ color: "#334155" }}
            >
              Understand custody law where you live
            </p>
          </Reveal>

          <Reveal delay={240}>
            <p className="text-slate-400 text-base leading-relaxed mb-10 max-w-lg mx-auto">
              Make confident custody decisions with AI-powered,
              state-specific guidance.
            </p>
          </Reveal>

          <Reveal delay={320}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
              <Button
                size="lg"
                className="h-11 px-7 font-semibold transition-all duration-200 hover:scale-[1.02] hover:shadow-md"
                onClick={openSignup}
                data-testid="button-hero-primary"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
              <Link href="/custody-map">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 px-6 text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 transition-all duration-200"
                  data-testid="button-hero-secondary"
                >
                  <Map className="w-4 h-4" />
                  Explore Custody Map
                </Button>
              </Link>
            </div>
          </Reveal>

          <Reveal delay={400}>
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
          </Reveal>
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
          {CREDIBILITY.map((text, idx) => (
            <Reveal key={text} delay={idx * 80}>
              <div className="sm:px-8 first:pl-0 last:pr-0 text-center sm:text-left">
                <p className="text-sm font-medium text-slate-600">{text}</p>
              </div>
            </Reveal>
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
        <Reveal>
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
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-4xl">
          {FEATURES.map(({ icon: Icon, title, description, href }, idx) => (
            <Reveal key={title} delay={idx * 90}>
              <Link href={href} className="group block h-full">
                <div className="h-full rounded-2xl border border-slate-100 bg-slate-50 p-7 hover:border-slate-300 hover:bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-5 border border-slate-200 transition-colors duration-300 group-hover:border-[#dcc98a]"
                    style={{ background: "white" }}
                  >
                    <Icon
                      className="w-5 h-5 text-slate-500 transition-colors duration-300 group-hover:text-[#b5922f]"
                    />
                  </div>
                  <h3
                    className="font-semibold text-base mb-2 group-hover:underline underline-offset-2 decoration-[#dcc98a]"
                    style={{ color: NAVY }}
                  >
                    {title}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {description}
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ color: GOLD }}>
                    Learn more
                    <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            </Reveal>
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
        <Reveal>
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
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {STEPS.map(({ icon: Icon, number, title, description }, idx) => (
            <Reveal key={number} delay={idx * 120}>
              <div className="relative flex flex-col items-start group">
                {idx < STEPS.length - 1 && (
                  <div
                    className="hidden md:block absolute top-5 left-[calc(100%_-_16px)] w-[calc(100%_-_32px)] h-px"
                    style={{ background: "#e2d9c4" }}
                    aria-hidden="true"
                  />
                )}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-5 border-2 relative z-10 transition-all duration-300 group-hover:scale-110 group-hover:shadow-sm"
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
            </Reveal>
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
          <Reveal>
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
                {NO_LIST.map((item, idx) => (
                  <Reveal key={item} delay={idx * 80}>
                    <li className="flex items-start gap-4">
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
                  </Reveal>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div>
              <Link href="/custody-map" className="block group" aria-label="Explore the Custody Map">
                <div className="relative">
                  <MiniMap />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none">
                    <div className="bg-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-2 border border-slate-200">
                      <Map className="w-4 h-4" style={{ color: NAVY }} />
                      <span className="text-sm font-semibold" style={{ color: NAVY }}>
                        Explore custody laws by state
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </div>
                <p className="text-center text-xs text-slate-400 mt-2 group-hover:text-slate-600 transition-colors">
                  <CountUp to={STATES_WITH_DATA.size} /> states with detailed custody data
                </p>
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ─── 6. STATES COVERED ────────────────────────────────────────────────────────
function StatesCoveredSection() {
  return (
    <section style={{ background: WARM_BG }} className="border-y border-slate-100 py-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal>
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
              Detailed custody law data for <CountUp to={STATES_COVERED.length} /> states.
            </p>
          </div>
        </Reveal>

        <div className="flex flex-wrap gap-2">
          {STATES_COVERED.map((state, idx) => (
            <Reveal key={state} delay={Math.min(idx * 15, 400)}>
              <Link href={`/jurisdiction/${encodeURIComponent(state)}/unknown`}>
                <Badge
                  variant="outline"
                  className="cursor-pointer text-xs py-1 px-3 border-slate-200 text-slate-500 hover:border-[#dcc98a] hover:text-[#b5922f] hover:bg-white transition-all duration-200 bg-white"
                  data-testid={`badge-state-${state.toLowerCase().replace(/\s/g, "-")}`}
                >
                  {state}
                </Badge>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 7. FINAL CTA ─────────────────────────────────────────────────────────────
function CTASection() {
  return (
    <section style={{ background: NAVY }} className="relative py-24 overflow-hidden">
      {/* Subtle radial accent */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 100%, rgba(181, 146, 47, 0.12), transparent 60%)`,
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
        <Reveal>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-5"
            style={{ color: GOLD }}
          >
            Get started today
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h2 className="font-serif text-3xl md:text-4xl font-semibold text-white leading-tight mb-4">
            Start understanding your custody<br className="hidden sm:block" /> options today
          </h2>
        </Reveal>

        <Reveal delay={160}>
          <p className="text-white/50 text-base mb-10 max-w-md mx-auto leading-relaxed">
            Get clarity, confidence, and guidance — all in one place.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <Button
            size="lg"
            className="h-12 px-8 font-semibold text-base transition-all duration-200 hover:scale-[1.03] hover:shadow-lg"
            style={{ background: "white", color: NAVY }}
            onClick={openSignup}
            data-testid="button-cta-bottom"
          >
            <MapPin className="w-4 h-4" />
            Get Started Free
          </Button>
        </Reveal>

        <Reveal delay={320}>
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
        </Reveal>
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
