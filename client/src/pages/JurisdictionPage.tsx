import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, AlertCircle, Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JurisdictionCard } from "@/components/app/JurisdictionCard";
import { LawSummarySection } from "@/components/app/LawSummarySection";
import { Breadcrumb } from "@/components/app/Header";
import type { CustodyLaw, Jurisdiction } from "@shared/schema";

export default function JurisdictionPage() {
  const [match, params] = useRoute("/jurisdiction/:state/:county");
  const [location] = useLocation();

  if (!match || !params) return null;

  const state = decodeURIComponent(params.state);
  const county = decodeURIComponent(params.county);

  const urlParams = new URLSearchParams(location.split("?")[1] || "");
  const country = urlParams.get("country") || "United States";
  const formattedAddress = urlParams.get("address") || undefined;

  const jurisdiction: Jurisdiction = {
    state,
    county,
    country,
    formattedAddress: formattedAddress || undefined,
  };

  const { data: law, isLoading, error } = useQuery<CustodyLaw>({
    queryKey: ["/api/custody-laws", state],
    queryFn: async () => {
      const res = await fetch(`/api/custody-laws/${encodeURIComponent(state)}`);
      if (!res.ok) {
        if (res.status === 404) {
          const json = await res.json();
          throw new Error(json.error || "No data available for this state");
        }
        throw new Error("Failed to fetch custody laws");
      }
      return res.json();
    },
  });

  const askAIPath = `/ask?state=${encodeURIComponent(state)}&county=${encodeURIComponent(county)}&country=${encodeURIComponent(country)}${formattedAddress ? `&address=${encodeURIComponent(formattedAddress)}` : ""}`;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Find My Laws", href: "/location" },
          { label: `${county} County, ${state}` },
        ]}
      />

      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold" data-testid="heading-jurisdiction">
          {county} County, {state}
        </h1>
        <p className="text-muted-foreground">
          Child custody laws and regulations for your jurisdiction
        </p>
      </div>

      <JurisdictionCard jurisdiction={jurisdiction} hasLawData={!error && !isLoading} />

      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-3" data-testid="loading-laws">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-muted-foreground">Loading custody laws for {state}...</span>
        </div>
      )}

      {error && !isLoading && (
        <Card className="border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-6 flex flex-col sm:flex-row items-start gap-4">
            <div className="w-10 h-10 rounded-md bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold mb-1 text-amber-800 dark:text-amber-200">Limited Data Available</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                We don't have specific custody law data for {state} yet. However, you can still ask our AI for general information about custody law in your state.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href={askAIPath}>
                  <Button size="sm" data-testid="button-ask-ai-anyway">
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                    Ask AI About {state} Laws
                  </Button>
                </Link>
                <Link href="/location">
                  <Button variant="outline" size="sm" data-testid="button-try-different">
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Try Different Location
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {law && !isLoading && (
        <>
          <LawSummarySection law={law} state={state} />

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold mb-1">Have Questions About Your Situation?</h3>
                  <p className="text-sm text-muted-foreground">
                    Our AI can answer specific questions about {state} custody law in plain English.
                  </p>
                </div>
                <Link href={askAIPath} className="flex-shrink-0">
                  <Button className="gap-2" data-testid="button-ask-ai">
                    <MessageSquare className="w-4 h-4" />
                    Ask AI Questions
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
