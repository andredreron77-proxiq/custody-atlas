import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequestRaw } from "@/lib/queryClient";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type BillingPlan = "monthly" | "annual";

const PLAN_COPY: Record<BillingPlan, {
  label: string;
  price: string;
  description: string;
  badge?: string;
}> = {
  monthly: {
    label: "Monthly",
    price: "$19.99/month",
    description: "Flexible month-to-month access to every Pro feature.",
  },
  annual: {
    label: "Annual",
    price: "$179/year",
    description: "Save 25% and keep your case support uninterrupted all year.",
    badge: "Best value",
  },
};

const MONTHLY_PRICE_ID = (import.meta.env.VITE_STRIPE_PRO_MONTHLY_PRICE_ID as string | undefined) ?? "";
const ANNUAL_PRICE_ID = (import.meta.env.VITE_STRIPE_PRO_ANNUAL_PRICE_ID as string | undefined) ?? "";

export function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<BillingPlan | null>(null);

  const planConfigs = useMemo(() => ([
    { plan: "monthly" as const, priceId: MONTHLY_PRICE_ID, ...PLAN_COPY.monthly },
    { plan: "annual" as const, priceId: ANNUAL_PRICE_ID, ...PLAN_COPY.annual },
  ]), []);

  async function handleChoosePlan(plan: BillingPlan, priceId: string) {
    setLoadingPlan(plan);
    try {
      const res = await apiRequestRaw("POST", "/api/billing/create-checkout-session", {
        priceId: priceId || plan,
        plan,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.url !== "string") {
        throw new Error(body.error || "Could not start checkout.");
      }
      window.location.assign(body.url);
    } catch (err: any) {
      toast({
        title: "Checkout unavailable",
        description: err?.message ?? "Could not start checkout.",
        variant: "destructive",
      });
      setLoadingPlan(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-6 text-white">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2 text-blue-200">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">Upgrade</span>
            </div>
            <DialogTitle className="text-2xl font-semibold text-white">
              Upgrade to Custody Atlas Pro
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-sm leading-6 text-slate-200">
              Unlock more questions, deeper analysis, and a stronger case workspace with billing managed securely through Stripe.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2">
          {planConfigs.map((plan) => {
            const isLoading = loadingPlan === plan.plan;
            return (
              <Card
                key={plan.plan}
                className={plan.plan === "annual"
                  ? "border-[1.5px] border-blue-500 shadow-lg shadow-blue-500/10"
                  : "border-border shadow-sm"}
              >
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-xl">{plan.label}</CardTitle>
                    {plan.badge ? (
                      <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                        {plan.badge}
                      </Badge>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-3xl font-semibold tracking-tight text-foreground">{plan.price}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.description}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                      <span>Higher monthly question allowance</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                      <span>Pro-only pattern recognition and deeper insights</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                      <span>Full billing control from your customer portal</span>
                    </li>
                  </ul>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => handleChoosePlan(plan.plan, plan.priceId)}
                    disabled={loadingPlan !== null}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting checkout…
                      </>
                    ) : (
                      "Choose this plan"
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UpgradeModal;
