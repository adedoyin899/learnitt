import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { executeAITaskWithRetry } from "@/lib/ai/core";
import { AIProvider } from "@/lib/ai/types";
import { getMaterialConsent } from "@/lib/materials/consent";
import { searchMaterialChunks } from "@/lib/materials/retrieval";

export interface RetrievedChunkInfo {
  id: string;
  material_id: string;
  material_title?: string;
  content: string;
  ordinal: number;
}

export interface PostMessageResult {
  userMessage: {
    id: string;
    conversation_id: string;
    role: "user";
    content: string;
    created_at: string;
  };
  assistantMessage: {
    id: string;
    conversation_id: string;
    role: "assistant";
    content: string;
    cited_chunk_ids: string[];
    general_knowledge: boolean;
    created_at: string;
  };
  citedChunks: RetrievedChunkInfo[];
}

/**
 * Creates a new conversation thread for a skill or goal.
 * PRD Epics F & G1 & Phase L8 Requirement 1 & 2.
 */
export async function createConversation(
  supabase: SupabaseClient<Database>,
  params: {
    ownerId: string;
    skillId?: string | null;
    goalId?: string | null;
  }
) {
  const { ownerId, skillId, goalId } = params;

  // If skillId provided but no goalId, resolve goalId from skill
  let resolvedGoalId = goalId || null;
  if (skillId && !resolvedGoalId) {
    const { data: skill } = await supabase
      .from("skills")
      .select("goal_id")
      .eq("id", skillId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (skill?.goal_id) {
      resolvedGoalId = skill.goal_id;
    }
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      owner_id: ownerId,
      skill_id: skillId || null,
      goal_id: resolvedGoalId,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create conversation");
  }

  return data;
}

/**
 * Lists conversations for a user, optionally filtered by skill or goal.
 */
export async function listConversations(
  supabase: SupabaseClient<Database>,
  params: {
    ownerId: string;
    skillId?: string | null;
    goalId?: string | null;
  }
) {
  const { ownerId, skillId, goalId } = params;
  let query = supabase
    .from("conversations")
    .select(`
      id,
      goal_id,
      skill_id,
      created_at,
      skills (
        id,
        name
      ),
      goals (
        id,
        title,
        health_flag
      )
    `)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (skillId) {
    query = query.eq("skill_id", skillId);
  }
  if (goalId) {
    query = query.eq("goal_id", goalId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return data || [];
}

/**
 * Retrieves a conversation and its messages with cited chunks.
 */
export async function getConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  ownerId: string
) {
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select(`
      id,
      goal_id,
      skill_id,
      created_at,
      skills (
        id,
        name
      ),
      goals (
        id,
        title,
        health_flag
      )
    `)
    .eq("id", conversationId)
    .eq("owner_id", ownerId)
    .single();

  if (convErr || !conv) {
    throw new Error("Conversation not found");
  }

  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  if (msgErr) {
    throw new Error(msgErr.message);
  }

  // Collect all cited chunk IDs
  const allCitedIds = Array.from(
    new Set((messages || []).flatMap((m) => m.cited_chunk_ids || []))
  );

  const chunkMap = new Map<string, RetrievedChunkInfo>();
  if (allCitedIds.length > 0) {
    const { data: chunks } = await supabase
      .from("material_chunks")
      .select(`
        id,
        material_id,
        content,
        ordinal,
        materials (
          id,
          title
        )
      `)
      .in("id", allCitedIds)
      .eq("owner_id", ownerId);

    if (chunks) {
      for (const ch of chunks as any[]) {
        chunkMap.set(ch.id, {
          id: ch.id,
          material_id: ch.material_id,
          material_title: ch.materials?.title || "Uploaded Material",
          content: ch.content,
          ordinal: ch.ordinal,
        });
      }
    }
  }

  return {
    conversation: conv,
    messages: (messages || []).map((m) => ({
      ...m,
      citations: (m.cited_chunk_ids || [])
        .map((cid) => chunkMap.get(cid))
        .filter(Boolean) as RetrievedChunkInfo[],
    })),
  };
}

/**
 * Posts a user message and generates a grounded tutor reply.
 * PRD 7.5 & Phase L8 Requirement 1:
 * - Retrieves chunks for confirmed materials
 * - AI reply cites chunk ids
 * - Remove any citation id that is not in the retrieved set
 * - If nothing supports the answer, label it "General knowledge, not from your materials"
 *   and set general_knowledge on the message.
 */
export async function postMessageAndGenerateAnswer(
  supabase: SupabaseClient<Database>,
  params: {
    conversationId: string;
    ownerId: string;
    content: string;
    customProvider?: AIProvider;
  }
): Promise<PostMessageResult> {
  const { conversationId, ownerId, content, customProvider } = params;

  // 1. Fetch conversation details
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select(`
      id,
      goal_id,
      skill_id,
      skills (
        id,
        name
      ),
      goals (
        id,
        title,
        health_flag
      )
    `)
    .eq("id", conversationId)
    .eq("owner_id", ownerId)
    .single();

  if (convErr || !conv) {
    throw new Error("Conversation not found");
  }

  // 2. Insert User Message
  const { data: userMsg, error: userMsgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      owner_id: ownerId,
      role: "user",
      content: content.trim(),
    })
    .select()
    .single();

  if (userMsgErr || !userMsg) {
    throw new Error(userMsgErr?.message || "Failed to record user message");
  }

  // 3. Retrieve relevant chunks from confirmed materials
  let retrievedChunks: RetrievedChunkInfo[] = [];

  // Check consent first
  const consent = await getMaterialConsent(ownerId, supabase);
  if (consent.consent) {
    // If skill linked, find confirmed materials for that skill
    let materialIds: string[] = [];
    if (conv.skill_id) {
      const { data: links } = await supabase
        .from("skill_material_links")
        .select("material_id")
        .eq("skill_id", conv.skill_id)
        .eq("owner_id", ownerId)
        .eq("confirmed", true);

      if (links) {
        materialIds = links.map((l) => l.material_id);
      }
    }

    if (materialIds.length > 0) {
      // Fetch chunks from these confirmed materials
      const { data: chunks } = await supabase
        .from("material_chunks")
        .select(`
          id,
          material_id,
          content,
          ordinal,
          materials (
            id,
            title
          )
        `)
        .in("material_id", materialIds)
        .eq("owner_id", ownerId)
        .limit(10);

      if (chunks && chunks.length > 0) {
        retrievedChunks = (chunks as any[]).map((c) => ({
          id: c.id,
          material_id: c.material_id,
          material_title: c.materials?.title || "Course Material",
          content: c.content,
          ordinal: c.ordinal,
        }));
      }
    } else {
      // Fallback: full-text search scoped to owner and goal
      try {
        const searchRes = await searchMaterialChunks({
          dbClient: supabase,
          query: content,
          ownerId,
          goalId: conv.goal_id || undefined,
          limit: 8,
        });
        retrievedChunks = searchRes.map((r) => ({
          id: r.id,
          material_id: r.material_id,
          material_title: r.material_title,
          content: r.content,
          ordinal: r.ordinal || 0,
        }));
      } catch {
        // Fallback to empty if FTS fails
        retrievedChunks = [];
      }
    }
  }

  // Set of valid chunk IDs in the retrieved set
  const validChunkIds = new Set(retrievedChunks.map((c) => c.id));

  // 4. Invoke AI Task: answer_question
  const skillName = (conv.skills as any)?.name || undefined;
  const aiExecution = await executeAITaskWithRetry<{
    answer: string;
    cited_chunk_ids: string[];
    general_knowledge: boolean;
  }>({
    task: "answer_question",
    payload: {
      question: content,
      skillName,
      chunks: retrievedChunks.map((c) => ({ id: c.id, content: c.content })),
    },
    ownerId,
    dbClient: supabase,
    provider: customProvider,
  });

  const aiResult = aiExecution.data;

  // 5. Invariant: Remove any citation id that is not in the retrieved set
  const rawCitations = aiResult.cited_chunk_ids || [];
  const sanitizedCitations = rawCitations.filter((id) => validChunkIds.has(id));

  // 6. Invariant: If nothing supports the answer, label it "General knowledge, not from your materials"
  // and set general_knowledge on the message.
  let generalKnowledge = Boolean(aiResult.general_knowledge);
  const finalAnswer = aiResult.answer;

  if (sanitizedCitations.length === 0 || retrievedChunks.length === 0) {
    generalKnowledge = true;
  }

  // 7. Insert Assistant Message
  const { data: assistantMsg, error: asstErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      owner_id: ownerId,
      role: "assistant",
      content: finalAnswer,
      cited_chunk_ids: sanitizedCitations,
      general_knowledge: generalKnowledge,
    })
    .select()
    .single();

  if (asstErr || !assistantMsg) {
    throw new Error(asstErr?.message || "Failed to save assistant message");
  }

  const citedChunks = retrievedChunks.filter((c) => sanitizedCitations.includes(c.id));

  return {
    userMessage: {
      id: userMsg.id,
      conversation_id: userMsg.conversation_id,
      role: "user",
      content: userMsg.content,
      created_at: userMsg.created_at,
    },
    assistantMessage: {
      id: assistantMsg.id,
      conversation_id: assistantMsg.conversation_id,
      role: "assistant",
      content: assistantMsg.content,
      cited_chunk_ids: assistantMsg.cited_chunk_ids,
      general_knowledge: assistantMsg.general_knowledge,
      created_at: assistantMsg.created_at,
    },
    citedChunks,
  };
}

/**
 * Re-explains a message in a specified style: simpler, more technical, or with an example.
 * PRD 7.5 & Phase L8 Requirement 3:
 * - Each call counts against the AI cap.
 */
export async function explainMessageStyle(
  supabase: SupabaseClient<Database>,
  params: {
    messageId: string;
    ownerId: string;
    style: "simpler" | "more_technical" | "with_example";
    customProvider?: AIProvider;
  }
) {
  const { messageId, ownerId, style, customProvider } = params;

  // 1. Fetch message
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .eq("owner_id", ownerId)
    .single();

  if (msgErr || !msg) {
    throw new Error("Message not found");
  }

  // 2. Call AI task: explain_level (counts against usage counters / cap)
  const execution = await executeAITaskWithRetry<{ explanation: string }>({
    task: "explain_level",
    payload: {
      priorAnswer: msg.content,
      targetStyle: style,
    },
    ownerId,
    dbClient: supabase,
    provider: customProvider,
  });

  return {
    explanation: execution.data.explanation,
    style,
    modelVersion: execution.modelVersion,
  };
}
