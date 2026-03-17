import { useLocation } from "wouter";
import {
  DollarSign, MessageSquare, ChevronRight, Scale, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { triggerAIEntry, buildAskURL, type AIEntryParams } from "@/lib/aiEntry";

/**
 * Child support calculation models for each of the 22 supported states.
 * Source: National Conference of State Legislatures (NCSL) child support guideline models.
 * Placeholder used for any state not in this map ("income-based guidelines").
 */
const SUPPORT_MODELS: Record<string, string> = {
  Alabama: "Income Shares Model",
  Alaska: "Percentage of Income Model",
  Arizona: "Income Shares Model",
  California: "Income Shares Model",
  Colorado: "Income Shares Model",
  Florida: "Income Shares Model",
  Georgia: "Income Shares Model",
  Illinois: "Percentage of Income Model",
  Indiana: "Income Shares Model",
  Louisiana: "Income Shares Model",
  Massachusetts: "Percentage of Income Model",
  Michigan: "Income Shares Model",
  Nevada: "Percentage of Income Model",
  "New Jersey": "Income Shares Model",
  "New York": "Percentage of Income Model",
  "North Carolina": "Income Shares Model",
  Ohio: "Income Shares Model",
  Oklahoma: "Income Shares Model",
  Pennsylvania: "Income Shares Model",
  Texas: "Percentage of Income Model",
  Virginia: "Income Shares Model",
  Washington: "Income Shares Model",
};

interface ChildSupportImpactCardProps {
  state?: string;
  county?: string;
  country?: string;
}

export function ChildSupportImpactCard({
  state,
  county,
  country = "United States",
}: ChildSupportImpactCardProps) {
  const [, navigate] = useLocation();
  const supportModel = state ? SUPPORT_MODELS[state] : undefined;

  const handleAskAI = () => {
    const params: AIEntryParams = {
      topic: "child_support",
      state,
      county,
      autoSubmit: true,
    };

    // If a ChatBox is active on this page, submit directly and scroll to it.
    // Otherwise navigate to /ask with the question pre-filled.
    const handled = triggerAIEntry(params);
    if (!handled) {
      navigate(buildAskURL({ ...params, country }));
    }
  };

  return (
    <Card
      className="border-teal-200 dark:border-teal-800/40"
      data-testid="card-child-support-impact"
    >
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-md bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <DollarSign className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold leading-snug">
              Custody and Child Support
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              How parenting time can affect support obligations
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Child support laws vary by state. The amount each parent pays or receives often depends on income levels, the custody arrangement, and how much time the child spends with each parent.
        </p>

        <ul className="space-y-2.5">
          <li className="flex items-start gap-2 text-sm" data-testid="support-bullet-0">
            <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-teal-500 flex-shrink-0" />
            <span className="text-muted-foreground leading-relaxed">
              If one parent has the child most of the time, the other parent may pay more in child support.
            </span>
          </li>
          <li className="flex items-start gap-2 text-sm" data-testid="support-bullet-1">
            <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-teal-500 flex-shrink-0" />
            <span className="text-muted-foreground leading-relaxed">
              Shared custody arrangements may reduce support amounts depending on each parent's income and the division of everyday expenses.
            </span>
          </li>
          <li className="flex items-start gap-2 text-sm" data-testid="support-bullet-2">
            <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-teal-500 flex-shrink-0" />
            <span className="text-muted-foreground leading-relaxed">
              A significant change in parenting time may be grounds to request a modification of an existing support order.
            </span>
          </li>
        </ul>

        {state && (
          <div
            className="rounded-md border border-teal-100 dark:border-teal-900/50 bg-teal-50/60 dark:bg-teal-950/20 px-3 py-2.5 flex items-start gap-2"
            data-testid="panel-support-model"
          >
            <Scale className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-teal-800 dark:text-teal-200 leading-relaxed">
              {supportModel
                ? `${state} generally uses the ${supportModel} for calculating child support, which takes both parents' incomes and the parenting time schedule into account.`
                : `${state} uses income-based guidelines to calculate child support. The specific formula considers each parent's earnings and the custody arrangement. Consult an attorney for a personalized estimate.`}
            </p>
          </div>
        )}

        <Button
          onClick={handleAskAI}
          className="w-full gap-2 mt-1"
          variant="outline"
          data-testid="button-ask-child-support"
        >
          <MessageSquare className="w-4 h-4" />
          Ask about child support{state ? ` in ${state}` : ""}
        </Button>

        <div className="flex items-start gap-1.5 pt-1 border-t border-border/60">
          <Info className="w-3 h-3 text-muted-foreground/70 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground/80 italic leading-relaxed" data-testid="text-support-trust-message">
            Custody Atlas provides educational information about custody and child support. It does not replace legal advice from a licensed attorney.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
