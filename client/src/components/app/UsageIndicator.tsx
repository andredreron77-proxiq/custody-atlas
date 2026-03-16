/**
 * UsageIndicator — shows daily question and document usage progress bars.
 * Hidden when the user is not signed in.
 */

import { MessageSquare, FileSearch } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { fetchUsageState } from "@/services/usageService";
import type { UsageState } from "@/services/usageService";
import { cn } from "@/lib/utils";

interface UsageIndicatorProps {
  compact?: boolean;
}

export function UsageIndicator({ compact = false }: UsageIndicatorProps) {
  const { data: usage } = useQuery<UsageState>({
    queryKey: ["/api/usage"],
    queryFn: fetchUsageState,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  if (!usage || !usage.isAuthenticated) return null;

  const qPct = usage.questionsLimit
    ? Math.min((usage.questionsUsed / usage.questionsLimit) * 100, 100)
    : 0;
  const dPct = usage.documentsLimit
    ? Math.min((usage.documentsUsed / usage.documentsLimit) * 100, 100)
    : 0;

  const qAtLimit = usage.questionsLimit !== null && usage.questionsUsed >= usage.questionsLimit;
  const dAtLimit = usage.documentsLimit !== null && usage.documentsUsed >= usage.documentsLimit;

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3 h-3" />
          <span className={cn(qAtLimit && "text-red-400 font-medium")}>
            {usage.questionsUsed}/{usage.questionsLimit ?? "∞"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <FileSearch className="w-3 h-3" />
          <span className={cn(dAtLimit && "text-red-400 font-medium")}>
            {usage.documentsUsed}/{usage.documentsLimit ?? "∞"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[130px]" data-testid="usage-indicator">
      <UsageBar
        icon={<MessageSquare className="w-3 h-3" />}
        label="Questions"
        used={usage.questionsUsed}
        limit={usage.questionsLimit}
        pct={qPct}
        atLimit={qAtLimit}
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
  );
}

function UsageBar({
  icon,
  label,
  used,
  limit,
  pct,
  atLimit,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number | null;
  pct: number;
  atLimit: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("text-slate-400 flex-shrink-0", atLimit && "text-red-400")}>{icon}</span>
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center justify-between">
          <span className={cn("text-[10px] leading-none text-slate-400", atLimit && "text-red-400")}>
            {label}
          </span>
          <span className={cn("text-[10px] leading-none tabular-nums text-slate-500", atLimit && "text-red-400 font-medium")}>
            {used}/{limit ?? "∞"}
          </span>
        </div>
        <Progress
          value={pct}
          className={cn("h-1 bg-white/10", atLimit && "[&>div]:bg-red-500")}
        />
      </div>
    </div>
  );
}
