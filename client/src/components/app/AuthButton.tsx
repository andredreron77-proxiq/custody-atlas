/**
 * AuthButton — sign-in/sign-out control for the header.
 *
 * Auth dialog design:
 *  - Google OAuth is the primary action (top, visually prominent)
 *  - Email/password is secondary, below a divider
 *  - Single sign-in/create-account toggle — no tabs
 *  - Product-branded header: logo image + name + subtitle
 *  - Trust strip: private, not used for AI, saves progress
 *  - Return path: stored in sessionStorage before Google OAuth
 *    so users land back where they started
 *  - Errors humanized — no raw Supabase messages shown
 */

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LogOut, Mail, Loader2, ArrowLeft, Send, LifeBuoy, User,
  ShieldCheck, BrainCircuit, BookmarkCheck, SlidersHorizontal,
} from "lucide-react";
import { LogoMark } from "./LogoMark";
import { CommunicationPreferences } from "./CommunicationPreferences";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SiGoogle } from "react-icons/si";
import { useCurrentUser } from "@/hooks/use-auth";
import { initialsFromPreferredName, resolvePreferredDisplayName, useUserProfile } from "@/hooks/use-user-profile";
import { useUsage } from "@/hooks/use-usage";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOut,
  requestPasswordReset,
} from "@/services/authService";
import { useQueryClient } from "@tanstack/react-query";

type DialogView = "main" | "forgot";

/** Maps raw Supabase / network error strings to calm, human-readable messages. */
function humanizeError(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes("invalid login") || r.includes("invalid credentials") || r.includes("wrong password"))
    return "That email or password doesn't match our records. Please try again.";
  if (r.includes("email not confirmed") || r.includes("not confirmed"))
    return "Please confirm your email first — check your inbox for a verification link.";
  if (r.includes("user already registered") || r.includes("already exists") || r.includes("already registered"))
    return "An account with this email already exists. Try signing in instead.";
  if (r.includes("password") && (r.includes("short") || r.includes("6 char")))
    return "Your password must be at least 6 characters long.";
  if (r.includes("email") && (r.includes("invalid") || r.includes("format") || r.includes("valid email")))
    return "Please enter a valid email address.";
  if (r.includes("rate limit") || r.includes("too many request"))
    return "Too many attempts. Please wait a moment and try again.";
  if (r.includes("network") || r.includes("fetch") || r.includes("failed to fetch"))
    return "Connection issue. Please check your internet and try again.";
  if (r.includes("signup") && r.includes("disabled"))
    return "Account creation is temporarily unavailable. Please try again later.";
  return "Something went wrong. Please try again.";
}

/* ── Google icon SVG (inline, official "G" shape) ───────────────────────── */
function GoogleIcon({ className }: { className?: string }) {
  return <SiGoogle className={className} />;
}

