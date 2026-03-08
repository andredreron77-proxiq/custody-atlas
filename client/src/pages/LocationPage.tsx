import { useLocation } from "wouter";
import { MapPin } from "lucide-react";
import { LocationSelector } from "@/components/app/LocationSelector";
import type { Jurisdiction } from "@shared/schema";

export default function LocationPage() {
  const [, navigate] = useLocation();

  const handleJurisdictionFound = (jurisdiction: Jurisdiction) => {
    const params = new URLSearchParams({
      county: jurisdiction.county,
      country: jurisdiction.country,
      address: jurisdiction.formattedAddress || "",
    });
    navigate(`/jurisdiction/${encodeURIComponent(jurisdiction.state)}/${encodeURIComponent(jurisdiction.county)}?${params}`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-10">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <MapPin className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2" data-testid="heading-location">
          Find Your Custody Laws
        </h1>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Share your location or enter your ZIP code to see the child custody laws that apply to your jurisdiction.
        </p>
      </div>

      <LocationSelector onJurisdictionFound={handleJurisdictionFound} />

      <div className="mt-8 text-center">
        <p className="text-xs text-muted-foreground">
          Your location data is never stored. It is only used to look up applicable laws.
        </p>
      </div>
    </div>
  );
}
