import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequestRaw } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-auth";
import {
  clearDisplayNameSessionSkip,
  firstNameFromDisplayName,
  getDisplayNamePromptSuppressionState,
  setDisplayNameSkipForSession,
  skipDisplayNamePromptForAWhile,
  useUserProfile,
} from "@/hooks/use-user-profile";

function hasRealDisplayName(displayName: string | null | undefined): boolean {
  return Boolean(displayName?.trim());
}

export function DisplayNamePromptGate({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const { data: profile, isLoading, isError } = useUserProfile();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState(() => firstNameFromDisplayName(user?.displayName));
  const [dismissed, setDismissed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!draft && user?.displayName) {
      setDraft(firstNameFromDisplayName(user.displayName));
    }
  }, [draft, user?.displayName]);

  const suppressionState = useMemo(
    () => getDisplayNamePromptSuppressionState(user?.id),
    [user?.id],
  );

  const hasProfileDisplayName = hasRealDisplayName(profile?.displayName);
  const hasProfileRecord = Boolean(profile?.id);
  const profileLoaded = !isLoading;

  const needsPrompt = useMemo(
    () =>
      Boolean(user) &&
      profileLoaded &&
      !isError &&
      hasProfileRecord &&
      !dismissed &&
      !hasProfileDisplayName &&
      !suppressionState.suppressed,
    [user, profileLoaded, isError, hasProfileRecord, dismissed, hasProfileDisplayName, suppressionState.suppressed],
  );

  useEffect(() => {
    console.info("[DisplayNamePromptGate] decision", {
      hasUserId: Boolean(user?.id),
      userId: user?.id ?? null,
      profileLoaded,
      profileLoadError: isError,
      hasProfileRecord,
      rawDisplayName: profile?.displayName ?? null,
      rawFullName: profile?.fullName ?? null,
      authDisplayName: user?.displayName ?? null,
      authMetadataName: user?.authMetadataName ?? null,
      hasRealDisplayName: hasProfileDisplayName,
      hasSessionSkip: suppressionState.hasSessionSkip,
      localSkipUntil: suppressionState.localSkipUntil,
      hasActiveLocalSkip: suppressionState.hasActiveLocalSkip,
      dismissed,
      shouldShowPrompt: needsPrompt,
    });
  }, [
    user?.id,
    profileLoaded,
    isError,
    hasProfileRecord,
    profile?.displayName,
    profile?.fullName,
    user?.displayName,
    user?.authMetadataName,
    hasProfileDisplayName,
    suppressionState.hasSessionSkip,
    suppressionState.localSkipUntil,
    suppressionState.hasActiveLocalSkip,
    dismissed,
    needsPrompt,
  ]);

  const saveMutation = useMutation({
    mutationFn: async (displayName: string) => {
      const res = await apiRequestRaw("PATCH", "/api/user-profile/display-name", { displayName });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not save your name.");
      }
    },
    onMutate: () => {
      setErrorMessage(null);
    },
    onSuccess: async () => {
      setDismissed(true);
      await qc.invalidateQueries({ queryKey: ["/api/user-profile"] });
      if (user?.id) {
        clearDisplayNameSessionSkip(user.id);
      }
      navigate("/workspace", { replace: true });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not save your name.";
      console.error("[DisplayNamePromptGate] Failed to save display name:", message, error);
      setErrorMessage(message);
    },
  });

  const handleSkip = async () => {
    setErrorMessage(null);
    setDismissed(true);

    try {
      if (user?.id) {
        setDisplayNameSkipForSession(user.id);
      }
      skipDisplayNamePromptForAWhile(user?.id);
      await qc.invalidateQueries({ queryKey: ["/api/user-profile"] });
      navigate("/workspace", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not complete onboarding.";
      console.error("[DisplayNamePromptGate] Failed to skip display name prompt:", message, error);
      setErrorMessage(message);
      // Keep users unblocked even if persistence fails.
      navigate("/workspace", { replace: true });
    }
  };

  if (user && isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!needsPrompt) return <>{children}</>;

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-sm" data-testid="prompt-preferred-name">
        <h1 className="text-lg font-semibold text-foreground" data-testid="heading-preferred-name-prompt">What should we call you?</h1>
        <p className="text-sm text-muted-foreground mt-1">You can change this later.</p>
        <div className="mt-4 space-y-2">
          <Label htmlFor="display-name">Preferred name</Label>
          <Input
            id="display-name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={80}
            placeholder="Your name"
            data-testid="input-display-name"
          />
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleSkip}
            data-testid="button-skip-display-name"
          >
            Skip for now
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || draft.trim().length === 0}
            onClick={() => saveMutation.mutate(draft.trim())}
            data-testid="button-continue-display-name"
          >
            Continue
          </Button>
        </div>
        {errorMessage ? (
          <p className="mt-3 text-sm text-red-600" role="alert" data-testid="display-name-error">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
