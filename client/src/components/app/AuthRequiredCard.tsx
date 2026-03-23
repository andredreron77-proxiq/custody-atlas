/**
 * AuthRequiredCard
 *
 * Shown in place of a gated feature (Ask AI, Analyze Document, Workspace)
 * when no authenticated user is present.
 *
 * TO CONNECT SUPABASE:
 *   - Import signIn from "@/services/authService" and call it from the button.
 *   - The FeatureGate wrapping these pages will automatically unmount this card
 *     and render the real feature once useCurrentUser() returns a non-null user.
 */

import { Lock, LogIn, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type GatedFeature = "ask-ai" | "analyze-document" | "workspace";

const FEATURE_COPY: Record<GatedFeature, { title: string; description: string; icon: string }> = {
  "ask-ai": {
    title: "Ask Atlas requires sign-in",
    description:
      "Get plain-English answers to your custody questions, tailored to your specific state and county. Create a free account to get started.",
    icon: "💬",
  },
  "analyze-document": {
    title: "Document Analysis requires sign-in",
    description:
      "Upload custody orders, parenting plans, and other legal documents to get a plain-English summary with key terms and dates identified.",
    icon: "📄",
  },
  workspace: {
    title: "Workspace requires sign-in",
    description:
      "Your personal legal research hub — track documents, save questions, and keep notes on your custody case all in one place.",
    icon: "🗂️",
  },
};

interface AuthRequiredCardProps {
  feature: GatedFeature;
}

export function AuthRequiredCard({ feature }: AuthRequiredCardProps) {
  const copy = FEATURE_COPY[feature];

  function handleSignIn() {
    // Signal the AuthButton in the header to open its dialog.
    window.dispatchEvent(new CustomEvent("custody-atlas:open-auth"));
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md border border-border shadow-lg">
        <CardContent className="pt-10 pb-10 flex flex-col items-center text-center gap-5">

          {/* Feature icon + lock overlay */}
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-3xl">
              {copy.icon}
            </div>
            <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border border-border flex items-center justify-center">
              <Lock className="w-3 h-3 text-muted-foreground" />
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              {copy.description}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <Button
              className="flex-1 gap-2"
              onClick={handleSignIn}
              data-testid="button-sign-in-gate"
            >
              <LogIn className="w-4 h-4" />
              Sign in to continue
            </Button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Scale className="w-3 h-3 flex-shrink-0" />
            <span>Free account. No credit card required.</span>
          </div>

          <p className="text-[11px] text-muted-foreground/60 leading-relaxed max-w-xs">
            Custody Atlas is a legal information tool, not a law firm.
            Always consult a licensed family law attorney for advice about your case.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
