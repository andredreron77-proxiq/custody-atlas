import { useState } from "react";
import { useLocation, Link } from "wouter";
import { MessageSquare, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChatBox } from "@/components/app/ChatBox";
import { JurisdictionCard } from "@/components/app/JurisdictionCard";
import { LocationSelector } from "@/components/app/LocationSelector";
import { Breadcrumb } from "@/components/app/Header";
import { JurisdictionContextHeader } from "@/components/app/JurisdictionContextHeader";
import { useJurisdiction } from "@/hooks/useJurisdiction";
import type { Jurisdiction } from "@shared/schema";

export default function AskAIPage() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(
    location.split("?")[1] || window.location.search.slice(1)
  );

  const stateParam = urlParams.get("state");
  const countyParam = urlParams.get("county");

  // Build a jurisdiction from URL params if present — these take priority over stored session
  const urlJurisdiction: Jurisdiction | null =
    stateParam && countyParam
      ? {
          state: stateParam,
          county: countyParam,
          country: urlParams.get("country") || "United States",
          formattedAddress: urlParams.get("address") || undefined,
          latitude: urlParams.get("lat") ? Number(urlParams.get("lat")) : undefined,
          longitude: urlParams.get("lng") ? Number(urlParams.get("lng")) : undefined,
        }
      : null;

  // useJurisdiction: URL params take priority; falls back to sessionStorage automatically
  const { jurisdiction, setJurisdiction, clearJurisdiction } = useJurisdiction(urlJurisdiction);

  // "Change Location" shows the picker overlay without clearing — cleared only on confirm
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const handleJurisdictionFound = (j: Jurisdiction) => {
    setJurisdiction(j);
    setShowLocationPicker(false);
  };

  const handleChangeLocation = () => {
    clearJurisdiction();
    setShowLocationPicker(true);
  };

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
            Share your location so we can provide information specific to your state's custody laws.
          </p>
        </div>

        <LocationSelector onJurisdictionFound={handleJurisdictionFound} />

        <p className="text-xs text-muted-foreground text-center mt-6">
          Your location is only used to identify applicable laws and is never stored on our servers.
        </p>
      </div>
    );
  }

  const lawPagePath =
    `/jurisdiction/${encodeURIComponent(jurisdiction.state)}/${encodeURIComponent(jurisdiction.county)}` +
    `?country=${encodeURIComponent(jurisdiction.country ?? "United States")}` +
    `&address=${encodeURIComponent(jurisdiction.formattedAddress || "")}` +
    (jurisdiction.latitude !== undefined ? `&lat=${jurisdiction.latitude}` : "") +
    (jurisdiction.longitude !== undefined ? `&lng=${jurisdiction.longitude}` : "");

  return (
    <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col flex-1 min-h-0 gap-4">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: `${jurisdiction.county} County, ${jurisdiction.state}`, href: lawPagePath },
          { label: "Ask AI" },
        ]}
      />

      <JurisdictionContextHeader
        mode="jurisdiction"
        state={jurisdiction.state}
        county={jurisdiction.county}
        onChangeLocation={handleChangeLocation}
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
            onClick={handleChangeLocation}
            className="gap-1.5"
            data-testid="button-change-location"
          >
            <MapPin className="w-3.5 h-3.5" />
            Change Location
          </Button>
        </div>
      </div>

      <JurisdictionCard jurisdiction={jurisdiction} />

      {/* Educational notice */}
      <p className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/40 leading-relaxed" data-testid="text-ai-notice">
        This assistant provides educational information about custody law based on your jurisdiction. It is not a substitute for a licensed attorney.
      </p>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardContent className="flex-1 min-h-0 flex flex-col p-4">
          <ChatBox jurisdiction={jurisdiction} />
        </CardContent>
      </Card>
    </div>
  );
}
