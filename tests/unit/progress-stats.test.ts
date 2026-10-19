import { describe, expect, it } from "vitest";
import {
  calculateMVDStreak,
  computeEvidenceMix,
  computeVerifiedSkillsTimeline,
  generateCodeWeeklySummary,
} from "@/lib/progress";

describe("Progress Stats & MVD Streak Pure Logic (src/lib/progress)", () => {
  describe("1. MVD Streak Calculation", () => {
    it("returns 0 streak for empty dates", () => {
      const res = calculateMVDStreak([]);
      expect(res.current_streak).toBe(0);
      expect(res.status).toBe("active");
    });

    it("calculates active streak when completed today or yesterday", () => {
      const today = new Date("2026-10-19T12:00:00Z");
      const dates = ["2026-10-17", "2026-10-18", "2026-10-19"];

      const res = calculateMVDStreak(dates, today);
      expect(res.current_streak).toBe(3);
      expect(res.status).toBe("active");
      expect(res.longest_streak).toBe(3);
      expect(res.message).toContain("3 day streak active");
    });

    it("pauses streak without resetting count when a day was missed (No guilt copy)", () => {
      const today = new Date("2026-10-19T12:00:00Z");
      // Completed up to 2026-10-17, missed 2026-10-18 and today
      const dates = ["2026-10-15", "2026-10-16", "2026-10-17"];

      const res = calculateMVDStreak(dates, today);
      // Invariant: count is KEPT (not reset to 0 silently)
      expect(res.current_streak).toBe(3);
      // Invariant: status is 'paused'
      expect(res.status).toBe("paused");
      // Invariant: no guilt copy ("Pick up right where you left off!")
      expect(res.message).toContain("Streak paused at 3 days");
      expect(res.message).toContain("Pick up right where you left off");
    });
  });

  describe("2. Evidence Mix Distribution", () => {
    it("computes accurate counts for E0, E1, E2, E3", () => {
      const skills = [
        { evidence_level: 0 },
        { evidence_level: null },
        { evidence_level: 1 },
        { evidence_level: 1 },
        { evidence_level: 2 },
        { evidence_level: 3 },
      ];

      const mix = computeEvidenceMix(skills);
      expect(mix.e0).toBe(2);
      expect(mix.e1).toBe(2);
      expect(mix.e2).toBe(1);
      expect(mix.e3).toBe(1);
    });
  });

  describe("3. Verified Skills Timeline", () => {
    it("accumulates verified skills monotonically over time", () => {
      const skills = [
        { verified_at: "2026-10-10T10:00:00Z" },
        { verified_at: "2026-10-12T10:00:00Z" },
        { verified_at: "2026-10-12T14:00:00Z" },
        { verified_at: "2026-10-15T10:00:00Z" },
      ];

      const points = computeVerifiedSkillsTimeline(skills);
      expect(points).toEqual([
        { date: "2026-10-10", cumulative_count: 1 },
        { date: "2026-10-12", cumulative_count: 3 },
        { date: "2026-10-15", cumulative_count: 4 },
      ]);
    });
  });

  describe("4. Plain-Language Weekly Summary by Code (NO AI)", () => {
    it("generates deterministic summary without calling any AI", () => {
      const summary = generateCodeWeeklySummary({
        doneMinutesThisWeek: 180,
        plannedMinutesThisWeek: 240,
        sessionsCompletedThisWeek: 4,
        streak: {
          current_streak: 5,
          status: "active",
          longest_streak: 5,
          last_completed_date: "2026-10-19",
          message: "5 day streak active!",
        },
        verifiedSkillsCount: 6,
        skillsDueForReview: 2,
        evidenceMix: { e0: 1, e1: 2, e2: 2, e3: 1 },
      });

      expect(summary).toContain("4 learning sessions totaling 180 minutes");
      expect(summary).toContain("MVD streak is active at 5 days");
      expect(summary).toContain("6 verified skills (3 backed by hands-on applied/artifact evidence)");
      expect(summary).toContain("2 skills are ready for spaced review today");
    });
  });
});
