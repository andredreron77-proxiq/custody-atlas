/**
 * AuthRequiredCard
 *
 * Shown in place of a gated feature (Ask AI, Analyze Document, Workspace)
 * when no authenticated user is present.
 *
 * Design: clean, editorial, legal-tech. No emoji — Lucide icons only.
 * Centred inside the remaining page space below the header.
 */

import { Lock, LogIn, MessageSquare, FileSearch, LayoutDashboard, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";

type GatedFeature = "ask-ai" | "analyze-document" | "workspace";

const FEATURE_COPY: Record<
  GatedFeature,
  { title: string; description: string; Icon: typeof MessageSquare }
> = {
  "ask-ai": {
    title: "Ask Atlas requires a free account",
    description:
      "Get plain-English answers to your custody questions, tailored to your specific state and county.",
    Icon: MessageSquare,
  },
  "analyze-document": {
    title: "Document analysis requires a free account",
    description:
      "Upload custody orders and legal documents to get a plain-English summary with key terms and dates identified.",
    Icon: FileSearch,
  },
  workspace: {
    title: "Workspace requires a free account",
    description:
      "Your personal legal research hub — track documents, save questions, and keep notes on your custody case.",
    Icon: LayoutDashboard,
  },
};

interface AuthRequiredCardProps {
  feature: GatedFeature;
}

export function AuthRequiredCard({ feature }: AuthRequiredCardProps) {
  const { title, description, Icon } = FEATURE_COPY[feature];

  function handleSignIn() {
    window.dispatchEvent(new CustomEvent("custody-atlas:open-auth"));
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm flex flex-col items-center text-center gap-6">

        {/* Icon mark */}
        <div className="relative">
          <div
            className="w-16 h-16 rounded-2xl border border-border bg-card flex items-center justify-center shadow-xs"
            aria-hidden
          >
            <Icon className="w-7 h-7 text-muted-foreground/60" />
          </div>
          <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center shadow-xs">
            <Lock className="w-3 h-3 text-muted-foreground" />
          </span>
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h2 className="font-serif text-xl font-semibold text-foreground leading-snug">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>

        {/* CTA */}
        <Button
          className="w-full gap-2"
          onClick={handleSignIn}
          data-testid="button-sign-in-gate"
        >
          <LogIn className="w-4 h-4" />
          Create a free account
        </Button>

        {/* Trust footnote */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Scale className="w-3 h-3 flex-shrink-0" />
            <span>Free account. No credit card required.</span>
          </div>
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            Custody Atlas is a legal information tool, not a law firm.
            Always consult a licensed family law attorney for advice about your case.
          </p>
        </div>

      </div>
    </div>
  );
}
