/**
 * ResetPasswordPage — /reset-password
 *
 * Recovery flow:
 *  1. User clicks the reset-password link in their email.
 *  2. Supabase redirects them here with recovery tokens in the URL hash.
 *  3. `detectSessionInUrl: true` automatically exchanges the tokens and fires
 *     onAuthStateChange with event = "PASSWORD_RECOVERY".
 *  4. use-auth.ts intercepts that event, sets a sessionStorage flag, and
 *     navigates here while keeping the user "unauthenticated" in the UI.
 *  5. This page detects the flag, shows the new-password form, and calls
 *     supabase.auth.updateUser({ password }) to complete the reset.
 *  6. On success: flag is cleared, user is redirected to /workspace.
 *
 * States:
 *  "loading" — waiting for recovery detection
 *  "form"    — valid recovery session confirmed; collecting new password
 *  "success" — password updated; redirecting
 *  "expired" — no valid recovery session (link expired / already used)
 *  "resend"  — user requests a new reset email
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Scale, Lock, Loader2, CheckCircle2, AlertTriangle,
  KeyRound, Mail, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { updatePassword, requestPasswordReset } from "@/services/authService";

const RECOVERY_FLAG = "custody-atlas:recovery";

type PageState = "loading" | "form" | "success" | "expired" | "resend";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const [pageState, setPageState] = useState<PageState>("loading");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [resendEmail, setResendEmail] = useState("");
  const [resendSending, setResendSending] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    // Primary trigger: PASSWORD_RECOVERY event from Supabase.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          sessionStorage.setItem(RECOVERY_FLAG, "1");
          setPageState("form");
        }
      },
    );

    // Fallback: if the user navigated back to this page after the event
    // already fired (e.g. pressed Back), the sessionStorage flag persists.
    const hasFlag = sessionStorage.getItem(RECOVERY_FLAG) === "1";
    if (hasFlag) {
      setPageState("form");
    } else {
      // Give Supabase up to 2.5 s to fire PASSWORD_RECOVERY before giving up.
      const timer = setTimeout(() => {
        setPageState((prev) => (prev === "loading" ? "expired" : prev));
      }, 2500);
      return () => {
        clearTimeout(timer);
        subscription.unsubscribe();
      };
    }

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);

    if (error) {
      setFormError(error);
      return;
    }

    // Clear the recovery guard so use-auth.ts resumes normal behaviour.
    sessionStorage.removeItem(RECOVERY_FLAG);
    setPageState("success");
    setTimeout(() => navigate("/workspace"), 3000);
  }

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendError(null);
    setResendSending(true);
    const { error } = await requestPasswordReset(resendEmail);
    setResendSending(false);
    if (error) {
      setResendError(error);
    } else {
      setResendDone(true);
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

        {/* ── Loading ── */}
        {pageState === "loading" && (
          <Card>
            <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Verifying your reset link…
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Expired / invalid link ── */}
        {pageState === "expired" && (
          <Card>
            <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground">
                  Link expired or already used
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Password reset links are single-use and expire after 1 hour.
                  Request a new link below.
                </p>
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => setPageState("resend")}
                data-testid="button-request-new-link"
              >
                <Mail className="w-4 h-4 mr-2" />
                Send a new reset link
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => navigate("/")}
                data-testid="button-back-to-home"
              >
                Back to home
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Resend form ── */}
        {pageState === "resend" && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-md bg-blue-600/10 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-blue-600" />
                </div>
                <CardTitle className="text-base">Request a new link</CardTitle>
              </div>
              <CardDescription>
                Enter the email address on your account and we'll send a fresh
                reset link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resendDone ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm text-muted-foreground">
                    Check your inbox — a new reset link is on its way.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1"
                    onClick={() => navigate("/")}
                  >
                    Back to home
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleResend} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="resend-email">Email address</Label>
                    <Input
                      id="resend-email"
                      type="email"
                      placeholder="you@example.com"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      required
                      autoFocus
                      data-testid="input-resend-email"
                    />
                  </div>

                  {resendError && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-destructive leading-snug">
                        {resendError}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={resendSending}
                    data-testid="button-send-reset-link"
                  >
                    {resendSending
                      ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      : <Mail className="w-4 h-4 mr-2" />}
                    {resendSending ? "Sending…" : "Send reset link"}
                  </Button>

                  <button
                    type="button"
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 pt-1"
                    onClick={() => setPageState("expired")}
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back
                  </button>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── New password form ── */}
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
                Choose a strong password — at least 8 characters.
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

                {formError && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    <p
                      className="text-sm text-destructive leading-snug"
                      data-testid="text-reset-error"
                    >
                      {formError}
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

        {/* ── Success ── */}
        {pageState === "success" && (
          <Card>
            <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <h2
                  className="text-base font-semibold text-foreground"
                  data-testid="text-reset-success"
                >
                  Password updated!
                </h2>
                <p className="text-sm text-muted-foreground">
                  You're signed in. Taking you to your workspace…
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
