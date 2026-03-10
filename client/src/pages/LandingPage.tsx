import { Link } from "wouter";
import { Scale, MapPin, MessageSquare, Shield, ChevronRight, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATES_COVERED = [
  "Alabama", "Alaska", "Arizona", "California", "Colorado",
  "Florida", "Georgia", "Illinois", "Michigan", "New York",
  "North Carolina", "Ohio", "Pennsylvania", "Texas", "Virginia", "Washington"
];

const FEATURES = [
  {
    icon: MapPin,
    title: "Location-Aware",
    description: "Automatically detects your state and county using GPS or ZIP code lookup.",
  },
  {
    icon: Scale,
    title: "Jurisdiction-Specific",
    description: "Laws vary dramatically by state. Get information for your exact jurisdiction.",
  },
  {
    icon: MessageSquare,
    title: "AI-Powered Q&A",
    description: "Ask specific questions in plain English and get clear, relevant answers.",
  },
  {
    icon: Shield,
    title: "5 Key Areas Covered",
    description: "Custody standards, types, modifications, relocation rules, and enforcement.",
  },
];

const HOW_IT_WORKS = [
  { step: "1", title: "Share Your Location", desc: "Use GPS or enter your ZIP code" },
  { step: "2", title: "View Your Laws", desc: "See custody laws for your state and county" },
  { step: "3", title: "Ask Questions", desc: "Get plain-English answers from our AI" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
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

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20 w-full">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">How It Works</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Three simple steps to understanding child custody law in your jurisdiction.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {HOW_IT_WORKS.map((step, idx) => (
            <div key={step.step} className="flex flex-col items-center text-center gap-4 relative">
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg flex-shrink-0">
                {step.step}
              </div>
              <div>
                <h3 className="font-semibold mb-1">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
              {idx < HOW_IT_WORKS.length - 1 && (
                <ChevronRight className="hidden md:block w-5 h-5 text-muted-foreground absolute top-4 -right-4" />
              )}
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

      <section className="bg-muted/30 border-y">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">What We Cover</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Comprehensive custody law information across all five key areas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="hover-elevate">
                  <CardContent className="p-5 space-y-3">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm">{feature.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 w-full">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">States Currently Covered</h2>
          <p className="text-muted-foreground">
            We have detailed custody law data for {STATES_COVERED.length} states.
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
      </section>

      <section className="bg-primary text-primary-foreground">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Find Out What Applies to Your Family
          </h2>
          <p className="text-primary-foreground/80 mb-7 max-w-xl mx-auto">
            Every family's situation is unique. Start by finding the laws in your area, then ask our AI your specific questions.
          </p>
          <Link href="/location">
            <Button
              size="lg"
              className="bg-white text-primary border-white font-semibold gap-2"
              data-testid="button-cta-bottom"
            >
              <MapPin className="w-4 h-4" />
              Find Custody Laws Near Me
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
