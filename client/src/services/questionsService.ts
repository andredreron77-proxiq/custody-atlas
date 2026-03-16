/**
 * client/src/services/questionsService.ts
 *
 * Frontend questions history service.
 *
 * CURRENT STATE: All functions are stubs — no data is persisted.
 *
 * TO CONNECT SUPABASE:
 *   - Replace getQuestions: call GET /api/questions (authenticated) or query
 *     supabase.from("questions") directly on the client using the anon key +
 *     RLS (Row Level Security) so each user only sees their own rows.
 *   - Replace saveQuestion: POST /api/questions or supabase.from("questions").insert(...)
 */

export interface SavedQuestion {
  id: string;
  jurisdictionState: string;
  jurisdictionCounty: string;
  questionText: string;
  responseJson: Record<string, unknown>;
  createdAt: string;
}

/**
 * Return the signed-in user's question history.
 *
 * Supabase slot:
 *   const { data } = await supabase.from("questions")
 *     .select("*").order("created_at", { ascending: false });
 *   return data ?? [];
 */
export async function getQuestions(): Promise<SavedQuestion[]> {
  return [];
}

/**
 * Persist a question + AI response.
 *
 * Supabase slot:
 *   const { data } = await supabase.from("questions")
 *     .insert({ ...fields }).select().single();
 *   return data;
 */
export async function saveQuestion(
  _fields: Omit<SavedQuestion, "id" | "createdAt">,
): Promise<SavedQuestion | null> {
  return null;
}
