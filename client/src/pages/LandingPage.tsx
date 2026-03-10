import { Link } from "wouter";
import {
  Scale, MapPin, MessageSquare, ArrowRight, CheckCircle,
  FileSearch, BookOpen, HelpCircle, Globe, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATES_COVERED = [
  "Alabama", "Alaska", "Arizona", "California", "Colorado",
  "Florida", "Georgia", "Illinois", "Michigan", "New York",
  "North Carolina", "Ohio", "Pennsylvania", "Texas", "Virginia", "Washington",
];

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Enter your location",
    desc: "Use GPS or type your ZIP code. We find your state and county automatically.",
    href: "/location",
  },
  {
    step: "2",
    title: "See the law that applies to you",
    desc: "Get a plain-English summary of custody law specific to your jurisdiction — no legal degree required.",
    href: "/location",
  },
  {
    step: "3",
    title: "Ask questions and get guidance",
    desc: "Type any custody question and get a clear answer, plus suggestions for what to ask your attorney.",
    href: "/ask",
  },
];

const BENEFITS = [
  {
    icon: Globe,
    title: "Understand custody law in your state",
    desc: "Every state handles custody differently. See exactly what the rules look like where you live.",
  },
  {
    icon: MapPin,
    title: "Learn how rules may differ by location",
    desc: "County courts can vary. Custody Atlas helps you understand what to expect in your specific area.",
  },
  {
    icon: HelpCircle,
    title: "Ask custody questions in plain English",
    desc: "No jargon, no confusion. Just real answers to the questions you're already thinking about.",
  },
  {
    icon: FileSearch,
    title: "Upload documents for easier explanation",
    desc: "Drop in a custody order or parenting plan and get a plain-English breakdown of what it says.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary/80 to-blue-800/90"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
          aria-hidden="true"
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <div className="max-w-2xl">
            <Badge className="mb-5 bg-white/20 text-white border-white/30 hover:bg-white/25 no-default-active-elevate">
              Free Legal Information Tool
            </Badge>

            <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 leading-tight">
              Custody Atlas
            </h1>

            <p className="text-xl md:text-2xl text-blue-100 font-medium mb-5">
              Understand custody law where you live.
            </p>

            <p className="text-base text-blue-100/90 mb-8 leading-relaxed max-w-xl">
              Get plain-English explanations of custody law based on your state and county.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/location">
                <Button
                  size="lg"
                  className="bg-white text-primary border-white font-semibold gap-2"
                  data-testid="button-cta-find-laws"
                >
                  <MapPin className="w-4 h-4" />
                  Find Custody Laws Near Me
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/ask">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/50 text-white bg-white/10 font-semibold gap-2"
                  data-testid="button-cta-ask-ai"
                >
                  <MessageSquare className="w-4 h-4" />
                  Ask a Question
                </Button>
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
              {["Free to use", "No account required", `${STATES_COVERED.length} states covered`].map((item) => (
                <div key={item} className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-green-300" />
                  <span className="text-sm text-blue-100">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20 w-full">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">How it works</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Three simple steps to understanding custody law in your area.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((item, idx) => (
            <div key={item.step} className="relative flex flex-col items-center text-center gap-4">
              {/* Connector line between steps (desktop only) */}
              {idx < HOW_IT_WORKS.length - 1 && (
                <div
                  className="hidden md:block absolute top-5 left-[calc(50%+28px)] right-[calc(-50%+28px)] h-px bg-border"
                  aria-hidden="true"
                />
              )}
              <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-base flex-shrink-0 z-10">
                {item.step}
              </div>
              <div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link href="/location">
            <Button size="lg" className="gap-2" data-testid="button-cta-get-started">
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── WHAT YOU CAN DO ──────────────────────────────────────────────── */}
      <section className="bg-muted/30 border-y">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">What you can do with Custody Atlas</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Built for anyone trying to make sense of custody law — without needing a law degree.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <Card key={benefit.title} className="hover-elevate border">
                  <CardContent className="p-6 flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{benefit.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{benefit.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── TRUST SECTION ────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 w-full">
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col items-center text-center gap-5 p-8 rounded-xl border bg-card shadow-sm">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3">Built to inform, not to replace your attorney</h2>
              <p className="text-muted-foreground leading-relaxed">
                Custody Atlas provides educational information to help you understand custody law and prepare better questions for a licensed attorney.
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

      {/* ── STATES COVERED ───────────────────────────────────────────────── */}
      <section className="bg-muted/30 border-t">
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

      {/* ── BOTTOM CTA ───────────────────────────────────────────────────── */}
      <section className="bg-primary text-primary-foreground">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Find out what applies to your family
          </h2>
          <p className="text-primary-foreground/80 mb-7 max-w-lg mx-auto">
            Start with your location. We'll show you the custody laws for your state and county in plain, simple language.
          </p>
          <Link href="/location">
            <Button
              size="lg"
              className="bg-white text-primary border-white font-semibold gap-2"
              data-testid="button-cta-bottom"
            >
              <MapPin className="w-4 h-4" />
              Find My Custody Laws
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
