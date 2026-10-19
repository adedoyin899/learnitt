import { SupabaseClient } from "@supabase/supabase-js";
import { executeAITaskWithRetry, AICapReachedError } from "@/lib/ai/core";
import { AIProvider } from "@/lib/ai/types";
import { SEARCH_CONFIG } from "@/lib/config/search";
import { SearchProvider, SearchCandidate, SearchCapReachedError } from "@/lib/search/types";
import { getSearchProvider } from "@/lib/search/registry";
import { Database, ResourceType } from "@/types/database";
import { normalizeUrl, vetUrl, assertSearchSourced } from "./vetting";
import { classifyCandidatesInBatches } from "./classifier";

export interface DiscoverOptions {
  goalId: string;
  ownerId: string;
  dbClient: SupabaseClient<Database>;
  searchProvider?: SearchProvider;
  aiProvider?: AIProvider;
  skillId?: string; // Optional: target single skill
  maxSkillsToDiscover?: number;
  customFetch?: typeof fetch;
  onProgress?: (progress: {
    phase: "identifying_skills" | "generating_queries" | "searching" | "vetting" | "classifying" | "saving";
    skillsCount: number;
    queriesCount: number;
    candidatesCount: number;
    vettedCount: number;
    deadCount: number;
  }) => Promise<void> | void;
}

export interface DiscoveryResult {
  goalId: string;
  skillsEvaluated: number;
  queriesRun: number;
  candidatesFound: number;
  vettedOkCount: number;
  deadDroppedCount: number;
  excludedSkippedCount: number;
  duplicateSkippedCount: number;
  resourcesCreated: Array<{
    id: string;
    url: string;
    title: string | null;
    skill_id: string | null;
    type: ResourceType | null;
    estimated_minutes: number | null;
    relevance: number | null;
    found_by_query: string | null;
    search_provider: string | null;
  }>;
}

/**
 * Orchestrates resource discovery for a goal:
 * 1. Identifies skills that lack material or need depth.
 * 2. Generates up to 3 queries per skill using search_queries task.
 * 3. Fetches candidates via SearchProvider.
 * 4. Strictly enforces that NO candidate URL comes from the model.
 * 5. Filters out goal's resource_exclusions.
 * 6. Deduplicates candidates by normalized URL.
 * 7. Vets via SSRF & HTTP check (drops dead links, counts them).
 * 8. Classifies in batches of up to 10 candidates.
 * 9. Stores resources with approval: "pending" and provenance.
 */
