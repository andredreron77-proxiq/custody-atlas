import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Link } from "wouter";
import {
  Search, X, MessageSquare, Scale, Users, Gavel, MapPin,
  ArrowRight, Info, ChevronDown, Loader2, ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { CustodyLawRecord } from "@shared/schema";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const STATES_WITH_DATA = new Set([
  "Alabama", "Alaska", "Arizona", "California", "Colorado",
  "Florida", "Georgia", "Illinois", "Michigan", "New York",
  "North Carolina", "Ohio", "Pennsylvania", "Texas", "Virginia", "Washington",
]);

const ALL_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma",
  "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

const LAW_SECTIONS = [
  { key: "custody_standard" as const, label: "Custody Standard", icon: Scale, color: "text-blue-600" },
  { key: "custody_types" as const, label: "Custody Types", icon: Users, color: "text-violet-600" },
  { key: "modification_rules" as const, label: "Modification Rules", icon: Gavel, color: "text-amber-600" },
  { key: "relocation_rules" as const, label: "Relocation Rules", icon: MapPin, color: "text-orange-600" },
];

function StateFill({
  stateName,
  selectedState,
  hoveredState,
}: {
  stateName: string;
  selectedState: string | null;
  hoveredState: string | null;
}) {
  const hasData = STATES_WITH_DATA.has(stateName);
  const isSelected = selectedState === stateName;
  const isHovered = hoveredState === stateName;

  if (isSelected) return "#1d4ed8";
  if (isHovered) return hasData ? "#3b82f6" : "#94a3b8";
  if (hasData) return "#bfdbfe";
  return "#e2e8f0";
}

interface StateLawPanelProps {
  stateName: string;
  onClose: () => void;
}

function StateLawPanel({ stateName, onClose }: StateLawPanelProps) {
  const hasData = STATES_WITH_DATA.has(stateName);

  const { data: law, isLoading } = useQuery<CustodyLawRecord>({
    queryKey: ["/api/custody-laws", stateName],
    queryFn: async () => {
      const res = await fetch(`/api/custody-laws/${encodeURIComponent(stateName)}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: hasData,
    staleTime: 5 * 60 * 1000,
  });

  const askAIPath = `/ask?state=${encodeURIComponent(stateName)}&county=general&country=United%20States`;
  const fullDetailsPath = `/jurisdiction/${encodeURIComponent(stateName)}/general`;

  return (
    <div className="flex flex-col h-full" data-testid={`panel-state-${stateName.toLowerCase().replace(/\s+/g, "-")}`}>
      {/* Panel header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-foreground" data-testid="text-panel-state-name">
              {stateName}
            </h2>
            {hasData ? (
              <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                Detailed data available
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Coming soon
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasData ? "Custody law summary for this state" : "Data not yet available for this state"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="flex-shrink-0 -mt-1 -mr-1"
          data-testid="button-close-panel"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {!hasData && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-8">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Info className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm mb-1">Data coming soon for {stateName}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We're working on adding detailed custody law data for this state.
              You can still ask our AI general questions.
            </p>
          </div>
          <Link href={askAIPath}>
            <Button className="gap-2" data-testid="button-ask-ai-no-data">
              <MessageSquare className="w-4 h-4" />
              Ask AI About {stateName}
            </Button>
          </Link>
        </div>
      )}

      {hasData && isLoading && (
        <div className="flex-1 flex items-center justify-center gap-2 py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading custody laws…</span>
        </div>
      )}

      {hasData && law && (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {LAW_SECTIONS.map(({ key, label, icon: Icon, color }) => (
            <div key={key} className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className={`w-3.5 h-3.5 ${color} flex-shrink-0`} />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </h3>
              </div>
              <p className="text-sm text-foreground leading-relaxed" data-testid={`text-panel-${key}`}>
                {truncate(law[key], 220)}
              </p>
            </div>
          ))}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-1 pb-2">
            <Link href={askAIPath}>
              <Button className="w-full gap-2" data-testid="button-ask-ai-state">
                <MessageSquare className="w-4 h-4" />
                Ask about custody law in {stateName}
              </Button>
            </Link>
            <Link href={fullDetailsPath}>
              <Button variant="outline" className="w-full gap-2" data-testid="button-view-details">
                <ExternalLink className="w-4 h-4" />
                View full law details
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustodyMapPage() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const filteredStates = searchQuery.trim()
    ? ALL_STATES.filter((s) =>
        s.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  const handleStateClick = (stateName: string) => {
    setSelectedState(stateName);
    if (panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const handleSearchSelect = (stateName: string) => {
    setSelectedState(stateName);
    setSearchQuery(stateName);
    setShowDropdown(false);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSelectedState(null);
    setShowDropdown(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold mb-1" data-testid="heading-custody-map">
          Custody Law Map
        </h1>
        <p className="text-muted-foreground text-sm">
          Explore how custody laws differ across states. Click any state to see a summary.
        </p>
      </div>

      {/* Legend row + Search bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#bfdbfe] border border-[#93c5fd] inline-block" />
            <span className="text-xs text-muted-foreground">Data available ({STATES_WITH_DATA.size} states)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#e2e8f0] border border-[#cbd5e1] inline-block" />
            <span className="text-xs text-muted-foreground">Coming soon</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#1d4ed8] inline-block" />
            <span className="text-xs text-muted-foreground">Selected</span>
          </div>
        </div>

        {/* Search */}
        <div ref={searchRef} className="relative w-full sm:w-64" data-testid="search-state-container">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => searchQuery && setShowDropdown(true)}
              placeholder="Search your state…"
              className="pl-9 pr-9 text-sm bg-card"
              data-testid="input-search-state"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="button-clear-search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {showDropdown && filteredStates.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg z-50 overflow-hidden"
              data-testid="search-dropdown"
            >
              {filteredStates.map((state) => (
                <button
                  key={state}
                  onClick={() => handleSearchSelect(state)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 text-left transition-colors"
                  data-testid={`search-option-${state.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <span>{state}</span>
                  {STATES_WITH_DATA.has(state) ? (
                    <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 ml-2">Data</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground ml-2">Soon</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content: map + panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">

        {/* Map card */}
        <Card className="overflow-hidden shadow-md" data-testid="card-map">
          <CardContent className="p-0">
            {hoveredState && (
              <div className="px-4 pt-3 pb-1 border-b bg-muted/30 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium" data-testid="text-hovered-state">{hoveredState}</span>
                {STATES_WITH_DATA.has(hoveredState) ? (
                  <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 ml-1">Click to view</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">· Coming soon</span>
                )}
              </div>
            )}
            {!hoveredState && (
              <div className="px-4 pt-3 pb-1 border-b bg-muted/30">
                <span className="text-xs text-muted-foreground">
                  Hover over a state to preview · Click to open details
                </span>
              </div>
            )}
            <ComposableMap
              projection="geoAlbersUsa"
              style={{ width: "100%", height: "auto" }}
              data-testid="svg-map"
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const stateName: string = geo.properties.name;
                    const fill = StateFill({ stateName, selectedState, hoveredState });
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke="#ffffff"
                        strokeWidth={0.75}
                        style={{
                          default: { outline: "none", cursor: "pointer", transition: "fill 0.15s ease" },
                          hover: { outline: "none", cursor: "pointer", opacity: 0.9 },
                          pressed: { outline: "none", opacity: 0.8 },
                        }}
                        onClick={() => handleStateClick(stateName)}
                        onMouseEnter={() => setHoveredState(stateName)}
                        onMouseLeave={() => setHoveredState(null)}
                        data-testid={`state-${stateName.toLowerCase().replace(/\s+/g, "-")}`}
                        aria-label={stateName}
                      />
                    );
                  })
                }
              </Geographies>
            </ComposableMap>
          </CardContent>
        </Card>

        {/* Side panel */}
        <div ref={panelRef} data-testid="panel-container">
          {selectedState ? (
            <Card className="shadow-md" data-testid="card-state-panel">
              <CardContent className="p-5 min-h-[400px] flex flex-col">
                <StateLawPanel
                  stateName={selectedState}
                  onClose={() => setSelectedState(null)}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-sm border-dashed" data-testid="card-panel-empty">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-4 min-h-[300px]">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Scale className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="font-semibold mb-1">Select a state</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Click any state on the map or use the search bar to explore custody laws.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Quick access — states with data
                  </p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {[...STATES_WITH_DATA].slice(0, 8).map((state) => (
                      <button
                        key={state}
                        onClick={() => handleStateClick(state)}
                        className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                        data-testid={`quick-state-${state.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {state}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Trust message */}
      <div className="rounded-xl border bg-card p-4 flex gap-3 items-start shadow-sm" data-testid="card-trust-message">
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Info className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Custody laws vary by state. Custody Atlas provides plain-English explanations to help you understand
          the rules that may apply where you live. For advice specific to your situation, always consult a
          licensed family law attorney.
        </p>
      </div>

      {/* Bottom CTA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="shadow-sm hover-elevate" data-testid="card-cta-ai">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Ask an AI question</p>
              <p className="text-xs text-muted-foreground">Get plain-English answers about custody law</p>
            </div>
            <Link href="/ask">
              <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" data-testid="button-cta-ask">
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover-elevate" data-testid="card-cta-location">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Use my location</p>
              <p className="text-xs text-muted-foreground">Auto-detect your state and county</p>
            </div>
            <Link href="/location">
              <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" data-testid="button-cta-location">
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
