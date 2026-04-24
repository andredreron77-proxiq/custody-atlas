/**
 * UpgradePromptCard — shown inline when a user hits their daily usage limit.
 */

import { Zap } from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UpgradeModal from "@/components/app/UpgradeModal";
import { useUsage } from "@/hooks/use-usage";
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
      "You've used your 10 free questions for this month. Upgrade to continue your custody conversation with higher limits and Pro-only features.",
  },
  document: {
    title: "You've reached your free analysis limit",
    description:
      "You've used your free document analysis. Upgrade to Pro for more monthly capacity and deeper case support.",
  },
};

export function UpgradePromptCard({ type, className }: UpgradePromptCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { usage } = useUsage();
  const isAnonymousQuestionLimit = usage?.tier === "anonymous" && type === "question";
  const copy = isAnonymousQuestionLimit
    ? {
        title: "You've reached your guest question limit",
        description:
          "You've used your 3 guest questions. Create a free account to keep going with 10 questions per month.",
      }
    : COPY[type];

  if (usage?.tier === "pro") {
    return null;
  }

  const handlePrimaryAction = () => {
    if (isAnonymousQuestionLimit) {
      window.dispatchEvent(new CustomEvent("custody-atlas:open-auth", {
        detail: { mode: "signup" },
      }));
      return;
    }
    setModalOpen(true);
  };

  return (
    <>
      <Card className={cn("border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30", className)}>
        <CardContent className="py-4 px-4 flex gap-3 items-start">
          <div className="w-8 h-8 rounded-md bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-3 min-w-0 flex-1">
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{copy.title}</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{copy.description}</p>
            </div>
            <Button size="sm" className="h-8" onClick={handlePrimaryAction}>
              {isAnonymousQuestionLimit ? "Create a free account" : "Upgrade to Pro"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {!isAnonymousQuestionLimit ? <UpgradeModal open={modalOpen} onOpenChange={setModalOpen} /> : null}
    </>
  );
}
