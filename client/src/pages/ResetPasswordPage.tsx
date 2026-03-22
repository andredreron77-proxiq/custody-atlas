/**
 * ResetPasswordPage — /reset-password
 *
 * Supabase emails a magic link that redirects here with the recovery
 * tokens embedded in the URL hash.  `detectSessionInUrl: true` in the
 * Supabase client automatically exchanges those tokens for a session,
 * so by the time this page mounts we just call updateUser({ password }).
 *
 * States:
 *  "form"    — waiting for new password input
 *  "success" — password updated; redirecting to home
 *  "expired" — no valid recovery session found (link expired / already used)
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Scale, Lock, Loader2, CheckCircle2, AlertTriangle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { updatePassword } from "@/services/authService";

type PageState = "loading" | "form" | "success" | "expired";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when the link tokens are exchanged.
    // detectSessionInUrl handles the token swap automatically; we just
    // listen for the event to know when the session is ready.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPageState("form");
      }
    });

    // Also check if a session already exists (e.g. the user navigated back
    // to this page after the event already fired).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setPageState("form");
      } else {
        // Give the hash exchange a moment to complete before declaring expired.
        setTimeout(() => {
          setPageState((prev) => (prev === "loading" ? "expired" : prev));
        }, 2500);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);

    if (updateError) {
      setError(updateError);
      return;
    }

    setPageState("success");
    setTimeout(() => navigate("/"), 3000);
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

        {/* Loading */}
        {pageState === "loading" && (
          <Card>
            <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Verifying your reset link…</p>
            </CardContent>
          </Card>
        )}

        {/* Expired / invalid link */}
        {pageState === "expired" && (
          <Card>
            <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground">Link expired or already used</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Password reset links are single-use and expire after 1 hour.
                  Request a new link to continue.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => navigate("/")}
                data-testid="button-back-to-home"
              >
                Back to home
              </Button>
            </CardContent>
          </Card>
        )}

        {/* New password form */}
        {pageState === "form" && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-md bg-blue-600/10 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-blue-600" />
                </div>
                <CardTitle className="text-base">Set a new password</CardTitle>
              </div>
              <CardDescription>
                Choose a strong password — at least 6 characters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    autoFocus
                    data-testid="input-new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    data-testid="input-confirm-password"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-destructive leading-snug" data-testid="text-reset-error">
                      {error}
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={submitting}
                  data-testid="button-set-password"
                >
                  {submitting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Lock className="w-4 h-4" />}
                  {submitting ? "Updating…" : "Set new password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Success */}
        {pageState === "success" && (
          <Card>
            <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground" data-testid="text-reset-success">
                  Password updated!
                </h2>
                <p className="text-sm text-muted-foreground">
                  You're signed in. Redirecting you to the home page…
                </p>
              </div>
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
