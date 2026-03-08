import { useState } from "react";
import { Scale, Users, RefreshCw, Truck, Shield, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { CustodyLaw } from "@shared/schema";

const SECTIONS = [
  {
    key: "custodyStandard" as keyof CustodyLaw,
    icon: Scale,
    title: "Custody Standard",
    description: "How courts decide custody",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    key: "custodyTypes" as keyof CustodyLaw,
    icon: Users,
    title: "Custody Types",
    description: "Forms of custody available",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-950/30",
  },
  {
    key: "modificationRules" as keyof CustodyLaw,
    icon: RefreshCw,
    title: "Modification Rules",
    description: "How to change existing orders",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  {
    key: "relocationRules" as keyof CustodyLaw,
    icon: Truck,
    title: "Relocation Rules",
    description: "Moving with your child",
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/30",
  },
  {
    key: "enforcementOptions" as keyof CustodyLaw,
    icon: Shield,
    title: "Enforcement Options",
    description: "When orders are violated",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
];

interface LawSummarySectionProps {
  law: CustodyLaw;
  state: string;
}

function SectionCard({ section, content }: { section: typeof SECTIONS[0]; content: string }) {
  const [expanded, setExpanded] = useState(true);
  const Icon = section.icon;

  return (
    <Card data-testid={`card-law-${section.key}`}>
      <CardHeader className="pb-0">
        <button
          className="flex items-center justify-between w-full text-left gap-3"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-toggle-${section.key}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${section.bg}`}>
              <Icon className={`w-4.5 h-4.5 ${section.color}`} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm">{section.title}</h3>
              <p className="text-xs text-muted-foreground">{section.description}</p>
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-4 pb-5">
          <p className="text-sm text-foreground leading-relaxed" data-testid={`text-law-${section.key}`}>
            {content}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

export function LawSummarySection({ law, state }: LawSummarySectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">{state} Custody Laws</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overview of child custody law in {state}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <SectionCard
            key={section.key}
            section={section}
            content={law[section.key]}
          />
        ))}
      </div>
    </div>
  );
}
