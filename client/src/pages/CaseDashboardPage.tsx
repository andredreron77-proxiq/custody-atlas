import { Link, useParams } from "wouter";

export default function CaseDashboardPage() {
  const { caseId } = useParams<{ caseId: string }>();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4" data-testid="page-case-dashboard-placeholder">
      <nav className="text-sm text-muted-foreground">
        <Link href="/workspace">Workspace</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Case {caseId}</span>
      </nav>

      <div className="rounded-xl border bg-card p-6">
        <h1 className="text-2xl font-semibold mb-2">Case Dashboard coming soon</h1>
        <p className="text-sm text-muted-foreground">
          You can already create cases and assign documents. Full case insights and timeline tools are on the way.
        </p>
      </div>
    </div>
  );
}
