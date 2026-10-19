import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { repairGraphCycles, validateSkillGraph } from "./graph-validation";

export interface SkillGraphPayloadItem {
  id: string; // Temporary ID (e.g. sk_01)
  name: string;
  description: string;
  prereq_ids?: string[];
  estimated_minutes: { min: number; max: number };
  difficulty: number;
  priority?: number;
  verification_type: "recall" | "applied" | "artifact" | "self";
  mvd_minutes: number;
  mvd_task: string;
}

export interface PersistGraphResult {
  success: boolean;
  savedSkills: Array<Database["public"]["Tables"]["skills"]["Row"]>;
  error?: string;
}

/**
 * Persists an AI-generated or imported skill graph to the database.
 * Converts temporary string IDs to database UUIDs, maintains prerequisites,
 * and updates goal graph_version.
 */
export async function persistSkillGraphForGoal(
  client: SupabaseClient<Database>,
  ownerId: string,
  goalId: string,
  rawSkills: SkillGraphPayloadItem[],
  source: "ai" | "user" | "import" = "ai"
): Promise<PersistGraphResult> {
  // 1. Cycle detection & validation
  const adaptedNodes = rawSkills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    prereq_ids: s.prereq_ids || [],
    estimated_min_minutes: s.estimated_minutes?.min || 60,
    estimated_max_minutes: s.estimated_minutes?.max || 120,
    difficulty: s.difficulty || 2,
    priority: s.priority || 2,
    verification_type: s.verification_type,
    mvd_minutes: s.mvd_minutes || 15,
    mvd_task: s.mvd_task,
  }));

  let validation = validateSkillGraph(adaptedNodes);

  // If cycle detected, attempt one repair
  if (validation.hasCycle) {
    const repaired = repairGraphCycles(adaptedNodes);
    const reValidation = validateSkillGraph(repaired);
    if (!reValidation.hasCycle) {
      // Repaired successfully
      for (let i = 0; i < rawSkills.length; i++) {
        rawSkills[i].prereq_ids = repaired[i].prereq_ids;
      }
      validation = reValidation;
    } else {
      return {
        success: false,
        savedSkills: [],
        error: `Skill graph has circular dependencies that could not be repaired: ${validation.errors.join("; ")}`,
      };
    }
  }

  if (!validation.valid) {
    return {
      success: false,
      savedSkills: [],
      error: `Skill graph validation failed: ${validation.errors.join("; ")}`,
    };
  }

  // 2. Clear existing skills for this goal if replacing draft graph
  await client.from("skills").delete().eq("goal_id", goalId).eq("owner_id", ownerId);

  // 3. Map temporary IDs to database UUIDs
  const idMap = new Map<string, string>(); // tempId -> realUUID
  const insertPayloads: Array<Database["public"]["Tables"]["skills"]["Insert"]> = [];

  for (let idx = 0; idx < rawSkills.length; idx++) {
    const s = rawSkills[idx];
    const skillUuid = crypto.randomUUID();
    idMap.set(s.id, skillUuid);

    insertPayloads.push({
      id: skillUuid,
      owner_id: ownerId,
      goal_id: goalId,
      name: s.name,
      description: s.description || null,
      estimated_min_minutes: s.estimated_minutes?.min || 60,
      estimated_max_minutes: s.estimated_minutes?.max || 120,
      difficulty: s.difficulty || 2,
      priority: s.priority || 2,
      verification_type: s.verification_type,
      mvd_minutes: s.mvd_minutes || 15,
      mvd_task: s.mvd_task || null,
      position: idx,
      source,
      status: "not_started",
      evidence_level: 0,
    });
  }

  // 4. Insert skills
  const { data: insertedSkills, error: insertSkillErr } = await client
    .from("skills")
    .insert(insertPayloads)
    .select();

  if (insertSkillErr || !insertedSkills) {
    return {
      success: false,
      savedSkills: [],
      error: `Failed to insert skills: ${insertSkillErr?.message || "Unknown database error"}`,
    };
  }

  // 5. Insert prerequisites
  const prereqInserts: Array<Database["public"]["Tables"]["skill_prereqs"]["Insert"]> = [];
  for (const s of rawSkills) {
    const skillUuid = idMap.get(s.id);
    if (!skillUuid) continue;

    for (const tempPrereqId of s.prereq_ids || []) {
      const prereqUuid = idMap.get(tempPrereqId);
      if (prereqUuid && prereqUuid !== skillUuid) {
        prereqInserts.push({
          owner_id: ownerId,
          skill_id: skillUuid,
          prereq_id: prereqUuid,
        });
      }
    }
  }

  if (prereqInserts.length > 0) {
    const { error: prereqErr } = await client.from("skill_prereqs").insert(prereqInserts);
    if (prereqErr) {
      return {
        success: false,
        savedSkills: insertedSkills as Array<Database["public"]["Tables"]["skills"]["Row"]>,
        error: `Failed to insert prerequisites: ${prereqErr.message}`,
      };
    }
  }

  // 6. Increment goal graph_version
  const { data: currentGoal } = await client.from("goals").select("graph_version").eq("id", goalId).single();
  const nextVersion = ((currentGoal?.graph_version as number) || 1) + 1;
  await client.from("goals").update({ graph_version: nextVersion, updated_at: new Date().toISOString() }).eq("id", goalId);

  return {
    success: true,
    savedSkills: insertedSkills as Array<Database["public"]["Tables"]["skills"]["Row"]>,
  };
}
