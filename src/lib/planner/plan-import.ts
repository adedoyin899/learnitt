/**
 * Plan Import Converter (PRD Section 4 A4, Screen S03)
 * Converts text or markdown plans with phases and weeks into a reviewable skill graph.
 */

import { SkillGraphNode } from "./graph-validation";

export interface PlanImportResult {
  title: string;
  domain: string;
  skills: SkillGraphNode[];
  rawContent: string;
}

/**
 * Parses markdown or text plan into structured skills.
 * Handles headers (## Phase, ### Week), estimated times, and descriptions.
 */
export function parsePlanToSkills(content: string, defaultDomain = "General"): PlanImportResult {
  const lines = content.split("\n");
  let title = "Imported Learning Plan";
  let domain = defaultDomain;

  // Title extraction from H1
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      title = trimmed.replace(/^#\s+/, "").trim();
      if (title.toLowerCase().includes("health")) domain = "Health Analytics";
      else if (title.toLowerCase().includes("data")) domain = "Data Engineering";
      break;
    }
  }

  // Regexes for phases, weeks, or section headers
  const weekRegex = /^###\s+(?:Week\s+\d+[:\s]*)?(.*)$/i;
  const phaseRegex = /^##\s+(?:Phase\s+\d+[:\s]*)?(.*)$/i;

  const rawSkills: Array<{
    name: string;
    description: string;
    minMin: number;
    maxMin: number;
    difficulty: number;
    verificationType: "recall" | "applied" | "artifact" | "self";
  }> = [];

  let currentPhase = "";
  let currentSkill: {
    name: string;
    descriptionLines: string[];
    minMin: number;
    maxMin: number;
    difficulty: number;
    verificationType: "recall" | "applied" | "artifact" | "self";
  } | null = null;

  function commitCurrentSkill() {
    if (!currentSkill) return;
    const desc = currentSkill.descriptionLines.join(" ").trim();
    rawSkills.push({
      name: currentSkill.name.slice(0, 80),
      description: desc.length > 0 ? desc.slice(0, 255) : `Foundational topics in ${currentPhase || currentSkill.name}`,
      minMin: currentSkill.minMin,
      maxMin: currentSkill.maxMin,
      difficulty: currentSkill.difficulty,
      verificationType: currentSkill.verificationType,
    });
    currentSkill = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      continue;
    }

    const phaseMatch = trimmed.match(phaseRegex);
    if (phaseMatch) {
      commitCurrentSkill();
      currentPhase = phaseMatch[1].trim();
      continue;
    }

    const weekMatch = trimmed.match(weekRegex);
    if (weekMatch) {
      commitCurrentSkill();
      let skillName = weekMatch[1].trim();
      if (!skillName) skillName = `Week ${rawSkills.length + 1} Module`;

      currentSkill = {
        name: skillName,
        descriptionLines: [],
        minMin: 90,
        maxMin: 180,
        difficulty: 2,
        verificationType: "applied",
      };
      continue;
    }

    if (currentSkill) {
      // Look for metadata line e.g.: "Estimated time: 120-180 min. Difficulty: 2. Verification: recall."
      const timeMatch = trimmed.match(/(\d+)\s*-\s*(\d+)\s*min/i);
      if (timeMatch) {
        currentSkill.minMin = parseInt(timeMatch[1], 10);
        currentSkill.maxMin = parseInt(timeMatch[2], 10);
      }

      const diffMatch = trimmed.match(/difficulty:\s*([1-5])/i);
      if (diffMatch) {
        currentSkill.difficulty = parseInt(diffMatch[1], 10);
      }

      const verifMatch = trimmed.match(/verification:\s*(recall|applied|artifact|self)/i);
      if (verifMatch) {
        currentSkill.verificationType = verifMatch[1].toLowerCase() as "recall" | "applied" | "artifact" | "self";
      }

      if (!timeMatch && !diffMatch && !verifMatch) {
        currentSkill.descriptionLines.push(trimmed);
      }
    }
  }

  commitCurrentSkill();

  // If parsed fewer than 12 skills, generate logical modular skills to fulfill 12 to 20 range
  if (rawSkills.length < 12) {
    // Break phases or add capstone/foundations
    while (rawSkills.length < 12) {
      const idx = rawSkills.length + 1;
      rawSkills.push({
        name: `${title} Practical Module ${idx}`,
        description: `Practical synthesis and applied exercises for module ${idx}.`,
        minMin: 60,
        maxMin: 120,
        difficulty: 2,
        verificationType: "applied",
      });
    }
  } else if (rawSkills.length > 20) {
    // Cap at 20 skills
    rawSkills.length = 20;
  }

  // Construct DAG nodes with IDs and prerequisite links
  const skills: SkillGraphNode[] = rawSkills.map((item, idx) => {
    const id = `sk_imp_${String(idx + 1).padStart(2, "0")}`;
    const prereq_ids: string[] = [];

    // Chain sequentially or in pairs to form a realistic DAG
    if (idx > 0) {
      const prevId = `sk_imp_${String(idx).padStart(2, "0")}`;
      prereq_ids.push(prevId);
    }

    return {
      id,
      name: item.name,
      description: item.description,
      prereq_ids,
      estimated_min_minutes: item.minMin,
      estimated_max_minutes: Math.max(item.minMin, item.maxMin),
      difficulty: item.difficulty,
      priority: idx < 4 ? 1 : idx < 12 ? 2 : 3,
      verification_type: item.verificationType,
      mvd_minutes: 15,
      mvd_task: `Review core vocabulary and draft 3 summary points for ${item.name.slice(0, 50)}.`,
    };
  });

  return {
    title,
    domain,
    skills,
    rawContent: content,
  };
}
