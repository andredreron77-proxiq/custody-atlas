import { FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CaseScopeBadgeProps {
  caseTitle?: string | null;
  className?: string;
}

export function CaseScopeBadge({ caseTitle, className }: CaseScopeBadgeProps) {
  const label = caseTitle
    ? `Answering from: ${caseTitle}`
    : "General Workspace";

  return (
    <Badge
      variant="outline"
      className={className ?? "inline-flex items-center gap-1.5 text-[11px] font-medium"}
      data-testid="badge-case-scope"
    >
      <FolderOpen className="w-3 h-3" />
      {label}
    </Badge>
  );
}
