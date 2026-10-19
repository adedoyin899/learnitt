/**
 * Skill Graph Validation & Cycle Detection (PRD 7.3, Epic A2)
 */

export interface SkillGraphNode {
  id: string;
  name: string;
  description?: string;
  prereq_ids?: string[];
  estimated_min_minutes: number;
  estimated_max_minutes: number;
  difficulty?: number;
  priority?: number;
  verification_type?: "recall" | "applied" | "artifact" | "self";
  mvd_minutes?: number;
  mvd_task?: string;
}

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  hasCycle: boolean;
  cycleNodes?: string[];
}

/**
 * Detects cycles in a directed prerequisite graph.
 * In a prerequisite graph: if B is in A.prereq_ids, then edge is B -> A (B must be learned before A).
 * Alternatively, following prereq links: A -> prereq.
 * Either way, a cycle exists if there is a circular dependency.
 */
export function detectCycle(
  skills: Array<{ id: string; prereq_ids?: string[] }>
): { hasCycle: boolean; cycleNodes?: string[] } {
  const adj = new Map<string, string[]>();
  for (const s of skills) {
    adj.set(s.id, s.prereq_ids || []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stackList: string[] = [];
  let foundCycleNodes: string[] | undefined;

  function dfs(node: string): boolean {
    visited.add(node);
    inStack.add(node);
    stackList.push(node);

    const prereqs = adj.get(node) || [];
    for (const prereq of prereqs) {
      if (!adj.has(prereq)) continue; // Missing prereq is handled as separate validation
      if (!visited.has(prereq)) {
        if (dfs(prereq)) return true;
      } else if (inStack.has(prereq)) {
        const cycleStartIndex = stackList.indexOf(prereq);
        foundCycleNodes = cycleStartIndex !== -1 ? stackList.slice(cycleStartIndex) : [prereq, node];
        return true;
      }
    }

    inStack.delete(node);
    stackList.pop();
    return false;
  }

  for (const s of skills) {
    if (!visited.has(s.id)) {
      if (dfs(s.id)) {
        return { hasCycle: true, cycleNodes: foundCycleNodes };
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Validates a skill graph against PRD 7.3 requirements:
 * 1. 12 to 20 skills
 * 2. Unique IDs
 * 3. Prerequisites exist and no self-dependency
 * 4. No cycles
 * 5. estimated_min_minutes <= estimated_max_minutes
 */
export function validateSkillGraph(skills: SkillGraphNode[]): GraphValidationResult {
  const errors: string[] = [];

  // 1. Skill count (12 to 20)
  if (skills.length < 12) {
    errors.push(`Graph has ${skills.length} skills. Must have between 12 and 20 skills.`);
  } else if (skills.length > 20) {
    errors.push(`Graph has ${skills.length} skills. Cannot exceed 20 skills.`);
  }

  // 2. Unique IDs
  const seenIds = new Set<string>();
  for (const s of skills) {
    if (!s.id || s.id.trim() === "") {
      errors.push("Skill missing an ID.");
      continue;
    }
    if (seenIds.has(s.id)) {
      errors.push(`Duplicate skill ID: '${s.id}'. IDs must be unique.`);
    }
    seenIds.add(s.id);
  }

  // 3. Min estimate <= Max estimate & valid ranges
  for (const s of skills) {
    if (s.estimated_min_minutes > s.estimated_max_minutes) {
      errors.push(
        `Skill '${s.name || s.id}': Minimum estimate (${s.estimated_min_minutes}m) must be less than or equal to maximum estimate (${s.estimated_max_minutes}m).`
      );
    }
    if (s.estimated_min_minutes < 5) {
      errors.push(`Skill '${s.name || s.id}': Minimum estimate must be at least 5 minutes.`);
    }
  }

  // 4. Prerequisites existence & self-dependency
  for (const s of skills) {
    const prereqs = s.prereq_ids || [];
    for (const p of prereqs) {
      if (p === s.id) {
        errors.push(`Skill '${s.name || s.id}' cannot list itself as a prerequisite.`);
      } else if (!seenIds.has(p)) {
        errors.push(`Skill '${s.name || s.id}' lists non-existent prerequisite ID '${p}'.`);
      }
    }
  }

  // 5. Cycle check
  const cycleResult = detectCycle(skills);
  if (cycleResult.hasCycle) {
    const cycleStr = cycleResult.cycleNodes ? cycleResult.cycleNodes.join(" -> ") : "circular dependency";
    errors.push(`Skill prerequisites contain a cycle (${cycleStr}). A skill cannot depend on itself through prerequisites.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    hasCycle: cycleResult.hasCycle,
    cycleNodes: cycleResult.cycleNodes,
  };
}

/**
 * Attempts deterministic repair on a cyclical graph by removing the feedback edge that closes the cycle.
 */
export function repairGraphCycles<T extends { id: string; prereq_ids?: string[] }>(skills: T[]): T[] {
  const result = skills.map((s) => ({ ...s, prereq_ids: [...(s.prereq_ids || [])] }));
  let safety = 50;

  while (safety > 0) {
    const { hasCycle, cycleNodes } = detectCycle(result);
    if (!hasCycle || !cycleNodes || cycleNodes.length < 2) break;

    // The last node in cycleNodes depends on the first (or preceding) node. Remove the edge.
    const fromNode = cycleNodes[cycleNodes.length - 1];
    const toNode = cycleNodes[0];

    const targetSkill = result.find((s) => s.id === fromNode);
    if (targetSkill && targetSkill.prereq_ids) {
      targetSkill.prereq_ids = targetSkill.prereq_ids.filter((p) => p !== toNode);
    } else {
      // Fallback: break any edge in cycle
      const anyNode = result.find((s) => s.id === cycleNodes[0]);
      if (anyNode && anyNode.prereq_ids && anyNode.prereq_ids.length > 0) {
        anyNode.prereq_ids.pop();
      } else {
        break;
      }
    }
    safety--;
  }

  return result as T[];
}
