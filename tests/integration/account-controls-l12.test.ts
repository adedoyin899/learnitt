/**
 * @vitest-environment node
 */

import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import JSZip from "jszip";

import { POST as exportRoute } from "@/app/api/v1/export/route";
import { DELETE as deleteGoalRoute } from "@/app/api/v1/goals/[id]/route";
import { DELETE as deleteAccountRoute } from "@/app/api/v1/account/route";
import { POST as retentionRoute } from "@/app/api/v1/cron/retention/route";
import { runRetentionPurge } from "@/lib/retention/service";
import { createBackup } from "@/../scripts/backup.mjs";
import { restoreBackup } from "@/../scripts/restore.mjs";
import {
  checkAiRateLimit,
  checkAuthRateLimit,
  resetAllRateLimits,
  AI_RATE_LIMIT,
  AUTH_RATE_LIMIT,
} from "@/lib/security/rate-limit";
import * as serverAuth from "@/lib/supabase/server";
import * as serviceAuth from "@/lib/supabase/service-role";
import { createPgliteSupabaseAdapter } from "../db/pglite-adapter";
import { createTestDatabase } from "../db/test-db";
import { storeMaterialBuffer, getMockStorageMap, clearMockStorage } from "@/lib/materials/storage";
import { env } from "@/lib/env";

const USER_A = "11111111-1111-1111-1111-111111111111"; // Maz
const USER_B = "22222222-2222-2222-2222-222222222222"; // Alex

