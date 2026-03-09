import { useState } from "react";
import { useLocation, Link } from "wouter";
import { MessageSquare, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChatBox } from "@/components/app/ChatBox";
import { JurisdictionCard } from "@/components/app/JurisdictionCard";
import { LocationSelector } from "@/components/app/LocationSelector";
import { Breadcrumb } from "@/components/app/Header";
import type { Jurisdiction } from "@shared/schema";

export default function AskAIPage() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split("?")[1] || "");

  const stateParam = urlParams.get("state");
  const countyParam = urlParams.get("county");
  const countryParam = urlParams.get("country");
  const addressParam = urlParams.get("address");

  const [jurisdiction, setJurisdiction] = useState<Jurisdiction | null>(
    stateParam && countyParam
      ? {
          state: stateParam,
          county: countyParam,
          country: countryParam || "United States",
          formattedAddress: addressParam || undefined,
        }
      : null
  );

  const [showLocationPicker, setShowLocationPicker] = useState(!jurisdiction);

  if (!jurisdiction || showLocationPicker) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2" data-testid="heading-ask-ai">
            Ask About Custody Law
          </h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            First, share your location so we can provide information specific to your state's custody laws.
          </p>
        </div>

        <LocationSelector
          onJurisdictionFound={(j) => {
            setJurisdiction(j);
            setShowLocationPicker(false);
          }}
        />

        <p className="text-xs text-muted-foreground text-center mt-6">
          Your location is only used to identify applicable laws and is never stored.
        </p>
      </div>
    );
  }

  const lawPagePath = `/jurisdiction/${encodeURIComponent(jurisdiction.state)}/${encodeURIComponent(jurisdiction.county)}?country=${encodeURIComponent(jurisdiction.country)}&address=${encodeURIComponent(jurisdiction.formattedAddress || "")}`;

  return (
    <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col flex-1 min-h-0 gap-4">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: `${jurisdiction.county} County, ${jurisdiction.state}`, href: lawPagePath },
          { label: "Ask AI" },
        ]}
      />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" data-testid="heading-ask-ai-active">
            Ask About {jurisdiction.state} Custody Law
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Get plain-English answers to your custody questions
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link href={lawPagePath}>
            <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-view-laws">
              <ArrowRight className="w-3.5 h-3.5" />
              View Law Summary
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowLocationPicker(true)}
            className="gap-1.5"
            data-testid="button-change-location"
          >
            <MapPin className="w-3.5 h-3.5" />
            Change Location
          </Button>
        </div>
      </div>

      <JurisdictionCard jurisdiction={jurisdiction} />

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardContent className="flex-1 min-h-0 flex flex-col p-4">
          <ChatBox jurisdiction={jurisdiction} />
        </CardContent>
      </Card>
    </div>
  );
}
