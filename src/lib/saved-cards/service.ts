import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

export interface SaveCardParams {
  ownerId: string;
  skillId?: string | null;
  question: string;
  answer: string;
}

/**
 * Saves a question and answer pair to saved_cards.
 * PRD Epic F, PRD Section 8 & Phase L8 Requirement 4:
 * "Make this a flashcard saves a question and answer pair to saved_cards for that skill.
 *  Saved cards appear in the review block as a self-rated card (evidence stays E0).
 *  A flip-card UI is out of scope for v0.1."
 */
export async function saveCard(
  supabase: SupabaseClient<Database>,
  params: SaveCardParams
) {
  const { ownerId, skillId, question, answer } = params;

  const { data, error } = await supabase
    .from("saved_cards")
    .insert({
      owner_id: ownerId,
      skill_id: skillId || null,
      question: question.trim(),
      answer: answer.trim(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to save flashcard");
  }

  return data;
}

/**
 * Lists saved cards for a user and optionally a specific skill.
 */
export async function listSavedCards(
  supabase: SupabaseClient<Database>,
  params: {
    ownerId: string;
    skillId?: string | null;
  }
) {
  const { ownerId, skillId } = params;
  let query = supabase
    .from("saved_cards")
    .select(`
      id,
      skill_id,
      question,
      answer,
      created_at,
      skills (
        id,
        name
      )
    `)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (skillId) {
    query = query.eq("skill_id", skillId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return data || [];
}
