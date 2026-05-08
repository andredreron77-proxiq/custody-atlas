import { Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  MapPin,
  CheckCircle,
  Shield,
  FileSearch,
  MessageSquare,
  Map,
  LayoutDashboard,
  Upload,
  Zap,
  BadgeCheck,
  Scale,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExploreStateMap, GuestStateQAPanel, STATES_WITH_DATA } from "@/components/custody/CustodyExploreShared";
import type { CustodyLawRecord } from "@shared/schema";

const STATES_COVERED = Array.from(STATES_WITH_DATA).sort();

function openSignup() {
  window.dispatchEvent(new CustomEvent("custody-atlas:open-auth", { detail: { mode: "signup" } }));
}

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
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, visible };
}

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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em]"
      style={{
        color: "hsl(var(--gold))",
        borderColor: "hsl(var(--gold))",
        backgroundColor: "hsl(var(--gold) / 0.08)",
      }}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </p>
  );
}

function Divider() {
  return (
    <div
      className="mb-5 h-px w-12 rounded-full"
      style={{ backgroundColor: "hsl(var(--gold))" }}
      aria-hidden="true"
    />
  );
}

function deriveStandardHeading(record: CustodyLawRecord | undefined, selectedState: string): string {
  const standard = record?.custody_standard?.toLowerCase() ?? "";
  if (standard.includes("best interest")) {
    return "Best Interest of the Child";
  }
  if (standard.includes("best interests")) {
    return "Best Interests Standard";
  }
  return `${selectedState} Custody Standard`;
}

function MiniMap() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <ExploreStateMap
          selectedState={selectedState}
          hoveredState={hoveredState}
          onHoverStateChange={setHoveredState}
          onStateClick={setSelectedState}
        />
      </div>
      <p className="text-center text-xs text-muted-foreground">
        <CountUp to={STATES_WITH_DATA.size} /> states with detailed custody data
      </p>
    </div>
  );
}