export async function discoverResourcesForGoal(
  options: DiscoverOptions
): Promise<DiscoveryResult> {
  const { goalId, ownerId, dbClient } = options;
  const searchProvider = options.searchProvider || getSearchProvider();

  // 1. Fetch skills for this goal
  let skillsQuery = dbClient
    .from("skills")
    .select("id, name, difficulty, description")
    .eq("goal_id", goalId);

  if (options.skillId) {
    skillsQuery = skillsQuery.eq("id", options.skillId);
  }

  const { data: skills, error: skillsErr } = await skillsQuery;
  if (skillsErr || !skills || skills.length === 0) {
    return {
      goalId,
      skillsEvaluated: 0,
      queriesRun: 0,
      candidatesFound: 0,
      vettedOkCount: 0,
      deadDroppedCount: 0,
      excludedSkippedCount: 0,
      duplicateSkippedCount: 0,
      resourcesCreated: [],
    };
  }

  // 2. Determine which skills lack materials or need depth
  const skillIds = skills.map((s) => s.id);
  const { data: links } = await dbClient
    .from("skill_material_links")
    .select("skill_id")
    .in("skill_id", skillIds);

  const linkCountBySkill = new Map<string, number>();
  for (const l of links || []) {
    linkCountBySkill.set(l.skill_id, (linkCountBySkill.get(l.skill_id) || 0) + 1);
  }

  // Sort skills: 0 materials first (lacks material), then 1 material (needs depth)
  const prioritizedSkills = [...skills].sort((a, b) => {
    const countA = linkCountBySkill.get(a.id) || 0;
    const countB = linkCountBySkill.get(b.id) || 0;
    return countA - countB;
  });

  const maxSkills = options.maxSkillsToDiscover || 3;
  const targetSkills = prioritizedSkills.slice(0, maxSkills);

  // 3. Fetch exclusions and existing resources for this goal
  const { data: exclusions } = await dbClient
    .from("resource_exclusions")
    .select("url")
    .eq("goal_id", goalId);

  const excludedUrlSet = new Set<string>();
  for (const ex of exclusions || []) {
    excludedUrlSet.add(normalizeUrl(ex.url));
  }

  const { data: existingResources } = await dbClient
    .from("resources")
    .select("url")
    .eq("goal_id", goalId);

  const existingUrlSet = new Set<string>();
  for (const res of existingResources || []) {
    existingUrlSet.add(normalizeUrl(res.url));
  }

  // Track URLs returned strictly by search provider
  const searchProvidedUrls = new Set<string>();
  const skillCandidatesMap = new Map<
    string,
    Array<{ candidate: SearchCandidate; query: string }>
  >();

  let queriesRun = 0;
  let candidatesFound = 0;

  // 4. Generate queries and fetch search candidates
  for (const skill of targetSkills) {
    let queries: string[] = [];

    try {
      const aiResponse = await executeAITaskWithRetry<{ queries: string[] }>({
        ownerId,
        task: "search_queries",
        payload: {
          skillName: skill.name,
          level:
            (skill.difficulty ?? 2) <= 2
              ? "beginner"
              : (skill.difficulty ?? 2) <= 4
              ? "intermediate"
              : "advanced",
        },
        dbClient,
        provider: options.aiProvider,
      });

      queries = (aiResponse.data?.queries || []).slice(
        0,
        SEARCH_CONFIG.MAX_QUERIES_PER_SKILL
      );
    } catch (err) {
      if (err instanceof AICapReachedError || (err as any)?.isCapReached) {
        throw err;
      }
      // Fallback query if AI fails
      queries = [
        `${skill.name} tutorial practical guide`,
        `${skill.name} official documentation reference`,
      ];
    }

    if (queries.length === 0) {
      queries = [`${skill.name} tutorial guide`];
    }

    queriesRun += queries.length;
    const candidatesForSkill: Array<{ candidate: SearchCandidate; query: string }> = [];

    for (const query of queries) {
      const candidates = await searchProvider.search({
        query,
        maxResults: SEARCH_CONFIG.MAX_RESULTS_PER_QUERY,
      });

      for (const cand of candidates) {
        candidatesFound++;
        const norm = normalizeUrl(cand.url);
        searchProvidedUrls.add(norm);
        candidatesForSkill.push({ candidate: cand, query });
      }
    }

    skillCandidatesMap.set(skill.id, candidatesForSkill);
  }

  // 5. Invariant & Vetting Pipeline
  const seenInRun = new Set<string>();
  let deadDroppedCount = 0;
  let excludedSkippedCount = 0;
  let duplicateSkippedCount = 0;

  interface VettedItem {
    skillId: string;
    candidate: SearchCandidate;
    query: string;
    normalizedUrl: string;
  }

  const vettedOkItems: VettedItem[] = [];

  for (const [skillId, items] of skillCandidatesMap.entries()) {
    for (const { candidate, query } of items) {
      const norm = normalizeUrl(candidate.url);

      // INVARIANT: Every URL must strictly come from the search provider
      assertSearchSourced(candidate.url, searchProvidedUrls);

      // Check per-goal exclusion list
      if (excludedUrlSet.has(norm)) {
        excludedSkippedCount++;
        continue;
      }

      // Check existing resources in database or current run
      if (existingUrlSet.has(norm) || seenInRun.has(norm)) {
        duplicateSkippedCount++;
        continue;
      }

      seenInRun.add(norm);

      // Vetting HTTP check
      const vetResult = await vetUrl(candidate.url, { customFetch: options.customFetch });
      if (!vetResult.isHealthy) {
        deadDroppedCount++;
        // Dead links are dropped and logged
        console.warn(
          `[ResourceDiscovery] Dropped dead/invalid link: ${candidate.url} (reason: ${vetResult.error})`
        );
        continue;
      }

      vettedOkItems.push({
        skillId,
        candidate,
        query,
        normalizedUrl: norm,
      });
    }
  }

  // 6. Batch Classify Candidates in batches of up to 10
  const candidatesToClassify = vettedOkItems.map((v) => v.candidate);
  const classifications = await classifyCandidatesInBatches(
    ownerId,
    candidatesToClassify,
    {
      dbClient,
      provider: options.aiProvider,
    }
  );

  // 7. Store resources with provenance & approval="pending"
  const rowsToInsert = vettedOkItems.map((item) => {
    const classification = classifications.get(item.candidate.url) || {
      type: "article" as ResourceType,
      estimated_minutes: 20,
      relevance: 0.85,
    };

    return {
      owner_id: ownerId,
      goal_id: goalId,
      skill_id: item.skillId,
      url: item.candidate.url,
      title: item.candidate.title || item.candidate.domain,
      domain: item.candidate.domain,
      type: classification.type,
      estimated_minutes: classification.estimated_minutes,
      relevance: classification.relevance,
      found_by_query: item.query,
      search_provider: searchProvider.id,
      approval: "pending" as const,
      status: "ok" as const,
      found_at: new Date().toISOString(),
    };
  });

  let createdResources: any[] = [];
  if (rowsToInsert.length > 0) {
    const { data: inserted, error: insertErr } = await dbClient
      .from("resources")
      .insert(rowsToInsert as any)
      .select("id, url, title, skill_id, type, estimated_minutes, relevance, found_by_query, search_provider");

    if (insertErr) {
      throw new Error(`Failed to save discovered resources: ${insertErr.message}`);
    }
    createdResources = inserted || [];
  }

  return {
    goalId,
    skillsEvaluated: targetSkills.length,
    queriesRun,
    candidatesFound,
    vettedOkCount: vettedOkItems.length,
    deadDroppedCount,
    excludedSkippedCount,
    duplicateSkippedCount,
    resourcesCreated: createdResources,
  };
}

