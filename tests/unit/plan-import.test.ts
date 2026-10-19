import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parsePlanToSkills } from "@/lib/planner/plan-import";
import { validateSkillGraph } from "@/lib/planner/graph-validation";

describe("Plan Import Parser (src/lib/planner/plan-import.ts)", () => {
  it("imports the health analytics plan fixture and produces a valid, reviewable graph", () => {
    const fixturePath = path.resolve(process.cwd(), "tests/fixtures/health-analytics-plan.md");
    const content = fs.readFileSync(fixturePath, "utf-8");

    const result = parsePlanToSkills(content);

    expect(result.title).toContain("Health Analytics");
    expect(result.domain).toBe("Health Analytics");
    expect(result.skills.length).toBeGreaterThanOrEqual(12);
    expect(result.skills.length).toBeLessThanOrEqual(20);

    // Validate using PRD 7.3 validation rules
    const validation = validateSkillGraph(result.skills);
    expect(validation.valid).toBe(true);
    expect(validation.hasCycle).toBe(false);
    expect(validation.errors).toHaveLength(0);

    // Check specific health analytics skills
    const firstSkill = result.skills[0];
    expect(firstSkill.name).toContain("Probability Distributions");
    expect(firstSkill.estimated_min_minutes).toBe(120);
    expect(firstSkill.estimated_max_minutes).toBe(180);
    expect(firstSkill.difficulty).toBe(2);
    expect(firstSkill.verification_type).toBe("recall");
  });
});
