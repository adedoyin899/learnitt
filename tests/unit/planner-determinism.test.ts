import { describe, expect, it } from "vitest";
import {
  calculateCapacity,
  schedule,
} from "@/lib/planner/scheduler";
import {
  applyAdaptDecision,
  checkAdaptTrigger,
  generateAdaptProposals,
} from "@/lib/planner/adapt";
import { rescheduleMissedItem } from "@/lib/planner/reschedule";
import {
  PlannedItem,
  PlannerGoal,
  PlannerPrereq,
  PlannerReview,
  PlannerSkill,
} from "@/lib/planner/types";

describe("Planner Pure Engine · Determinism & Invariants (Prompt Requirement 1 & Tests)", () => {
  // Goal: 8 hours/week, Mon-Fri (5 days).
  // capacity = 8 * 60 / 5 = 96 min -> rounded down to 5-min step = 95 min.
  const sampleGoal: PlannerGoal = {
    id: "goal-data-eng",
    title: "Data Engineering Master Plan",
    target_date: "2026-11-30",
    weekly_hours: 8,
    study_days: [1, 2, 3, 4, 5],
  };

  const sampleSkills: PlannerSkill[] = [
    {
      id: "skill-sql",
      name: "SQL Basics & DDL",
      priority: 1, // High
      difficulty: 2,
      estimated_min_minutes: 120,
      estimated_max_minutes: 180, // mid = 150 min
      mvd_minutes: 15,
      mvd_task: "Write 3 CREATE TABLE statements.",
    },
    {
      id: "skill-queries",
      name: "Advanced SQL Queries & Joins",
      priority: 1,
      difficulty: 3,
      estimated_min_minutes: 180,
      estimated_max_minutes: 240, // mid = 210 min
      mvd_minutes: 20,
      mvd_task: "Write 1 complex JOIN query with aggregation.",
    },
    {
      id: "skill-data-modeling",
      name: "Data Modeling & Normalization",
      priority: 2,
      difficulty: 3,
      estimated_min_minutes: 120,
      estimated_max_minutes: 180, // mid = 150 min
      mvd_minutes: 15,
      mvd_task: "Draft 3NF schema diagram on paper.",
    },
    {
      id: "skill-spark",
      name: "PySpark Fundamentals",
      priority: 2,
      difficulty: 4,
      estimated_min_minutes: 200,
      estimated_max_minutes: 280, // mid = 240 min
      mvd_minutes: 20,
      mvd_task: "Read DataFrame and write groupBy count.",
    },
    {
      id: "skill-airflow",
      name: "Airflow Orchestration",
      priority: 3,
      difficulty: 3,
      estimated_min_minutes: 90,
      estimated_max_minutes: 150, // mid = 120 min
      mvd_minutes: 15,
      mvd_task: "Define basic PythonOperator DAG.",
    },
  ];

  const samplePrereqs: PlannerPrereq[] = [
    { skill_id: "skill-queries", prereq_id: "skill-sql" },
    { skill_id: "skill-data-modeling", prereq_id: "skill-queries" },
    { skill_id: "skill-spark", prereq_id: "skill-queries" },
    { skill_id: "skill-airflow", prereq_id: "skill-spark" },
  ];

  it("1. calculates capacity correctly: weekly_hours * 60 / study_days, rounded down to 5-min steps", () => {
    // 8 hours on 5 study days: 480 / 5 = 96 -> 95 mins
    // Monday (2026-10-19) is day 1
    const mondayCap = calculateCapacity(sampleGoal, "2026-10-19");
    expect(mondayCap).toBe(95);

    // Saturday (2026-10-24) is non-study day -> 0
    const saturdayCap = calculateCapacity(sampleGoal, "2026-10-24");
    expect(saturdayCap).toBe(0);

    // Sunday (2026-10-25) is non-study day -> 0
    const sundayCap = calculateCapacity(sampleGoal, "2026-10-25");
    expect(sundayCap).toBe(0);

    // 10 hours on 4 study days: 600 / 4 = 150 mins
    const customGoal: PlannerGoal = {
      ...sampleGoal,
      weekly_hours: 10,
      study_days: [1, 2, 3, 4],
    };
    expect(calculateCapacity(customGoal, "2026-10-19")).toBe(150);
  });

  it("2. determinism test: same input yields identical output, byte-for-byte, run 100 times", () => {
    const input = {
      goal: sampleGoal,
      skills: sampleSkills,
      prereqs: samplePrereqs,
      startDate: "2026-10-19",
      planVersion: 1,
    };

    const firstRun = JSON.stringify(schedule(input));

    for (let i = 0; i < 100; i++) {
      const subsequentRun = JSON.stringify(schedule(input));
      expect(subsequentRun).toBe(firstRun);
    }
  });

  it("3. capacity is never exceeded on any study day", () => {
    const output = schedule({
      goal: sampleGoal,
      skills: sampleSkills,
      prereqs: samplePrereqs,
      startDate: "2026-10-19",
    });

    const dayTotals = new Map<string, number>();
    for (const item of output.scheduled_items) {
      const cur = dayTotals.get(item.scheduled_date) || 0;
      dayTotals.set(item.scheduled_date, cur + item.planned_minutes);
    }

    for (const [dateStr, totalMins] of dayTotals.entries()) {
      const maxCap = calculateCapacity(sampleGoal, dateStr);
      expect(totalMins).toBeLessThanOrEqual(maxCap);
    }
  });

  it("4. MVD is always present and never above planned minutes (15 to 20 mins)", () => {
    const output = schedule({
      goal: sampleGoal,
      skills: sampleSkills,
      prereqs: samplePrereqs,
      startDate: "2026-10-19",
    });

    expect(output.all_items.length).toBeGreaterThan(0);
    for (const item of output.all_items) {
      expect(item.mvd_minutes).toBeDefined();
      expect(item.mvd_minutes).toBeGreaterThanOrEqual(10);
      expect(item.mvd_minutes).toBeLessThanOrEqual(20);
      expect(item.mvd_minutes).toBeLessThanOrEqual(item.planned_minutes);
      expect(item.mvd_task).toBeTruthy();
    }
  });

  it("5. max 60 minutes per session invariant", () => {
    const output = schedule({
      goal: sampleGoal,
      skills: sampleSkills,
      prereqs: samplePrereqs,
      startDate: "2026-10-19",
    });

    for (const item of output.scheduled_items) {
      expect(item.planned_minutes).toBeLessThanOrEqual(60);
      expect(item.planned_minutes).toBeGreaterThanOrEqual(5);
    }
  });

  it("6. spaced review minutes are inserted before new learning, capped at 15m a day", () => {
    const reviews: PlannerReview[] = [
      {
        skill_id: "skill-sql",
        skill_name: "SQL Basics Review",
        due_date: "2026-10-20",
        minutes: 25,
      },
    ];

    const output = schedule({
      goal: sampleGoal,
      skills: sampleSkills,
      prereqs: samplePrereqs,
      reviews,
      startDate: "2026-10-19",
    });

    // On 2026-10-20, review should be present, exactly capped at 15m, and position should be 0 (before new learning)
    const day20Items = output.scheduled_items.filter((it) => it.scheduled_date === "2026-10-20");
    const reviewItems = day20Items.filter((it) => it.kind === "review");
    expect(reviewItems.length).toBeGreaterThan(0);

    const reviewTotal = reviewItems.reduce((acc, it) => acc + it.planned_minutes, 0);
    expect(reviewTotal).toBeLessThanOrEqual(15);

    // Ensure review item is at position 0 before new learning
    if (day20Items.length > 1) {
      expect(day20Items[0].kind).toBe("review");
    }
  });

  it("7. property test: prerequisites are never violated over 50 random valid DAGs", () => {
    for (let testIdx = 0; testIdx < 50; testIdx++) {
      // Generate a random valid DAG of 6 to 12 skills
      const skillCount = 6 + (testIdx % 7);
      const randomSkills: PlannerSkill[] = [];
      for (let s = 0; s < skillCount; s++) {
        randomSkills.push({
          id: `rand-skill-${s}`,
          name: `Skill ${s}`,
          priority: 1 + (s % 3),
          difficulty: 1 + (s % 5),
          estimated_min_minutes: 60 + (s * 15),
          estimated_max_minutes: 90 + (s * 15),
          mvd_minutes: 15,
          mvd_task: `MVD for ${s}`,
        });
      }

      // Add prerequisites strictly with j < i so it's guaranteed acyclic
      const randomPrereqs: PlannerPrereq[] = [];
      for (let i = 1; i < skillCount; i++) {
        if ((i + testIdx) % 2 === 0) {
          const parent = (i - 1 + testIdx) % i;
          randomPrereqs.push({
            skill_id: randomSkills[i].id,
            prereq_id: randomSkills[parent].id,
          });
        }
      }

      const output = schedule({
        goal: {
          ...sampleGoal,
          target_date: "2027-01-30", // Long target date to fit all
        },
        skills: randomSkills,
        prereqs: randomPrereqs,
        startDate: "2026-10-19",
      });

      // Build index of completion for each skill: the last session's (date, position)
      interface SessionPosition {
        date: string;
        position: number;
        index: number;
      }
      const skillFirstSession = new Map<string, SessionPosition>();
      const skillLastSession = new Map<string, SessionPosition>();

      output.scheduled_items.forEach((item, globalIdx) => {
        if (!item.skill_id) return;
        const pos: SessionPosition = {
          date: item.scheduled_date,
          position: item.position,
          index: globalIdx,
        };

        if (!skillFirstSession.has(item.skill_id)) {
          skillFirstSession.set(item.skill_id, pos);
        }
        skillLastSession.set(item.skill_id, pos);
      });

      // Assert: For each prereq (P -> S), P's last session MUST be <= S's first session
      for (const p of randomPrereqs) {
        const prereqEnd = skillLastSession.get(p.prereq_id);
        const skillStart = skillFirstSession.get(p.skill_id);

        if (prereqEnd && skillStart) {
          expect(prereqEnd.index).toBeLessThan(skillStart.index);
        }
      }
    }
  });

  it("8. unscheduled tail: when work exceeds capacity, excess work is marked unscheduled", () => {
    // Goal with very tight target date (only 2 study days = 190 min capacity)
    const tightGoal: PlannerGoal = {
      ...sampleGoal,
      target_date: "2026-10-20", // Monday and Tuesday only
    };

    const output = schedule({
      goal: tightGoal,
      skills: sampleSkills, // total work ~870 min
      prereqs: samplePrereqs,
      startDate: "2026-10-19",
    });

    expect(output.unscheduled_items.length).toBeGreaterThan(0);
    for (const u of output.unscheduled_items) {
      expect(u.status).toBe("unscheduled");
      expect(u.mvd_minutes).toBeDefined();
    }
  });

  it("9. checkAdaptTrigger triggers when >= 2 sessions missed or completion < 60%", () => {
    // Case A: 2 missed sessions in rolling 7 days
    const result2Missed = checkAdaptTrigger({
      checkIns: [
        { plan_item_id: "p1", scheduled_date: "2026-10-19", outcome: "missed" },
        { plan_item_id: "p2", scheduled_date: "2026-10-20", outcome: "missed" },
      ],
      planItems: [],
      today: "2026-10-21",
    });
    expect(result2Missed.triggered).toBe(true);
    expect(result2Missed.missedSessionsInWeek).toBe(2);
    expect(result2Missed.reason).toContain("You missed 2 sessions this week. Pick how to catch up.");

    // Case B: Only 1 missed session, 100% completion on others -> not triggered
    const result1Missed = checkAdaptTrigger({
      checkIns: [
        { plan_item_id: "p1", scheduled_date: "2026-10-19", outcome: "missed" },
        { plan_item_id: "p2", scheduled_date: "2026-10-20", outcome: "done", minutes_actual: 60 },
      ],
      planItems: [
        {
          skill_id: "s1",
          scheduled_date: "2026-10-19",
          kind: "learn",
          planned_minutes: 60,
          mvd_minutes: 15,
          mvd_task: "",
          status: "missed",
          position: 0,
          plan_version: 1,
        },
        {
          skill_id: "s2",
          scheduled_date: "2026-10-20",
          kind: "learn",
          planned_minutes: 60,
          mvd_minutes: 15,
          mvd_task: "",
          status: "done",
          position: 0,
          plan_version: 1,
        },
      ],
      today: "2026-10-21",
    });
    // completion = 60 / 120 = 50% -> triggers on completion rate!
    expect(result1Missed.triggered).toBe(true);

    // Case C: High completion, 0 missed -> not triggered
    const resultNormal = checkAdaptTrigger({
      checkIns: [
        { plan_item_id: "p1", scheduled_date: "2026-10-19", outcome: "done", minutes_actual: 60 },
        { plan_item_id: "p2", scheduled_date: "2026-10-20", outcome: "done", minutes_actual: 60 },
      ],
      planItems: [
        {
          skill_id: "s1",
          scheduled_date: "2026-10-19",
          kind: "learn",
          planned_minutes: 60,
          mvd_minutes: 15,
          mvd_task: "",
          status: "done",
          position: 0,
          plan_version: 1,
        },
        {
          skill_id: "s2",
          scheduled_date: "2026-10-20",
          kind: "learn",
          planned_minutes: 60,
          mvd_minutes: 15,
          mvd_task: "",
          status: "done",
          position: 0,
          plan_version: 1,
        },
      ],
      today: "2026-10-21",
    });
    expect(resultNormal.triggered).toBe(false);
  });

  it("10. adapt proposals include all 4 options with before & after", () => {
    const proposals = generateAdaptProposals({
      goal: sampleGoal,
      skills: sampleSkills,
      prereqs: samplePrereqs,
      today: "2026-10-19",
    });

    expect(proposals.length).toBe(4);
    const types = proposals.map((p) => p.type);
    expect(types).toContain("compress");
    expect(types).toContain("extend");
    expect(types).toContain("add_time");
    expect(types).toContain("reduce_scope");

    for (const p of proposals) {
      expect(p.before).toBeDefined();
      expect(p.after).toBeDefined();
      expect(p.title).toBeTruthy();
    }
  });

  it("11. reduce_scope without confirmation changes nothing", () => {
    const result = applyAdaptDecision({
      option: "reduce_scope",
      goal: sampleGoal,
      skills: sampleSkills,
      prereqs: samplePrereqs,
      confirmedSkillIds: [], // Empty confirmation
      today: "2026-10-19",
    });

    expect(result.success).toBe(false);
    expect(result.noOp).toBe(true);
    expect(result.updatedSkills.length).toBe(sampleSkills.length);
  });

  it("12. reduce_scope with confirmation removes confirmed skills and preserves valid DAG", () => {
    const result = applyAdaptDecision({
      option: "reduce_scope",
      goal: sampleGoal,
      skills: sampleSkills,
      prereqs: samplePrereqs,
      confirmedSkillIds: ["skill-airflow"], // Low priority skill with 0 dependents
      today: "2026-10-19",
    });

    expect(result.success).toBe(true);
    expect(result.updatedSkills.length).toBe(sampleSkills.length - 1);
    expect(result.updatedSkills.find((s) => s.id === "skill-airflow")).toBeUndefined();
  });

  it("13. compress option never shortens sessions below MVD", () => {
    const result = applyAdaptDecision({
      option: "compress",
      goal: sampleGoal,
      skills: sampleSkills,
      prereqs: samplePrereqs,
      today: "2026-10-19",
    });

    expect(result.success).toBe(true);
    for (const item of result.updatedPlan.scheduled_items) {
      expect(item.planned_minutes).toBeGreaterThanOrEqual(item.mvd_minutes);
    }
  });

  it("14. rescheduleMissedItem moves item to next day with free capacity within 7 days", () => {
    const item: PlannedItem = {
      id: "item-missed",
      skill_id: "skill-sql",
      scheduled_date: "2026-10-19", // Monday
      kind: "learn",
      planned_minutes: 40,
      mvd_minutes: 15,
      mvd_task: "SQL MVD",
      status: "missed",
      position: 0,
      plan_version: 1,
    };

    // Tuesday already has 60m scheduled (capacity is 95m -> free capacity is 35m, which is < 40m)
    // Wednesday has 0m scheduled (capacity is 95m -> free capacity is 95m, which is >= 40m)
    const existingItems: PlannedItem[] = [
      {
        id: "item-tue",
        skill_id: "skill-queries",
        scheduled_date: "2026-10-20", // Tuesday
        kind: "learn",
        planned_minutes: 60,
        mvd_minutes: 15,
        mvd_task: "",
        status: "planned",
        position: 0,
        plan_version: 1,
      },
    ];

    const res = rescheduleMissedItem({
      item,
      goal: sampleGoal,
      existingItems,
      missCount: 1,
    });

    expect(res.success).toBe(true);
    // Should skip Tuesday (only 35m free, need 40m) and pick Wednesday (2026-10-21)
    expect(res.newDate).toBe("2026-10-21");
    expect(res.rescheduledItem?.status).toBe("rescheduled");
    expect(res.rescheduledItem?.rescheduled_from).toBe("2026-10-19");
  });

  it("15. rescheduleMissedItem requires confirmation if moving pushes week over weekly hours", () => {
    // Goal: 4 hours/week = 240 minutes max weekly capacity, 3 study days = 80 min daily capacity
    const tightWeekGoal: PlannerGoal = {
      ...sampleGoal,
      weekly_hours: 4,
      study_days: [1, 2, 3], // Mon, Tue, Wed
    };

    const item: PlannedItem = {
      id: "item-missed",
      skill_id: "skill-sql",
      scheduled_date: "2026-10-19",
      kind: "learn",
      planned_minutes: 60,
      mvd_minutes: 15,
      mvd_task: "MVD",
      status: "missed",
      position: 0,
      plan_version: 1,
    };

    // Existing item in that same week has 200m. Adding 60m = 260m > 240m!
    // On Tuesday, day capacity is 80m, used is 0m -> fits in day, but exceeds week!
    const existingItems: PlannedItem[] = [
      {
        id: "item-wed",
        skill_id: "skill-queries",
        scheduled_date: "2026-10-21",
        kind: "learn",
        planned_minutes: 200,
        mvd_minutes: 15,
        mvd_task: "",
        status: "planned",
        position: 0,
        plan_version: 1,
      },
    ];

    // Without confirmation -> requiresWeeklyConfirmation: true
    const unconfirmed = rescheduleMissedItem({
      item,
      goal: tightWeekGoal,
      existingItems,
      missCount: 1,
      confirmedExceedWeeklyHours: false,
    });
    expect(unconfirmed.success).toBe(false);
    expect(unconfirmed.requiresWeeklyConfirmation).toBe(true);

    // With confirmation -> succeeds
    const confirmed = rescheduleMissedItem({
      item,
      goal: tightWeekGoal,
      existingItems,
      missCount: 1,
      confirmedExceedWeeklyHours: true,
    });
    expect(confirmed.success).toBe(true);
    expect(confirmed.newDate).toBeDefined();
  });

  it("16. an item missed 3 times triggers the adapt prompt", () => {
    const item: PlannedItem = {
      id: "item-missed-3x",
      skill_id: "skill-sql",
      scheduled_date: "2026-10-19",
      kind: "learn",
      planned_minutes: 45,
      mvd_minutes: 15,
      mvd_task: "MVD",
      status: "missed",
      position: 0,
      plan_version: 1,
    };

    const res = rescheduleMissedItem({
      item,
      goal: sampleGoal,
      existingItems: [],
      missCount: 3, // Missed 3 times!
    });

    expect(res.success).toBe(false);
    expect(res.triggerAdapt).toBe(true);
    expect(res.reason).toContain("missed 3 times");
  });
});