/**
 * Approves a single resource and attaches it to plan items for its skill.
 * Requirement 5 & 6:
 * "Nothing enters the plan until approved. Approved resources attach to plan items for their skill."
 */
export async function approveResource(
  resourceId: string,
  ownerId: string,
  dbClient: SupabaseClient<Database>
): Promise<{
  resource: Database["public"]["Tables"]["resources"]["Row"];
  attachedPlanItemIds: string[];
}> {
  // 1. Fetch resource
  const { data: resource, error: getErr } = await dbClient
    .from("resources")
    .select("*")
    .eq("id", resourceId)
    .eq("owner_id", ownerId)
    .single();

  if (getErr || !resource) {
    throw new Error(`Resource ${resourceId} not found or unauthorized.`);
  }

  // 2. Mark approved
  const { data: updated, error: updateErr } = await dbClient
    .from("resources")
    .update({ approval: "approved" })
    .eq("id", resourceId)
    .select("*")
    .single();

  if (updateErr || !updated) {
    throw new Error(`Failed to approve resource: ${updateErr?.message}`);
  }

  const attachedPlanItemIds: string[] = [];

  // 3. Attach to plan item for its skill if plan items exist
  if (resource.skill_id) {
    const { data: planItems } = await dbClient
      .from("plan_items")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("goal_id", resource.goal_id)
      .eq("skill_id", resource.skill_id)
      .is("resource_id", null)
      .order("scheduled_date", { ascending: true })
      .limit(1);

    if (planItems && planItems.length > 0) {
      const targetPlanItemId = planItems[0].id;
      await dbClient
        .from("plan_items")
        .update({ resource_id: resource.id })
        .eq("id", targetPlanItemId);

      attachedPlanItemIds.push(targetPlanItemId);
    }
  }

  return {
    resource: updated,
    attachedPlanItemIds,
  };
}

/**
 * Rejects a resource (or marks it "Not useful") and adds its normalized URL
 * to the goal's resource_exclusions list so it is never suggested again.
 * Requirement 5:
 * "Reject and 'Not useful' remove it and add the URL to a per-goal exclusion list so it is never suggested again."
 */
export async function rejectResource(
  resourceId: string,
  ownerId: string,
  reason: string = "user_rejected",
  dbClient: SupabaseClient<Database>
): Promise<{
  resource: Database["public"]["Tables"]["resources"]["Row"];
  exclusionCreated: boolean;
}> {
  const { data: resource, error: getErr } = await dbClient
    .from("resources")
    .select("*")
    .eq("id", resourceId)
    .eq("owner_id", ownerId)
    .single();

  if (getErr || !resource) {
    throw new Error(`Resource ${resourceId} not found or unauthorized.`);
  }

  // 1. Mark resource as rejected
  const { data: updated, error: updateErr } = await dbClient
    .from("resources")
    .update({ approval: "rejected" })
    .eq("id", resourceId)
    .select("*")
    .single();

  if (updateErr || !updated) {
    throw new Error(`Failed to reject resource: ${updateErr?.message}`);
  }

  // 2. Add to resource_exclusions table
  const normalized = normalizeUrl(resource.url);
  const { error: exErr } = await dbClient.from("resource_exclusions").upsert(
    {
      owner_id: ownerId,
      goal_id: resource.goal_id,
      url: normalized,
      reason,
    },
    { onConflict: "goal_id, url" }
  );

  return {
    resource: updated,
    exclusionCreated: !exErr,
  };
}

/**
 * Approves all pending resources for a skill and attaches them to plan items.
 * Requirement 5: "Approve per resource or per skill."
 */
export async function approveSkillResources(
  skillId: string,
  goalId: string,
  ownerId: string,
  dbClient: SupabaseClient<Database>
): Promise<{
  approvedCount: number;
  attachedPlanItemIds: string[];
}> {
  const { data: pendingResources, error: getErr } = await dbClient
    .from("resources")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("goal_id", goalId)
    .eq("skill_id", skillId)
    .eq("approval", "pending");

  if (getErr || !pendingResources || pendingResources.length === 0) {
    return { approvedCount: 0, attachedPlanItemIds: [] };
  }

  const attachedPlanItemIds: string[] = [];

  for (const res of pendingResources) {
    const result = await approveResource(res.id, ownerId, dbClient);
    attachedPlanItemIds.push(...result.attachedPlanItemIds);
  }

  return {
    approvedCount: pendingResources.length,
    attachedPlanItemIds,
  };
}

/**
 * Enforces the approval gate:
 * Validates that unapproved (pending or rejected) resources cannot be added to a plan.
 */
export async function assertResourceApprovedForPlan(
  resourceId: string,
  dbClient: SupabaseClient<Database>
): Promise<void> {
  const { data: resource } = await dbClient
    .from("resources")
    .select("id, approval")
    .eq("id", resourceId)
    .single();

  if (!resource || resource.approval !== "approved") {
    throw new Error(
      `Approval gate violation: Resource '${resourceId}' is not approved (status: ${resource?.approval || "not_found"}). Nothing enters the plan until approved.`
    );
  }
}
