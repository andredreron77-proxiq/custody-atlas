import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface UserProfile {
  id: string;
  displayName: string | null;
  welcomeDismissedAt: string | null;
  createdAt: string | null;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
  autoUpdateCir: boolean;
}

export interface SetDisplayNameResult {
  ok: boolean;
  reason?: "SUPABASE_NOT_CONFIGURED" | "INVALID_DISPLAY_NAME" | "SUPABASE_ERROR";
  stage?: "update" | "insert";
  error?: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
}

export interface SetWelcomeDismissedResult {
  ok: boolean;
  reason?: "SUPABASE_NOT_CONFIGURED" | "SUPABASE_ERROR";
  stage?: "update" | "insert";
  error?: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
}

export interface SetJurisdictionResult {
  ok: boolean;
  reason?: "SUPABASE_NOT_CONFIGURED" | "INVALID_JURISDICTION" | "SUPABASE_ERROR";
  error?: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
}

export interface ResetOnboardingStateResult {
  ok: boolean;
  reason?: "SUPABASE_NOT_CONFIGURED" | "SUPABASE_ERROR";
  error?: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
}

export interface SetAutoUpdateCIRResult {
  ok: boolean;
  reason?: "SUPABASE_NOT_CONFIGURED" | "SUPABASE_ERROR";
  error?: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  if (!supabaseAdmin) {
    return {
      id: userId,
      displayName: null,
      welcomeDismissedAt: null,
      createdAt: null,
      jurisdictionState: null,
      jurisdictionCounty: null,
      autoUpdateCir: false,
    };
  }

  try {
    const { data } = await supabaseAdmin
      .from("user_profiles")
      .select("id, display_name, welcome_dismissed_at, created_at, jurisdiction_state, jurisdiction_county, auto_update_cir")
      .eq("id", userId)
      .maybeSingle();

    return {
      id: userId,
      displayName: data?.display_name ?? null,
      welcomeDismissedAt: data?.welcome_dismissed_at ?? null,
      createdAt: data?.created_at ?? null,
      jurisdictionState: data?.jurisdiction_state ?? null,
      jurisdictionCounty: data?.jurisdiction_county ?? null,
      autoUpdateCir: data?.auto_update_cir ?? false,
    };
  } catch {
    return {
      id: userId,
      displayName: null,
      welcomeDismissedAt: null,
      createdAt: null,
      jurisdictionState: null,
      jurisdictionCounty: null,
      autoUpdateCir: false,
    };
  }
}

export async function setAutoUpdateCIR(userId: string, autoUpdateCir: boolean): Promise<SetAutoUpdateCIRResult> {
  if (!supabaseAdmin) {
    return { ok: false, reason: "SUPABASE_NOT_CONFIGURED" };
  }

  try {
    const { error } = await supabaseAdmin
      .from("user_profiles")
      .upsert(
        {
          id: userId,
          auto_update_cir: autoUpdateCir,
        },
        { onConflict: "id" },
      );

    if (error) {
      return {
        ok: false,
        reason: "SUPABASE_ERROR",
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
      };
    }

    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      reason: "SUPABASE_ERROR",
      error: {
        code: error?.code,
        message: error?.message ?? "Unexpected error while saving CIR preference.",
        details: error?.details,
        hint: error?.hint,
      },
    };
  }
}

export async function setProfileJurisdiction(
  userId: string,
  jurisdiction: { state: string; county: string },
): Promise<SetJurisdictionResult> {
  if (!supabaseAdmin) {
    return { ok: false, reason: "SUPABASE_NOT_CONFIGURED" };
  }

  const state = jurisdiction.state.trim();
  const county = jurisdiction.county.trim();
  if (!state || !county) {
    return { ok: false, reason: "INVALID_JURISDICTION" };
  }

  try {
    const { error } = await supabaseAdmin
      .from("user_profiles")
      .upsert(
        {
          id: userId,
          jurisdiction_state: state,
          jurisdiction_county: county,
        },
        { onConflict: "id" },
      );

    if (error) {
      return {
        ok: false,
        reason: "SUPABASE_ERROR",
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
      };
    }

    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      reason: "SUPABASE_ERROR",
      error: {
        code: error?.code,
        message: error?.message ?? "Unexpected error while saving jurisdiction.",
        details: error?.details,
        hint: error?.hint,
      },
    };
  }
}

export async function setDisplayName(userId: string, displayName: string): Promise<SetDisplayNameResult> {
  if (!supabaseAdmin) {
    return { ok: false, reason: "SUPABASE_NOT_CONFIGURED" };
  }
  try {
    const trimmed = displayName.trim();
    if (!trimmed) {
      return { ok: false, reason: "INVALID_DISPLAY_NAME" };
    }

    // First try an UPDATE so existing rows keep all other profile fields untouched.
    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update({ display_name: trimmed })
      .eq("id", userId)
      .select("id");

    if (updateError) {
      return {
        ok: false,
        reason: "SUPABASE_ERROR",
        stage: "update",
        error: {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        },
      };
    }

    if ((updatedRows?.length ?? 0) > 0) {
      return { ok: true };
    }

    // No row yet for this user — create one.
    const { error: insertError } = await supabaseAdmin
      .from("user_profiles")
      .insert({ id: userId, display_name: trimmed });

    if (insertError) {
      return {
        ok: false,
        reason: "SUPABASE_ERROR",
        stage: "insert",
        error: {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        },
      };
    }

    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      reason: "SUPABASE_ERROR",
      error: {
        code: error?.code,
        message: error?.message ?? "Unexpected error while saving display name.",
        details: error?.details,
        hint: error?.hint,
      },
    };
  }
}

export async function setWelcomeDismissed(userId: string): Promise<SetWelcomeDismissedResult> {
  if (!supabaseAdmin) {
    return { ok: false, reason: "SUPABASE_NOT_CONFIGURED" };
  }
  const nowIso = new Date().toISOString();
  try {
    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update({ welcome_dismissed_at: nowIso })
      .eq("id", userId)
      .select("id");

    if (updateError) {
      return {
        ok: false,
        reason: "SUPABASE_ERROR",
        stage: "update",
        error: {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        },
      };
    }

    if ((updatedRows?.length ?? 0) > 0) {
      return { ok: true };
    }

    const { error: insertError } = await supabaseAdmin
      .from("user_profiles")
      .insert({ id: userId, welcome_dismissed_at: nowIso });

    if (insertError) {
      return {
        ok: false,
        reason: "SUPABASE_ERROR",
        stage: "insert",
        error: {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        },
      };
    }

    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      reason: "SUPABASE_ERROR",
      error: {
        code: error?.code,
        message: error?.message ?? "Unexpected error while saving welcome dismissal.",
        details: error?.details,
        hint: error?.hint,
      },
    };
  }
}

export async function resetOnboardingState(userId: string): Promise<ResetOnboardingStateResult> {
  if (!supabaseAdmin) {
    return { ok: false, reason: "SUPABASE_NOT_CONFIGURED" };
  }
  try {
    const { error } = await supabaseAdmin
      .from("user_profiles")
      .upsert(
        {
          id: userId,
          display_name: null,
          welcome_dismissed_at: null,
        },
        { onConflict: "id" },
      );

    if (error) {
      return {
        ok: false,
        reason: "SUPABASE_ERROR",
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        },
      };
    }

    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      reason: "SUPABASE_ERROR",
      error: {
        code: error?.code,
        message: error?.message ?? "Unexpected error while resetting onboarding state.",
        details: error?.details,
        hint: error?.hint,
      },
    };
  }
}
