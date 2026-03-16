/**
 * server/services/questions.ts
 *
 * Questions ownership and history service.
 *
 * CURRENT STATE: All methods are stubs — no data is persisted.
 *
 * TO CONNECT SUPABASE:
 *   - Create a `questions` table: id, user_id, jurisdiction_state,
 *     jurisdiction_county, question_text, response_json, created_at
 *   - Replace each stub below with the corresponding supabase.from("questions") call.
 *   - Enable Row Level Security so users can only read their own rows.
 */

export interface SavedQuestion {
  id: string;
  userId: string;
  jurisdictionState: string;
  jurisdictionCounty: string;
  questionText: string;
  responseJson: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Retrieve all questions saved by a user, newest first.
 *
 * Supabase slot:
 *   const { data } = await supabase.from("questions")
 *     .select("*").eq("user_id", userId).order("created_at", { ascending: false });
 *   return data ?? [];
 */
export async function getQuestions(_userId: string): Promise<SavedQuestion[]> {
  return [];
}

/**
 * Persist a question + AI response for a user.
 *
 * Supabase slot:
 *   const { data } = await supabase.from("questions").insert({ user_id: userId, ...fields }).select().single();
 *   return data;
 */
export async function saveQuestion(
  _userId: string,
  _fields: Omit<SavedQuestion, "id" | "userId" | "createdAt">,
): Promise<SavedQuestion | null> {
  return null;
}

/**
 * Delete a saved question by ID (verifying ownership).
 *
 * Supabase slot:
 *   await supabase.from("questions").delete().eq("id", questionId).eq("user_id", userId);
 */
export async function deleteQuestion(
  _questionId: string,
  _userId: string,
): Promise<void> {
  // no-op
}
