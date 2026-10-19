/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createMaterialRoute } from "@/app/api/v1/materials/route";
import { POST as processMaterialRoute } from "@/app/api/v1/materials/[id]/process/route";
import { GET as uncoveredSkillsRoute } from "@/app/api/v1/materials/uncovered-skills/route";
import { PATCH as updateLinkRoute } from "@/app/api/v1/materials/links/route";
import { POST as enqueueLinkingRoute } from "@/app/api/v1/goals/[id]/link-materials/route";
import { GET as getConsentRoute, POST as updateConsentRoute } from "@/app/api/v1/user/consent/route";
import { applyProposedLinks } from "@/lib/materials/linking";
import { searchMaterialChunks } from "@/lib/materials/retrieval";
import { clearMockStorage } from "@/lib/materials/storage";
import * as serverAuth from "@/lib/supabase/server";
import * as serviceAuth from "@/lib/supabase/service-role";
import { createPgliteSupabaseAdapter } from "../db/pglite-adapter";
import { createTestDatabase } from "../db/test-db";
import { MINIMAL_TEST_PDF } from "../fixtures/sample-pdf";

const USER_A = "11111111-1111-1111-1111-111111111111"; // Maz
const USER_B = "22222222-2222-2222-2222-222222222222"; // Other user

describe("L4 Integration Suite · Materials, Extraction, Retrieval, Linking & Consent Gate", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let supabaseAdapter: ReturnType<typeof createPgliteSupabaseAdapter>;
  let activeUserId = USER_A;

  beforeEach(async () => {
    clearMockStorage();
    testDb = await createTestDatabase();
    supabaseAdapter = createPgliteSupabaseAdapter(testDb.db);
    activeUserId = USER_A;

    // Service role client mock
    vi.spyOn(serviceAuth, "createServiceRoleClient").mockReturnValue(
      supabaseAdapter as unknown as ReturnType<typeof serviceAuth.createServiceRoleClient>
    );

    // Auth client mock switching on activeUserId
    vi.spyOn(serverAuth, "createClient").mockImplementation(async () => {
      return {
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: activeUserId,
                email: activeUserId === USER_A ? "maz@learnitt.com" : "other@learnitt.com",
                app_metadata: {},
                user_metadata: {},
                aud: "authenticated",
                created_at: new Date().toISOString(),
              },
            },
            error: null,
          }),
        },
        from: (table: string) => (supabaseAdapter as any).from(table),
        rpc: (fn: string, args: Record<string, unknown>) => (supabaseAdapter as any).rpc(fn, args),
        storage: supabaseAdapter.storage,
      } as unknown as ReturnType<typeof serverAuth.createClient>;
    });
  });

  it("1. uploads a real PDF, processes it into chunks, and searches for the right passage", async () => {
    // 1. Upload genuine PDF
    const req = new NextRequest("http://localhost:3000/api/v1/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "pdf",
        title: "Machine Learning Foundations.pdf",
        filename: "Machine Learning Foundations.pdf",
        contentBase64: MINIMAL_TEST_PDF.toString("base64"),
      }),
    });

    const createRes = await createMaterialRoute(req);
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.material.id).toBeDefined();
    expect(createData.duplicate).toBe(false);
    expect(createData.signed_upload_url).toBeDefined();

    const materialId = createData.material.id;

    // 2. Process material (extract text and chunk)
    const procReq = new NextRequest(`http://localhost:3000/api/v1/materials/${materialId}/process`, {
      method: "POST",
    });
    const procRes = await processMaterialRoute(procReq, {
      params: Promise.resolve({ id: materialId }),
    });
    expect(procRes.status).toBe(200);
    const procData = await procRes.json();
    expect(procData.status).toBe("ready");
    expect(procData.chunk_count).toBeGreaterThan(0);

    // 3. Search via full-text retrieval function
    const searchResults = await searchMaterialChunks({
      ownerId: USER_A,
      query: "gradient descent",
      dbClient: supabaseAdapter,
    });

    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].material_id).toBe(materialId);
    expect(searchResults[0].material_title).toBe("Machine Learning Foundations.pdf");
    expect(searchResults[0].content).toContain("gradient descent");
    expect(searchResults[0].rank).toBeGreaterThan(0);
  });

  it("2. rejects a renamed executable (.exe renamed to .pdf)", async () => {
    // PE MZ magic bytes
    const fakeExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04]);

    const req = new NextRequest("http://localhost:3000/api/v1/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "pdf",
        title: "trojan.pdf",
        filename: "trojan.pdf",
        contentBase64: fakeExe.toString("base64"),
      }),
    });

    const res = await createMaterialRoute(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Executable files");
  });

  it("3. skips exact duplicates by content hash and returns existing material", async () => {
    const textContent = "# Advanced SQL Indexing\n\nB-Tree vs Hash index performance analysis.";
    const base64 = Buffer.from(textContent).toString("base64");

    // First upload
    const req1 = new NextRequest("http://localhost:3000/api/v1/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "markdown",
        title: "sql_indexes.md",
        filename: "sql_indexes.md",
        contentBase64: base64,
      }),
    });
    const res1 = await createMaterialRoute(req1);
    expect(res1.status).toBe(201);
    const data1 = await res1.json();
    expect(data1.duplicate).toBe(false);

    // Duplicate upload
    const req2 = new NextRequest("http://localhost:3000/api/v1/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "markdown",
        title: "sql_indexes_renamed.md",
        filename: "sql_indexes_renamed.md",
        contentBase64: base64,
      }),
    });
    const res2 = await createMaterialRoute(req2);
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.duplicate).toBe(true);
    expect(data2.material.id).toBe(data1.material.id);
  });

  it("4. extraction failure path sets status needs_attention with a readable reason and the file stays", async () => {
    // Insert a material with invalid/unextractable storage reference
    const { data: inserted } = await (supabaseAdapter.from("materials") as any)
      .insert({
        owner_id: USER_A,
        kind: "pdf",
        title: "corrupted.pdf",
        storage_path: "materials/non_existent_file.pdf",
        byte_size: 1024,
        status: "pending",
      })
      .select()
      .single();

    expect(inserted).toBeDefined();

    // Trigger process
    const procReq = new NextRequest(`http://localhost:3000/api/v1/materials/${inserted.id}/process`, {
      method: "POST",
    });
    const procRes = await processMaterialRoute(procReq, {
      params: Promise.resolve({ id: inserted.id }),
    });

    expect(procRes.status).toBe(200);
    const procData = await procRes.json();
    expect(procData.status).toBe("needs_attention");
    expect(procData.reason).toBeDefined();
    expect(procData.reason.length).toBeGreaterThan(5);

    // Verify the record still exists in the database with needs_attention and readable status_reason
    const { data: verified } = await supabaseAdapter
      .from("materials")
      .select("*")
      .eq("id", inserted.id)
      .single();

    expect(verified!.status).toBe("needs_attention");
    expect(verified!.status_reason).toMatch(/not found/i);
  });

  it("5. full-text retrieval is strictly scoped to the owner and never returns another user's chunk", async () => {
    // 1. User A uploads quantum material
    const textA = "Quantum physics: wave function collapse and entanglement phenomena.";
    const base64A = Buffer.from(textA).toString("base64");

    const reqA = new NextRequest("http://localhost:3000/api/v1/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "text",
        title: "Quantum Notes",
        filename: "quantum.txt",
        contentBase64: base64A,
      }),
    });
    const resA = await createMaterialRoute(reqA);
    const dataA = await resA.json();
    await processMaterialRoute(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: dataA.material.id }),
    });

    // 2. User B uploads cryptography material
    activeUserId = USER_B;
    const textB = "Public key cryptography: RSA algorithm primes and discrete logarithm.";
    const base64B = Buffer.from(textB).toString("base64");

    const reqB = new NextRequest("http://localhost:3000/api/v1/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "text",
        title: "Crypto Notes",
        filename: "crypto.txt",
        contentBase64: base64B,
      }),
    });
    const resB = await createMaterialRoute(reqB);
    const dataB = await resB.json();
    await processMaterialRoute(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: dataB.material.id }),
    });

    // 3. User B searches for 'quantum'
    const searchResB = await searchMaterialChunks({
      ownerId: USER_B,
      query: "quantum",
      dbClient: supabaseAdapter,
    });
    // User B must get 0 results for User A's chunks!
    expect(searchResB).toHaveLength(0);

    // 4. User A searches for 'quantum'
    const searchResA = await searchMaterialChunks({
      ownerId: USER_A,
      query: "quantum",
      dbClient: supabaseAdapter,
    });
    expect(searchResA.length).toBeGreaterThan(0);
    expect(searchResA[0].content).toContain("wave function");
  });

  it("6. blocks SSRF attacks targeting private IP ranges, loopback, and cloud metadata", async () => {
    activeUserId = USER_A;

    // Loopback
    const req1 = new NextRequest("http://localhost:3000/api/v1/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "url",
        sourceUrl: "http://127.0.0.1:8080/admin",
      }),
    });
    const res1 = await createMaterialRoute(req1);
    expect(res1.status).toBe(400);
    expect((await res1.json()).error).toContain("Blocked SSRF target");

    // Cloud metadata
    const req2 = new NextRequest("http://localhost:3000/api/v1/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "url",
        sourceUrl: "http://169.254.169.254/computeMetadata/v1/",
      }),
    });
    const res2 = await createMaterialRoute(req2);
    expect(res2.status).toBe(400);

    // Private network
    const req3 = new NextRequest("http://localhost:3000/api/v1/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "url",
        sourceUrl: "http://10.1.2.3/confidential",
      }),
    });
    const res3 = await createMaterialRoute(req3);
    expect(res3.status).toBe(400);
  });

  it("7. lists skills that have no materials yet", async () => {
    activeUserId = USER_A;

    // Create a goal
    const { data: goal } = await (supabaseAdapter.from("goals") as any)
      .insert({
        owner_id: USER_A,
        title: "Fullstack Architecture",
        domain: "Software",
        starting_level: "intermediate",
        target_date: "2026-12-01",
        weekly_hours: 8,
      })
      .select()
      .single();

    expect(goal).toBeDefined();

    // Create two skills
    const { data: skills } = await (supabaseAdapter.from("skills") as any)
      .insert([
        {
          owner_id: USER_A,
          goal_id: goal.id,
          name: "Database Indexing",
          description: "Backend",
          estimated_min_minutes: 30,
          estimated_max_minutes: 60,
          difficulty: 3,
          priority: 2,
          verification_type: "applied",
          mvd_minutes: 15,
        },
        {
          owner_id: USER_A,
          goal_id: goal.id,
          name: "CSS Grid Layouts",
          description: "Frontend",
          estimated_min_minutes: 30,
          estimated_max_minutes: 60,
          difficulty: 2,
          priority: 2,
          verification_type: "applied",
          mvd_minutes: 15,
        },
      ])
      .select();

    const skill1 = skills[0];

    // Create a material
    const { data: material } = await (supabaseAdapter.from("materials") as any)
      .insert({
        owner_id: USER_A,
        kind: "text",
        title: "PostgreSQL Manual",
        status: "ready",
      })
      .select()
      .single();

    // Link skill1 to material
    await (supabaseAdapter.from("skill_material_links") as any).insert({
      owner_id: USER_A,
      skill_id: skill1.id,
      material_id: material.id,
      confidence: 0.9,
      confirmed: true,
    });

    // Query uncovered skills route
    const req = new NextRequest(`http://localhost:3000/api/v1/materials/uncovered-skills?goal_id=${goal.id}`);
    const res = await uncoveredSkillsRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.totalSkills).toBe(2);
    expect(data.coveredSkills).toBe(1);
    expect(data.uncoveredSkills).toHaveLength(1);
    expect(data.uncoveredSkills[0].title).toBe("CSS Grid Layouts");
  });

  it("8. enforces consent gate: consent off blocks material-based AI tasks and preview shows materials and chunk counts", async () => {
    activeUserId = USER_A;

    // Create goal and skill
    const { data: goal } = await (supabaseAdapter.from("goals") as any)
      .insert({
        owner_id: USER_A,
        title: "Distributed Systems",
        domain: "Systems",
        starting_level: "advanced",
        target_date: "2026-12-30",
        weekly_hours: 8,
      })
      .select()
      .single();

    expect(goal).toBeDefined();

    await (supabaseAdapter.from("skills") as any)
      .insert({
        owner_id: USER_A,
        goal_id: goal.id,
        name: "Raft Consensus",
        description: "Systems",
        estimated_min_minutes: 30,
        estimated_max_minutes: 60,
        difficulty: 4,
        priority: 1,
        verification_type: "applied",
        mvd_minutes: 15,
      })
      .select()
      .single();

    // Create ready material with chunks
    const { data: material } = await (supabaseAdapter.from("materials") as any)
      .insert({
        owner_id: USER_A,
        kind: "text",
        title: "Raft Paper.txt",
        status: "ready",
      })
      .select()
      .single();

    await (supabaseAdapter.from("material_chunks") as any).insert({
      owner_id: USER_A,
      material_id: material.id,
      ordinal: 0,
      content: "Leader election and log replication in distributed state machines.",
      tokens: 300,
    });

    // Initial consent is false
    const consentGetReq = new NextRequest("http://localhost:3000/api/v1/user/consent");
    const consentGetRes = await getConsentRoute(consentGetReq);
    expect(consentGetRes.status).toBe(200);
    const consentGetData = await consentGetRes.json();
    expect(consentGetData.status.consent).toBe(false);
    expect(consentGetData.preview.materials.length).toBeGreaterThan(0);
    expect(consentGetData.preview.totalChunks).toBeGreaterThan(0);

    // Attempting to enqueue link_materials without consent is refused with 403
    const linkReq = new NextRequest(`http://localhost:3000/api/v1/goals/${goal.id}/link-materials`, {
      method: "POST",
    });
    const linkRes = await enqueueLinkingRoute(linkReq, {
      params: Promise.resolve({ id: goal.id }),
    });

    expect(linkRes.status).toBe(403);
    const linkData = await linkRes.json();
    expect(linkData.consent_required).toBe(true);
    expect(linkData.error).toContain("consent");

    // Grant consent
    const updateConsentReq = new NextRequest("http://localhost:3000/api/v1/user/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: true }),
    });
    const updateConsentRes = await updateConsentRoute(updateConsentReq);
    expect(updateConsentRes.status).toBe(200);

    // Now link_materials succeeds in queuing
    const linkRes2 = await enqueueLinkingRoute(linkReq, {
      params: Promise.resolve({ id: goal.id }),
    });
    expect(linkRes2.status).toBe(200);
    const linkData2 = await linkRes2.json();
    expect(linkData2.status).toBe("queued");
  });

  it("9. preserves confirmed links across re-runs (confirmed links are never overwritten)", async () => {
    activeUserId = USER_A;

    // Create real goal, skill, and material to satisfy foreign key constraints
    const { data: goal } = await (supabaseAdapter.from("goals") as any)
      .insert({
        owner_id: USER_A,
        title: "Goal for Linking",
        starting_level: "beginner",
        target_date: "2026-12-01",
        weekly_hours: 8,
      })
      .select()
      .single();

    const { data: skill } = await (supabaseAdapter.from("skills") as any)
      .insert({
        owner_id: USER_A,
        goal_id: goal.id,
        name: "Skill Alpha",
        estimated_min_minutes: 30,
        estimated_max_minutes: 60,
        difficulty: 2,
        priority: 2,
        verification_type: "recall",
        mvd_minutes: 15,
      })
      .select()
      .single();

    const { data: mat } = await (supabaseAdapter.from("materials") as any)
      .insert({
        owner_id: USER_A,
        kind: "text",
        title: "Material Alpha",
        status: "ready",
      })
      .select()
      .single();

    const skillId = skill.id;
    const materialId = mat.id;

    // 1. Initial run: AI proposes link with 0.85 confidence
    const run1 = await applyProposedLinks(
      USER_A,
      [{ skill_id: skillId, material_id: materialId, confidence: 0.85 }],
      supabaseAdapter
    );
    expect(run1.added).toBe(1);

    // Verify inserted as unconfirmed
    const { data: initialLink } = await supabaseAdapter
      .from("skill_material_links")
      .select("*")
      .eq("owner_id", USER_A)
      .eq("skill_id", skillId)
      .eq("material_id", materialId)
      .single();
    expect(Number(initialLink!.confidence)).toBe(0.85);
    expect(initialLink!.confirmed).toBe(false);

    // 2. User confirms the link
    const confirmReq = new NextRequest("http://localhost:3000/api/v1/materials/links", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "confirm",
        skillId,
        materialId,
      }),
    });
    const confirmRes = await updateLinkRoute(confirmReq);
    expect(confirmRes.status).toBe(200);

    // Verify confirmed is true
    const { data: confirmedLink } = await supabaseAdapter
      .from("skill_material_links")
      .select("*")
      .eq("owner_id", USER_A)
      .eq("skill_id", skillId)
      .eq("material_id", materialId)
      .single();
    expect(confirmedLink!.confirmed).toBe(true);

    // 3. AI re-runs link_materials proposing a LOWER confidence (0.40) or different reason
    const run2 = await applyProposedLinks(
      USER_A,
      [{ skill_id: skillId, material_id: materialId, confidence: 0.40 }],
      supabaseAdapter
    );

    expect(run2.preserved).toBe(1); // Link was preserved untouched!

    // Verify the database row still has confirmed = true and was not overwritten
    const { data: finalLink } = await supabaseAdapter
      .from("skill_material_links")
      .select("*")
      .eq("owner_id", USER_A)
      .eq("skill_id", skillId)
      .eq("material_id", materialId)
      .single();

    expect(finalLink!.confirmed).toBe(true);
    expect(Number(finalLink!.confidence)).toBe(0.85); // Preserved original value
  });
});
