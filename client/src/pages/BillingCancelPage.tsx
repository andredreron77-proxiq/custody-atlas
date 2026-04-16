import { Link } from "wouter";
import { ArrowLeft, CircleSlash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BillingCancelPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-2xl border bg-card px-8 py-10 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CircleSlash2 className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
          No worries
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Your plan hasn&apos;t changed. You can keep using Custody Atlas on your current tier and upgrade any time.
        </p>
        <div className="mt-8">
          <Link href="/">
            <Button variant="outline" size="lg" className="min-w-48 gap-2">
              <ArrowLeft className="h-4 w-4" />
              Go back
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
