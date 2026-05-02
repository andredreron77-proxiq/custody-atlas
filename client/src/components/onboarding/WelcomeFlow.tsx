import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSearch,
  Loader2,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationSelector } from "@/components/app/LocationSelector";
import { useCurrentUser } from "@/hooks/use-auth";
import { resolvePreferredDisplayName, useUserProfile, WELCOME_FLOW_JUST_COMPLETED_KEY } from "@/hooks/use-user-profile";
import { apiRequestRaw } from "@/lib/queryClient";
import { formatJurisdictionLabel } from "@/lib/jurisdictionUtils";
import { resolveUSStateCode } from "@shared/usStates";
import type { Jurisdiction } from "@shared/schema";
import { cn } from "@/lib/utils";

type SituationType =
  | "more_time"
  | "respond_to_filing"
  | "hearing_coming_up"
  | "figuring_things_out";

const SITUATIONS: Array<{
  value: SituationType;
  emoji: string;
  title: string;
}> = [
  { value: "more_time", emoji: "🏠", title: "I want more time with my child" },
  { value: "respond_to_filing", emoji: "📋", title: "I need to respond to something that was filed" },
  { value: "hearing_coming_up", emoji: "⚖️", title: "I have a hearing coming up" },
  { value: "figuring_things_out", emoji: "🔍", title: "I'm just starting to figure things out" },
];

const READY_COPY: Record<SituationType, { text: string; cta: string; href: string; icon: typeof FileSearch }> = {
  more_time: {
    text: "Tell Atlas what's going on and we'll figure out the best path forward together. No documents needed yet.",
    cta: "Talk to Atlas About Your Situation",
    href: "/ask",
    icon: MessageSquare,
  },
  respond_to_filing: {
    text: "Upload what you were served with and Atlas will break it down in plain English.",
    cta: "Upload the Document You Received",
    href: "/upload-document",
    icon: FileSearch,
  },
  hearing_coming_up: {
    text: "Tell Atlas when your hearing is and what you have so far. We'll help you prepare step by step.",
    cta: "Ask Atlas About Your Hearing",
    href: "/ask",
    icon: MessageSquare,
  },
  figuring_things_out: {
    text: "There are no wrong questions. Atlas is ready when you are.",
    cta: "Start Talking to Atlas",
    href: "/ask",
    icon: MessageSquare,
  },
};

const READY_HINT_COPY: Record<SituationType, string> = {
  hearing_coming_up:
    "Start with what you know so far, and Atlas will help you prepare one step at a time.",
  respond_to_filing:
    "Start by uploading what you received so Atlas can review it with you.",
  more_time:
    "Start by telling Atlas what's happening, and it will help you sort out the next step.",
  figuring_things_out:
    "Start anywhere. Atlas is ready to help you make sense of it.",
};

function getGuidedConversationTypeForSituation(situationType: SituationType | null): string | null {
  switch (situationType) {
    case "hearing_coming_up":
      return "guided_hearing_prep";
    case "respond_to_filing":
      return "guided_respond_filing";
    case "more_time":
      return "guided_more_time";
    case "figuring_things_out":
      return "guided_figuring_it_out";
    default:
      return null;
  }
}

const WELCOME_FLOW_ACTIVE_KEY = "custody-atlas:welcome-flow-active";
const PENDING_GUIDED_CONVERSATION_KEY = "pendingGuidedConversation";

function lastNameFromDisplayName(name: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
}

