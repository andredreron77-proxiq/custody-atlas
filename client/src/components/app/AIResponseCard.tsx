/**
 * AIResponseCard.tsx
 *
 * Reusable renderer for an AILegalResponse object.
 * Used by the public Q&A page to display structured AI answers cleanly.
 * Mirrors the section layout used inside ChatBox but as a standalone card.
 */

import {
  FileText, ChevronRight, AlertTriangle, HelpCircle, Scale,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AILegalResponse } from "@shared/schema";

interface AIResponseCardProps {
  response: AILegalResponse;
}

export function AIResponseCard({ response }: AIResponseCardProps) {
  const proseResponse = response.prose_response?.trim() ?? "";
  const keyPoints = response.key_points ?? [];
  return (
    <div className="space-y-5" data-testid="section-ai-response">
      {/* Summary */}
      {response.summary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex gap-3">
              <Scale className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm leading-relaxed text-foreground" data-testid="text-ai-summary">
                {response.summary}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {proseResponse && (
        <div className="space-y-3">
          {proseResponse
            .split(/\n{2,}/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean)
            .map((paragraph, i) => (
              <p key={i} className="text-sm leading-relaxed text-foreground">
                {paragraph}
              </p>
            ))}
        </div>
      )}

      {/* Key points */}
      {!proseResponse && keyPoints.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Key Points
          </h2>
          <ul className="space-y-2">
            {keyPoints.map((point, i) => (
              <li
                key={i}
                className="flex gap-2.5 text-sm leading-relaxed"
                data-testid={`text-key-point-${i}`}
              >
                <ChevronRight className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cautions */}
      {response.cautions?.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-4">
            <div className="flex gap-2.5 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Things to Be Aware Of
              </h2>
            </div>
            <ul className="space-y-1.5 ml-6">
              {response.cautions.map((caution, i) => (
                <li
                  key={i}
                  className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed list-disc"
                  data-testid={`text-caution-${i}`}
                >
                  {caution}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Questions to ask attorney */}
      {response.questions_to_ask_attorney?.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary" />
            Questions to Ask an Attorney
          </h2>
          <ul className="space-y-2">
            {response.questions_to_ask_attorney.map((q, i) => (
              <li
                key={i}
                className="text-sm text-muted-foreground leading-relaxed pl-4 border-l-2 border-primary/30"
                data-testid={`text-attorney-question-${i}`}
              >
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      {response.disclaimer && (
        <p
          className="text-xs text-muted-foreground border-t border-border/40 pt-4 leading-relaxed"
          data-testid="text-disclaimer"
        >
          {response.disclaimer}
        </p>
      )}
    </div>
  );
}
