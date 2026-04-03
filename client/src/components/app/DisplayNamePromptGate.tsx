import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequestRaw } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-auth";
import { DISPLAY_NAME_SKIP_SESSION_KEY, firstNameFromDisplayName, useUserProfile } from "@/hooks/use-user-profile";

function shouldPrompt(displayName: string | null | undefined): boolean {
  if (displayName) return false;
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(DISPLAY_NAME_SKIP_SESSION_KEY) !== "1";
}

export function DisplayNamePromptGate({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const { data: profile, isLoading } = useUserProfile();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState(() => firstNameFromDisplayName(user?.displayName));

  useEffect(() => {
    if (!draft && user?.displayName) {
      setDraft(firstNameFromDisplayName(user.displayName));
    }
  }, [draft, user?.displayName]);

  const needsPrompt = useMemo(
    () => Boolean(user) && !isLoading && shouldPrompt(profile?.displayName),
    [user, isLoading, profile?.displayName],
  );

  const saveMutation = useMutation({
    mutationFn: async (displayName: string) => {
      const res = await apiRequestRaw("PATCH", "/api/user-profile/display-name", { displayName });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not save your name.");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/user-profile"] });
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(DISPLAY_NAME_SKIP_SESSION_KEY);
      }
      navigate("/workspace", { replace: true });
    },
  });

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
      <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">What should we call you?</h1>
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
            onClick={() => {
              window.sessionStorage.setItem(DISPLAY_NAME_SKIP_SESSION_KEY, "1");
              navigate("/workspace", { replace: true });
            }}
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
      </div>
    </div>
  );
}
