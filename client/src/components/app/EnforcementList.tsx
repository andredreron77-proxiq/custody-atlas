import { Shield, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EnforcementListProps {
  enforcementText: string;
  state: string;
}

/**
 * EnforcementList
 * Parses the enforcement_options string into a visual bulleted list.
 * Splits on sentence boundaries (". ") to render each option as a distinct item.
 *
 * Design decision: The JSON stores enforcement as a single paragraph for portability
 * (works with both file and DB backends). Parsing happens at render time only.
 */
function parseEnforcementOptions(text: string): string[] {
  return text
    .split(/\.\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10)
    .map((s) => (s.endsWith(".") ? s : `${s}.`));
}

export function EnforcementList({ enforcementText, state }: EnforcementListProps) {
  const items = parseEnforcementOptions(enforcementText);

  return (
    <Card data-testid="card-enforcement-list">
      <CardHeader className="pb-3 pt-5 px-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          Enforcement Options in {state}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="h-px bg-border mb-4" />
        <ul className="space-y-2.5" data-testid="list-enforcement-options">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 text-sm"
              data-testid={`enforcement-item-${i}`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed text-muted-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
