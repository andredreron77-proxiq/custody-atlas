import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FolderOpen, Hash, Scale } from "lucide-react";
import { getCaseAccent, getCaseInitials } from "@/lib/caseIdentity";

interface CaseContext {
  id?: string | null;
  title?: string | null;
  caseNumber?: string | null;
  jurisdiction?: string | null;
  status?: string | null;
}

export function CaseChip({ caseInfo, fallback = "General Workspace" }: { caseInfo?: CaseContext | null; fallback?: string }) {
  const accent = getCaseAccent(caseInfo?.id);
  const title = caseInfo?.title?.trim() || fallback;

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", accent.chip)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", accent.dot)} aria-hidden />
      <span className="truncate max-w-[200px]">{title}</span>
    </span>
  );
}

export function ActiveCaseIndicator({
  caseInfo,
  noCaseLabel = "General Workspace / No Case Selected",
}: {
  caseInfo?: CaseContext | null;
  noCaseLabel?: string;
}) {
  const accent = getCaseAccent(caseInfo?.id);
  const isCase = Boolean(caseInfo?.id);

  return (
    <div className={cn("rounded-lg border border-l-4 px-3 py-2", accent.border, accent.bg)} data-testid="active-case-indicator">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Active matter context</p>
      <div className="mt-1 flex items-center gap-2 min-w-0">
        <FolderOpen className="w-3.5 h-3.5 text-muted-foreground/80 flex-shrink-0" />
        <p className="text-sm font-medium truncate">{isCase ? caseInfo?.title : noCaseLabel}</p>
        {caseInfo?.caseNumber && (
          <Badge variant="outline" className="text-[10px] h-5 px-1.5">#{caseInfo.caseNumber}</Badge>
        )}
      </div>
      {(caseInfo?.jurisdiction || caseInfo?.status) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {caseInfo.jurisdiction ? <span>{caseInfo.jurisdiction}</span> : null}
          {caseInfo.status ? <span>• {caseInfo.status}</span> : null}
        </div>
      )}
    </div>
  );
}

export function CasePageHeader({ caseInfo }: { caseInfo: CaseContext }) {
  const accent = getCaseAccent(caseInfo.id);
  const title = caseInfo.title?.trim() || "Case";

  return (
    <div className={cn("rounded-xl border border-l-4 px-4 py-3", accent.border, accent.bg)} data-testid="case-page-identity-header">
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-md flex items-center justify-center text-xs font-semibold", accent.avatar)}>
          {getCaseInitials(title)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Case dashboard</p>
          <h1 className="text-lg font-semibold leading-tight truncate">{title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            {caseInfo.caseNumber && (
              <span className="inline-flex items-center gap-1 text-foreground/80">
                <Hash className="w-3 h-3" />
                {caseInfo.caseNumber}
              </span>
            )}
            {caseInfo.jurisdiction && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Scale className="w-3 h-3" />
                {caseInfo.jurisdiction}
              </span>
            )}
            {caseInfo.status && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">{caseInfo.status}</Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
