import { MapPin, Building, Globe, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Jurisdiction } from "@shared/schema";

interface JurisdictionCardProps {
  jurisdiction: Jurisdiction;
  hasLawData?: boolean;
}

export function JurisdictionCard({ jurisdiction, hasLawData }: JurisdictionCardProps) {
  return (
    <Card className="hover-elevate">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Your Jurisdiction</p>
                <p className="font-semibold text-sm truncate" data-testid="text-jurisdiction">
                  {jurisdiction.county} County, {jurisdiction.state}
                </p>
              </div>
            </div>

            {jurisdiction.formattedAddress && (
              <p className="text-xs text-muted-foreground pl-10" data-testid="text-address">
                {jurisdiction.formattedAddress}
              </p>
            )}

            <div className="flex items-center gap-3 pl-10 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{jurisdiction.county} County</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{jurisdiction.state}</span>
              </div>
            </div>
          </div>

          {hasLawData !== undefined && (
            <div className="flex-shrink-0">
              {hasLawData ? (
                <Badge variant="secondary" className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/50">
                  <CheckCircle className="w-3 h-3" />
                  Laws Available
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">
                  Limited Data
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
