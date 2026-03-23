import { useState } from "react";
import { useLocation, Link } from "wouter";
import { MessageSquare, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatBox } from "@/components/app/ChatBox";
import { LocationSelector } from "@/components/app/LocationSelector";
import { Breadcrumb } from "@/components/app/Header";
import { JurisdictionContextHeader } from "@/components/app/JurisdictionContextHeader";
import { useJurisdiction } from "@/hooks/useJurisdiction";
import type { Jurisdiction } from "@shared/schema";
import { formatJurisdictionLabel } from "@/lib/jurisdictionUtils";

export default function AskAIPage() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(
    location.split("?")[1] || window.location.search.slice(1)
  );

  const stateParam = urlParams.get("state");
  const countyParam = urlParams.get("county");
  const initialQuestion = urlParams.get("q") ?? undefined;

  const urlJurisdiction: Jurisdiction | null =
    stateParam
      ? {
          state: stateParam,
          county: countyParam ?? "",
          country: urlParams.get("country") || "United States",
          formattedAddress: urlParams.get("address") || undefined,
          latitude: urlParams.get("lat") ? Number(urlParams.get("lat")) : undefined,
          longitude: urlParams.get("lng") ? Number(urlParams.get("lng")) : undefined,
        }
      : null;

  const { jurisdiction, setJurisdiction, clearJurisdiction } = useJurisdiction(urlJurisdiction);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const handleJurisdictionFound = (j: Jurisdiction) => {
    setJurisdiction(j);
    setShowLocationPicker(false);
  };

  const handleChangeLocation = () => {
    clearJurisdiction();
    setShowLocationPicker(true);
  };

  /* ── Location picker (no jurisdiction yet) ───────────────────────────── */
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

  /* ── Main Ask AI layout ───────────────────────────────────────────────── */
  return (
    <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">

      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: formatJurisdictionLabel(jurisdiction.state, jurisdiction.county), href: lawPagePath },
          { label: "Ask AI" },
        ]}
      />

      {/* Jurisdiction context bar + action buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <JurisdictionContextHeader
          mode="jurisdiction"
          state={jurisdiction.state}
          county={jurisdiction.county}
          onChangeLocation={handleChangeLocation}
        />

        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <Link href={lawPagePath}>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" data-testid="button-view-laws">
              <ArrowRight className="w-3.5 h-3.5" />
              View Law Summary
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleChangeLocation}
            className="gap-1.5 text-xs"
            data-testid="button-change-location"
          >
            <MapPin className="w-3.5 h-3.5" />
            Change Location
          </Button>
        </div>
      </div>

      {/* ChatBox — input at top, conversation thread grows below */}
      <ChatBox jurisdiction={jurisdiction} initialQuestion={initialQuestion} />

    </div>
  );
}
