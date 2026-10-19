/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getJobRoute } from "@/app/api/v1/jobs/[id]/route";
import * as serverAuth from "@/lib/supabase/server";
import * as serviceAuth from "@/lib/supabase/service-role";
import { createPgliteSupabaseAdapter } from "../db/pglite-adapter";
import { createTestDatabase } from "../db/test-db";

const USER_A = "11111111-1111-1111-1111-111111111111"; // Maz
const USER_B = "22222222-2222-2222-2222-222222222222"; // Alex

describe("GET /api/v1/jobs/[id] Access Control", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let supabaseAdapter: ReturnType<typeof createPgliteSupabaseAdapter>;
  let userAJobId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    supabaseAdapter = createPgliteSupabaseAdapter(testDb.db);

    // Mock createServiceRoleClient to use test database adapter
    vi.spyOn(serviceAuth, "createServiceRoleClient").mockReturnValue(
      supabaseAdapter as unknown as ReturnType<typeof serviceAuth.createServiceRoleClient>
    );

    // Insert a test job belonging to User A
    const res = await supabaseAdapter.from("ai_jobs").insert({
      owner_id: USER_A,
      task: "skill_graph",
      payload: { title: "Data Engineering" },
      status: "succeeded",
      attempts: 1,
      result_ref: { skills: [] },
    });

    const rows = res.data as Array<{ id: string }>;
    userAJobId = rows[0].id;
  });

  it("allows owner (User A) to retrieve their own job", async () => {
    // Mock user session as User A
    vi.spyOn(serverAuth, "createClient").mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: USER_A,
              email: "maz@learnitt.com",
              app_metadata: {},
              user_metadata: {},
              aud: "authenticated",
              created_at: new Date().toISOString(),
            },
          },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof serverAuth.createClient>>);

    const req = new NextRequest(`http://localhost:3000/api/v1/jobs/${userAJobId}`);
    const response = await getJobRoute(req, {
      params: Promise.resolve({ id: userAJobId }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.id).toBe(userAJobId);
    expect(json.data.status).toBe("succeeded");
    expect(json.data.task).toBe("skill_graph");
  });

  it("strictly refuses another user (User B) from viewing User A's job", async () => {
    // Mock user session as User B
    vi.spyOn(serverAuth, "createClient").mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: USER_B,
              email: "alex@learnitt.com",
              app_metadata: {},
              user_metadata: {},
              aud: "authenticated",
              created_at: new Date().toISOString(),
            },
          },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof serverAuth.createClient>>);

    const req = new NextRequest(`http://localhost:3000/api/v1/jobs/${userAJobId}`);
    const response = await getJobRoute(req, {
      params: Promise.resolve({ id: userAJobId }),
    });

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toMatch(/permission/i);
  });

  it("returns 401 when unauthenticated", async () => {
    // Mock user session as null
    vi.spyOn(serverAuth, "createClient").mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof serverAuth.createClient>>);

    const req = new NextRequest(`http://localhost:3000/api/v1/jobs/${userAJobId}`);
    const response = await getJobRoute(req, {
      params: Promise.resolve({ id: userAJobId }),
    });

    expect(response.status).toBe(401);
  });
});
