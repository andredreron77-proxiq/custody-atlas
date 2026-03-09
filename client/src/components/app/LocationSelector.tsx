import { useState } from "react";
import {
  MapPin, Hash, Loader2, Navigation, AlertCircle,
  ShieldOff, WifiOff, Clock, CheckCircle2, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { Jurisdiction } from "@shared/schema";

interface LocationSelectorProps {
  onJurisdictionFound: (jurisdiction: Jurisdiction) => void;
}

type Tab = "gps" | "zip";

type GpsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "timeout" }
  | { status: "server_error"; message: string }
  | { status: "success"; jurisdiction: Jurisdiction };

type ZipState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "not_found" }
  | { status: "server_error"; message: string }
  | { status: "success"; jurisdiction: Jurisdiction };

// Validate US ZIP codes (5 digits, optionally with 4-digit extension)
function isValidZip(zip: string): boolean {
  return /^\d{5}$/.test(zip);
}

// Calls the server-side geocoding route — Google Maps API key is never exposed here
async function reverseGeocode(lat: number, lng: number): Promise<Jurisdiction> {
  const res = await fetch("/api/geocode/coordinates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Server error (${res.status})`);
  }
  return res.json();
}

// Calls the server-side ZIP geocoding route — Google Maps API key is never exposed here
async function geocodeZip(zipCode: string): Promise<Jurisdiction> {
  const res = await fetch("/api/geocode/zip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zipCode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `Server error (${res.status})`);
    if (res.status === 404) (err as any).notFound = true;
    throw err;
  }
  return res.json();
}

function GpsErrorDisplay({ state, onRetry, onSwitchToZip }: {
  state: GpsState;
  onRetry: () => void;
  onSwitchToZip: () => void;
}) {
  if (state.status === "denied") {
    return (
      <div
        className="rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-left space-y-2"
        data-testid="error-gps-denied"
      >
        <div className="flex items-center gap-2">
          <ShieldOff className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Location Access Denied</p>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          Your browser blocked location access. To use GPS detection, allow location in your browser settings and try again.
          Or switch to ZIP code entry below.
        </p>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={onRetry} className="text-xs h-7" data-testid="button-gps-retry">
            Try Again
          </Button>
          <Button size="sm" variant="ghost" onClick={onSwitchToZip} className="text-xs h-7" data-testid="button-switch-to-zip">
            Use ZIP Instead
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2" data-testid="error-gps-unavailable">
        <WifiOff className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-destructive font-medium">Location Unavailable</p>
          <p className="text-xs text-destructive/80 mt-0.5">
            Your device couldn't determine a location. Please enter your ZIP code instead.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "timeout") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2" data-testid="error-gps-timeout">
        <Clock className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-destructive font-medium">Request Timed Out</p>
          <p className="text-xs text-destructive/80 mt-0.5">
            Location detection took too long. Try again or use ZIP code entry.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "server_error") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2" data-testid="error-gps-server">
        <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-destructive font-medium">Lookup Failed</p>
          <p className="text-xs text-destructive/80 mt-0.5">{state.message}</p>
        </div>
      </div>
    );
  }

  return null;
}

