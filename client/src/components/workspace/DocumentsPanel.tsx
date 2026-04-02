import { Badge } from "@/components/ui/badge";
import { Panel, PanelContent, PanelHeader } from "@/components/app/ProductLayout";
import { FileText } from "lucide-react";

interface DocumentsPanelProps {
  groupedCaseCount: number;
  children: React.ReactNode;
}

export function DocumentsPanel({ groupedCaseCount, children }: DocumentsPanelProps) {
  return (
    <Panel testId="card-workspace-documents" className="border-border/50 bg-card shadow-sm">
      <PanelHeader
        icon={FileText}
        label="Documents"
        meta={<Badge variant="outline" className="text-[10px] h-5 px-1.5">{groupedCaseCount} groups</Badge>}
      />
      <PanelContent className="p-3">{children}</PanelContent>
    </Panel>
  );
}