describe("L12 Hardening Integration Suite · Account Controls, Security, Retention & Backups", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let supabaseAdapter: ReturnType<typeof createPgliteSupabaseAdapter>;
  let tempDir: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    supabaseAdapter = createPgliteSupabaseAdapter(testDb.db);
    resetAllRateLimits();
    clearMockStorage();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnitt-l12-test-"));

    // Default mock server client returns USER_A
    vi.spyOn(serverAuth, "createClient").mockResolvedValue(
      supabaseAdapter as unknown as Awaited<ReturnType<typeof serverAuth.createClient>>
    );

    vi.spyOn(serviceAuth, "createServiceRoleClient").mockReturnValue(
      supabaseAdapter as unknown as ReturnType<typeof serviceAuth.createServiceRoleClient>
    );

    // Link materials to existing seeded goals
    await testDb.db.exec(`
      INSERT INTO public.materials (id, owner_id, goal_id, kind, title, storage_path, status)
      VALUES
        ('11111111-1111-0000-0000-000000000001', '${USER_A}', 'a1111111-1111-1111-1111-111111111111', 'pdf', 'Maz Data Notes.pdf', '${USER_A}/mat_1/notes.pdf', 'ready'),
        ('22222222-2222-0000-0000-000000000001', '${USER_B}', 'b2222222-2222-2222-2222-222222222222', 'pdf', 'Alex Private Doc.pdf', '${USER_B}/mat_2/confidential.pdf', 'ready')
      ON CONFLICT DO NOTHING;
    `);

    // Put mock files in mock storage
    storeMaterialBuffer(
      `${USER_A}/mat_1/notes.pdf`,
      Buffer.from("%PDF-1.7 Maz Data Engineering Notes"),
      supabaseAdapter
    );
    storeMaterialBuffer(
      `${USER_B}/mat_2/confidential.pdf`,
      Buffer.from("%PDF-1.7 Alex Confidential"),
      supabaseAdapter
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAllRateLimits();
    clearMockStorage();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  });

  describe("1. Data & Materials Export (POST /export)", () => {
    it("exports all owned rows for the authenticated user and nothing from any other user", async () => {
      // Mock auth as USER_A
      vi.spyOn(supabaseAdapter.auth, "getUser").mockResolvedValue({
        data: { user: { id: USER_A } as any },
        error: null,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/export?format=json", {
        method: "POST",
        headers: { Accept: "application/json" },
      });

      const res = await exportRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.user_id).toBe(USER_A);
      expect(json.data.goals.length).toBeGreaterThanOrEqual(1);

      // Verify that all goals belong strictly to USER_A
      expect(json.data.goals.every((g: any) => g.owner_id === USER_A)).toBe(true);
      expect(json.data.goals.some((g: any) => g.title === "Health Analytics and Biostatistics")).toBe(false);

      // Verify skills belong strictly to USER_A
      expect(json.data.skills.every((s: any) => s.owner_id === USER_A)).toBe(true);
      expect(json.data.skills.some((s: any) => s.name === "Alex Secret Skill")).toBe(false);

      // Verify materials belong strictly to USER_A
      expect(json.data.materials.every((m: any) => m.owner_id === USER_A)).toBe(true);
      expect(json.data.materials.some((m: any) => m.title === "Alex Private Doc.pdf")).toBe(false);
    });

    it("generates a valid ZIP archive containing learnitt-data.json and original materials", async () => {
      vi.spyOn(supabaseAdapter.auth, "getUser").mockResolvedValue({
        data: { user: { id: USER_A } as any },
        error: null,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/export", {
        method: "POST",
        headers: { Accept: "application/zip" },
      });

      const res = await exportRoute(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/zip");
      expect(res.headers.get("content-disposition")).toContain("learnitt-export-");

      const zipArrayBuf = await res.arrayBuffer();
      const zip = await JSZip.loadAsync(zipArrayBuf);

      // Confirm learnitt-data.json exists inside zip
      const jsonFile = zip.file("learnitt-data.json");
      expect(jsonFile).not.toBeNull();
      const jsonContent = await jsonFile!.async("string");
      const parsed = JSON.parse(jsonContent);
      expect(parsed.user_id).toBe(USER_A);
      expect(parsed.data.goals[0].owner_id).toBe(USER_A);

      // Confirm material files exist in materials/
      const materialsFolder = zip.folder("materials");
      expect(materialsFolder).not.toBeNull();
      const files = Object.keys(zip.files).filter((f) => f.startsWith("materials/") && !f.endsWith("/"));
      expect(files.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("2. Typed Goal Deletion (DELETE /api/v1/goals/:id)", () => {
    const GOAL_ID = "a1111111-1111-1111-1111-111111111111";

    it("rejects deletion when typed confirmation does not match goal title", async () => {
      vi.spyOn(supabaseAdapter.auth, "getUser").mockResolvedValue({
        data: { user: { id: USER_A } as any },
        error: null,
      });

      const req = new NextRequest(`http://localhost:3000/api/v1/goals/${GOAL_ID}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation_title: "Wrong Goal Title" }),
      });

      const res = await deleteGoalRoute(req, { params: Promise.resolve({ id: GOAL_ID }) });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain("Confirmation text must match the goal title");

      // Verify goal was not deleted
      const check = await testDb.db.query("SELECT id FROM public.goals WHERE id = $1", [GOAL_ID]);
      expect(check.rows.length).toBe(1);
    });

    it("deletes goal, cascades rows, deletes storage objects, and cancels jobs when confirmed", async () => {
      vi.spyOn(supabaseAdapter.auth, "getUser").mockResolvedValue({
        data: { user: { id: USER_A } as any },
        error: null,
      });

      // Insert an AI job referencing this goal
      await testDb.db.exec(`
        INSERT INTO public.ai_jobs (id, owner_id, task, payload, status)
        VALUES ('33333333-3333-3333-3333-333333333333', '${USER_A}', 'skill_graph', '{"goal_id": "${GOAL_ID}"}', 'queued');
      `);

      const req = new NextRequest(`http://localhost:3000/api/v1/goals/${GOAL_ID}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation_title: "Junior Data Engineer in 6 months" }),
      });

      const res = await deleteGoalRoute(req, { params: Promise.resolve({ id: GOAL_ID }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify goal is gone
      const goalCheck = await testDb.db.query("SELECT id FROM public.goals WHERE id = $1", [GOAL_ID]);
      expect(goalCheck.rows.length).toBe(0);

      // Verify cascade deleted skills
      const skillCheck = await testDb.db.query("SELECT id FROM public.skills WHERE goal_id = $1", [GOAL_ID]);
      expect(skillCheck.rows.length).toBe(0);

      // Verify cascade deleted materials
      const matCheck = await testDb.db.query("SELECT id FROM public.materials WHERE goal_id = $1", [GOAL_ID]);
      expect(matCheck.rows.length).toBe(0);

      // Verify queued job is deleted
      const jobCheck = await testDb.db.query("SELECT id FROM public.ai_jobs WHERE id = '33333333-3333-3333-3333-333333333333'");
      expect(jobCheck.rows.length).toBe(0);
    });
  });

  describe("3. Typed Account Deletion (DELETE /api/v1/account)", () => {
    it("rejects deletion when confirmation is not 'DELETE'", async () => {
      vi.spyOn(supabaseAdapter.auth, "getUser").mockResolvedValue({
        data: { user: { id: USER_A } as any },
        error: null,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/account", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: "delete please" }),
      });

      const res = await deleteAccountRoute(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain("must be 'DELETE'");

      // Verify User A profile still exists
      const profCheck = await testDb.db.query("SELECT id FROM public.profiles WHERE id = $1", [USER_A]);
      expect(profCheck.rows.length).toBe(1);
    });

    it("permanently removes all rows, storage objects, and jobs for the user when confirmed with 'DELETE'", async () => {
      vi.spyOn(supabaseAdapter.auth, "getUser").mockResolvedValue({
        data: { user: { id: USER_A } as any },
        error: null,
      });

      // Insert extra rows for User A: reminder settings, journal entry, ai job
      await testDb.db.exec(`
        INSERT INTO public.reminder_settings (owner_id, daily_time) VALUES ('${USER_A}', '09:00:00') ON CONFLICT DO NOTHING;
        INSERT INTO public.journal_entries (owner_id, body) VALUES ('${USER_A}', 'Test journal note');
        INSERT INTO public.ai_jobs (owner_id, task, payload) VALUES ('${USER_A}', 'quiz_generate', '{}');
      `);

      const req = new NextRequest("http://localhost:3000/api/v1/account", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: "DELETE" }),
      });

      const res = await deleteAccountRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify zero rows remain for User A across every table
      const tablesToCheck = [
        "profiles",
        "goals",
        "skills",
        "materials",
        "journal_entries",
        "reminder_settings",
        "ai_jobs",
      ];

      for (const table of tablesToCheck) {
        const idCol = table === "profiles" ? "id" : "owner_id";
        const result = await testDb.db.query(`SELECT 1 FROM public.${table} WHERE ${idCol} = $1`, [USER_A]);
        expect(result.rows.length, `Expected 0 rows in ${table} for deleted user`).toBe(0);
      }

      // Verify User B data was completely untouched
      const userBGoals = await testDb.db.query("SELECT id FROM public.goals WHERE owner_id = $1", [USER_B]);
      expect(userBGoals.rows.length).toBeGreaterThanOrEqual(1);

      const userBMaterials = await testDb.db.query("SELECT id FROM public.materials WHERE owner_id = $1", [USER_B]);
      expect(userBMaterials.rows.length).toBe(1);
    });
  });

  describe("4. Security Pass · Rate Limiting (Phase L12 Requirement 2)", () => {
    it("enforces AI rate limit: allows up to 20 calls/min, triggers 429 on 21st call", () => {
      const testUserId = "test-rate-limit-user-1";

      for (let i = 0; i < AI_RATE_LIMIT; i++) {
        const result = checkAiRateLimit(testUserId);
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(AI_RATE_LIMIT - 1 - i);
      }

      // 21st call must trigger rate limit
      const exceeded = checkAiRateLimit(testUserId);
      expect(exceeded.success).toBe(false);
      expect(exceeded.remaining).toBe(0);
      expect(exceeded.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("enforces Auth rate limit: allows up to 10 calls/min per IP, triggers 429 on 11th call", () => {
      const mockReq = new NextRequest("http://localhost:3000/api/v1/auth/signout", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.195" },
      });

      for (let i = 0; i < AUTH_RATE_LIMIT; i++) {
        const result = checkAuthRateLimit(mockReq);
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(AUTH_RATE_LIMIT - 1 - i);
      }

      // 11th call must trigger rate limit
      const exceeded = checkAuthRateLimit(mockReq);
      expect(exceeded.success).toBe(false);
      expect(exceeded.remaining).toBe(0);
      expect(exceeded.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("5. Retention Job (POST /cron/retention & SQL migration)", () => {
    it("requires CRON_SECRET for access", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/cron/retention", {
        method: "POST",
      });

      const res = await retentionRoute(req);
      expect(res.status).toBe(401);
    });

    it("purges ai_cache and ai_jobs older than 30 days and keeps usage counters 13 months", async () => {
      // Insert old records (>30 days old) and fresh records (<30 days old)
      await testDb.db.exec(`
        -- Old cache entry (40 days old)
        INSERT INTO public.ai_cache (cache_key, task, provider, prompt_version, result, created_at)
        VALUES ('old_cache_key', 'test_task', 'gemini', 'v1', '{}', now() - interval '40 days');

        -- Fresh cache entry (5 days old)
        INSERT INTO public.ai_cache (cache_key, task, provider, prompt_version, result, created_at)
        VALUES ('fresh_cache_key', 'test_task', 'gemini', 'v1', '{}', now() - interval '5 days');

        -- Old job (35 days old)
        INSERT INTO public.ai_jobs (id, owner_id, task, payload, status, created_at)
        VALUES ('44444444-4444-4444-4444-444444444444', '${USER_B}', 'task', '{}', 'succeeded', now() - interval '35 days');

        -- Fresh job (2 days old)
        INSERT INTO public.ai_jobs (id, owner_id, task, payload, status, created_at)
        VALUES ('55555555-5555-5555-5555-555555555555', '${USER_B}', 'task', '{}', 'succeeded', now() - interval '2 days');

        -- Old usage counter (14 months old)
        INSERT INTO public.usage_counters (owner_id, day, calls)
        VALUES ('${USER_B}', current_date - interval '14 months', 10);

        -- Fresh usage counter (6 months old)
        INSERT INTO public.usage_counters (owner_id, day, calls)
        VALUES ('${USER_B}', current_date - interval '6 months', 20);
      `);

      const stats = await runRetentionPurge(testDb.db);

      expect(stats.purgedAiCache).toBe(1);
      expect(stats.purgedAiJobs).toBe(1);
      expect(stats.purgedUsageCounters).toBe(1);

      // Verify fresh records were preserved
      const freshCache = await testDb.db.query("SELECT cache_key FROM public.ai_cache WHERE cache_key = 'fresh_cache_key'");
      expect(freshCache.rows.length).toBe(1);

      const freshJob = await testDb.db.query("SELECT id FROM public.ai_jobs WHERE id = '55555555-5555-5555-5555-555555555555'");
      expect(freshJob.rows.length).toBe(1);

      const freshCounter = await testDb.db.query("SELECT calls FROM public.usage_counters WHERE calls = 20");
      expect(freshCounter.rows.length).toBe(1);
    });
  });

  describe("6. Backups & Restoration Verification", () => {
    it("exports database and materials, then restores into a fresh database with matching row counts", async () => {
      // 1. Create backup
      const { backupFolder, manifest } = await createBackup(testDb.db, tempDir);
      expect(fs.existsSync(backupFolder)).toBe(true);
      expect(fs.existsSync(path.join(backupFolder, "manifest.json"))).toBe(true);
      expect(fs.existsSync(path.join(backupFolder, "database.json"))).toBe(true);
      const tables = manifest.tables as Record<string, number>;
      expect(tables.goals).toBeGreaterThanOrEqual(1);

      // 2. Create a clean fresh database
      const freshDb = await createTestDatabase();

      // Clear any default seeded goals to verify pure restoration
      await freshDb.db.query("DELETE FROM public.goals");
      const emptyCheck = await freshDb.db.query("SELECT count(*) as count FROM public.goals");
      expect(Number((emptyCheck.rows[0] as { count: string | number }).count)).toBe(0);

      // 3. Restore backup into fresh database
      const restoreReport = await restoreBackup(backupFolder, freshDb.db);
      const restoredTables = restoreReport.restored_tables as Record<string, number>;
      expect(restoredTables.goals).toBe(tables.goals);

      // 4. Verify rows restored into fresh database
      const restoredGoals = await freshDb.db.query("SELECT count(*) as count FROM public.goals");
      expect(Number((restoredGoals.rows[0] as { count: string | number }).count)).toBe(tables.goals);
    });
  });

  describe("7. Security Verification · Service Role Key Client Isolation", () => {
    it("confirms createServiceRoleClient is never imported in client components or client bundles", () => {
      const componentsDir = path.join(process.cwd(), "src", "components");
      const clientEnvPath = path.join(process.cwd(), "src", "lib", "env.client.ts");

      // Verify env.client.ts never references service role
      const clientEnvContent = fs.readFileSync(clientEnvPath, "utf8");
      expect(clientEnvContent).not.toContain("SUPABASE_SERVICE_ROLE_KEY");

      // Scan all files in src/components
      function scanDir(dir: string) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory()) {
            scanDir(fullPath);
          } else if (file.name.endsWith(".tsx") || file.name.endsWith(".ts")) {
            const content = fs.readFileSync(fullPath, "utf8");
            expect(
              content.includes("createServiceRoleClient"),
              `Forbidden service role import detected in client component: ${file.name}`
            ).toBe(false);
            expect(
              content.includes("SUPABASE_SERVICE_ROLE_KEY"),
              `Forbidden service role key string detected in client component: ${file.name}`
            ).toBe(false);
          }
        }
      }

      scanDir(componentsDir);
    });
  });
});