/* ── Trust strip shown at the bottom of the dialog ──────────────────────── */
function TrustStrip() {
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {[
        { icon: ShieldCheck,     text: "Private and secure — your data is never shared" },
        { icon: BrainCircuit,    text: "Your documents are not used to train any AI model" },
        { icon: BookmarkCheck,   text: "Progress saved across sessions and devices" },
      ].map(({ icon: Icon, text }) => (
        <div key={text} className="flex items-center gap-2">
          <Icon className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
          <span className="text-[11px] text-muted-foreground/70 leading-tight">{text}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Product header shown inside the dialog ──────────────────────────────── */
function DialogBrand({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 pt-2 pb-1">
      <LogoMark size={36} variant="color" />
      <div className="space-y-0.5">
        <p className="text-base font-semibold tracking-tight">Custody Atlas</p>
        <p className="text-xs text-muted-foreground leading-snug max-w-[230px]">{subtitle}</p>
      </div>
    </div>
  );
}

export function AuthButton() {
  const [, navigate] = useLocation();
  const { user, isLoading } = useCurrentUser();
  const { data: profile } = useUserProfile();
  const { usage } = useUsage();
  const [open, setOpen]         = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [view, setView]         = useState<DialogView>("main");
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [message, setMessage]   = useState<string | null>(null);
  const [canMountDialogs, setCanMountDialogs] = useState(false);
  const qc = useQueryClient();

  function resetForm() {
    setEmail("");
    setPassword("");
    setAcceptedTerms(false);
    setError(null);
    setMessage(null);
  }

  function openDialog(forSignUp = false) {
    resetForm();
    setView("main");
    setIsSignUp(forSignUp);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    resetForm();
    setView("main");
  }

  // Listen for the event fired by AuthRequiredCard's "Sign in to continue" button.
  useEffect(() => {
    function handleOpenAuth(event: Event) {
      if (!user) {
        const signUp = event instanceof CustomEvent && event.detail?.mode === "signup";
        openDialog(signUp);
      }
    }
    window.addEventListener("custody-atlas:open-auth", handleOpenAuth);
    return () => window.removeEventListener("custody-atlas:open-auth", handleOpenAuth);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isLoading) {
      setCanMountDialogs(false);
      return;
    }

    const timer = window.setTimeout(() => setCanMountDialogs(true), 100);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    if (isSignUp && !acceptedTerms) {
      setError("Please agree to the Terms of Service, Privacy Policy, and legal disclaimer to create an account.");
      setSubmitting(false);
      return;
    }

    if (!isSignUp) {
      const { error } = await signInWithEmail(email, password);
      if (error) {
        setError(humanizeError(error));
      } else {
        closeDialog();
        qc.invalidateQueries({ queryKey: ["/api/usage"] });
      }
    } else {
      const { error } = await signUpWithEmail(email, password);
      if (error) {
        setError(humanizeError(error));
      } else {
        setMessage("Check your inbox for a confirmation link, then sign in.");
        setIsSignUp(false);
      }
    }
    setSubmitting(false);
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const { error } = await requestPasswordReset(email);
    setSubmitting(false);

    if (error) {
      setError(humanizeError(error));
    } else {
      setMessage(
        "If that email is registered with us, you'll receive a reset link shortly. Check your inbox and spam folder."
      );
    }
  }

  async function handleGoogle() {
    setError(null);
    // Store current path so we can return the user here after OAuth completes.
    const returnPath = window.location.pathname + window.location.search;
    if (returnPath && returnPath !== "/") {
      sessionStorage.setItem("custody-atlas:return-path", returnPath);
    }
    const { error } = await signInWithGoogle();
    if (error) setError(humanizeError(error));
  }

  async function handleSignOut() {
    await signOut();
    qc.invalidateQueries({ queryKey: ["/api/usage"] });
  }

  if (isLoading) {
    return (
      <div className="w-8 h-8 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      </div>
    );
  }

  if (user) {
    const isProUser = usage?.tier === "pro";
    const preferredDisplayName = resolvePreferredDisplayName({
      profileDisplayName: profile?.displayName,
      profileFullName: profile?.fullName,
      authMetadataName: user.authMetadataName,
      authDisplayName: user.fullName ?? user.displayName,
      email: user.email,
    });
    const initials = initialsFromPreferredName({
      profileDisplayName: profile?.displayName,
      profileFullName: profile?.fullName,
      authMetadataName: user.authMetadataName,
      authDisplayName: user.fullName ?? user.displayName,
      email: user.email,
    });

    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40"
              data-testid="button-user-menu"
              aria-label="User menu"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={preferredDisplayName ?? "User avatar"}
                  className="w-8 h-8 rounded-full object-cover border border-white/20"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold">
                  {initials}
                </div>
              )}
              <span
                className="hidden lg:block text-sm text-slate-300 max-w-[120px] truncate"
                data-testid="text-username"
              >
                {preferredDisplayName ?? user.email}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-[11px] text-muted-foreground/70">Signed in as</p>
              <p className="text-xs font-medium truncate mt-0.5">{user.email}</p>
            </div>
            {!!user && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setPreferencesOpen(true);
                  }}
                  className="gap-2 text-sm cursor-pointer"
                  data-testid="button-communication-preferences"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Communication Preferences
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                navigate("/account");
              }}
              className="gap-2 text-sm cursor-pointer"
              data-testid="button-account-settings"
            >
              <User className="w-3.5 h-3.5" />
              Account Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.location.href = "mailto:support@custodyatlas.com";
              }}
              className="gap-2 text-sm cursor-pointer"
              data-testid="button-help-support"
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              Help & Support
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="gap-2 text-sm cursor-pointer"
              data-testid="button-logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {canMountDialogs ? (
          <Dialog open={preferencesOpen} onOpenChange={setPreferencesOpen}>
            <DialogContent className="left-1/2 top-1/2 max-h-[80vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden border-white/10 bg-slate-950 p-0 text-slate-100 sm:w-full">
              <DialogHeader className="sr-only">
                <DialogTitle>Communication Preferences</DialogTitle>
                <DialogDescription>Customize how Atlas communicates with you.</DialogDescription>
              </DialogHeader>
              <CommunicationPreferences onClose={() => setPreferencesOpen(false)} />
            </DialogContent>
          </Dialog>
        ) : null}
      </>
    );
  }

  /* ── Sign-out state: header trigger button ─────────────────────────────── */
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-slate-100 border-slate-600 bg-transparent hover:bg-white/10 hover:text-white"
        onClick={() => openDialog()}
        data-testid="button-login"
      >
        Sign In
      </Button>

      {canMountDialogs ? (
        <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
          <DialogContent className="sm:max-w-[360px] gap-0 p-6">

          {/* ── Forgot password view ──────────────────────────────────── */}
          {view === "forgot" ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Reset your password</p>
                <p className="text-xs text-muted-foreground">
                  Enter your email and we'll send you a link to set a new password.
                </p>
              </div>

              <form onSubmit={handleForgotPassword} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email" className="text-xs">Email address</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    className="h-9 text-sm"
                    data-testid="input-forgot-email"
                  />
                </div>

                {error && (
                  <p className="text-xs text-destructive leading-snug" data-testid="text-forgot-error">
                    {error}
                  </p>
                )}
                {message && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 leading-snug" data-testid="text-forgot-success">
                    {message}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full gap-2 h-9"
                  disabled={submitting || !!message}
                  data-testid="button-send-reset"
                >
                  {submitting
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />}
                  {submitting ? "Sending…" : "Send reset link"}
                </Button>
              </form>

              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { resetForm(); setView("main"); }}
                data-testid="button-back-to-signin"
              >
                <ArrowLeft className="w-3 h-3" />
                Back to sign in
              </button>
            </div>
          ) : (
            /* ── Main sign-in / sign-up view ─────────────────────────── */
            <div className="space-y-4">

              {/* Brand header */}
              <DialogBrand
                subtitle={
                  isSignUp
                    ? "Create a free account to save your case, documents, and progress."
                    : "Sign in securely to access your case, documents, and progress."
                }
              />

              {/* Primary: Google */}
              <Button
                variant="outline"
                className="w-full gap-2.5 h-10 font-medium text-sm border-border hover:bg-accent"
                onClick={handleGoogle}
                type="button"
                disabled={isSignUp && !acceptedTerms}
                data-testid="button-google-auth"
              >
                <GoogleIcon className="w-4 h-4 text-[#4285F4]" />
                Continue with Google
              </Button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-[11px] text-muted-foreground flex-shrink-0">or continue with email</span>
                <Separator className="flex-1" />
              </div>

              {/* Secondary: email/password */}
              <form onSubmit={handleEmailAuth} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="auth-email" className="text-xs">Email address</Label>
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-9 text-sm"
                    data-testid="input-email"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auth-password" className="text-xs">Password</Label>
                    {!isSignUp && (
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => { resetForm(); setView("forgot"); }}
                        data-testid="button-forgot-password"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="auth-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    className="h-9 text-sm"
                    data-testid="input-password"
                  />
                </div>

                {error && (
                  <p className="text-xs text-destructive leading-snug" data-testid="text-auth-error">
                    {error}
                  </p>
                )}
                {message && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 leading-snug" data-testid="text-auth-message">
                    {message}
                  </p>
                )}

                {isSignUp ? (
                  <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="auth-legal-consent"
                        checked={acceptedTerms}
                        onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                        className="mt-0.5"
                        data-testid="checkbox-signup-consent"
                      />
                      <Label
                        htmlFor="auth-legal-consent"
                        className="text-xs leading-5 text-muted-foreground"
                      >
                        I agree to the{" "}
                        <Link href="/terms" className="text-primary hover:underline">
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link href="/privacy" className="text-primary hover:underline">
                          Privacy Policy
                        </Link>{" "}
                        and understand that Custody Atlas does not provide legal advice.
                      </Label>
                    </div>
                  </div>
                ) : null}

                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full gap-2 h-9 text-sm"
                  disabled={submitting || (isSignUp && !acceptedTerms)}
                  data-testid="button-submit-auth"
                >
                  {submitting
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Mail className="w-3.5 h-3.5" />}
                  {submitting
                    ? (isSignUp ? "Creating account…" : "Signing in…")
                    : (isSignUp ? "Create account" : "Continue with email")}
                </Button>
              </form>

              {/* Toggle sign-in ↔ sign-up */}
              <p className="text-center text-[11px] text-muted-foreground">
                {isSignUp ? "Already have an account? " : "New to Custody Atlas? "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                  onClick={() => { resetForm(); setIsSignUp(!isSignUp); }}
                  data-testid="button-toggle-auth-mode"
                >
                  {isSignUp ? "Sign in" : "Create a free account"}
                </button>
              </p>

              {/* Trust strip */}
              <Separator />
              <TrustStrip />
            </div>
          )}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
