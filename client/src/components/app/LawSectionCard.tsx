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
 * Splits a block of legal text into individual sentences for readable rendering.
 * Returns the lead sentence separately so it can be styled as a summary.
 */
function parseSentences(text: string): { lead: string; rest: string[] } {
  const raw = text
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Always keep as plain paragraph if only one sentence,
  // or if the total text is short (under 220 chars).
  if (raw.length <= 1 || text.length < 220) return { lead: text, rest: [] };

  const [lead, ...rest] = raw;
  return { lead: lead.endsWith(".") ? lead : `${lead}.`, rest };
}

/**
 * LawSectionCard
 * A collapsible card that displays one section of state custody law.
 * Long content (3+ sentences) is rendered with a lead sentence and a bullet list
 * so dense legal text stays scannable.
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
  const { lead, rest } = parseSentences(content);
  const cardTestId = testId ?? `card-law-section-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <Card
      className="overflow-hidden"
      data-testid={cardTestId}
    >
      <CardHeader
        className="py-4 px-5 cursor-pointer select-none hover:bg-muted/30 transition-colors"
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
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
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
        <CardContent className="px-5 pb-5 pt-0 animate-fade-in">
          <div className="h-px bg-border mb-4" />

          {rest.length === 0 ? (
            /* Short content — render as a plain paragraph */
            <p
              className="text-sm leading-relaxed text-muted-foreground"
              data-testid={`${cardTestId}-content`}
            >
              {content}
            </p>
          ) : (
            /* Long content — lead sentence + sentence-level bullet list */
            <div data-testid={`${cardTestId}-content`} className="space-y-3">
              <p className="text-sm font-medium text-foreground leading-relaxed">
                {lead}
              </p>
              <ul className="space-y-2 pl-1">
                {rest.map((sentence, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                    <span className="text-sm leading-relaxed text-muted-foreground">
                      {sentence}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
