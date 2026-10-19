import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { executeAITaskWithRetry } from "@/lib/ai/core";
import { AIProvider } from "@/lib/ai/types";

export interface CreateJournalEntryParams {
  ownerId: string;
  body: string;
  mood?: number | null;
  linkedCheckInId?: string | null;
  linkedSkillId?: string | null;
  entryId?: string | null;
  clientId?: string | null;
}

/**
 * Creates or edits a journal entry.
 * PRD Epic G1 & Phase L8 Requirement 5:
 * - Edits create a new version.
 * - Stored and never sent to the AI unless user explicitly ticks "Include my journal".
 * - Idempotent by client_id.
 */
export async function createOrEditJournalEntry(
  supabase: SupabaseClient<Database>,
  params: CreateJournalEntryParams
) {
  const {
    ownerId,
    body,
    mood,
    linkedCheckInId,
    linkedSkillId,
    entryId,
    clientId,
  } = params;

  // 1. Idempotency check by client_id
  if (clientId) {
    const { data: existing } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (existing) {
      return existing;
    }
  }

  const finalEntryId = entryId || crypto.randomUUID();
  let nextVersion = 1;

  // 2. If entryId provided, find the latest version to increment
  if (entryId) {
    const { data: prevVersions } = await supabase
      .from("journal_entries")
      .select("version")
      .eq("owner_id", ownerId)
      .eq("entry_id", entryId)
      .order("version", { ascending: false })
      .limit(1);

    if (prevVersions && prevVersions.length > 0) {
      nextVersion = (prevVersions[0].version || 1) + 1;
    }
  }

  // 3. Insert new journal entry row (version)
  const { data, error } = await supabase
    .from("journal_entries")
    .insert({
      owner_id: ownerId,
      entry_id: finalEntryId,
      version: nextVersion,
      client_id: clientId || null,
      body: body.trim(),
      mood: mood ?? null,
      linked_check_in_id: linkedCheckInId || null,
      linked_skill_id: linkedSkillId || null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to save journal entry");
  }

  return data;
}

/**
 * Lists journal timeline (returns latest version for each entry_id, with optional history).
 */
export async function listJournalTimeline(
  supabase: SupabaseClient<Database>,
  ownerId: string
) {
  const { data: entries, error } = await supabase
    .from("journal_entries")
    .select(`
      id,
      entry_id,
      version,
      client_id,
      body,
      mood,
      linked_check_in_id,
      linked_skill_id,
      created_at,
      skills (
        id,
        name
      )
    `)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  // Group by entry_id: the latest version is the head, older versions are history
  const entryGroups = new Map<string, any[]>();
  for (const item of entries || []) {
    const key = item.entry_id || item.id;
    const group = entryGroups.get(key) || [];
    group.push(item);
    entryGroups.set(key, group);
  }

  const timeline = Array.from(entryGroups.values()).map((group) => {
    // Sort descending by version
    group.sort((a, b) => (b.version || 1) - (a.version || 1));
    const current = group[0];
    const history = group.slice(1);
    return {
      ...current,
      total_versions: group.length,
      history,
    };
  });

  return timeline;
}

/**
 * Summarises weekly progress.
 * PRD Epic G1 & Phase L8 Requirement 5:
 * - Runs only when the user taps "Summarise my week".
 * - Runs ONLY on structured stats UNLESS the user explicitly ticks "Include my journal".
 * - Journal text NEVER appears in any AI request unless the explicit option is ticked.
 */
export async function generateWeeklySummary(
  supabase: SupabaseClient<Database>,
  params: {
    ownerId: string;
    includeJournal?: boolean;
    customProvider?: AIProvider;
  }
) {
  const { ownerId, includeJournal, customProvider } = params;

  // 1. Gather weekly structured stats
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Check-ins in past 7 days
  const { data: checkIns } = await supabase
    .from("check_ins")
    .select("outcome, minutes_actual, created_at")
    .eq("owner_id", ownerId)
    .gte("created_at", sevenDaysAgo);

  const totalMinutes = (checkIns || []).reduce((acc, c) => acc + (c.minutes_actual || 0), 0);
  const doneCount = (checkIns || []).filter((c) => c.outcome === "done" || c.outcome === "mvd_only").length;

  // Grades / Quizzes passed in past 7 days
  const { data: grades } = await supabase
    .from("grades")
    .select("verdict, total, created_at")
    .eq("owner_id", ownerId)
    .eq("is_current", true)
    .gte("created_at", sevenDaysAgo);

  const passedQuizzes = (grades || []).filter((g) => g.verdict === "pass").length;

  const stats = {
    weekly_hours: Number((totalMinutes / 60).toFixed(1)),
    completed_sessions: doneCount,
    total_sessions_attempted: (checkIns || []).length,
    passed_quizzes: passedQuizzes,
    period: "Past 7 days",
  };

  // 2. Strictly gate journal entries
  let journalEntries: Array<{ body: string; mood?: number | null; created_at: string }> | undefined;

  if (includeJournal === true) {
    const { data: rawJournal } = await supabase
      .from("journal_entries")
      .select("body, mood, created_at")
      .eq("owner_id", ownerId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(10);

    if (rawJournal && rawJournal.length > 0) {
      journalEntries = rawJournal.map((j) => ({
        body: j.body,
        mood: j.mood,
        created_at: j.created_at,
      }));
    }
  }

  // 3. Call AI task: weekly_summary
  const execution = await executeAITaskWithRetry<{ summary: string }>({
    task: "weekly_summary",
    payload: {
      stats,
      journalEntries, // strictly undefined unless includeJournal === true
    },
    ownerId,
    dbClient: supabase,
    provider: customProvider,
  });

  return {
    summary: execution.data.summary,
    stats,
    includedJournal: Boolean(includeJournal && journalEntries && journalEntries.length > 0),
    modelVersion: execution.modelVersion,
  };
}
