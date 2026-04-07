import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WorkspaceHeaderProps {
  activeCaseName: string | null;
  caseCount: number;
  timelineEventCount: number;
  activeCaseId?: string;
  preferredName?: string | null;
  cases: Array<{ id: string; title: string }>;
  onSelectCase: (caseId: string) => void;
  onCreateCase: () => void;
}

export function WorkspaceHeader({
  activeCaseName,
  caseCount,
  timelineEventCount,
  activeCaseId,
  preferredName,
  cases,
  onSelectCase,
  onCreateCase,
}: WorkspaceHeaderProps) {
  const hasActiveCase = !!activeCaseName;

  return (
    <div className="sticky top-2 z-10 rounded-xl border border-border/70 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-sm px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground" data-testid="text-header-display-name">
            {preferredName ? `${preferredName}'s Workspace` : "Active Workspace"}
          </p>
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

        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8" onClick={onCreateCase} data-testid="button-create-case">
            Create Case
          </Button>
          <Select
            value={activeCaseId ?? "all"}
            onValueChange={(value) => onSelectCase(value)}
          >
            <SelectTrigger className="w-[210px] h-8" data-testid="button-switch-case">
              <SelectValue placeholder="Switch case" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workspace documents</SelectItem>
              {cases.map((caseRecord) => (
                <SelectItem key={caseRecord.id} value={caseRecord.id}>
                  {caseRecord.title || "Untitled Case"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap" data-testid="workspace-context-row">
        <Badge variant="outline" className="text-[11px] font-medium normal-case">
          {timelineEventCount} recent event{timelineEventCount === 1 ? "" : "s"}
        </Badge>
        <Badge variant="outline" className="text-[11px] font-medium normal-case">
          {hasActiveCase ? "Case linked" : "General workspace"}
        </Badge>
        <Badge variant="outline" className="text-[11px] font-medium normal-case">
          {caseCount} case{caseCount === 1 ? "" : "s"}
        </Badge>
      </div>
    </div>
  );
}
