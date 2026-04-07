import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface UserProfile {
  id: string;
  displayName: string | null;
  welcomeDismissedAt: string | null;
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

export async function getUserProfile(userId: string): Promise<UserProfile> {
  if (!supabaseAdmin) {
    return { id: userId, displayName: null, welcomeDismissedAt: null };
  }

  try {
    const { data } = await supabaseAdmin
      .from("user_profiles")
      .select("id, display_name, welcome_dismissed_at")
      .eq("id", userId)
      .maybeSingle();

    return {
      id: userId,
      displayName: data?.display_name ?? null,
      welcomeDismissedAt: data?.welcome_dismissed_at ?? null,
    };
  } catch {
    return { id: userId, displayName: null, welcomeDismissedAt: null };
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
