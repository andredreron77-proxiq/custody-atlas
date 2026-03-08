import { useState } from "react";
import { MapPin, Hash, Loader2, Navigation, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { Jurisdiction } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface LocationSelectorProps {
  onJurisdictionFound: (jurisdiction: Jurisdiction) => void;
  isLoading?: boolean;
}

export function LocationSelector({ onJurisdictionFound, isLoading: externalLoading }: LocationSelectorProps) {
  const [activeTab, setActiveTab] = useState<"gps" | "zip">("gps");
  const [zipCode, setZipCode] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const { toast } = useToast();

  const isLoading = externalLoading || gpsLoading || zipLoading;

  const handleGpsDetect = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser.");
      return;
    }

    setGpsError(null);
    setGpsLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await apiRequest("POST", "/api/geocode/coordinates", {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          const data = await res.json();
          onJurisdictionFound(data as Jurisdiction);
        } catch (err: any) {
          const message = err?.message || "Failed to determine your location";
          toast({ title: "Location Error", description: message, variant: "destructive" });
        } finally {
          setGpsLoading(false);
        }
      },
      (error) => {
        setGpsLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGpsError("Location access was denied. Please allow location access or enter your ZIP code.");
            break;
          case error.POSITION_UNAVAILABLE:
            setGpsError("Location information is unavailable. Please enter your ZIP code.");
            break;
          case error.TIMEOUT:
            setGpsError("Location request timed out. Please try again or enter your ZIP code.");
            break;
          default:
            setGpsError("An unknown error occurred. Please enter your ZIP code.");
        }
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  };

  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = zipCode.trim();
    if (!trimmed) return;

    setZipLoading(true);
    try {
      const res = await apiRequest("POST", "/api/geocode/zip", { zipCode: trimmed });
      const data = await res.json();
      onJurisdictionFound(data as Jurisdiction);
    } catch (err: any) {
      const message = err?.message || "Failed to find location for this ZIP code";
      toast({ title: "ZIP Code Error", description: message, variant: "destructive" });
    } finally {
      setZipLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="flex rounded-lg border bg-muted/30 p-1 gap-1">
        <button
          onClick={() => setActiveTab("gps")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === "gps"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
          data-testid="tab-gps"
        >
          <Navigation className="w-4 h-4" />
          Detect Location
        </button>
        <button
          onClick={() => setActiveTab("zip")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === "zip"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
          data-testid="tab-zip"
        >
          <Hash className="w-4 h-4" />
          Enter ZIP Code
        </button>
      </div>

      {activeTab === "gps" && (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <MapPin className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Use Your Current Location</h3>
              <p className="text-sm text-muted-foreground">
                We'll use your device's GPS to automatically detect your state and county.
              </p>
            </div>

            {gpsError && (
              <div className="flex items-start gap-2 text-left bg-destructive/10 border border-destructive/20 rounded-md p-3">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{gpsError}</p>
              </div>
            )}

            <Button
              onClick={handleGpsDetect}
              disabled={isLoading}
              className="w-full"
              data-testid="button-detect-location"
            >
              {gpsLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Detecting Location...
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4 mr-2" />
                  Detect My Location
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === "zip" && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Hash className="w-7 h-7 text-primary" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold mb-1">Enter Your ZIP Code</h3>
              <p className="text-sm text-muted-foreground">
                Enter your 5-digit ZIP code to find custody laws for your area.
              </p>
            </div>

            <form onSubmit={handleZipSubmit} className="space-y-3">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 30301"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                maxLength={5}
                disabled={isLoading}
                data-testid="input-zip-code"
              />
              <Button
                type="submit"
                disabled={zipCode.length < 5 || isLoading}
                className="w-full"
                data-testid="button-submit-zip"
              >
                {zipLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Looking up ZIP Code...
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4 mr-2" />
                    Find My Laws
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
