/**
 * UpgradePromptCard — shown inline when a user hits their daily usage limit.
 */

import { Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type LimitType = "question" | "document";

interface UpgradePromptCardProps {
  type: LimitType;
  className?: string;
}

const COPY: Record<LimitType, { title: string; description: string }> = {
  question: {
    title: "You've reached your free question limit",
    description:
      "You've used your 5 free questions for today. Upgrade to continue your custody conversation, or come back tomorrow when your limit resets.",
  },
  document: {
    title: "You've reached your free analysis limit",
    description:
      "You've used your free document analysis for today. Upgrade to Pro for 10 analyses per day, or come back tomorrow.",
  },
};

export function UpgradePromptCard({ type, className }: UpgradePromptCardProps) {
  const copy = COPY[type];

  return (
    <Card className={cn("border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30", className)}>
      <CardContent className="py-4 px-4 flex gap-3 items-start">
        <div className="w-8 h-8 rounded-md bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{copy.title}</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{copy.description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
