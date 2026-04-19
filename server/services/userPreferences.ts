import type { UserSignals } from "../lib/adaptiveIntelligence";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface UserPreferences {
  communication_style: "auto" | "simple" | "balanced" | "professional";
  response_format: "auto" | "bullets" | "prose";
  explain_terms: "auto" | "always" | "once" | "never";
  detected_knowledge_level: "beginner" | "intermediate" | "advanced";
  questions_asked_count: number;
  preference_locked: boolean;
}

const DEFAULT_USER_PREFERENCES: UserPreferences = {
  communication_style: "auto",
  response_format: "auto",
  explain_terms: "auto",
  detected_knowledge_level: "beginner",
  questions_asked_count: 0,
  preference_locked: false,
};

export function getDefaultUserPreferences(): UserPreferences {
  return { ...DEFAULT_USER_PREFERENCES };
}

function normalizeUserPreferences(data: Partial<UserPreferences> | null | undefined): UserPreferences {
  return {
    communication_style: data?.communication_style ?? "auto",
    response_format: data?.response_format ?? "auto",
    explain_terms: data?.explain_terms ?? "auto",
    detected_knowledge_level: data?.detected_knowledge_level ?? "beginner",
    questions_asked_count: data?.questions_asked_count ?? 0,
    preference_locked: data?.preference_locked ?? false,
  };
}

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select(`
      communication_style,
      response_format,
      explain_terms,
      detected_knowledge_level,
      questions_asked_count,
      preference_locked
    `)
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeUserPreferences(data as Partial<UserPreferences>);
}

export async function updateDetectedPreferences(
  userId: string,
  signals: UserSignals,
  currentPrefs: UserPreferences,
): Promise<void> {
  if (!supabaseAdmin || currentPrefs.preference_locked) return;

  const newCount = currentPrefs.questions_asked_count + 1;
  const shouldUpdateLevel = newCount >= 3;

  const updates: Partial<UserPreferences> & { questions_asked_count: number } = {
    questions_asked_count: newCount,
  };

  if (shouldUpdateLevel) {
    const currentLevel = currentPrefs.detected_knowledge_level;
    const detectedLevel = signals.knowledgeLevel;

    if (
      (detectedLevel === "advanced" && currentLevel !== "advanced") ||
      (detectedLevel === "intermediate" && currentLevel === "beginner")
    ) {
      updates.detected_knowledge_level = detectedLevel;
    }
  }

  await supabaseAdmin
    .from("user_profiles")
    .upsert({ id: userId, ...updates }, { onConflict: "id" });
}

export async function setUserPreferences(
  userId: string,
  prefs: {
    communication_style?: "simple" | "balanced" | "professional";
    response_format?: "bullets" | "prose";
    explain_terms?: "always" | "once" | "never";
  },
): Promise<void> {
  if (!supabaseAdmin) return;

  await supabaseAdmin
    .from("user_profiles")
    .upsert(
      {
        id: userId,
        ...prefs,
        preference_locked: true,
      },
      { onConflict: "id" },
    );
}

export async function resetUserPreferences(userId: string): Promise<void> {
  if (!supabaseAdmin) return;

  await supabaseAdmin
    .from("user_profiles")
    .upsert(
      {
        id: userId,
        communication_style: "auto",
        response_format: "auto",
        explain_terms: "auto",
        detected_knowledge_level: "beginner",
        questions_asked_count: 0,
        preference_locked: false,
      },
      { onConflict: "id" },
    );
}

export function resolveEffectivePreferences(
  prefs: UserPreferences,
  signals: UserSignals,
): {
  knowledgeLevel: "beginner" | "intermediate" | "advanced";
  responseFormat: "bullets" | "prose";
  explainTerms: boolean;
} {
  const knowledgeLevel = prefs.communication_style !== "auto"
    ? prefs.communication_style === "professional"
      ? "advanced"
      : prefs.communication_style === "balanced"
        ? "intermediate"
        : "beginner"
    : prefs.questions_asked_count >= 3
      ? prefs.detected_knowledge_level
      : signals.knowledgeLevel;

  const responseFormat = prefs.response_format !== "auto"
    ? prefs.response_format
    : signals.needsEmpathyFirst
      ? "prose"
      : signals.prefersBullets
        ? "bullets"
        : "bullets";

  const explainTerms = prefs.explain_terms !== "auto"
    ? prefs.explain_terms !== "never"
    : knowledgeLevel === "beginner";

  return { knowledgeLevel, responseFormat, explainTerms };
}
