import { describe, it, expect } from "vitest";
import {
  detectCycle,
  validateSkillGraph,
  repairGraphCycles,
  SkillGraphNode,
} from "@/lib/planner/graph-validation";

describe("Skill Graph Validation & Cycle Detection (src/lib/planner/graph-validation.ts)", () => {
  const baseValidSkills: SkillGraphNode[] = Array.from({ length: 14 }, (_, i) => ({
    id: `sk_${i + 1}`,
    name: `Skill ${i + 1}`,
    description: `Description for skill ${i + 1}`,
    prereq_ids: i > 0 ? [`sk_${i}`] : [],
    estimated_min_minutes: 60,
    estimated_max_minutes: 120,
    difficulty: 2,
    verification_type: "applied",
  }));

  it("passes validation for a valid DAG with 12 to 20 skills", () => {
    const result = validateSkillGraph(baseValidSkills);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.hasCycle).toBe(false);
  });

  it("fails validation when skill count is less than 12", () => {
    const shortList = baseValidSkills.slice(0, 10);
    const result = validateSkillGraph(shortList);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Must have between 12 and 20 skills"))).toBe(true);
  });

  it("fails validation when skill count exceeds 20", () => {
    const longList = Array.from({ length: 22 }, (_, i) => ({
      id: `sk_${i + 1}`,
      name: `Skill ${i + 1}`,
      prereq_ids: [],
      estimated_min_minutes: 30,
      estimated_max_minutes: 60,
    }));
    const result = validateSkillGraph(longList);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Cannot exceed 20 skills"))).toBe(true);
  });

  it("surfaces readable errors for duplicate skill IDs", () => {
    const withDuplicates = [...baseValidSkills];
    withDuplicates[5] = { ...withDuplicates[5], id: withDuplicates[0].id };
    const result = validateSkillGraph(withDuplicates);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate skill ID"))).toBe(true);
  });

  it("surfaces readable errors when min estimate exceeds max estimate", () => {
    const invalidEstimate = [...baseValidSkills];
    invalidEstimate[2] = {
      ...invalidEstimate[2],
      estimated_min_minutes: 150,
      estimated_max_minutes: 60,
    };
    const result = validateSkillGraph(invalidEstimate);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("Minimum estimate (150m) must be less than or equal to maximum estimate (60m)"))
    ).toBe(true);
  });

  it("surfaces readable errors for missing prerequisites", () => {
    const missingPrereq = [...baseValidSkills];
    missingPrereq[3] = {
      ...missingPrereq[3],
      prereq_ids: ["non_existent_id"],
    };
    const result = validateSkillGraph(missingPrereq);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("non-existent prerequisite ID"))).toBe(true);
  });

  it("detects direct cycle: A -> B -> A", () => {
    const cyclicSkills = [
      { id: "A", prereq_ids: ["B"] },
      { id: "B", prereq_ids: ["A"] },
    ];
    const { hasCycle, cycleNodes } = detectCycle(cyclicSkills);
    expect(hasCycle).toBe(true);
    expect(cycleNodes).toBeDefined();
  });

  it("detects indirect cycle: A -> B -> C -> A", () => {
    const cyclicSkills = [
      { id: "A", prereq_ids: ["B"] },
      { id: "B", prereq_ids: ["C"] },
      { id: "C", prereq_ids: ["A"] },
    ];
    const { hasCycle, cycleNodes } = detectCycle(cyclicSkills);
    expect(hasCycle).toBe(true);
    expect(cycleNodes).toBeDefined();
  });

  it("fails graph validation when a cycle exists and surfaces readable error", () => {
    const cyclicGraph = baseValidSkills.map((s) => ({ ...s }));
    // Introduce cycle between sk_1 and sk_3
    // sk_2 depends on sk_1, sk_3 depends on sk_2. Make sk_1 depend on sk_3:
    cyclicGraph[0] = { ...cyclicGraph[0], prereq_ids: ["sk_3"] };

    const result = validateSkillGraph(cyclicGraph);
    expect(result.valid).toBe(false);
    expect(result.hasCycle).toBe(true);
    expect(result.errors.some((e) => e.toLowerCase().includes("cycle"))).toBe(true);
  });

  it("repairs cycle by removing circular feedback edge", () => {
    const cyclicGraph = baseValidSkills.map((s) => ({ ...s }));
    cyclicGraph[0] = { ...cyclicGraph[0], prereq_ids: ["sk_3"] };

    expect(detectCycle(cyclicGraph).hasCycle).toBe(true);
    const repaired = repairGraphCycles(cyclicGraph);
    expect(detectCycle(repaired).hasCycle).toBe(false);
  });
});
