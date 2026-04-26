/**
 * UsageIndicator — shows daily question and document usage progress bars.
 * Hidden when the user is not signed in.
 */

import { MessageSquare, FileSearch } from "lucide-react";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { fetchUsageState } from "@/services/usageService";
import type { UsageState } from "@/services/usageService";
import { cn } from "@/lib/utils";
import UpgradeModal from "@/components/app/UpgradeModal";

interface UsageIndicatorProps {
  compact?: boolean;
}

export function UsageIndicator({ compact = false }: UsageIndicatorProps) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { data: usage } = useQuery<UsageState>({
    queryKey: ["/api/usage"],
    queryFn: fetchUsageState,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  if (!usage || !usage.isAuthenticated) return null;

  const isFreeUser = usage.tier === "free";
  const qPct = usage.questionsLimit
    ? Math.min((usage.questionsUsed / usage.questionsLimit) * 100, 100)
    : 0;
  const dPct = usage.documentsLimit
    ? Math.min((usage.documentsUsed / usage.documentsLimit) * 100, 100)
    : 0;

  const qAtLimit = usage.questionsLimit !== null && usage.questionsUsed >= usage.questionsLimit;
  const dAtLimit = usage.documentsLimit !== null && usage.documentsUsed >= usage.documentsLimit;
  const showUpgradePrompt = isFreeUser && usage.questionsUsed >= 3;
  const isUpgradeUrgent = isFreeUser && usage.questionsUsed >= 8;

  if (compact) {
    return (
      <>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3 h-3" />
          <span className={cn((qAtLimit || isUpgradeUrgent) && "text-amber-400 font-medium")}>
            {usage.questionsUsed}/{usage.questionsLimit ?? "∞"}
          </span>
          {showUpgradePrompt ? (
            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              className={cn(
                "text-xs font-medium text-[#b5922f] hover:underline",
                isUpgradeUrgent && "rounded-full border border-[#dcc98a] px-2 py-0.5 no-underline hover:no-underline",
              )}
            >
              Upgrade
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <FileSearch className="w-3 h-3" />
          <span className={cn(dAtLimit && "text-red-400 font-medium")}>
            {usage.documentsUsed}/{usage.documentsLimit ?? "∞"}
          </span>
        </div>
      </div>
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      </>
    );
  }

  return (
    <>
    <div className="flex flex-col gap-1.5 min-w-[130px]" data-testid="usage-indicator">
      <UsageBar
        icon={<MessageSquare className="w-3 h-3" />}
        label="Questions"
        used={usage.questionsUsed}
        limit={usage.questionsLimit}
        pct={qPct}
        atLimit={qAtLimit}
        highlight={isUpgradeUrgent}
        showUpgradePrompt={showUpgradePrompt}
        urgentUpgrade={isUpgradeUrgent}
        onUpgrade={() => setUpgradeOpen(true)}
      />
      <UsageBar
        icon={<FileSearch className="w-3 h-3" />}
        label="Docs"
        used={usage.documentsUsed}
        limit={usage.documentsLimit}
        pct={dPct}
        atLimit={dAtLimit}
      />
    </div>
    <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </>
  );
}

function UsageBar({
  icon,
  label,
  used,
  limit,
  pct,
  atLimit,
  highlight = false,
  showUpgradePrompt = false,
  urgentUpgrade = false,
  onUpgrade,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number | null;
  pct: number;
  atLimit: boolean;
  highlight?: boolean;
  showUpgradePrompt?: boolean;
  urgentUpgrade?: boolean;
  onUpgrade?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("text-slate-400 flex-shrink-0", (atLimit || highlight) && "text-amber-500")}>{icon}</span>
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center justify-between">
          <span className={cn("text-[10px] leading-none text-slate-400", (atLimit || highlight) && "text-amber-500")}>
            {label}
          </span>
          <div className="flex items-center gap-1.5">
            <span className={cn("text-[10px] leading-none tabular-nums text-slate-500", (atLimit || highlight) && "text-amber-500 font-medium")}>
              {used}/{limit ?? "∞"}
            </span>
            {showUpgradePrompt ? (
              <button
                type="button"
                onClick={onUpgrade}
                className={cn(
                  "text-xs font-medium text-[#b5922f] hover:underline",
                  urgentUpgrade && "rounded-full border border-[#dcc98a] px-2 py-0.5 no-underline hover:no-underline",
                )}
              >
                Upgrade
              </button>
            ) : null}
          </div>
        </div>
        <Progress
          value={pct}
          className={cn("h-1 bg-white/10", (atLimit || highlight) && "[&>div]:bg-amber-500")}
        />
      </div>
    </div>
  );
}
