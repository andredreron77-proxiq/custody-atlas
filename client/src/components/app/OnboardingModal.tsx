/**
 * OnboardingModal
 *
 * Shown automatically on the first authenticated visit (localStorage flag).
 * Can be reopened anytime via:
 *   window.dispatchEvent(new CustomEvent("custody-atlas:open-onboarding"))
 *
 * localStorage key:  custody-atlas:onboarded
 */

import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import {
  MessageSquare, FileSearch, LayoutDashboard,
  MapPin, Scale, Lock, X, ArrowRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-auth";
import { apiRequestRaw } from "@/lib/queryClient";
import { useUserProfile } from "@/hooks/use-user-profile";

const STORAGE_KEY = "custody-atlas:onboarded";

function welcomeStorageKeyForUser(userId?: string | null): string {
  if (!userId) return STORAGE_KEY;
  return `${STORAGE_KEY}:${userId}`;
}

const STEPS = [
  {
    icon: MessageSquare,
    iconBg: "bg-blue-100 dark:bg-blue-950/50",
    iconColor: "text-blue-600 dark:text-blue-400",
    title: "Ask Atlas",
    description:
      "Ask custody questions based on your location and continue the conversation.",
  },
  {
    icon: FileSearch,
    iconBg: "bg-emerald-100 dark:bg-emerald-950/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    title: "Analyze a Document",
    description:
      "Upload a custody order or legal document and get a plain-English explanation.",
  },
  {
    icon: LayoutDashboard,
    iconBg: "bg-violet-100 dark:bg-violet-950/50",
    iconColor: "text-violet-600 dark:text-violet-400",
    title: "Use Your Workspace",
    description:
      "Your questions, documents, and progress are saved so you can return anytime.",
  },
];

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const { user, isLoading } = useCurrentUser();
  const { data: profile, isLoading: isProfileLoading } = useUserProfile();
  const [, navigate] = useLocation();
  const [isPersistingDismissal, setIsPersistingDismissal] = useState(false);
  const storageKey = useMemo(() => welcomeStorageKeyForUser(user?.id), [user?.id]);

  // Auto-open once for first-time authenticated users.
  // Durable source of truth: user_profiles.welcome_dismissed_at.
  // Local storage is a fallback optimization.
  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (isProfileLoading) return;
    const localSeen = localStorage.getItem(storageKey);
    const hasDurableDismissal = Boolean(profile?.welcomeDismissedAt);
    const shouldShow = !hasDurableDismissal && localSeen !== "true";

    console.info("[OnboardingModal] decision", {
      hasUserId: Boolean(user?.id),
      userId: user?.id ?? null,
      profileLoaded: !isProfileLoading,
      profileWelcomeDismissedAt: profile?.welcomeDismissedAt ?? null,
      storageKey,
      localSeen,
      hasDurableDismissal,
      shouldShow,
    });

    if (shouldShow) {
      setOpen(true);
    }
  }, [user, isLoading, isProfileLoading, profile?.welcomeDismissedAt, storageKey]);

  // Allow any component to reopen via event dispatch
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("custody-atlas:open-onboarding", handler);
    return () => window.removeEventListener("custody-atlas:open-onboarding", handler);
  }, []);

  const dismiss = async () => {
    if (!user?.id) return;
    localStorage.setItem(storageKey, "true");
    setOpen(false);
    if (isPersistingDismissal) return;
    try {
      setIsPersistingDismissal(true);
      const res = await apiRequestRaw("PATCH", "/api/user-profile/welcome-dismissed");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to persist welcome state.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to persist welcome state.";
      console.error("[OnboardingModal] Failed to persist welcome dismissal:", message, error);
    } finally {
      setIsPersistingDismissal(false);
    }
  };

  const go = async (href: string) => {
    await dismiss();
    navigate(href);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) void dismiss(); }}>
      <DialogContent
        className="max-w-lg w-full p-0 gap-0 overflow-hidden"
        data-testid="modal-onboarding"
      >
        {/* ── Header band ─────────────────────────────────────────────────── */}
        <div className="bg-[#0f172a] px-6 pt-6 pb-5 relative">
          <button
            onClick={() => { void dismiss(); }}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
            data-testid="button-onboarding-close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogHeader>
                <DialogTitle className="text-white text-lg font-bold leading-snug text-left">
                  Welcome to Custody Atlas
                </DialogTitle>
                <DialogDescription className="text-slate-300/80 text-sm mt-0.5 text-left">
                  Understand custody law where you live, organize your case, and ask better questions.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-5">

          {/* Three step cards */}
          <div className="grid grid-cols-1 gap-3">
            {STEPS.map(({ icon: Icon, iconBg, iconColor, title, description }, i) => (
              <div
                key={i}
                className="flex items-start gap-3.5 rounded-xl border bg-muted/30 px-4 py-3.5"
                data-testid={`onboarding-step-${i + 1}`}
              >
                <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-snug">
                    {i + 1}. {title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col gap-2">
            <Button
              className="w-full gap-2 justify-start"
              onClick={() => { void go("/ask"); }}
              data-testid="button-onboarding-ask"
            >
              <MessageSquare className="w-4 h-4" />
              Ask My First Question
              <ArrowRight className="w-3.5 h-3.5 ml-auto" />
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => { void go("/upload-document"); }}
                data-testid="button-onboarding-upload"
              >
                <FileSearch className="w-3.5 h-3.5" />
                Upload a Document
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => { void go("/workspace"); }}
                data-testid="button-onboarding-workspace"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Go to Workspace
              </Button>
            </div>
          </div>

          {/* Trust + disclaimer */}
          <div className="rounded-lg bg-muted/40 border px-4 py-3 space-y-1.5">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Lock className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>Your documents and conversations are tied to your account and handled privately.</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Scale className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>Custody Atlas provides general legal information, not legal advice.</span>
            </div>
          </div>

          {/* Dismiss */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => { void dismiss(); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-onboarding-skip"
            >
              Skip for now
            </button>
            <Button size="sm" onClick={() => { void go("/ask"); }} data-testid="button-onboarding-get-started">
              Get Started
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
