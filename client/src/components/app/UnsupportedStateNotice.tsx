import { Link } from "wouter";
import { MapPin, MessageSquare, RefreshCw, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UnsupportedStateNoticeProps {
  state: string;
  askAIPath: string;
}

/**
 * UnsupportedStateNotice
 * Shown when a user's detected state is not yet in the custody_laws.json dataset.
 * Provides two clear CTAs:
 *   1. Ask AI anyway — still useful even without local data
 *   2. Request coverage — placeholder for a future feedback/request system
 *
 * To connect the "Request Coverage" CTA to a real backend:
 * Replace the mailto link with a POST to /api/coverage-requests or similar.
 */
export function UnsupportedStateNotice({ state, askAIPath }: UnsupportedStateNoticeProps) {
  return (
    <Card
      className="border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20"
      data-testid="card-unsupported-state"
    >
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3
                className="font-semibold text-amber-800 dark:text-amber-200"
                data-testid="text-unsupported-state-title"
              >
                {state} Not Yet Covered
              </h3>
              <Badge
                variant="outline"
                className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
              >
                Coming Soon
              </Badge>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed" data-testid="text-unsupported-state-body">
              We don't have specific custody law data for {state} in our dataset yet.
              Our AI assistant can still provide helpful general information about custody
              law in your state based on its training data, and you can request that we add {state} to our coverage.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href={askAIPath}>
            <Button size="sm" className="gap-1.5" data-testid="button-ask-ai-anyway">
              <MessageSquare className="w-3.5 h-3.5" />
              Ask AI About {state} Laws
            </Button>
          </Link>

          <a
            href={`mailto:coverage@custodylawnearme.com?subject=Coverage Request: ${state}&body=Please add custody law data for ${state}.`}
            className="inline-flex"
            data-testid="button-request-coverage"
          >
            <Button size="sm" variant="outline" className="gap-1.5 border-amber-300 dark:border-amber-700">
              <Bell className="w-3.5 h-3.5" />
              Request {state} Coverage
            </Button>
          </a>

          <Link href="/location">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-amber-700 dark:text-amber-300"
              data-testid="button-try-different"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Different Location
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