function HeroSection() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  const { data: law, isLoading } = useQuery<CustodyLawRecord>({
    queryKey: ["/api/custody-laws", selectedState ?? "__none__", "landing-hero"],
    queryFn: async () => {
      const res = await fetch(`/api/custody-laws/${encodeURIComponent(selectedState!)}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!selectedState,
    staleTime: 5 * 60 * 1000,
  });

  const standardHeading = selectedState ? deriveStandardHeading(law, selectedState) : "";

  return (
    <section className="relative overflow-hidden border-b border-border bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle at 50% 0%, hsl(var(--gold) / 0.08), transparent 60%)",
        }}
      />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-16 pt-16 text-center sm:px-6 md:pb-20 md:pt-20">
        <Reveal>
          <Eyebrow>A QUIET GUIDE THROUGH CUSTODY LAW</Eyebrow>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-6 font-serif text-5xl font-medium leading-none tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Custody Atlas
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-4 text-[14px] italic text-muted-foreground">
            Plain answers about the law where you live.
          </p>
        </Reveal>

        <Reveal delay={220} className="mt-8">
          <div className="space-y-1.5 text-center">
            <p className="font-serif text-[16px] font-medium text-foreground">
              Start with your state.
            </p>
            <p className="text-[12px] text-muted-foreground">
              50 states. Three free questions.
            </p>
          </div>
        </Reveal>

        <Reveal delay={240} className="mt-5 w-full max-w-[520px]">
          <ExploreStateMap
            selectedState={selectedState}
            hoveredState={hoveredState}
            onHoverStateChange={setHoveredState}
            onStateClick={setSelectedState}
          />
        </Reveal>

        {selectedState ? (
          <Reveal delay={320} className="mt-7 w-full max-w-[520px] text-left">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: "hsl(var(--gold))" }}
                  >
                    {selectedState}
                  </p>
                  <h3 className="mt-2 font-serif text-2xl font-medium leading-tight text-card-foreground">
                    {isLoading ? "Loading custody standard..." : standardHeading}
                  </h3>
                </div>
                <Link href="/custody-map" className="text-sm font-medium text-primary transition-colors hover:text-foreground">
                  See full guide →
                </Link>
              </div>

              <div className="my-4 h-px w-full bg-border" />

              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {law?.custody_standard ?? `Review the custody standard used in ${selectedState}, then ask Atlas what it means in plain English.`}
                </p>
                <p className="font-serif text-sm italic text-muted-foreground">
                  Ask about {selectedState}. Three free questions, no account required.
                </p>
              </div>

              <GuestStateQAPanel
                selectedState={selectedState}
                embedded
                emptyPrompt={`Choose ${selectedState} to ask Atlas about custody law in your area.`}
              />
            </div>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

const CREDIBILITY = [
  "Designed for real parents navigating custody",
  "Built to simplify complex legal decisions",
  "Private, secure, and easy to use",
];

function CredibilityStrip() {
  return (
    <section className="border-y border-border bg-muted/35">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-3 text-center sm:gap-4">
          {CREDIBILITY.map((text, idx) => (
            <Reveal key={text} delay={idx * 80}>
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-muted-foreground">{text}</p>
                {idx < CREDIBILITY.length - 1 ? (
                  <span className="text-muted-foreground" aria-hidden="true">•</span>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

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
    <section className="bg-background py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="mb-14 max-w-xl">
            <Divider />
            <SectionLabel>Core features</SectionLabel>
            <h2 className="font-serif text-2xl font-semibold leading-snug text-foreground md:text-3xl">
              Everything you need to navigate custody with clarity
            </h2>
          </div>
        </Reveal>

        <div className="grid max-w-4xl grid-cols-1 gap-5 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, description, href }, idx) => (
            <Reveal key={title} delay={idx * 90}>
              <Link href={href} className="group block h-full">
                <div className="h-full cursor-pointer rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-0.5 hover:bg-secondary hover:shadow-md">
                  <div
                    className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background transition-colors duration-300"
                    style={{ borderColor: "hsl(var(--gold) / 0.35)" }}
                  >
                    <Icon className="h-5 w-5 text-primary transition-colors duration-300" />
                  </div>
                  <h3
                    className="mb-2 text-base font-semibold text-card-foreground group-hover:underline underline-offset-2"
                    style={{ textDecorationColor: "hsl(var(--gold))" }}
                  >
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    Learn more
                    <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
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
    <section className="border-y border-border bg-muted/35 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="mx-auto mb-14 max-w-xl text-center">
            <Divider />
            <SectionLabel>How it works</SectionLabel>
            <h2 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">
              Simple, guided, and built for clarity
            </h2>
          </div>
        </Reveal>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
          {STEPS.map(({ number, title, description }, idx) => (
            <Reveal key={number} delay={idx * 120}>
              <div className="relative flex flex-col items-start">
                {idx < STEPS.length - 1 ? (
                  <div
                    className="absolute left-[calc(100%_-_16px)] top-5 hidden h-px w-[calc(100%_-_32px)] md:block"
                    style={{ backgroundColor: "hsl(var(--border))" }}
                    aria-hidden="true"
                  />
                ) : null}
                <div
                  className="relative z-10 mb-5 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-card text-sm font-bold"
                  style={{ borderColor: "hsl(var(--gold))", color: "hsl(var(--gold))" }}
                >
                  {number}
                </div>
                <h3 className="mb-2 text-base font-semibold leading-snug text-foreground">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const NO_LIST = [
  "No legal jargon overload",
  "No guesswork about your rights",
  "No need to navigate this alone",
];

function DifferentiationSection() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <div>
              <Divider />
              <SectionLabel>Why Custody Atlas</SectionLabel>
              <h2 className="mb-8 font-serif text-2xl font-semibold leading-snug text-foreground md:text-3xl">
                Built for clarity,
                <br className="hidden sm:block" /> not complexity
              </h2>
              <ul className="space-y-5">
                {NO_LIST.map((item, idx) => (
                  <Reveal key={item} delay={idx * 80}>
                    <li className="flex items-start gap-4">
                      <div
                        className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border"
                        style={{
                          backgroundColor: "hsl(var(--gold) / 0.08)",
                          borderColor: "hsl(var(--gold) / 0.35)",
                        }}
                      >
                        <CheckCircle className="h-3.5 w-3.5" style={{ color: "hsl(var(--gold))" }} />
                      </div>
                      <span className="text-base font-medium leading-snug text-foreground">
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
                <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
                  <MiniMap />
                </div>
                <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-primary transition-colors group-hover:text-foreground">
                  <span>Explore custody laws by state</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </div>
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function StatesCoveredSection() {
  return (
    <section className="border-y border-border bg-muted/35 py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div>
              <SectionLabel>Coverage</SectionLabel>
              <h2 className="font-serif text-xl font-semibold text-foreground">
                States currently covered
              </h2>
            </div>
            <p className="text-sm text-muted-foreground sm:mb-0.5">
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
                  className="cursor-pointer bg-card px-3 py-1 text-xs text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"
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

function CTASection() {
  return (
    <section className="relative overflow-hidden bg-primary py-24 text-primary-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle at 50% 100%, hsl(var(--gold) / 0.12), transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-6">
        <Reveal>
          <p
            className="mb-5 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "hsl(var(--gold))" }}
          >
            Get started today
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h2 className="mb-4 font-serif text-3xl font-semibold leading-tight md:text-4xl">
            Start understanding your custody
            <br className="hidden sm:block" /> options today
          </h2>
        </Reveal>

        <Reveal delay={160}>
          <p className="mx-auto mb-10 max-w-md text-base leading-relaxed text-primary-foreground/70">
            Get clarity, confidence, and guidance — all in one place.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <Button
            size="lg"
            className="h-12 px-8 text-base font-semibold transition-all duration-200 hover:scale-[1.03] hover:shadow-lg"
            onClick={openSignup}
            data-testid="button-cta-bottom"
          >
            <MapPin className="h-4 w-4" />
            Get Started Free
          </Button>
        </Reveal>

        <Reveal delay={320}>
          <div className="mt-12 flex flex-col items-center justify-center gap-6 border-t border-card-border pt-8 text-xs text-primary-foreground/70 sm:flex-row">
            <span className="flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5" />
              Not legal advice
            </span>
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Educational information only
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Always consult a licensed attorney
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

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
