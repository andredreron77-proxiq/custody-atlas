import { MapPin, Globe, Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Jurisdiction } from "@shared/schema";

interface JurisdictionHeaderProps {
  jurisdiction: Jurisdiction;
  stateCode?: string;
  hasData: boolean;
}

/**
 * JurisdictionHeader
 * Displays the detected/entered location in a structured header block.
 * Shows state, county, country, formatted address, and optionally coordinates.
 */
export function JurisdictionHeader({ jurisdiction, stateCode, hasData }: JurisdictionHeaderProps) {
  const { state, county, country, formattedAddress, latitude, longitude } = jurisdiction;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3" data-testid="jurisdiction-header">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold" data-testid="text-jurisdiction-title">
              {county} County, {state}
            </h2>
            {stateCode && (
              <Badge variant="outline" className="text-xs font-mono" data-testid="badge-state-code">
                {stateCode}
              </Badge>
            )}
            {hasData && (
              <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700" data-testid="badge-data-available">
                Data Available
              </Badge>
            )}
          </div>

          {formattedAddress && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span data-testid="text-formatted-address">{formattedAddress}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Globe className="w-3.5 h-3.5 flex-shrink-0" />
          <span data-testid="text-country">{country ?? "United States"}</span>
        </div>
      </div>

      {latitude !== undefined && longitude !== undefined && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 pt-1 border-t border-border">
          <Navigation className="w-3 h-3 flex-shrink-0" />
          <span data-testid="text-coordinates">
            {latitude.toFixed(5)}°{latitude >= 0 ? "N" : "S"},{" "}
            {Math.abs(longitude).toFixed(5)}°{longitude >= 0 ? "E" : "W"}
          </span>
        </div>
      )}
    </div>
  );
}
