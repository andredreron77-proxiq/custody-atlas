import { useState, useRef, useEffect } from "react";
import {
  MapPin, Hash, Loader2, Navigation, AlertCircle,
  ShieldOff, WifiOff, Clock, CheckCircle2, ArrowRight, TriangleAlert,
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
  /** County resolved from center-point reverse geocode — needs user confirmation */
  | { status: "county_confirm"; jurisdiction: Jurisdiction }
  /** No county resolved at all — free-text manual entry */
  | { status: "county_ambiguous"; jurisdiction: Jurisdiction }
  | { status: "success"; jurisdiction: Jurisdiction };

type ZipState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "server_error"; message: string }
  /** County resolved from center-point reverse geocode — needs user confirmation */
  | { status: "county_confirm"; jurisdiction: Jurisdiction }
  /** No county resolved at all — free-text manual entry */
  | { status: "county_ambiguous"; jurisdiction: Jurisdiction }
  | { status: "success"; jurisdiction: Jurisdiction };

// Validate US ZIP codes (5 digits, optionally with 4-digit extension)
function isValidZip(zip: string): boolean {
  return /^\d{5}$/.test(zip);
}

/**
 * CountyConfirmPanel — shown when the server resolved a county via reverse
 * geocoding of the ZIP's center point.  The ZIP may span multiple counties so
 * the user must confirm the suggested county (or enter a different one) before
 * proceeding to county-specific guidance.
 */
function CountyConfirmPanel({
  jurisdiction,
  onConfirm,
  onSkip,
}: {
  jurisdiction: Jurisdiction;
  onConfirm: (county: string) => void;
  onSkip: () => void;
}) {
  const [showManual, setShowManual] = useState(false);
  const [manualCounty, setManualCounty] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showManual) {
      const t = setTimeout(() => manualInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showManual]);

  return (
    <div
      className="rounded-md border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3 text-left"
      data-testid="panel-county-confirm"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Confirm your county
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5 leading-relaxed">
            This ZIP code may span more than one county. Please confirm your
            county to continue with county-specific custody rules.
          </p>
        </div>
      </div>

      {!showManual ? (
        <div className="space-y-2">
          {/* Pre-selected primary county button */}
          <button
            onClick={() => onConfirm(jurisdiction.county)}
            className="w-full flex items-center gap-2.5 rounded-md border border-amber-300 dark:border-amber-600 bg-white dark:bg-background px-3 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            data-testid="button-county-primary"
          >
            <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {jurisdiction.county} County
              </p>
              <p className="text-xs text-muted-foreground">Primary county for this ZIP</p>
            </div>
          </button>

          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
            <button
              className="min-h-10 text-sm text-amber-700 dark:text-amber-300 underline underline-offset-2"
              onClick={() => setShowManual(true)}
              data-testid="button-county-different"
            >
              My county is different
            </button>
            <span className="hidden text-xs text-muted-foreground sm:inline">·</span>
            <button
              className="min-h-10 text-sm text-muted-foreground"
              onClick={onSkip}
              data-testid="button-county-skip"
            >
              Use {jurisdiction.state} laws only
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            ref={manualInputRef}
            placeholder="Enter your county name (e.g. Clayton)"
            value={manualCounty}
            onChange={(e) => setManualCounty(e.target.value)}
            className="bg-white dark:bg-background text-sm"
            data-testid="input-county-disambiguation"
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualCounty.trim()) onConfirm(manualCounty.trim());
            }}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="sm"
              disabled={!manualCounty.trim()}
              onClick={() => onConfirm(manualCounty.trim())}
              className="flex-1 text-sm h-10"
              data-testid="button-county-confirm"
            >
              Use {manualCounty.trim() ? `${manualCounty.trim()} County` : "This County"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowManual(false); setManualCounty(""); }}
              className="text-sm h-10"
            >
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * CountyDisambiguationPanel — fallback shown when no county could be resolved
 * at all (rare — forward and reverse geocoding both failed to find a county).
 * Requires free-text manual entry.
 */
