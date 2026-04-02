import type { ReactNode } from "react";

interface WorkspaceHeaderSectionProps {
  title: string;
  description: string;
  right?: ReactNode;
  summary?: ReactNode;
}

export function WorkspaceHeaderSection({
  title,
  description,
  right,
  summary,
}: WorkspaceHeaderSectionProps) {
  return (
    <section className="space-y-4" data-testid="workspace-v0-header">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground" data-testid="heading-workspace">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {right ? <div className="flex items-center gap-2">{right}</div> : null}
      </div>
      {summary}
    </section>
  );
}

export function WorkspaceMainLayout({
  primary,
  secondary,
}: {
  primary: ReactNode;
  secondary: ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 xl:grid-cols-3 gap-6" data-testid="workspace-v0-main-layout">
      <div className="xl:col-span-2 space-y-6">{primary}</div>
      <aside className="space-y-6">{secondary}</aside>
    </section>
  );
}

export function WorkspacePrimaryGroup({ children }: { children: ReactNode }) {
  return <div className="space-y-6" data-testid="workspace-v0-primary-group">{children}</div>;
}

export function WorkspaceSecondaryGroup({ children }: { children: ReactNode }) {
  return <div className="space-y-6" data-testid="workspace-v0-secondary-group">{children}</div>;
}
