import { useLocation } from "wouter";
import { LocationSelector } from "@/components/app/LocationSelector";
import { useJurisdiction } from "@/hooks/useJurisdiction";
import { PageShell, PageHeader } from "@/components/app/PageShell";
import type { Jurisdiction } from "@shared/schema";

export default function LocationPage() {
  const [, navigate] = useLocation();
  const { setJurisdiction } = useJurisdiction();

  const handleJurisdictionFound = (jurisdiction: Jurisdiction) => {
    setJurisdiction(jurisdiction);

    const params = new URLSearchParams({
      county: jurisdiction.county,
      country: jurisdiction.country ?? "United States",
      address: jurisdiction.formattedAddress ?? "",
    });

    if (jurisdiction.latitude !== undefined) {
      params.set("lat", String(jurisdiction.latitude));
    }
    if (jurisdiction.longitude !== undefined) {
      params.set("lng", String(jurisdiction.longitude));
    }

    navigate(
      `/jurisdiction/${encodeURIComponent(jurisdiction.state)}/${encodeURIComponent(jurisdiction.county)}?${params}`
    );
  };

  return (
    <PageShell className="max-w-2xl">
      <PageHeader
        eyebrow="Jurisdiction Lookup"
        title="Find Your Custody Laws"
        subtitle="Share your location or enter your ZIP code to see the child custody laws that apply to your situation."
        center
      />

      <LocationSelector onJurisdictionFound={handleJurisdictionFound} />

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Your location data is used only to look up applicable laws and is not stored on our servers.
      </p>
    </PageShell>
  );
}
