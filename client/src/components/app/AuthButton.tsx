/**
 * AuthButton — sign-in/sign-out control for the header.
 *
 * When signed out: shows a "Sign In" button that opens an auth dialog
 * with email/password and Google OAuth options.
 *
 * When signed in: shows the user's avatar (or initials) + email,
 * with a dropdown for signing out.
 */

import { useState } from "react";
import { LogIn, LogOut, User, Mail, Loader2, ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/use-auth";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOut,
  requestPasswordReset,
} from "@/services/authService";
import { useQueryClient } from "@tanstack/react-query";

type DialogView = "signin" | "signup" | "forgot";

export function AuthButton() {
  const { user, isLoading } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DialogView>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const qc = useQueryClient();

  function resetForm() {
    setEmail("");
    setPassword("");
    setError(null);
    setMessage(null);
  }

  function openDialog() {
    resetForm();
    setView("signin");
    setOpen(true);
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    if (view === "signin") {
      const { error } = await signInWithEmail(email, password);
      if (error) {
        setError(error);
      } else {
        setOpen(false);
        resetForm();
        qc.invalidateQueries({ queryKey: ["/api/usage"] });
      }
    } else {
      const { error } = await signUpWithEmail(email, password);
      if (error) {
        setError(error);
      } else {
        setMessage("Check your email for a confirmation link, then sign in.");
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
      setError(error);
    } else {
      setMessage(
        "If that email is registered, you'll receive a reset link shortly. Check your inbox and spam folder."
      );
    }
  }

  async function handleGoogle() {
    setError(null);
    const { error } = await signInWithGoogle();
    if (error) setError(error);
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
    const initials = user.displayName
      ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
      : (user.email?.[0] ?? "U").toUpperCase();

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="button-user-menu"
            aria-label="User menu"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName ?? "User avatar"}
                className="w-8 h-8 rounded-full object-cover border border-white/20"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold border border-blue-500">
                {initials}
              </div>
            )}
            <span
              className="hidden lg:block text-sm text-slate-300 max-w-[120px] truncate"
              data-testid="text-username"
            >
              {user.displayName ?? user.email}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <div className="px-2 py-1.5">
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
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
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-slate-100 border-slate-600 bg-transparent hover:bg-white/10 hover:text-white"
        onClick={openDialog}
        data-testid="button-login"
      >
        <LogIn className="w-3.5 h-3.5" />
        Sign In
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-sm">

          {/* ── Forgot password view ── */}
          {view === "forgot" ? (
            <>
              <DialogHeader>
                <DialogTitle>Reset your password</DialogTitle>
                <DialogDescription>
                  Enter your email and we'll send you a link to set a new password.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleForgotPassword} className="mt-2 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">Email address</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    data-testid="input-forgot-email"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" data-testid="text-forgot-error">
                    {error}
                  </p>
                )}
                {message && (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400" data-testid="text-forgot-success">
                    {message}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={submitting || !!message}
                  data-testid="button-send-reset"
                >
                  {submitting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />}
                  {submitting ? "Sending…" : "Send reset link"}
                </Button>
              </form>

              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-1"
                onClick={() => { resetForm(); setView("signin"); }}
                data-testid="button-back-to-signin"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </button>
            </>
          ) : (
            /* ── Sign in / Sign up view ── */
            <>
              <DialogHeader>
                <DialogTitle>Welcome to Custody Atlas</DialogTitle>
                <DialogDescription>
                  Sign in to access AI questions, document analysis, and your workspace.
                </DialogDescription>
              </DialogHeader>

              <Tabs
                value={view}
                onValueChange={(v) => { setView(v as DialogView); setError(null); setMessage(null); }}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="signin" className="flex-1">Sign In</TabsTrigger>
                  <TabsTrigger value="signup" className="flex-1">Sign Up</TabsTrigger>
                </TabsList>

                <TabsContent value={view} className="mt-4">
                  <form onSubmit={handleEmailAuth} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="auth-email">Email</Label>
                      <Input
                        id="auth-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        data-testid="input-email"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="auth-password">Password</Label>
                        {view === "signin" && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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
                        autoComplete={view === "signin" ? "current-password" : "new-password"}
                        data-testid="input-password"
                      />
                    </div>

                    {error && (
                      <p className="text-sm text-destructive" data-testid="text-auth-error">{error}</p>
                    )}
                    {message && (
                      <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>
                    )}

                    <Button
                      type="submit"
                      className="w-full gap-2"
                      disabled={submitting}
                      data-testid="button-submit-auth"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      {view === "signin" ? "Sign In" : "Create Account"}
                    </Button>
                  </form>

                  <div className="mt-3 relative flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <Button
                    variant="outline"
                    className="w-full mt-3 gap-2"
                    onClick={handleGoogle}
                    type="button"
                    data-testid="button-google-auth"
                  >
                    <User className="w-4 h-4" />
                    Continue with Google
                  </Button>
                </TabsContent>
              </Tabs>

              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Free account. No credit card required.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