export function LocationSelector({ onJurisdictionFound }: LocationSelectorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("gps");
  const [gpsState, setGpsState] = useState<GpsState>({ status: "idle" });
  const [zipCode, setZipCode] = useState("");
  const [zipState, setZipState] = useState<ZipState>({ status: "idle" });

  const isGpsLoading = gpsState.status === "loading";
  const isZipLoading = zipState.status === "loading";

  const handleGpsDetect = () => {
    if (!navigator.geolocation) {
      setGpsState({ status: "unavailable" });
      return;
    }

    setGpsState({ status: "loading" });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          // Sends coordinates to server — Google Maps API key used server-side only
          const jurisdiction = await reverseGeocode(
            position.coords.latitude,
            position.coords.longitude
          );
          setGpsState({ status: "success", jurisdiction });
          onJurisdictionFound(jurisdiction);
        } catch (err: any) {
          setGpsState({ status: "server_error", message: err.message || "Failed to look up your location." });
        }
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGpsState({ status: "denied" });
            break;
          case error.POSITION_UNAVAILABLE:
            setGpsState({ status: "unavailable" });
            break;
          case error.TIMEOUT:
            setGpsState({ status: "timeout" });
            break;
          default:
            setGpsState({ status: "server_error", message: "An unknown error occurred." });
        }
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  };

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
    setZipCode(val);
    if (zipState.status === "invalid" && val.length === 5) {
      setZipState({ status: "idle" });
    }
    if (zipState.status !== "idle" && zipState.status !== "loading") {
      setZipState({ status: "idle" });
    }
  };

  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = zipCode.trim();

    if (!isValidZip(trimmed)) {
      setZipState({ status: "invalid" });
      return;
    }

    setZipState({ status: "loading" });
    try {
      // Sends ZIP to server — Google Maps API key used server-side only
      const jurisdiction = await geocodeZip(trimmed);
      setZipState({ status: "success", jurisdiction });
      onJurisdictionFound(jurisdiction);
    } catch (err: any) {
      if ((err as any).notFound) {
        setZipState({ status: "not_found" });
      } else {
        setZipState({ status: "server_error", message: err.message || "Failed to look up this ZIP code." });
      }
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="flex rounded-lg border bg-muted/30 p-1 gap-1" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "gps"}
          onClick={() => setActiveTab("gps")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === "gps"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-gps"
        >
          <Navigation className="w-4 h-4" />
          Detect Location
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "zip"}
          onClick={() => setActiveTab("zip")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === "zip"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
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
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto transition-colors ${
                gpsState.status === "success"
                  ? "bg-emerald-100 dark:bg-emerald-900/30"
                  : "bg-primary/10"
              }`}
            >
              {gpsState.status === "loading" ? (
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              ) : gpsState.status === "success" ? (
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              ) : gpsState.status === "denied" ? (
                <ShieldOff className="w-7 h-7 text-amber-500" />
              ) : (
                <MapPin className="w-7 h-7 text-primary" />
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-1">
                {gpsState.status === "loading"
                  ? "Detecting Your Location..."
                  : gpsState.status === "success"
                    ? "Location Detected"
                    : "Use Your Current Location"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {gpsState.status === "idle"
                  ? "We'll use your device's GPS to automatically detect your state and county."
                  : gpsState.status === "loading"
                    ? "Please allow location access when prompted by your browser."
                    : gpsState.status === "success"
                      ? `Found: ${gpsState.jurisdiction.formattedAddress}`
                      : null}
              </p>
            </div>

            {/* Error states — each displays its own distinct UI */}
            <GpsErrorDisplay
              state={gpsState}
              onRetry={handleGpsDetect}
              onSwitchToZip={() => setActiveTab("zip")}
            />

            {gpsState.status !== "denied" && (
              <Button
                onClick={handleGpsDetect}
                disabled={isGpsLoading || gpsState.status === "success"}
                className="w-full"
                data-testid="button-detect-location"
              >
                {isGpsLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Detecting Location...
                  </>
                ) : gpsState.status === "success" ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Location Found
                  </>
                ) : (
                  <>
                    <Navigation className="w-4 h-4 mr-2" />
                    Detect My Location
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "zip" && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              {zipState.status === "loading" ? (
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              ) : zipState.status === "success" ? (
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Hash className="w-7 h-7 text-primary" />
              )}
            </div>

            <div className="text-center">
              <h3 className="font-semibold mb-1">Enter Your ZIP Code</h3>
              <p className="text-sm text-muted-foreground">
                Enter your 5-digit ZIP code to find custody laws for your area.
              </p>
            </div>

            <form onSubmit={handleZipSubmit} className="space-y-2">
              <div className="space-y-1.5">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g. 90210"
                  value={zipCode}
                  onChange={handleZipChange}
                  maxLength={5}
                  disabled={isZipLoading}
                  aria-invalid={zipState.status === "invalid" || zipState.status === "not_found"}
                  aria-describedby="zip-error"
                  className={
                    zipState.status === "invalid" || zipState.status === "not_found"
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                  data-testid="input-zip"
                />

                {/* Inline validation errors — shown under the input, not as toasts */}
                {zipState.status === "invalid" && (
                  <div id="zip-error" className="flex items-center gap-1.5" data-testid="error-zip-invalid">
                    <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                    <p className="text-xs text-destructive">Please enter a valid 5-digit US ZIP code.</p>
                  </div>
                )}
                {zipState.status === "not_found" && (
                  <div id="zip-error" className="flex items-center gap-1.5" data-testid="error-zip-not-found">
                    <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                    <p className="text-xs text-destructive">ZIP code not found. Please check and try again.</p>
                  </div>
                )}
                {zipState.status === "server_error" && (
                  <div id="zip-error" className="flex items-center gap-1.5" data-testid="error-zip-server">
                    <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                    <p className="text-xs text-destructive">{zipState.message}</p>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={zipCode.length < 5 || isZipLoading || zipState.status === "success"}
                className="w-full"
                data-testid="button-zip-submit"
              >
                {isZipLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Looking Up ZIP Code...
                  </>
                ) : zipState.status === "success" ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Location Found
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4 mr-2" />
                    Find My Laws
                  </>
                )}
              </Button>
            </form>

            {zipState.status === "success" && (
              <p className="text-xs text-center text-muted-foreground" data-testid="text-zip-result">
                Found: {zipState.jurisdiction.formattedAddress}
                {zipState.jurisdiction.latitude && (
                  <span className="block text-muted-foreground/60 mt-0.5">
                    {zipState.jurisdiction.latitude.toFixed(4)}°N, {Math.abs(zipState.jurisdiction.longitude!).toFixed(4)}°W
                  </span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
