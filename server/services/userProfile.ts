import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface UserProfile {
  id: string;
  displayName: string | null;
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  if (!supabaseAdmin) {
    return { id: userId, displayName: null };
  }

  try {
    const { data } = await supabaseAdmin
      .from("user_profiles")
      .select("id, display_name")
      .eq("id", userId)
      .maybeSingle();

    return {
      id: userId,
      displayName: data?.display_name ?? null,
    };
  } catch {
    return { id: userId, displayName: null };
  }
}

export async function setDisplayName(userId: string, displayName: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const trimmed = displayName.trim();
    if (!trimmed) return false;

    const { error } = await supabaseAdmin
      .from("user_profiles")
      .upsert({ id: userId, display_name: trimmed }, { onConflict: "id" });
    return !error;
  } catch {
    return false;
  }
}
