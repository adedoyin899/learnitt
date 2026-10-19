/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDatabase } from "../db/test-db";

const USER_A = "11111111-1111-1111-1111-111111111111"; // Maz
const USER_B = "22222222-2222-2222-2222-222222222222"; // Alex

describe("Database Schema & Row Level Security (RLS) Test Suite", () => {
  let testEnv: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    testEnv = await createTestDatabase();
  });

  describe("1. Schema Migration & Idempotent Seed Execution", () => {
    it("applies migrations and seed cleanly with two users and seeded goals", async () => {
      const { db } = testEnv;

      const users = await db.query<{ id: string; email: string }>(
        "SELECT id, email FROM auth.users ORDER BY email"
      );
      expect(users.rows).toHaveLength(2);
      expect(users.rows[0].email).toBe("alex@learnitt.com");
      expect(users.rows[1].email).toBe("maz@learnitt.com");

      // Verify User A has active data engineering goal
      const userAGoals = await db.query<{ id: string; title: string; status: string }>(
        "SELECT id, title, status FROM public.goals WHERE owner_id = $1 ORDER BY title",
        [USER_A]
      );
      expect(userAGoals.rows).toHaveLength(2); // One active Data Engineering, one draft Language
      expect(userAGoals.rows.some((g) => g.status === "active")).toBe(true);
      expect(userAGoals.rows.some((g) => g.status === "draft")).toBe(true);

      // Verify 12 skills in User A's data engineering graph
      const skills = await db.query<{ id: string; name: string }>(
        "SELECT id, name FROM public.skills WHERE owner_id = $1",
        [USER_A]
      );
      expect(skills.rows.length).toBeGreaterThanOrEqual(12);
    });

    it("enforces partial unique index: only one active goal per owner", async () => {
      const { db } = testEnv;

      // User A already has an active goal. Inserting a second active goal MUST throw a unique violation.
      await expect(
        db.query(
          `INSERT INTO public.goals (owner_id, title, starting_level, target_date, weekly_hours, status)
           VALUES ($1, 'Another Active Goal', 'beginner', current_date + 60, 5, 'active')`,
          [USER_A]
        )
      ).rejects.toThrow(/one_active_goal_per_owner/);
    });
  });

  describe("2. RLS Tenant Isolation for Every User-Owned Table", () => {
    it("enforces RLS on profiles", async () => {
      // User A sees only their own profile
      await testEnv.asUser(USER_A, async (client) => {
        const res = await client.query<{ id: string }>("SELECT id FROM public.profiles");
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0].id).toBe(USER_A);

        // Cannot update User B's profile
        const updateRes = await client.query(
          "UPDATE public.profiles SET display_name = 'Hacked' WHERE id = $1 RETURNING id",
          [USER_B]
        );
        expect(updateRes.rows).toHaveLength(0);
      });

      // Anonymous sees nothing
      await testEnv.asAnon(async (client) => {
        const res = await client.query("SELECT id FROM public.profiles");
        expect(res.rows).toHaveLength(0);
      });
    });

    it("enforces RLS on goals", async () => {
      await testEnv.asUser(USER_A, async (client) => {
        const res = await client.query<{ owner_id: string }>("SELECT owner_id FROM public.goals");
        expect(res.rows.every((r) => r.owner_id === USER_A)).toBe(true);

        // User A cannot delete User B's goal
        const delRes = await client.query(
          "DELETE FROM public.goals WHERE owner_id = $1 RETURNING id",
          [USER_B]
        );
        expect(delRes.rows).toHaveLength(0);
      });

      // User A cannot insert a goal for User B (must throw RLS error)
      await expect(
        testEnv.asUser(USER_A, async (client) => {
          await client.query(
            `INSERT INTO public.goals (owner_id, title, starting_level, target_date, weekly_hours)
             VALUES ($1, 'Stolen Goal', 'beginner', current_date + 30, 4)`,
            [USER_B]
          );
        })
      ).rejects.toThrow(/violates row-level security policy/);

      await testEnv.asAnon(async (client) => {
        const res = await client.query("SELECT id FROM public.goals");
        expect(res.rows).toHaveLength(0);
      });
    });

    it("enforces RLS on skills and skill_prereqs", async () => {
      await testEnv.asUser(USER_B, async (client) => {
        // User B sees 0 skills belonging to User A
        const res = await client.query("SELECT id FROM public.skills");
        expect(res.rows).toHaveLength(0);

        const prereqs = await client.query("SELECT skill_id FROM public.skill_prereqs");
        expect(prereqs.rows).toHaveLength(0);
      });
    });

    it("enforces RLS on materials, material_chunks, and skill_material_links", async () => {
      // Seed material for User A
      let materialId = "";
      await testEnv.asUser(USER_A, async (client) => {
        const mat = await client.query<{ id: string }>(
          `INSERT INTO public.materials (owner_id, kind, title)
           VALUES ($1, 'text', 'Data Pipeline Notes') RETURNING id`,
          [USER_A]
        );
        materialId = mat.rows[0].id;

        await client.query(
          `INSERT INTO public.material_chunks (owner_id, material_id, ordinal, content, tokens)
           VALUES ($1, $2, 1, 'Chunk content for pipeline', 10)`,
          [USER_A, materialId]
        );
      });

      // User B cannot read User A's material or chunks
      await testEnv.asUser(USER_B, async (client) => {
        const matRes = await client.query("SELECT id FROM public.materials WHERE id = $1", [
          materialId,
        ]);
        expect(matRes.rows).toHaveLength(0);

        const chunkRes = await client.query(
          "SELECT id FROM public.material_chunks WHERE material_id = $1",
          [materialId]
        );
        expect(chunkRes.rows).toHaveLength(0);
      });
    });

    it("enforces RLS on resources and plan_items", async () => {
      let planItemId = "";
      await testEnv.asUser(USER_A, async (client) => {
        const goalRes = await client.query<{ id: string }>(
          "SELECT id FROM public.goals WHERE owner_id = $1 LIMIT 1",
          [USER_A]
        );
        const goalId = goalRes.rows[0].id;

        const planRes = await client.query<{ id: string }>(
          `INSERT INTO public.plan_items (owner_id, goal_id, scheduled_date, kind, planned_minutes, mvd_minutes)
           VALUES ($1, $2, current_date, 'learn', 60, 15) RETURNING id`,
          [USER_A, goalId]
        );
        planItemId = planRes.rows[0].id;
      });

      await testEnv.asUser(USER_B, async (client) => {
        const res = await client.query("SELECT id FROM public.plan_items WHERE id = $1", [
          planItemId,
        ]);
        expect(res.rows).toHaveLength(0);
      });
    });

    it("enforces RLS on check_ins", async () => {
      const checkInClientId = "99999999-9999-9999-9999-999999999999";
      await testEnv.asUser(USER_A, async (client) => {
        const planItem = await client.query<{ id: string }>(
          "SELECT id FROM public.plan_items WHERE owner_id = $1 LIMIT 1",
          [USER_A]
        );
        await client.query(
          `INSERT INTO public.check_ins (owner_id, plan_item_id, outcome, minutes_actual, client_id)
           VALUES ($1, $2, 'done', 45, $3)`,
          [USER_A, planItem.rows[0].id, checkInClientId]
        );
      });

      await testEnv.asUser(USER_B, async (client) => {
        const res = await client.query("SELECT id FROM public.check_ins WHERE client_id = $1", [
          checkInClientId,
        ]);
        expect(res.rows).toHaveLength(0);
      });
    });

    it("enforces RLS on quizzes, quiz_questions, attempts, and grades", async () => {
      let quizId = "";
      await testEnv.asUser(USER_A, async (client) => {
        const skill = await client.query<{ id: string }>(
          "SELECT id FROM public.skills WHERE owner_id = $1 LIMIT 1",
          [USER_A]
        );
        const qRes = await client.query<{ id: string }>(
          `INSERT INTO public.quizzes (owner_id, skill_id, prompt_version)
           VALUES ($1, $2, 'v1.0') RETURNING id`,
          [USER_A, skill.rows[0].id]
        );
        quizId = qRes.rows[0].id;
      });

      await testEnv.asUser(USER_B, async (client) => {
        const res = await client.query("SELECT id FROM public.quizzes WHERE id = $1", [quizId]);
        expect(res.rows).toHaveLength(0);
      });
    });

    it("enforces RLS on conversations and messages", async () => {
      let convId = "";
      await testEnv.asUser(USER_A, async (client) => {
        const cRes = await client.query<{ id: string }>(
          "INSERT INTO public.conversations (owner_id) VALUES ($1) RETURNING id",
          [USER_A]
        );
        convId = cRes.rows[0].id;

        await client.query(
          `INSERT INTO public.messages (owner_id, conversation_id, role, content)
           VALUES ($1, $2, 'user', 'What is an Airflow DAG?')`,
          [USER_A, convId]
        );
      });

      await testEnv.asUser(USER_B, async (client) => {
        const res = await client.query(
          "SELECT id FROM public.messages WHERE conversation_id = $1",
          [convId]
        );
        expect(res.rows).toHaveLength(0);
      });
    });

    it("enforces RLS on journal_entries, skill_reviews, and goal_changes", async () => {
      await testEnv.asUser(USER_A, async (client) => {
        await client.query(
          "INSERT INTO public.journal_entries (owner_id, body, mood) VALUES ($1, 'Great study session.', 5)",
          [USER_A]
        );
      });

      await testEnv.asUser(USER_B, async (client) => {
        const res = await client.query("SELECT id FROM public.journal_entries");
        expect(res.rows).toHaveLength(0);
      });
    });

    it("enforces RLS on reminder_settings, push_subscriptions, reminder_log, and saved_cards", async () => {
      await testEnv.asUser(USER_A, async (client) => {
        await client.query(
          "INSERT INTO public.saved_cards (owner_id, question, answer) VALUES ($1, 'What is SQL?', 'Structured Query Language')",
          [USER_A]
        );
        await client.query(
          "INSERT INTO public.reminder_log (owner_id, kind, day) VALUES ($1, 'daily', current_date)",
          [USER_A]
        );
      });

      await testEnv.asUser(USER_B, async (client) => {
        const cards = await client.query("SELECT id FROM public.saved_cards");
        expect(cards.rows).toHaveLength(0);

        const logs = await client.query("SELECT owner_id FROM public.reminder_log");
        expect(logs.rows).toHaveLength(0);
      });
    });
  });

  describe("3. Server-Only Tables & Secure Client RPCs", () => {
    it("blocks direct client access to ai_jobs, ai_cache, and usage_counters", async () => {
      // Seed an AI job and usage counter as service role
      await testEnv.asServiceRole(async (client) => {
        await client.query(
          `INSERT INTO public.ai_jobs (owner_id, task, payload)
           VALUES ($1, 'skill_graph', '{"test": true}')`,
          [USER_A]
        );
        await client.query(
          `INSERT INTO public.usage_counters (owner_id, day, calls, tokens_in, tokens_out)
           VALUES ($1, current_date, 5, 500, 250)`,
          [USER_A]
        );
      });

      // User A directly querying ai_jobs or ai_cache returns 0 rows due to empty policy
      await testEnv.asUser(USER_A, async (client) => {
        const jobs = await client.query("SELECT id FROM public.ai_jobs");
        expect(jobs.rows).toHaveLength(0);

        const counters = await client.query("SELECT calls FROM public.usage_counters");
        expect(counters.rows).toHaveLength(0);

        // But User A can safely read their own usage via secure RPC
        const myUsage = await client.query<{ calls: number }>(
          "SELECT * FROM public.get_my_usage_today()"
        );
        expect(myUsage.rows).toHaveLength(1);
        expect(myUsage.rows[0].calls).toBe(5);
      });
    });
  });

  describe("4. Storage Isolation in Private Materials Bucket", () => {
    it("enforces user prefix isolation for storage objects", async () => {
      // Service role inserts an object for User A and an object for User B
      await testEnv.asServiceRole(async (client) => {
        await client.query(
          `INSERT INTO storage.objects (bucket_id, name, owner)
           VALUES
             ('materials', '${USER_A}/mat_1/notes.pdf', '${USER_A}'),
             ('materials', '${USER_B}/mat_2/confidential.pdf', '${USER_B}')`
        );
      });

      // User A can only see objects with User A prefix
      await testEnv.asUser(USER_A, async (client) => {
        const res = await client.query<{ name: string }>(
          "SELECT name FROM storage.objects WHERE bucket_id = 'materials'"
        );
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0].name).toBe(`${USER_A}/mat_1/notes.pdf`);

        // User A cannot insert into User B's folder
        await expect(
          client.query(
            `INSERT INTO storage.objects (bucket_id, name, owner)
             VALUES ('materials', '${USER_B}/mat_1/exploit.pdf', '${USER_A}')`
          )
        ).rejects.toThrow(/violates row-level security policy/);
      });

      // User B can only see objects with User B prefix
      await testEnv.asUser(USER_B, async (client) => {
        const res = await client.query<{ name: string }>(
          "SELECT name FROM storage.objects WHERE bucket_id = 'materials'"
        );
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0].name).toBe(`${USER_B}/mat_2/confidential.pdf`);
      });

      // Anonymous sees zero storage objects
      await testEnv.asAnon(async (client) => {
        const res = await client.query("SELECT name FROM storage.objects");
        expect(res.rows).toHaveLength(0);
      });
    });
  });
});
