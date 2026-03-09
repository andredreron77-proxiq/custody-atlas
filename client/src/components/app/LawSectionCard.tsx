import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface LawSectionCardProps {
  title: string;
  content: string;
  icon: LucideIcon;
  defaultExpanded?: boolean;
  accentColor?: string;
  testId?: string;
}

/**
 * LawSectionCard
 * A collapsible card that displays one section of state custody law.
 * Each law category (custody standard, types, modification rules, etc.) maps to one card.
 *
 * To add a new law section:
 * 1. Add the field to CustodyLawRecord in shared/schema.ts
 * 2. Add the field to custody_laws.json for each state
 * 3. Render a new <LawSectionCard> in JurisdictionPage with the appropriate icon and title
 */
export function LawSectionCard({
  title,
  content,
  icon: Icon,
  defaultExpanded = false,
  accentColor = "text-primary",
  testId,
}: LawSectionCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Card
      className="overflow-hidden"
      data-testid={testId ?? `card-law-section-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <CardHeader
        className="py-4 px-5 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-4 h-4 ${accentColor}`} />
            </div>
            <span className="font-semibold text-sm">{title}</span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="px-5 pb-5 pt-0">
          <div className="h-px bg-border mb-4" />
          <p
            className="text-sm leading-relaxed text-muted-foreground"
            data-testid={`${testId ?? `card-law-section-${title.toLowerCase().replace(/\s+/g, "-")}`}-content`}
          >
            {content}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
