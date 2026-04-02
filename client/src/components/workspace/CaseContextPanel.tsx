import { Badge } from "@/components/ui/badge";
import { Panel, PanelContent, PanelHeader } from "@/components/app/ProductLayout";
import { Scale } from "lucide-react";

interface CaseContextPanelProps {
  activeCaseName: string | null;
  caseIdParam?: string;
  caseCount: number;
  timelineEventCount: number;
  children: React.ReactNode;
}

export function CaseContextPanel({
  activeCaseName,
  caseIdParam,
  caseCount,
  timelineEventCount,
  children,
}: CaseContextPanelProps) {
  return (
    <Panel testId="panel-case-context" className="border-border/40 bg-muted/20">
      <PanelHeader
        icon={Scale}
        label="Case Context"
        meta={<Badge variant="outline" className="text-[10px] h-5 px-1.5">{timelineEventCount} recent events</Badge>}
      />
      <PanelContent className="space-y-2.5 p-3">
        <div className="rounded-lg border border-border/50 bg-background/80 p-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Case Summary</p>
          <p className="text-sm font-semibold mt-0.5">{activeCaseName ?? "General Workspace"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {caseIdParam ? `Case #${caseIdParam.slice(0, 8)}...` : "Case #: Not selected"}
          </p>
          <p className="text-xs text-muted-foreground">Court: Not specified</p>
          <p className="text-xs text-muted-foreground">Tracked cases: {caseCount}</p>
        </div>
        {children}
      </PanelContent>
    </Panel>
  );
}
