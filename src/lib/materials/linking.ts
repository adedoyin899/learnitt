import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { ProposedLink } from "./types";

export interface SkillCoverageSummary {
  totalSkills: number;
  coveredSkills: number;
  uncoveredSkills: Array<{
    id: string;
    title: string;
    category?: string | null;
  }>;
}

/**
 * Applies proposed links from AI link_materials task output.
 * PRD Epic B2 & Prompt Requirement 4:
 * "Above 0.7 they appear as suggested, below as weak. The user confirms or removes.
 *  Confirmed links are never overwritten by a later run."
 */
export async function applyProposedLinks(
  ownerId: string,
  proposedLinks: Array<{
    skill_id: string;
    material_id: string;
    confidence: number;
    reason?: string;
  }>,
  dbClient: SupabaseClient<Database>
): Promise<{ added: number; preserved: number; updated: number }> {
  if (!proposedLinks || proposedLinks.length === 0) {
    return { added: 0, preserved: 0, updated: 0 };
  }

  // 1. Fetch existing links for these skills/materials
  const skillIds = Array.from(new Set(proposedLinks.map((p) => p.skill_id)));
  const { data: existingData, error: fetchErr } = await dbClient
    .from("skill_material_links")
    .select("skill_id, material_id, confidence, confirmed")
    .eq("owner_id", ownerId)
    .in("skill_id", skillIds);

  if (fetchErr) {
    throw new Error(`Failed to query existing skill material links: ${fetchErr.message}`);
  }

  const existingMap = new Map<string, { confidence: number; confirmed: boolean }>();
  if (existingData) {
    for (const row of existingData as any[]) {
      existingMap.set(`${row.skill_id}::${row.material_id}`, {
        confidence: Number(row.confidence),
        confirmed: Boolean(row.confirmed),
      });
    }
  }

  let added = 0;
  let preserved = 0;
  let updated = 0;

  for (const proposed of proposedLinks) {
    const key = `${proposed.skill_id}::${proposed.material_id}`;
    const existing = existingMap.get(key);

    // Clamp confidence between 0.00 and 1.00
    const conf = Math.max(0, Math.min(1, Math.round(proposed.confidence * 100) / 100));

    if (existing) {
      if (existing.confirmed) {
        // Confirmed links are never overwritten by a later run!
        preserved++;
        continue;
      }

      // Existing unconfirmed link: update confidence
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (dbClient.from("skill_material_links") as any)
        .update({
          confidence: conf,
        })
        .eq("owner_id", ownerId)
        .eq("skill_id", proposed.skill_id)
        .eq("material_id", proposed.material_id);

      if (updateErr) {
        throw new Error(`Failed to update skill material link: ${updateErr.message}`);
      }
      updated++;
    } else {
      // New link: insert with confirmed = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (dbClient.from("skill_material_links") as any).insert({
        owner_id: ownerId,
        skill_id: proposed.skill_id,
        material_id: proposed.material_id,
        confidence: conf,
        confirmed: false,
      });

      if (insertErr) {
        throw new Error(`Failed to insert skill material link: ${insertErr.message}`);
      }
      added++;
    }
  }

  return { added, preserved, updated };
}

/**
 * Confirms a proposed link.
 */
export async function confirmMaterialLink(
  ownerId: string,
  skillId: string,
  materialId: string,
  dbClient: SupabaseClient<Database>
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (dbClient.from("skill_material_links") as any)
    .update({ confirmed: true })
    .eq("owner_id", ownerId)
    .eq("skill_id", skillId)
    .eq("material_id", materialId);

  if (error) {
    throw new Error(`Failed to confirm skill material link: ${error.message}`);
  }
}

/**
 * Removes a link (confirmed or suggested).
 */
export async function removeMaterialLink(
  ownerId: string,
  skillId: string,
  materialId: string,
  dbClient: SupabaseClient<Database>
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (dbClient.from("skill_material_links") as any)
    .delete()
    .eq("owner_id", ownerId)
    .eq("skill_id", skillId)
    .eq("material_id", materialId);

  if (error) {
    throw new Error(`Failed to remove skill material link: ${error.message}`);
  }
}

/**
 * Gets skills for a goal that have no materials linked yet.
 * PRD Epic B2 & Prompt Requirement 6: "Show which skills have no material yet."
 */
export async function getSkillsWithoutMaterials(
  ownerId: string,
  goalId: string,
  dbClient: SupabaseClient<Database>
): Promise<SkillCoverageSummary> {
  // 1. Fetch all skills for this goal
  const { data: skillsData, error: skillsErr } = await dbClient
    .from("skills")
    .select("id, name, description")
    .eq("owner_id", ownerId)
    .eq("goal_id", goalId);

  if (skillsErr || !skillsData) {
    return { totalSkills: 0, coveredSkills: 0, uncoveredSkills: [] };
  }

  const skillIds = skillsData.map((s: any) => s.id);
  if (skillIds.length === 0) {
    return { totalSkills: 0, coveredSkills: 0, uncoveredSkills: [] };
  }

  // 2. Fetch existing links for these skills
  const { data: linksData } = await dbClient
    .from("skill_material_links")
    .select("skill_id")
    .eq("owner_id", ownerId)
    .in("skill_id", skillIds);

  const coveredSkillIds = new Set<string>();
  if (linksData) {
    for (const link of linksData as any[]) {
      coveredSkillIds.add(link.skill_id);
    }
  }

  const uncoveredSkills = skillsData
    .filter((s: any) => !coveredSkillIds.has(s.id))
    .map((s: any) => ({
      id: s.id,
      title: s.name || s.title || "Untitled Skill",
      category: s.description || null,
    }));

  return {
    totalSkills: skillsData.length,
    coveredSkills: coveredSkillIds.size,
    uncoveredSkills,
  };
}

/**
 * Fetches all links for a goal with skill and material details.
 * Categorizes confidence: >= 0.7 is 'suggested', < 0.7 is 'weak'.
 */
export async function getGoalLinksWithDetails(
  ownerId: string,
  goalId: string,
  dbClient: SupabaseClient<Database>
): Promise<ProposedLink[]> {
  // Fetch skills for this goal
  const { data: skills } = await dbClient
    .from("skills")
    .select("id, name")
    .eq("owner_id", ownerId)
    .eq("goal_id", goalId);

  if (!skills || skills.length === 0) return [];
  const skillMap = new Map<string, string>(
    skills.map((s: any) => [s.id, s.name || s.title || "Unknown Skill"])
  );
  const skillIds = Array.from(skillMap.keys());

  // Fetch materials for this goal or general
  const { data: materials } = await dbClient
    .from("materials")
    .select("id, title")
    .eq("owner_id", ownerId);

  const materialMap = new Map<string, string>(
    (materials || []).map((m: any) => [m.id, m.title])
  );

  // Fetch links
  const { data: links } = await dbClient
    .from("skill_material_links")
    .select("skill_id, material_id, confidence, confirmed")
    .eq("owner_id", ownerId)
    .in("skill_id", skillIds);

  if (!links) return [];

  return (links as any[]).map((row) => {
    const conf = Number(row.confidence);
    return {
      skill_id: row.skill_id,
      skill_name: skillMap.get(row.skill_id) || "Unknown Skill",
      material_id: row.material_id,
      material_title: materialMap.get(row.material_id) || "Unknown Material",
      confidence: conf,
      category: conf >= 0.7 ? "suggested" : "weak",
      confirmed: Boolean(row.confirmed),
    };
  });
}
