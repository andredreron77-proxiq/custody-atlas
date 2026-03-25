/**
 * RedeemCodePage — /redeem
 *
 * Lets a signed-in user enter an invite code to upgrade their account tier.
 * Requires authentication; redirects to home if not signed in.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Scale, Ticket, Loader2, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequestRaw } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-auth";

export default function RedeemCodePage() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useCurrentUser();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; tier?: string; error?: string } | null>(null);

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <p className="text-sm text-muted-foreground">
              You need to be signed in to redeem a code.
            </p>
            <Button onClick={() => navigate("/")} className="gap-1.5">
              Go to home
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setResult(null);
    const res = await apiRequestRaw("POST", "/api/redeem-code", { code: code.trim() });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (res.ok && body.ok) {
      setResult({ ok: true, tier: body.tier });
    } else {
      setResult({ ok: false, error: body.error ?? "Failed to redeem code." });
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16 bg-background">
      <div className="w-full max-w-sm space-y-6">

        {/* Brand mark */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Custody Atlas</h1>
        </div>

        {/* Success state */}
        {result?.ok ? (
          <Card>
            <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground" data-testid="text-redeem-success">
                  Code redeemed!
                </h2>
                {result.tier && (
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-sm text-muted-foreground">Your account is now</p>
                    <Badge className="capitalize bg-blue-600 text-white">{result.tier}</Badge>
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  Your upgraded access is active immediately.
                </p>
              </div>
              <Button onClick={() => navigate("/workspace")} className="w-full gap-1.5" data-testid="button-go-workspace">
                Go to Workspace
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-md bg-blue-600/10 flex items-center justify-center">
                  <Ticket className="w-4 h-4 text-blue-600" />
                </div>
                <CardTitle className="text-base">Redeem Invite Code</CardTitle>
              </div>
              <CardDescription>
                Enter your invite code below to upgrade your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-code">Invite code</Label>
                  <Input
                    id="invite-code"
                    placeholder="ATLAS-XXXX-XXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="font-mono tracking-widest"
                    required
                    autoFocus
                    data-testid="input-invite-code"
                  />
                </div>

                {result?.error && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-destructive leading-snug" data-testid="text-redeem-error">
                      {result.error}
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={submitting || !code.trim()}
                  data-testid="button-redeem-code"
                >
                  {submitting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Ticket className="w-4 h-4" />}
                  {submitting ? "Redeeming…" : "Redeem code"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="text-[11px] text-muted-foreground text-center">
          Custody Atlas is a legal information tool, not a law firm.
        </p>
      </div>
    </div>
  );
}
