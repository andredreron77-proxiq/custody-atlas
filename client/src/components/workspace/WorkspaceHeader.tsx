import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderOpen, ChevronsUpDown } from "lucide-react";

interface WorkspaceHeaderProps {
  activeCaseName: string | null;
  caseCount: number;
  timelineEventCount: number;
  activeCaseId?: string;
}

export function WorkspaceHeader({ activeCaseName, caseCount, timelineEventCount, activeCaseId }: WorkspaceHeaderProps) {
  const hasActiveCase = !!activeCaseName;

  return (
    <div className="sticky top-2 z-10 rounded-xl border border-border/70 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-sm px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Active Workspace</p>
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 text-primary/70 flex-shrink-0" />
            <h1 className="text-lg md:text-xl font-semibold truncate" data-testid="heading-workspace">
              {activeCaseName ?? "General Workspace"}
            </h1>
            <Badge variant={hasActiveCase ? "default" : "secondary"} className="text-[10px] uppercase tracking-wide">
              {hasActiveCase ? "Active" : "None"}
            </Badge>
          </div>
        </div>

        <Button variant="outline" size="sm" className="gap-1.5 h-8" data-testid="button-switch-case">
          <ChevronsUpDown className="w-3.5 h-3.5" />
          Switch case
          <span className="text-[10px] text-muted-foreground">({caseCount})</span>
        </Button>
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap" data-testid="workspace-context-row">
        <Badge variant="outline" className="text-[11px] font-medium normal-case">
          {timelineEventCount} recent event{timelineEventCount === 1 ? "" : "s"}
        </Badge>
        <Badge variant="outline" className="text-[11px] font-medium normal-case">
          {hasActiveCase ? "Case linked" : "General workspace"}
        </Badge>
        {activeCaseId && (
          <Badge variant="outline" className="text-[11px] font-medium normal-case">
            ID: {activeCaseId.slice(0, 8)}…
          </Badge>
        )}
      </div>
    </div>
  );
}
