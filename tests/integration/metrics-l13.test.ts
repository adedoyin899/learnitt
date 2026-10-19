/**
 * @vitest-environment node
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getMetricsRoute } from "@/app/api/v1/metrics/route";
import * as serverAuth from "@/lib/supabase/server";
import { createPgliteSupabaseAdapter } from "../db/pglite-adapter";
import { createTestDatabase } from "../db/test-db";
import {
  calculatePilotMetrics,
  generateMonthlyReviewMarkdown,
} from "@/lib/metrics/service";

const USER_A = "11111111-1111-1111-1111-111111111111";

describe("L13 Pilot Setup · PRD Section 18 Metrics & Monthly Review", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let supabaseAdapter: ReturnType<typeof createPgliteSupabaseAdapter>;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    supabaseAdapter = createPgliteSupabaseAdapter(testDb.db);

    vi.spyOn(serverAuth, "createClient").mockResolvedValue(
      supabaseAdapter as unknown as Awaited<ReturnType<typeof serverAuth.createClient>>
    );

    // Mock auth returns User A
    vi.spyOn(supabaseAdapter.auth, "getUser").mockResolvedValue({
      data: { user: { id: USER_A } as any },
      error: null,
    });
  });

  describe("1. Pilot Metrics Calculation (PRD Section 18)", () => {
    it("computes accurate MVD rate, weekly adherence, skills mix, AI caps, and override rate", async () => {
      // Seed test fixtures: check-ins, plan items, usage counters, grades
      await testDb.db.exec(`
        -- 1. Insert plan items and check-ins
        INSERT INTO public.plan_items (id, owner_id, goal_id, scheduled_date, kind, planned_minutes, mvd_minutes, status)
        VALUES
          ('d1111111-0001-0000-0000-000000000001', '${USER_A}', 'a1111111-1111-1111-1111-111111111111', current_date, 'learn', 60, 15, 'done'),
          ('d1111111-0002-0000-0000-000000000002', '${USER_A}', 'a1111111-1111-1111-1111-111111111111', current_date - interval '1 day', 'practise', 45, 15, 'mvd_only'),
          ('d1111111-0003-0000-0000-000000000003', '${USER_A}', 'a1111111-1111-1111-1111-111111111111', current_date - interval '2 days', 'apply', 90, 20, 'partial');

        INSERT INTO public.check_ins (id, owner_id, plan_item_id, outcome, minutes_actual, client_id, created_at)
        VALUES
          ('c1111111-0001-0000-0000-000000000001', '${USER_A}', 'd1111111-0001-0000-0000-000000000001', 'done', 60, '10000000-0000-0000-0000-000000000001', now()),
          ('c1111111-0002-0000-0000-000000000002', '${USER_A}', 'd1111111-0002-0000-0000-000000000002', 'mvd_only', 15, '10000000-0000-0000-0000-000000000002', now() - interval '1 day'),
          ('c1111111-0003-0000-0000-000000000003', '${USER_A}', 'd1111111-0003-0000-0000-000000000003', 'partial', 30, '10000000-0000-0000-0000-000000000003', now() - interval '2 days');

        -- 2. Insert usage counters for AI calls
        INSERT INTO public.usage_counters (owner_id, day, calls)
        VALUES
          ('${USER_A}', current_date, 12),
          ('${USER_A}', current_date - interval '1 day', 18),
          ('${USER_A}', current_date - interval '2 days', 24);

        -- 3. Insert quiz, attempt, and grades with override
        INSERT INTO public.quizzes (id, owner_id, skill_id, prompt_version)
        VALUES ('e1111111-0001-0000-0000-000000000001', '${USER_A}', 'b1111111-0001-0000-0000-000000000001', 'v1');

        INSERT INTO public.quiz_questions (id, owner_id, quiz_id, position, type, prompt)
        VALUES ('e2222222-0001-0000-0000-000000000001', '${USER_A}', 'e1111111-0001-0000-0000-000000000001', 1, 'applied', 'SQL test');

        INSERT INTO public.attempts (id, owner_id, question_id, client_id, status)
        VALUES ('f1111111-0001-0000-0000-000000000001', '${USER_A}', 'e2222222-0001-0000-0000-000000000001', '10000000-0000-0000-0000-000000000010', 'graded');

        INSERT INTO public.grades (id, owner_id, attempt_id, source, total, verdict)
        VALUES
          ('a9999999-0001-0000-0000-000000000001', '${USER_A}', 'f1111111-0001-0000-0000-000000000001', 'ai', 65, 'pass'),
          ('a9999999-0002-0000-0000-000000000002', '${USER_A}', 'f1111111-0001-0000-0000-000000000001', 'user_override', 80, 'pass');
      `);

      const metrics = await calculatePilotMetrics(supabaseAdapter, USER_A);

      // Verify MVD Rate
      expect(metrics.mvd.active_days).toBeGreaterThanOrEqual(3);
      expect(metrics.mvd.rate_percent).toBeGreaterThan(0);
      expect(metrics.mvd.target_percent).toBe(80);

      // Verify Weekly Plan Adherence
      expect(metrics.adherence.done_minutes).toBe(105); // 60 + 15 + 30
      expect(metrics.adherence.planned_minutes).toBe(195); // 60 + 45 + 90
      expect(metrics.adherence.rate_percent).toBe(54); // round(105/195 * 100)

      // Verify Check-in friction
      expect(metrics.checkin_time.median_seconds).toBeLessThan(30);

      // Verify Verified Skills & Evidence Mix
      expect(metrics.skills.verified_skills_count).toBeGreaterThanOrEqual(1);
      expect(metrics.skills.evidence_mix.target_share_percent).toBe(60);

      // Verify AI Usage
      expect(metrics.ai_usage.total_calls).toBe(54); // 12 + 18 + 24
      expect(metrics.ai_usage.daily_cap).toBe(30);
      expect(metrics.ai_usage.days_under_cap_percent).toBe(100);
      expect(metrics.ai_usage.meets_target).toBe(true);

      // Verify Override Rate
      expect(metrics.grading.ai_graded_count).toBe(1);
      expect(metrics.grading.user_override_count).toBe(1);
      expect(metrics.grading.override_rate_percent).toBe(50);
    });
  });

  describe("2. Monthly Review Markdown Generation", () => {
    it("generates structured one-page markdown matching PRD Section 18", async () => {
      const metrics = await calculatePilotMetrics(supabaseAdapter, USER_A);
      const markdown = generateMonthlyReviewMarkdown(metrics, "October 2026");

      expect(markdown).toContain("# Learnitt Pilot · Monthly Review (October 2026)");
      expect(markdown).toContain("## 1. Executive Metrics (PRD Section 18)");
      expect(markdown).toContain("Minimum Viable Day (MVD) Rate");
      expect(markdown).toContain("Weekly Plan Adherence");
      expect(markdown).toContain("Check-in Friction Time");
      expect(markdown).toContain("## 2. What Worked Well");
      expect(markdown).toContain("## 3. What Did Not Work / Friction Points");
      expect(markdown).toContain("## 4. Actionable Adjustments for Next Month");
    });
  });

  describe("3. GET /api/v1/metrics Endpoint", () => {
    it("returns JSON pilot metrics for authenticated operator", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/metrics", {
        headers: { Accept: "application/json" },
      });

      const res = await getMetricsRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.metrics).toBeDefined();
      expect(json.metrics.mvd.target_percent).toBe(80);
      expect(json.metrics.adherence.target_percent).toBe(70);
    });

    it("returns downloadable markdown review when format=markdown", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/v1/metrics?format=markdown&month=October%202026",
        {
          headers: { Accept: "text/markdown" },
        }
      );

      const res = await getMetricsRoute(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");
      expect(res.headers.get("content-disposition")).toContain("learnitt-monthly-review-");

      const mdText = await res.text();
      expect(mdText).toContain("# Learnitt Pilot · Monthly Review (October 2026)");
    });

    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      vi.spyOn(supabaseAdapter.auth, "getUser").mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid session" } as any,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/metrics");
      const res = await getMetricsRoute(req);
      expect(res.status).toBe(401);
    });
  });
});
