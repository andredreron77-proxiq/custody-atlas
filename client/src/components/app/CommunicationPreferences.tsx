import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { apiRequestRaw } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-auth";
import { useUsage } from "@/hooks/use-usage";
import { useToast } from "@/hooks/use-toast";
import { UpgradePromptCard } from "@/components/app/UpgradePromptCard";

export interface CommunicationPreferencesValue {
  communication_style: "auto" | "simple" | "balanced" | "professional";
  response_format: "auto" | "bullets" | "prose";
  explain_terms: "auto" | "always" | "once" | "never";
  detected_knowledge_level: "beginner" | "intermediate" | "advanced";
  questions_asked_count: number;
  preference_locked: boolean;
}

const DEFAULT_PREFERENCES: CommunicationPreferencesValue = {
  communication_style: "auto",
  response_format: "auto",
  explain_terms: "auto",
  detected_knowledge_level: "beginner",
  questions_asked_count: 0,
  preference_locked: false,
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface CommunicationPreferencesProps {
  onClose?: () => void;
}

export function CommunicationPreferences({ onClose }: CommunicationPreferencesProps) {
  const { user } = useCurrentUser();
  const { usage } = useUsage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isProUser = usage?.tier === "pro";
  const [formState, setFormState] = useState(DEFAULT_PREFERENCES);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const { data: preferences, isLoading } = useQuery<CommunicationPreferencesValue>({
    queryKey: ["/api/user/preferences", user?.id ?? "anon"],
    enabled: Boolean(user && isProUser),
    queryFn: async () => {
      const res = await apiRequestRaw("GET", "/api/user/preferences");
      if (!res.ok) {
        throw new Error("Failed to load communication preferences.");
      }
      const json = await res.json() as Partial<CommunicationPreferencesValue>;
      return { ...DEFAULT_PREFERENCES, ...json };
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (preferences) {
      setFormState(preferences);
    }
  }, [preferences]);

  async function refreshPreferences() {
    await qc.invalidateQueries({ queryKey: ["/api/user/preferences"] });
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await apiRequestRaw("PATCH", "/api/user/preferences", {
        communication_style: formState.communication_style,
        response_format: formState.response_format,
        explain_terms: formState.explain_terms,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "Could not save communication preferences.");
      }

      await refreshPreferences();
      toast({
        title: "Preferences saved",
        description: "Atlas will use your communication settings on future answers.",
      });
      onClose?.();
    } catch (err: any) {
      toast({
        title: "Could not save preferences",
        description: err?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReset() {
    setIsResetting(true);
    try {
      const res = await apiRequestRaw("POST", "/api/user/preferences/reset");
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "Could not reset communication preferences.");
      }

      await refreshPreferences();
      setFormState(DEFAULT_PREFERENCES);
      toast({
        title: "Auto-detect restored",
        description: "Atlas will start learning your preferences again.",
      });
    } catch (err: any) {
      toast({
        title: "Could not reset preferences",
        description: err?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  }

  if (!isProUser) {
    return (
      <Card className="border-white/10 bg-slate-950/90 shadow-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-slate-50">Communication Preferences</CardTitle>
          <CardDescription className="text-slate-400">
            Customize how Atlas communicates with you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpgradePromptCard type="question" />
        </CardContent>
      </Card>
    );
  }

  if (isLoading && !preferences) {
    return (
      <Card className="border-white/10 bg-slate-950/90 shadow-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-slate-50">Communication Preferences</CardTitle>
          <CardDescription className="text-slate-400">
            Customize how Atlas communicates with you.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3 py-8 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your preferences...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-slate-950/90 text-slate-100 shadow-xl">
      <CardHeader className="pb-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl border border-sky-400/20 bg-sky-400/10 p-2.5">
            <Sparkles className="h-4 w-4 text-sky-300" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-slate-50">Communication Preferences</CardTitle>
            <CardDescription className="text-slate-400">
              Customize how Atlas communicates with you.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-100">How should Atlas explain things?</h3>
            <p className="text-xs text-slate-400">
              Atlas has detected you prefer: {capitalize(formState.detected_knowledge_level)}
            </p>
          </div>
          <RadioGroup
            value={formState.communication_style}
            onValueChange={(value) =>
              setFormState((current) => ({
                ...current,
                communication_style: value as CommunicationPreferencesValue["communication_style"],
              }))}
            className="gap-3"
          >
            {[
              {
                value: "simple",
                label: "Simple",
                description: "Plain English, everyday words",
              },
              {
                value: "balanced",
                label: "Balanced",
                description: "Mix of plain and legal language",
              },
              {
                value: "professional",
                label: "Professional",
                description: "Legal terminology, statute citations",
              },
            ].map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:border-sky-400/30 hover:bg-white/8"
              >
                <RadioGroupItem value={option.value} id={`communication-style-${option.value}`} className="mt-1 border-slate-400 text-sky-300" />
                <div className="space-y-1">
                  <Label htmlFor={`communication-style-${option.value}`} className="cursor-pointer text-sm font-medium text-slate-100">
                    {option.label}
                  </Label>
                  <p className="text-xs leading-relaxed text-slate-400">{option.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </section>

        <Separator className="bg-white/10" />

        <section className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-100">How should answers be formatted?</h3>
          </div>
          <RadioGroup
            value={formState.response_format}
            onValueChange={(value) =>
              setFormState((current) => ({
                ...current,
                response_format: value as CommunicationPreferencesValue["response_format"],
              }))}
            className="gap-3"
          >
            {[
              {
                value: "bullets",
                label: "Bullet points",
                description: "Organized lists",
              },
              {
                value: "prose",
                label: "Prose",
                description: "Written paragraphs",
              },
            ].map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:border-sky-400/30 hover:bg-white/8"
              >
                <RadioGroupItem value={option.value} id={`response-format-${option.value}`} className="mt-1 border-slate-400 text-sky-300" />
                <div className="space-y-1">
                  <Label htmlFor={`response-format-${option.value}`} className="cursor-pointer text-sm font-medium text-slate-100">
                    {option.label}
                  </Label>
                  <p className="text-xs leading-relaxed text-slate-400">{option.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </section>

        <Separator className="bg-white/10" />

        <section className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-100">How should legal terms be handled?</h3>
          </div>
          <RadioGroup
            value={formState.explain_terms}
            onValueChange={(value) =>
              setFormState((current) => ({
                ...current,
                explain_terms: value as CommunicationPreferencesValue["explain_terms"],
              }))}
            className="gap-3"
          >
            {[
              {
                value: "always",
                label: "Always explain",
                description: "Define every legal term used",
              },
              {
                value: "once",
                label: "Explain once",
                description: "First time only",
              },
              {
                value: "never",
                label: "Never explain",
                description: "Skip definitions entirely",
              },
            ].map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:border-sky-400/30 hover:bg-white/8"
              >
                <RadioGroupItem value={option.value} id={`legal-terms-${option.value}`} className="mt-1 border-slate-400 text-sky-300" />
                <div className="space-y-1">
                  <Label htmlFor={`legal-terms-${option.value}`} className="cursor-pointer text-sm font-medium text-slate-100">
                    {option.label}
                  </Label>
                  <p className="text-xs leading-relaxed text-slate-400">{option.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isResetting || isSaving}
            className="border-white/15 text-slate-100 hover:bg-white/10 hover:text-white"
          >
            {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Reset to auto-detect
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isResetting}
            className="bg-sky-500 text-slate-950 hover:bg-sky-400"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