function StepIndicator({ step }: { step: number }) {
  const stepLabels = ["Situation", "Location", "Your Case", "Ready"];
  return (
    <div className="grid grid-cols-4 gap-2" aria-label="Welcome progress">
      {[1, 2, 3, 4].map((item, index) => {
        const isComplete = item < step;
        const isActive = item === step;
        return (
          <div key={item} className="flex items-start gap-2">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  isComplete && "border-primary bg-primary text-primary-foreground",
                  isActive && "border-primary bg-primary/10 text-primary",
                  !isComplete && !isActive && "border-border bg-background text-muted-foreground",
                )}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : item}
              </div>
              <div className="mt-1 text-center text-[10px] text-muted-foreground sm:hidden">
                {stepLabels[index]}
              </div>
            </div>
            <div
              className={cn(
                "hidden h-1 flex-1 rounded-full sm:block",
                item < step ? "bg-primary" : "bg-muted",
                item === 4 && "hidden",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

function Panel({
  children,
  heading,
  subtext,
}: {
  children: React.ReactNode;
  heading: string;
  subtext: string;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden" data-testid="welcome-flow-panel">
      <div className="border-b border-border/50 bg-muted/20 px-5 py-3 sm:px-7">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Custody Atlas welcome</p>
        <h1 className="font-serif text-2xl font-semibold leading-tight text-foreground sm:text-3xl">{heading}</h1>
        {subtext ? <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{subtext}</p> : null}
      </div>
      <div className="px-5 py-3 sm:px-7 sm:py-4">{children}</div>
    </section>
  );
}

interface WelcomeFlowProps {
  onNavigatingAway?: () => void;
}

export function WelcomeFlow({ onNavigatingAway }: WelcomeFlowProps) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const { data: profile } = useUserProfile();
  const [step, setStep] = useState(1);
  const [situationType, setSituationType] = useState<SituationType | null>(null);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [caseName, setCaseName] = useState("");
  const [caseNameTouched, setCaseNameTouched] = useState(false);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [caseCreationFailed, setCaseCreationFailed] = useState(false);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [isCreatingCase, setIsCreatingCase] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isPreparingGuidedConversation, setIsPreparingGuidedConversation] = useState(false);
  const [guidedConversationError, setGuidedConversationError] = useState<string | null>(null);
  const guidedConversationRedirectRef = useRef(false);
  const caseNameInputRef = useRef<HTMLInputElement | null>(null);
  const createdCaseIdRef = useRef<string | null>(null);

  const preferredName = resolvePreferredDisplayName({
    profileDisplayName: profile?.displayName,
    profileFullName: profile?.fullName,
    authMetadataName: user?.authMetadataName,
    authDisplayName: user?.fullName ?? user?.displayName,
    email: user?.email,
  });

  const suggestedCaseName = useMemo(() => {
    const lastName = lastNameFromDisplayName(preferredName);
    return lastName ? `${lastName} v. ` : "";
  }, [preferredName]);

  const currentReadyCopy = READY_COPY[situationType ?? "figuring_things_out"];
  const currentReadyHint = READY_HINT_COPY[situationType ?? "figuring_things_out"];
  const ReadyIcon = currentReadyCopy.icon;
  const trimmedCaseName = caseName.trim();
  const showCaseNameValidation = caseNameTouched && !trimmedCaseName;
  const showCaseNameHelper = !showCaseNameValidation && (!trimmedCaseName || !caseNameTouched);

  useEffect(() => {
    window.sessionStorage.setItem(WELCOME_FLOW_ACTIVE_KEY, "1");
  }, []);

  useEffect(() => {
    if (step === 3 && !caseName && suggestedCaseName) {
      setCaseName(suggestedCaseName);
    }
  }, [step, caseName, suggestedCaseName]);

  useEffect(() => {
    createdCaseIdRef.current = createdCaseId;
  }, [createdCaseId]);

  const persistWelcomeCompletion = async () => {
    if (jurisdiction) {
      try {
        const res = await apiRequestRaw("PATCH", "/api/user-profile/jurisdiction", {
          state: jurisdiction.state,
          county: jurisdiction.county,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to save jurisdiction.");
        }
        await qc.invalidateQueries({ queryKey: ["/api/user-profile"] });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save jurisdiction.";
        console.error("[WelcomeFlow] Failed to persist jurisdiction:", message, error);
      }
    }
    try {
      const res = await apiRequestRaw("PATCH", "/api/user-profile/welcome-dismissed");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save welcome progress.");
      }
      await qc.invalidateQueries({ queryKey: ["/api/user-profile"] });
      await qc.invalidateQueries({ queryKey: ["/api/cases"] });
      window.sessionStorage.setItem(WELCOME_FLOW_JUST_COMPLETED_KEY, "1");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save welcome progress.";
      console.error("[WelcomeFlow] Failed to persist welcome dismissal:", message, error);
      window.sessionStorage.setItem(WELCOME_FLOW_JUST_COMPLETED_KEY, "1");
    }
  };

  const finish = async (fallbackHref = "/ask") => {
    console.log("[WelcomeFlow] completion handler entry", { fallbackHref, situationType, createdCaseId });
    if (guidedConversationRedirectRef.current) {
      console.log("[WelcomeFlow] completion handler bypassed for guided conversation redirect");
      return;
    }
    setGuidedConversationError(null);
    setIsFinishing(true);

    const caseId = createdCaseIdRef.current ?? createdCaseId;
    const conversationTypeMap: Record<string, string> = {
      hearing_prep: "guided_hearing_prep",
      hearing_coming_up: "guided_hearing_prep",
      respond_filing: "guided_respond_filing",
      respond_to_filing: "guided_respond_filing",
      more_time: "guided_more_time",
      figuring_it_out: "guided_figuring_it_out",
      figuring_things_out: "guided_figuring_it_out",
    };
    const conversationType = conversationTypeMap[situationType ?? ""] ?? "guided_figuring_it_out";

    try {
      if (!caseId) {
        throw new Error("Missing guided conversation context");
      }

      const res = await apiRequestRaw("POST", "/api/conversations/initialize-guided", {
        conversation_type: conversationType,
        case_id: caseId,
      });
      if (!res.ok) {
        throw new Error("Failed to initialize guided conversation");
      }

      const data = await res.json().catch(() => ({} as { conversationId?: string; id?: string; conversation?: { id?: string } }));
      const conversationId = data?.conversationId ?? data?.id ?? data?.conversation?.id;
      if (!conversationId) {
        throw new Error("Missing conversation id");
      }

      guidedConversationRedirectRef.current = true;
      console.log("[WelcomeFlow] guided init succeeded", { conversationId, caseId, conversationType });
      window.sessionStorage.setItem(
        PENDING_GUIDED_CONVERSATION_KEY,
        JSON.stringify({ conversationId, caseId, conversationType }),
      );
      console.log("[WelcomeFlow] navigate", {
        href: `/ask?case=${encodeURIComponent(caseId)}&conversation=${encodeURIComponent(conversationId)}`,
        source: "finish",
      });
      onNavigatingAway?.();
      navigate(`/ask?case=${encodeURIComponent(caseId)}&conversation=${encodeURIComponent(conversationId)}`, { replace: true });
      setTimeout(() => {
        window.sessionStorage.removeItem(WELCOME_FLOW_ACTIVE_KEY);
        void persistWelcomeCompletion();
      }, 0);
      return;
    } catch (error) {
      console.error("[WelcomeFlow] Guided completion fallback:", error);
      await persistWelcomeCompletion();
      window.sessionStorage.removeItem(WELCOME_FLOW_ACTIVE_KEY);
      console.log("[WelcomeFlow] navigate", { href: fallbackHref, source: "finish-fallback" });
      navigate(fallbackHref, { replace: true });
    } finally {
      setIsFinishing(false);
    }
  };

  const skipFlow = () => {
    void finish("/ask");
  };

  const createCase = async (nameOverride?: string) => {
    const trimmed = (nameOverride ?? caseName).trim();
    if (!trimmed) return;

    if (nameOverride !== undefined && nameOverride !== caseName) {
      setCaseName(nameOverride);
    }

    setIsCreatingCase(true);
    setCaseError(null);
    setCaseCreationFailed(false);
    try {
      let resolvedUser = user;
      if (!resolvedUser) {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          resolvedUser = user;
          if (resolvedUser) break;
        }
      }
      if (!resolvedUser) {
        throw new Error("Please try again — your session is still loading.");
      }

      const res = await apiRequestRaw("POST", "/api/cases", {
        name: trimmed,
        caseType: "custody",
        stateCode: resolveUSStateCode(jurisdiction?.state) ?? "US",
        situation_type: situationType ?? "figuring_things_out",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "We couldn't create the case right now.");
      }
      const data = await res.json().catch(() => ({} as { case?: { id?: string } }));
      if (typeof data?.case?.id === "string" && data.case.id.length > 0) {
        createdCaseIdRef.current = data.case.id;
        setCreatedCaseId(data.case.id);
      }
      await qc.invalidateQueries({ queryKey: ["/api/cases"] });
      setStep(4);
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't create the case right now.";
      setCaseError(`${message} You can continue and create it later from Workspace.`);
      setCaseCreationFailed(true);
    } finally {
      setIsCreatingCase(false);
    }
  };

  const startGuidedConversation = async (conversationType: string) => {
    console.log("[WelcomeFlow] Talk to Atlas click handler entry", { conversationType });
    setGuidedConversationError(null);
    setIsPreparingGuidedConversation(true);
    guidedConversationRedirectRef.current = true;
    try {
      const caseId = createdCaseIdRef.current ?? createdCaseId;
      if (!caseId) {
        throw new Error("Something went wrong. Tap to try again.");
      }

      const res = await apiRequestRaw("POST", "/api/conversations/initialize-guided", {
        caseId,
        case_id: caseId,
        conversation_type: conversationType,
      });
      if (!res.ok) {
        throw new Error("Something went wrong. Tap to try again.");
      }

      const data = await res.json().catch(() => ({} as { conversation?: { id?: string } }));
      const conversationId = data?.conversation?.id;
      if (!conversationId) {
        throw new Error("Something went wrong. Tap to try again.");
      }

      console.log("[WelcomeFlow] guided init succeeded", { conversationId, caseId });
      window.sessionStorage.setItem(
        PENDING_GUIDED_CONVERSATION_KEY,
        JSON.stringify({ conversationId, caseId, conversationType }),
      );
      console.log("[WelcomeFlow] navigate", {
        href: `/ask?case=${encodeURIComponent(caseId)}&conversation=${encodeURIComponent(conversationId)}`,
        source: "startRespondToFilingConversation",
      });
      onNavigatingAway?.();
      navigate(`/ask?case=${encodeURIComponent(caseId)}&conversation=${encodeURIComponent(conversationId)}`, { replace: true });
      setTimeout(() => {
        window.sessionStorage.removeItem(WELCOME_FLOW_ACTIVE_KEY);
        void persistWelcomeCompletion();
      }, 0);
    } catch (error) {
      console.error("[WelcomeFlow] Failed to initialize guided conversation:", error);
      guidedConversationRedirectRef.current = false;
      setGuidedConversationError("Something went wrong. Tap to try again.");
    } finally {
      setIsPreparingGuidedConversation(false);
    }
  };

  const saveDisplayNameAndContinue = async () => {
    const trimmed = displayNameDraft.trim();
    if (!trimmed) {
      setStep(2);
      return;
    }

    setIsSavingDisplayName(true);
    try {
      const res = await apiRequestRaw("PATCH", "/api/user-profile/display-name", {
        displayName: trimmed,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not save your name.");
      }
      await qc.invalidateQueries({ queryKey: ["/api/user-profile"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your name.";
      console.error("[WelcomeFlow] Failed to save display name:", message, error);
    } finally {
      setIsSavingDisplayName(false);
      setStep(2);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10" data-testid="welcome-flow">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Welcome{preferredName ? `, ${preferredName.split(/\s+/)[0]}` : ""}</p>
          <p className="text-xs text-muted-foreground">Four quick choices, then Atlas gets out of your way.</p>
        </div>
        <button
          type="button"
          onClick={skipFlow}
          disabled={isFinishing}
          className="min-h-[44px] flex items-center text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
          data-testid="button-welcome-skip-flow"
        >
          Skip setup
        </button>
      </div>

      <StepIndicator step={step} />

      <div className="mt-5">
        {step === 1 && (
          <Panel
            heading="Let's start with your situation."
            subtext=""
          >
            <div className="space-y-2">
              <Label htmlFor="welcome-display-name">What should we call you? (optional)</Label>
              <Input
                id="welcome-display-name"
                value={displayNameDraft}
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                placeholder="First name or nickname"
                maxLength={80}
                data-testid="input-welcome-display-name"
              />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This helps Atlas give you answers that actually apply to your case.
            </p>
            <div className="mt-3 grid gap-2">
              {SITUATIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSituationType(item.value)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all",
                    situationType === item.value
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-background hover:border-primary/40 hover:bg-muted/20",
                  )}
                  data-testid={`button-situation-${item.value}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xl" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <span className="text-sm font-medium text-foreground">{item.title}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <Button
                className="w-full sm:w-auto"
                disabled={!situationType || isSavingDisplayName}
                onClick={() => void saveDisplayNameAndContinue()}
                data-testid="button-welcome-step-1-next"
              >
                {isSavingDisplayName ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Next
                {!isSavingDisplayName ? <ArrowRight className="h-4 w-4" /> : null}
              </Button>
            </div>
          </Panel>
        )}

        {step === 2 && (
          <Panel
            heading="Which state is your custody case in?"
            subtext="Atlas gives better answers when it knows your jurisdiction."
          >
            {jurisdiction ? (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Location selected</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {formatJurisdictionLabel(jurisdiction.state, jurisdiction.county)}
                </p>
                <button
                  type="button"
                  className="mt-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setJurisdiction(null)}
                >
                  Choose a different location
                </button>
              </div>
            ) : (
              <LocationSelector onJurisdictionFound={setJurisdiction} />
            )}

            <div className="mt-6 flex flex-col items-end gap-3">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button variant="outline" className="h-11" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  className="h-11"
                  disabled={!jurisdiction}
                  onClick={() => {
                    setStep(3);
                  }}
                  data-testid="button-welcome-step-2-next"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <button
                type="button"
                className="min-h-[44px] flex items-center text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setStep(3)}
                data-testid="button-welcome-step-2-skip"
              >
                Skip for now
              </button>
            </div>
          </Panel>
        )}

        {step === 3 && (
          <Panel
            heading="Give your case a name."
            subtext="Something simple works — most people use both parents' last names."
          >
            <div className="space-y-2">
              <Label htmlFor="welcome-case-name">Case name</Label>
              <Input
                id="welcome-case-name"
                ref={caseNameInputRef}
                value={caseName}
                onChange={(event) => {
                  setCaseName(event.target.value);
                  setCaseError(null);
                  setCaseCreationFailed(false);
                }}
                onBlur={() => setCaseNameTouched(true)}
                placeholder={suggestedCaseName || "e.g. Smith v. Johnson"}
                maxLength={200}
                data-testid="input-welcome-case-name"
              />
              {showCaseNameHelper ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Enter a name to continue — something simple works, like both last names.
                </p>
              ) : null}
              {showCaseNameValidation ? (
                <p className="mt-1.5 text-xs text-destructive">
                  Please enter a case name to continue
                </p>
              ) : null}
            </div>
            {caseError && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
                {caseError}
                <a
                  href="mailto:support@custodyatlas.com"
                  className="block mt-1 underline text-amber-800 dark:text-amber-200 text-xs"
                >
                  Contact support
                </a>
              </div>
            )}
            <div className="mt-6 flex flex-col items-end gap-3">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button variant="outline" className="h-11" onClick={() => setStep(2)}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  className="h-11"
                  disabled={!trimmedCaseName || isCreatingCase}
                  onClick={() => {
                    const liveCaseName = caseNameInputRef.current?.value ?? caseName;
                    const trimmedLiveCaseName = liveCaseName.trim();
                    setCaseNameTouched(true);

                    if (!trimmedLiveCaseName) {
                      setCaseName(liveCaseName);
                      return;
                    }

                    if (caseCreationFailed) {
                      setStep(4);
                      return;
                    }
                    void createCase(liveCaseName);
                  }}
                  data-testid="button-welcome-step-3-next"
                >
                  {isCreatingCase ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {caseCreationFailed ? "Continue anyway" : "Next"}
                  {!isCreatingCase ? <ArrowRight className="h-4 w-4" /> : null}
                </Button>
              </div>
              <button
                type="button"
                className="min-h-[44px] flex items-center text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setStep(4)}
                data-testid="button-welcome-step-3-skip"
              >
                Skip for now
              </button>
            </div>
          </Panel>
        )}

        {step === 4 && (
          <Panel
            heading="Atlas is ready to help."
            subtext={
              situationType === "respond_to_filing"
                ? "Tell Atlas what's going on and we'll figure out next steps together."
                : currentReadyCopy.text
            }
          >
            <div className="rounded-xl border bg-muted/20 px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Your workspace is private to your account.</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    You can change your case details, location, and documents later.
                  </p>
                </div>
              </div>
            </div>

            {situationType === "respond_to_filing" ? (
              <>
                <div className="mt-6">
                  <Button
                    className="w-full gap-2"
                    onClick={() => void startGuidedConversation("guided_respond_filing")}
                    disabled={isPreparingGuidedConversation}
                    data-testid="button-welcome-guided-respond-filing"
                  >
                    {isPreparingGuidedConversation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isPreparingGuidedConversation ? "Getting Atlas ready..." : "Talk to Atlas →"}
                  </Button>
                  {guidedConversationError ? (
                    <p className="mt-3 text-sm text-destructive" data-testid="text-welcome-guided-error">
                      {guidedConversationError}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="mt-4 min-h-[44px] text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => void finish("/upload-document")}
                  disabled={isFinishing || isPreparingGuidedConversation}
                  data-testid="button-welcome-upload-instead"
                >
                  Already have a document? Upload it instead
                </button>
              </>
            ) : (
              <>
                <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    className="w-full gap-2 sm:w-auto"
                    onClick={() => {
                      const guidedConversationType = getGuidedConversationTypeForSituation(situationType);
                      if (guidedConversationType) {
                        void finish("/ask");
                        return;
                      }
                      void finish(currentReadyCopy.href);
                    }}
                    disabled={isFinishing || isPreparingGuidedConversation}
                    data-testid="button-welcome-primary-cta"
                  >
                    {isFinishing || isPreparingGuidedConversation
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <ReadyIcon className="h-4 w-4" />}
                    {isPreparingGuidedConversation ? "Getting Atlas ready..." : currentReadyCopy.cta}
                  </Button>
                </div>
                <p className="mt-3 text-center text-sm text-muted-foreground">{currentReadyHint}</p>
              </>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

export default WelcomeFlow;