function CountyDisambiguationPanel({
  jurisdiction,
  onConfirm,
  onSkip,
}: {
  jurisdiction: Jurisdiction;
  onConfirm: (county: string) => void;
  onSkip: () => void;
}) {
  const [county, setCounty] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="rounded-md border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3 text-left"
      data-testid="panel-county-ambiguous"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            County needed
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5 leading-relaxed">
            We found <strong>{jurisdiction.state}</strong>
            {jurisdiction.city ? `, near ${jurisdiction.city},` : ""} but
            couldn't determine your county from this ZIP. Enter your county for
            county-specific custody rules, or continue with statewide guidance.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Input
          ref={inputRef}
          placeholder="e.g. Fulton"
          value={county}
          onChange={(e) => setCounty(e.target.value)}
          className="bg-white dark:bg-background text-sm"
          data-testid="input-county-disambiguation"
          onKeyDown={(e) => {
            if (e.key === "Enter" && county.trim()) onConfirm(county.trim());
          }}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="sm"
            disabled={!county.trim()}
            onClick={() => onConfirm(county.trim())}
            className="flex-1 text-sm h-10"
            data-testid="button-county-confirm"
          >
            Use {county.trim() ? `${county.trim()} County` : "This County"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSkip}
            className="text-sm h-10 text-muted-foreground"
            data-testid="button-county-skip"
          >
            Continue with {jurisdiction.state} only
          </Button>
        </div>
      </div>
    </div>
  );
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
    body: JSON.stringify({ zipCode: zipCode.trim() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // Use the server's specific error message — it explains exactly what went wrong.
    throw new Error(data.error || `We couldn't determine your location from that ZIP code.`);
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
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Button size="sm" variant="outline" onClick={onRetry} className="text-sm h-10" data-testid="button-gps-retry">
            Try Again
          </Button>
          <Button size="sm" variant="ghost" onClick={onSwitchToZip} className="text-sm h-10" data-testid="button-switch-to-zip">
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
  const zipInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === "zip") {
      // Defer one tick so the input is in the DOM before focusing
      const id = setTimeout(() => zipInputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [activeTab]);

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
          if (!jurisdiction.county) {
            // No county at all — rare, requires manual entry
            setGpsState({ status: "county_ambiguous", jurisdiction });
          } else if (jurisdiction.countyIsApproximate) {
            // County was inferred from center-point reverse geocode — needs confirmation
            setGpsState({ status: "county_confirm", jurisdiction });
          } else {
            setGpsState({ status: "success", jurisdiction });
            commitJurisdiction(jurisdiction);
          }
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

  const commitJurisdiction = (jurisdiction: Jurisdiction) => {
    onJurisdictionFound(jurisdiction);
  };

  const handleCountyConfirm = (source: "zip" | "gps", base: Jurisdiction, county: string) => {
    const resolved: Jurisdiction = { ...base, county };
    if (source === "zip") setZipState({ status: "success", jurisdiction: resolved });
    else setGpsState({ status: "success", jurisdiction: resolved });
    commitJurisdiction(resolved);
  };

  const handleCountySkip = (source: "zip" | "gps", base: Jurisdiction) => {
    const resolved: Jurisdiction = { ...base, county: "" };
    if (source === "zip") setZipState({ status: "success", jurisdiction: resolved });
    else setGpsState({ status: "success", jurisdiction: resolved });
    commitJurisdiction(resolved);
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
      if (!jurisdiction.county) {
        // No county at all — rare, both forward and reverse geocode failed
        setZipState({ status: "county_ambiguous", jurisdiction });
      } else if (jurisdiction.countyIsApproximate) {
        // County resolved from center-point reverse geocode — needs user confirmation
        setZipState({ status: "county_confirm", jurisdiction });
      } else {
        setZipState({ status: "success", jurisdiction });
        commitJurisdiction(jurisdiction);
      }
    } catch (err: any) {
      setZipState({ status: "server_error", message: err.message || "We couldn't determine your location from that ZIP code." });
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
                  : gpsState.status === "county_confirm" || gpsState.status === "county_ambiguous"
                    ? "bg-amber-100 dark:bg-amber-900/30"
                    : "bg-primary/10"
              }`}
            >
              {gpsState.status === "loading" ? (
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              ) : gpsState.status === "success" ? (
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              ) : gpsState.status === "county_confirm" || gpsState.status === "county_ambiguous" ? (
                <TriangleAlert className="w-7 h-7 text-amber-500" />
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
                    : gpsState.status === "county_confirm"
                      ? "Confirm Your County"
                      : gpsState.status === "county_ambiguous"
                        ? "County Needed"
                        : "Use Your Current Location"}
              </h3>
              {gpsState.status === "idle" && (
                <p className="text-sm text-muted-foreground">
                  We'll use your device's GPS to automatically detect your state and county.
                </p>
              )}
              {gpsState.status === "loading" && (
                <p className="text-sm text-muted-foreground">
                  Please allow location access when prompted by your browser.
                </p>
              )}
              {gpsState.status === "success" && (
                <div className="text-sm text-muted-foreground space-y-0.5" data-testid="text-gps-result">
                  {gpsState.jurisdiction.city && (
                    <p>City: <span className="font-medium text-foreground">{gpsState.jurisdiction.city}</span></p>
                  )}
                  {gpsState.jurisdiction.county && (
                    <p>County: <span className="font-medium text-foreground">{gpsState.jurisdiction.county} County</span></p>
                  )}
                  <p>State: <span className="font-medium text-foreground">{gpsState.jurisdiction.state}</span></p>
                </div>
              )}
            </div>

            {/* County confirm — preselected county from reverse geocode, requires confirmation */}
            {gpsState.status === "county_confirm" && (
              <CountyConfirmPanel
                jurisdiction={gpsState.jurisdiction}
                onConfirm={(county) => handleCountyConfirm("gps", gpsState.jurisdiction, county)}
                onSkip={() => handleCountySkip("gps", gpsState.jurisdiction)}
              />
            )}

            {/* County disambiguation — fallback when even reverse geocode found no county */}
            {gpsState.status === "county_ambiguous" && (
              <CountyDisambiguationPanel
                jurisdiction={gpsState.jurisdiction}
                onConfirm={(county) => handleCountyConfirm("gps", gpsState.jurisdiction, county)}
                onSkip={() => handleCountySkip("gps", gpsState.jurisdiction)}
              />
            )}

            {/* Error states — each displays its own distinct UI */}
            <GpsErrorDisplay
              state={gpsState}
              onRetry={handleGpsDetect}
              onSwitchToZip={() => setActiveTab("zip")}
            />

            {gpsState.status !== "denied" &&
             gpsState.status !== "county_confirm" &&
             gpsState.status !== "county_ambiguous" && (
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
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto transition-colors ${
                zipState.status === "success"
                  ? "bg-emerald-100 dark:bg-emerald-900/30"
                  : zipState.status === "county_confirm" || zipState.status === "county_ambiguous"
                    ? "bg-amber-100 dark:bg-amber-900/30"
                    : "bg-primary/10"
              }`}
            >
              {zipState.status === "loading" ? (
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              ) : zipState.status === "success" ? (
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              ) : zipState.status === "county_confirm" || zipState.status === "county_ambiguous" ? (
                <TriangleAlert className="w-7 h-7 text-amber-500" />
              ) : (
                <Hash className="w-7 h-7 text-primary" />
              )}
            </div>

            <div className="text-center">
              <h3 className="font-semibold mb-1">
                {zipState.status === "county_confirm"
                  ? "Confirm Your County"
                  : zipState.status === "county_ambiguous"
                    ? "County Needed"
                    : "Enter Your ZIP Code"}
              </h3>
              {zipState.status !== "county_confirm" &&
               zipState.status !== "county_ambiguous" &&
               zipState.status !== "success" && (
                <p className="text-sm text-muted-foreground">
                  Enter your 5-digit ZIP code to find custody laws for your area.
                </p>
              )}
              {zipState.status === "success" && (
                <div className="text-sm text-muted-foreground space-y-0.5" data-testid="text-zip-result">
                  {zipState.jurisdiction.city && (
                    <p>City: <span className="font-medium text-foreground">{zipState.jurisdiction.city}</span></p>
                  )}
                  {zipState.jurisdiction.county && (
                    <p>County: <span className="font-medium text-foreground">{zipState.jurisdiction.county} County</span></p>
                  )}
                  <p>State: <span className="font-medium text-foreground">{zipState.jurisdiction.state}</span></p>
                </div>
              )}
            </div>

            {/* County confirm — preselected county from reverse geocode, requires confirmation */}
            {zipState.status === "county_confirm" && (
              <CountyConfirmPanel
                jurisdiction={zipState.jurisdiction}
                onConfirm={(county) => handleCountyConfirm("zip", zipState.jurisdiction, county)}
                onSkip={() => handleCountySkip("zip", zipState.jurisdiction)}
              />
            )}

            {/* County disambiguation — fallback when even reverse geocode found no county */}
            {zipState.status === "county_ambiguous" && (
              <CountyDisambiguationPanel
                jurisdiction={zipState.jurisdiction}
                onConfirm={(county) => handleCountyConfirm("zip", zipState.jurisdiction, county)}
                onSkip={() => handleCountySkip("zip", zipState.jurisdiction)}
              />
            )}

            {/* ZIP input form — hidden once a county panel or success is active */}
            {zipState.status !== "county_confirm" &&
             zipState.status !== "county_ambiguous" &&
             zipState.status !== "success" && (
              <form onSubmit={handleZipSubmit} className="space-y-2">
                <div className="space-y-1.5">
                  <Input
                    ref={zipInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="e.g. 90210"
                    value={zipCode}
                    onChange={handleZipChange}
                    maxLength={5}
                    disabled={isZipLoading}
                    aria-invalid={zipState.status === "invalid" || zipState.status === "server_error"}
                    aria-describedby="zip-error"
                    className={
                      zipState.status === "invalid" || zipState.status === "server_error"
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    }
                    data-testid="input-zip"
                  />

                  {/* Inline validation / lookup errors — shown under the input, not as toasts */}
                  {zipState.status === "invalid" && (
                    <div id="zip-error" className="flex items-center gap-1.5" data-testid="error-zip-invalid">
                      <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                      <p className="text-xs text-destructive">Please enter a valid 5-digit US ZIP code.</p>
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
                  disabled={zipCode.length < 5 || isZipLoading}
                  className="w-full"
                  data-testid="button-zip-submit"
                >
                  {isZipLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Looking Up ZIP Code...
                    </>
                  ) : (
                    <>
                      <MapPin className="w-4 h-4 mr-2" />
                      Find My Laws
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
