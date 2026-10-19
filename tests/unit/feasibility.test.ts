import { describe, it, expect } from "vitest";
import { calculateFeasibility, SkillFeasibilityItem } from "@/lib/planner/feasibility";

describe("Feasibility Calculation Engine (src/lib/planner/feasibility.ts)", () => {
  // 5 study days/week (Mon-Fri) at 8 hours/week = 480 mins/5 = 96 mins/day, rounded down to 5-min step = 95 mins/day.
  // 20 study days = 1900 available minutes.

  it("classifies under 85% as 'feasible' (e.g. 84%)", () => {
    // 10 study days * 95 mins/day = 950 mins capacity.
    // 798 / 950 = 0.84 -> 84% feasible.
    const res = calculateFeasibility({
      skills: [
        {
          id: "s1",
          name: "Skill 1",
          priority: 2,
          estimated_min_minutes: 798,
          estimated_max_minutes: 798,
        },
      ],
      today: "2026-11-02", // Monday
      targetDate: "2026-11-13", // Friday (10 study days)
      weeklyHours: 8, // 8 * 60 / 5 = 96 -> rounded down to 95 mins/day. Total = 950 mins.
      studyDays: [1, 2, 3, 4, 5],
    });

    expect(res.capacityMinutes).toBe(950);
    expect(res.remainingMinutes).toBe(798);
    expect(res.percentage).toBe(84);
    expect(res.ratio).toBe(0.84);
    expect(res.band).toBe("feasible");
    expect(res.options).toBeUndefined();
    expect(res.summaryMessage).toContain("This plan is feasible");
    expect(res.summaryMessage).not.toContain("—"); // No em dashes
  });

  it("classifies exactly 85% as 'tight'", () => {
    // 950 * 0.85 = 807.5 -> 808 mins -> ratio = 0.85
    const res = calculateFeasibility({
      skills: [
        {
          id: "s1",
          name: "Skill 1",
          priority: 2,
          estimated_min_minutes: 808,
          estimated_max_minutes: 808,
        },
      ],
      today: "2026-11-02",
      targetDate: "2026-11-13",
      weeklyHours: 8,
      studyDays: [1, 2, 3, 4, 5],
    });

    expect(res.capacityMinutes).toBe(950);
    expect(res.percentage).toBe(85);
    expect(res.ratio).toBe(0.85);
    expect(res.band).toBe("tight");
    expect(res.options).toBeDefined();
    expect(res.summaryMessage).toContain("This is tight");
    expect(res.summaryMessage).toContain("Pick one option.");
    expect(res.summaryMessage).not.toContain("—");
  });

  it("classifies exactly 100% as 'tight'", () => {
    // 950 mins capacity, 950 mins work -> ratio = 1.00 (100%)
    const res = calculateFeasibility({
      skills: [
        {
          id: "s1",
          name: "Skill 1",
          priority: 2,
          estimated_min_minutes: 950,
          estimated_max_minutes: 950,
        },
      ],
      today: "2026-11-02",
      targetDate: "2026-11-13",
      weeklyHours: 8,
      studyDays: [1, 2, 3, 4, 5],
    });

    expect(res.capacityMinutes).toBe(950);
    expect(res.percentage).toBe(100);
    expect(res.ratio).toBe(1.0);
    expect(res.band).toBe("tight");
    expect(res.options).toBeDefined();
    expect(res.summaryMessage).toContain("This is tight");
    expect(res.summaryMessage).not.toContain("—");
  });

  it("classifies over 100% as 'not_feasible' (e.g. 101%)", () => {
    // 950 * 1.01 = 959.5 -> 960 mins -> ratio = 1.01 (101%)
    const res = calculateFeasibility({
      skills: [
        {
          id: "s1",
          name: "Skill 1",
          priority: 2,
          estimated_min_minutes: 960,
          estimated_max_minutes: 960,
        },
      ],
      today: "2026-11-02",
      targetDate: "2026-11-13",
      weeklyHours: 8,
      studyDays: [1, 2, 3, 4, 5],
    });

    expect(res.capacityMinutes).toBe(950);
    expect(res.percentage).toBe(101);
    expect(res.ratio).toBe(1.01);
    expect(res.band).toBe("not_feasible");
    expect(res.options).toBeDefined();
    expect(res.summaryMessage).toContain("This is not feasible");
    expect(res.summaryMessage).toContain("Pick one option.");
    expect(res.summaryMessage).not.toContain("—");
  });

  it("proposes 3 remedies for tight or not_feasible with lowest priority skills first", () => {
    const skills: SkillFeasibilityItem[] = [
      {
        id: "core-1",
        name: "Core SQL",
        priority: 1, // High priority
        estimated_min_minutes: 400,
        estimated_max_minutes: 400,
      },
      {
        id: "mid-1",
        name: "Intermediate Modeling",
        priority: 2, // Medium priority
        estimated_min_minutes: 400,
        estimated_max_minutes: 400,
      },
      {
        id: "opt-1",
        name: "Optional Deep Dive",
        priority: 3, // Lowest priority
        estimated_min_minutes: 300,
        estimated_max_minutes: 300,
      },
    ];

    // Total = 1100 mins. Capacity = 950 mins. Ratio = 1.157 (> 100% -> not_feasible)
    const res = calculateFeasibility({
      skills,
      today: "2026-11-02",
      targetDate: "2026-11-13",
      weeklyHours: 8,
      studyDays: [1, 2, 3, 4, 5],
    });

    expect(res.band).toBe("not_feasible");
    expect(res.options).toBeDefined();
    const opts = res.options!;

    // 1. Extend date proposed date is in the future beyond original target
    expect(opts.extendDate.proposedTargetDate > "2026-11-13").toBe(true);
    expect(opts.extendDate.projectedRatio).toBeLessThanOrEqual(0.85);

    // 2. Add hours proposed weekly hours > current 8
    expect(opts.addHours.proposedWeeklyHours).toBeGreaterThan(8);
    expect(opts.addHours.projectedRatio).toBeLessThanOrEqual(0.85);

    // 3. Reduce scope candidates list lowest priority (priority 3) first!
    expect(opts.reduceScope.candidateSkills.length).toBeGreaterThan(0);
    expect(opts.reduceScope.candidateSkills[0].id).toBe("opt-1"); // Priority 3 comes first!
    expect(opts.reduceScope.candidateSkills[0].priority).toBe(3);
    expect(opts.reduceScope.newBand).toBe("feasible");
  });
});
