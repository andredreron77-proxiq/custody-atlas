/**
 * server/services/questions.ts
 *
 * Supabase-backed questions service.
 *
 * Expected questions table schema:
 *   id                uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY
 *   user_id           uuid NOT NULL (FK → auth.users)
 *   jurisdiction_state text NOT NULL
 *   jurisdiction_county text NOT NULL
 *   question_text     text NOT NULL
 *   response_json     jsonb
 *   created_at        timestamptz NOT NULL DEFAULT now()
 */

import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface SavedQuestion {
  id: string;
  userId: string;
  jurisdictionState: string;
  jurisdictionCounty: string;
  questionText: string;
  responseJson: Record<string, unknown>;
  createdAt: string;
}

export async function getQuestions(userId: string): Promise<SavedQuestion[]> {
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("questions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      jurisdictionState: r.jurisdiction_state,
      jurisdictionCounty: r.jurisdiction_county,
      questionText: r.question_text,
      responseJson: r.response_json ?? {},
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function saveQuestion(
  userId: string,
  fields: Omit<SavedQuestion, "id" | "userId" | "createdAt">,
): Promise<SavedQuestion | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("questions")
      .insert({
        user_id: userId,
        jurisdiction_state: fields.jurisdictionState,
        jurisdiction_county: fields.jurisdictionCounty,
        question_text: fields.questionText,
        response_json: fields.responseJson,
      })
      .select()
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      jurisdictionState: data.jurisdiction_state,
      jurisdictionCounty: data.jurisdiction_county,
      questionText: data.question_text,
      responseJson: data.response_json ?? {},
      createdAt: data.created_at,
    };
  } catch {
    return null;
  }
}

export async function deleteQuestion(questionId: string, userId: string): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin
      .from("questions")
      .delete()
      .eq("id", questionId)
      .eq("user_id", userId);
  } catch (err) {
    console.error("[questions] deleteQuestion error:", err);
  }
}
