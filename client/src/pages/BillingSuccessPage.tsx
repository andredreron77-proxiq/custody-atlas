import { Link } from "wouter";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BillingSuccessPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-emerald-200 bg-emerald-50/70 px-8 py-10 text-center shadow-sm dark:border-emerald-800/50 dark:bg-emerald-950/20">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium uppercase tracking-[0.18em]">Billing updated</span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          You're now on Pro!
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Your subscription is active and Pro features are ready. You can head back to your workspace and keep moving.
        </p>
        <div className="mt-8">
          <Link href="/workspace">
            <Button size="lg" className="min-w-48">
              Go to workspace
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
