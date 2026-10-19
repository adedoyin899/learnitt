import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import { MockAIProvider } from "@/lib/ai/adapters/mock-adapter";
import {
  createConversation,
  getConversation,
  listConversations,
  postMessageAndGenerateAnswer,
  explainMessageStyle,
} from "@/lib/tutor/service";
import {
  createOrEditJournalEntry,
  listJournalTimeline,
  generateWeeklySummary,
} from "@/lib/journal/service";
import { saveCard, listSavedCards } from "@/lib/saved-cards/service";
import { queueOfflineAction } from "@/lib/offline/outbox";
import { db } from "@/lib/offline/db";

describe("Phase L8: Tutor Q&A and Journal (Epics F & G1)", () => {
  // Test in-memory database mock
  function createTestDb() {
    const profiles: any[] = [
      { id: "user_test_1", ai_materials_consent: true, ai_consent_asked_at: new Date().toISOString() },
    ];
    const goals: any[] = [];
    const skills: any[] = [];
    const skillMaterialLinks: any[] = [];
    const materialChunks: any[] = [];
    const materials: any[] = [];
    const conversations: any[] = [];
    const messages: any[] = [];
    const journalEntries: any[] = [];
    const savedCards: any[] = [];
    const checkIns: any[] = [];
    const grades: any[] = [];
    const usageCounters: any[] = [];
    const aiCache: any[] = [];

    const dbClient: any = {
      from: (table: string) => {
        const state: any = {
          _filters: [] as Array<(item: any) => boolean>,
          _orders: [] as Array<{ col: string; asc: boolean }>,
          _limit: null as number | null,
        };

        const builder: any = {
          select: (_cols?: string) => builder,
          insert: (val: any) => {
            const items = Array.isArray(val) ? val : [val];
            const inserted = items.map((it: any) => {
              const row = { id: it.id || crypto.randomUUID(), created_at: it.created_at || new Date().toISOString(), ...it };
              if (table === "conversations") conversations.push(row);
              if (table === "messages") messages.push(row);
              if (table === "journal_entries") journalEntries.push(row);
              if (table === "saved_cards") savedCards.push(row);
              if (table === "check_ins") checkIns.push(row);
              if (table === "grades") grades.push(row);
              if (table === "usage_counters") usageCounters.push(row);
              if (table === "ai_cache") aiCache.push(row);
              return row;
            });
            return {
              select: () => ({
                single: async () => ({ data: inserted[0], error: null }),
                maybeSingle: async () => ({ data: inserted[0], error: null }),
                then: (res: any) => res({ data: inserted, error: null }),
              }),
              then: (res: any) => res({ data: inserted, error: null }),
            };
          },
          upsert: (val: any) => {
            const items = Array.isArray(val) ? val : [val];
            items.forEach((it: any) => {
              const row = { id: it.id || crypto.randomUUID(), created_at: it.created_at || new Date().toISOString(), ...it };
              if (table === "ai_cache") {
                const idx = aiCache.findIndex((c) => c.cache_key === it.cache_key);
                if (idx >= 0) aiCache[idx] = row;
                else aiCache.push(row);
              }
              if (table === "usage_counters") {
                const idx = usageCounters.findIndex((c) => c.owner_id === it.owner_id && c.period_key === it.period_key);
                if (idx >= 0) usageCounters[idx] = row;
                else usageCounters.push(row);
              }
            });
            return Promise.resolve({ error: null });
          },
          update: (val: any) => {
            const updateFilters: Array<(item: any) => boolean> = [];
            const updateBuilder: any = {
              eq: (col: string, targetVal: any) => {
                updateFilters.push((item) => item[col] === targetVal);
                return updateBuilder;
              },
              then: (res: any) => {
                let matched: any[] = [];
                if (table === "journal_entries") matched = journalEntries;
                if (table === "messages") matched = messages;
                if (table === "usage_counters") matched = usageCounters;
                matched
                  .filter((item) => updateFilters.every((f) => f(item)))
                  .forEach((item) => Object.assign(item, val));
                return res({ error: null });
              },
            };
            return updateBuilder;
          },
          eq: (col: string, val: any) => {
            state._filters.push((it: any) => it[col] === val);
            return builder;
          },
          in: (col: string, vals: any[]) => {
            const set = new Set(vals);
            state._filters.push((it: any) => set.has(it[col]));
            return builder;
          },
          gte: (col: string, val: any) => {
            state._filters.push((it: any) => it[col] >= val);
            return builder;
          },
          order: (col: string, opts?: { ascending?: boolean }) => {
            state._orders.push({ col, asc: opts?.ascending ?? true });
            return builder;
          },
          limit: (n: number) => {
            state._limit = n;
            return builder;
          },
          maybeSingle: async () => {
            let list: any[] = [];
            if (table === "profiles") list = profiles;
            if (table === "goals") list = goals;
            if (table === "skills") list = skills;
            if (table === "conversations") list = conversations;
            if (table === "messages") list = messages;
            if (table === "journal_entries") list = journalEntries;
            if (table === "usage_counters") list = usageCounters;
            if (table === "ai_cache") list = aiCache;

            const filtered = list.filter((it) => state._filters.every((f: any) => f(it)));
            return { data: filtered[0] || null, error: null };
          },
          single: async () => {
            let list: any[] = [];
            if (table === "profiles") list = profiles;
            if (table === "goals") list = goals;
            if (table === "skills") list = skills;
            if (table === "conversations") list = conversations;
            if (table === "messages") list = messages;
            if (table === "journal_entries") list = journalEntries;
            if (table === "saved_cards") list = savedCards;
            if (table === "usage_counters") list = usageCounters;
            if (table === "ai_cache") list = aiCache;

            const filtered = list.filter((it) => state._filters.every((f: any) => f(it)));
            return {
              data: filtered[0] || null,
              error: filtered[0] ? null : new Error("Not found"),
            };
          },
          then: (res: any) => {
            let list: any[] = [];
            if (table === "profiles") list = profiles;
            if (table === "goals") list = goals;
            if (table === "skills") list = skills;
            if (table === "skill_material_links") list = skillMaterialLinks;
            if (table === "materials") list = materials;
            if (table === "material_chunks") {
              list = materialChunks.map((c) => ({
                ...c,
                materials: materials.find((m) => m.id === c.material_id) || { title: "Course PDF" },
              }));
            }
            if (table === "conversations") {
              list = conversations.map((c) => ({
                ...c,
                skills: skills.find((s) => s.id === c.skill_id) || null,
                goals: goals.find((g) => g.id === c.goal_id) || null,
              }));
            }
            if (table === "messages") list = messages;
            if (table === "journal_entries") {
              list = journalEntries.map((j) => ({
                ...j,
                skills: skills.find((s) => s.id === j.linked_skill_id) || null,
              }));
            }
            if (table === "saved_cards") {
              list = savedCards.map((sc) => ({
                ...sc,
                skills: skills.find((s) => s.id === sc.skill_id) || null,
              }));
            }
            if (table === "check_ins") list = checkIns;
            if (table === "grades") list = grades;
            if (table === "usage_counters") list = usageCounters;
            if (table === "ai_cache") list = aiCache;

            let filtered = list.filter((it) => state._filters.every((f: any) => f(it)));
            for (const ord of state._orders) {
              filtered.sort((a, b) => {
                const valA = a[ord.col];
                const valB = b[ord.col];
                if (valA < valB) return ord.asc ? -1 : 1;
                if (valA > valB) return ord.asc ? 1 : -1;
                return 0;
              });
            }
            if (state._limit) {
              filtered = filtered.slice(0, state._limit);
            }
            return res({ data: filtered, error: null });
          },
        };

        return builder;
      },
      _data: {
        profiles,
        goals,
        skills,
        skillMaterialLinks,
        materialChunks,
        materials,
        conversations,
        messages,
        journalEntries,
        savedCards,
        checkIns,
        grades,
        usageCounters,
      },
    };

    return dbClient;
  }

  describe("1. Citations stripping and General Knowledge fallback", () => {
    it("strips citations not in the retrieved set and retains only verified chunk citations", async () => {
      const db = createTestDb();
      const ownerId = "user_test_1";
      const provider = new MockAIProvider();

      // Setup: Skill with confirmed material and chunk
      const goal = { id: "g_1", owner_id: ownerId, title: "SQL Mastery", health_flag: false };
      const skill = { id: "sk_1", owner_id: ownerId, goal_id: "g_1", name: "SQL Filtering" };
      db._data.goals.push(goal);
      db._data.skills.push(skill);
      db._data.materials.push({ id: "mat_1", owner_id: ownerId, title: "Database Internals Book" });
      db._data.skillMaterialLinks.push({ skill_id: "sk_1", material_id: "mat_1", owner_id: ownerId, confirmed: true });
      db._data.materialChunks.push({
        id: "chunk_valid_101",
        material_id: "mat_1",
        owner_id: ownerId,
        content: "The WHERE clause filters before grouping in relational databases.",
        ordinal: 0,
      });

      // Create conversation
      const conv = await createConversation(db, { ownerId, skillId: "sk_1", goalId: "g_1" });

      // Mock AI returning both valid chunk and hallucinated/unretrieved chunk
      provider.generateStructured = (async () => ({
        data: {
          answer: "WHERE filters rows before grouping happens.",
          cited_chunk_ids: ["chunk_valid_101", "chunk_hallucinated_999"],
          general_knowledge: false,
        },
        usage: { inputTokens: 50, outputTokens: 50 },
        modelVersion: "mock-ai-v1",
      })) as any;

      const result = await postMessageAndGenerateAnswer(db, {
        conversationId: conv.id,
        ownerId,
        content: "How does filtering work in SQL?",
        customProvider: provider,
      });

      // Verification: chunk_hallucinated_999 is stripped, chunk_valid_101 is preserved
      expect(result.assistantMessage.cited_chunk_ids).toEqual(["chunk_valid_101"]);
      expect(result.citedChunks.length).toBe(1);
      expect(result.citedChunks[0].id).toBe("chunk_valid_101");
      expect(result.assistantMessage.general_knowledge).toBe(false);
    });

    it("labels unsupported answers as general knowledge when nothing supports it", async () => {
      const db = createTestDb();
      const ownerId = "user_test_1";
      const provider = new MockAIProvider();

      const goal = { id: "g_1", owner_id: ownerId, title: "SQL Mastery", health_flag: false };
      const skill = { id: "sk_1", owner_id: ownerId, goal_id: "g_1", name: "SQL Filtering" };
      db._data.goals.push(goal);
      db._data.skills.push(skill);

      const conv = await createConversation(db, { ownerId, skillId: "sk_1" });

      // No materials confirmed for this skill => retrieved set is empty
      const result = await postMessageAndGenerateAnswer(db, {
        conversationId: conv.id,
        ownerId,
        content: "What is quantum entanglement?",
        customProvider: provider,
      });

      // Verification: general_knowledge is set to true and citations are empty
      expect(result.assistantMessage.general_knowledge).toBe(true);
      expect(result.assistantMessage.cited_chunk_ids).toEqual([]);
      expect(result.assistantMessage.content).toContain("General knowledge");
    });
  });

  describe("2. Explain styles produce distinct requests", () => {
    it("produces distinct requests and explanations for 'simpler', 'more_technical', and 'with_example'", async () => {
      const db = createTestDb();
      const ownerId = "user_test_1";
      const provider = new MockAIProvider();

      const conv = await createConversation(db, { ownerId });
      const { data: msg } = await db
        .from("messages")
        .insert({
          conversation_id: conv.id,
          owner_id: ownerId,
          role: "assistant",
          content: "In SQL, the WHERE clause filters rows before grouping, and HAVING filters after grouping.",
        })
        .select()
        .single();

      // Style 1: simpler
      const simpler = await explainMessageStyle(db, {
        messageId: msg.id,
        ownerId,
        style: "simpler",
        customProvider: provider,
      });

      // Style 2: more_technical
      const technical = await explainMessageStyle(db, {
        messageId: msg.id,
        ownerId,
        style: "more_technical",
        customProvider: provider,
      });

      // Style 3: with_example
      const example = await explainMessageStyle(db, {
        messageId: msg.id,
        ownerId,
        style: "with_example",
        customProvider: provider,
      });

      // Verify that all 3 calls produced distinct requests and distinct outputs
      expect(simpler.explanation).not.toEqual(technical.explanation);
      expect(technical.explanation).not.toEqual(example.explanation);
      expect(simpler.explanation).toContain("bouncer");
      expect(technical.explanation).toContain("relational algebra");
      expect(example.explanation).toContain("SELECT");

      // Verify provider calls were recorded and distinct
      expect(provider.recordedCalls.length).toBe(3);
      expect(provider.recordedCalls[0].user).toContain("Requested Style: simpler");
      expect(provider.recordedCalls[1].user).toContain("Requested Style: more_technical");
      expect(provider.recordedCalls[2].user).toContain("Requested Style: with_example");
    });
  });

  describe("3. Journal text NEVER appears in AI requests unless explicitly ticked", () => {
    it("strictly excludes journal entries from AI weekly summary by default", async () => {
      const db = createTestDb();
      const ownerId = "user_test_1";
      const provider = new MockAIProvider();

      // Seed journal entries
      await createOrEditJournalEntry(db, {
        ownerId,
        body: "Confidential thought: I struggle with recursive CTE syntax and feel overwhelmed.",
        mood: 2,
      });

      // Call weekly summary with includeJournal = false (default)
      await generateWeeklySummary(db, {
        ownerId,
        includeJournal: false,
        customProvider: provider,
      });

      expect(provider.recordedCalls.length).toBe(1);
      const callPrompt = provider.recordedCalls[0].user;

      // Invariant: journal text MUST NOT appear in the prompt
      expect(callPrompt).not.toContain("Confidential thought");
      expect(callPrompt).not.toContain("recursive CTE syntax");
      expect(callPrompt).not.toContain("overwhelmed");
      expect(provider.recordedCalls[0].system).toContain("Note: Journal entries are not included");
    });

    it("includes journal text ONLY when explicit includeJournal option is true", async () => {
      const db = createTestDb();
      const ownerId = "user_test_1";
      const provider = new MockAIProvider();

      // Seed journal entries
      await createOrEditJournalEntry(db, {
        ownerId,
        body: "Focused on practicing indexing strategies and indexing b-trees today.",
        mood: 4,
      });

      // Call weekly summary with includeJournal = true
      await generateWeeklySummary(db, {
        ownerId,
        includeJournal: true,
        customProvider: provider,
      });

      expect(provider.recordedCalls.length).toBe(1);
      const callPrompt = provider.recordedCalls[0].user;

      // Invariant: journal text is now included
      expect(callPrompt).toContain("Focused on practicing indexing strategies");
      expect(provider.recordedCalls[0].system).toContain("The learner has explicitly opted to include their journal reflections");
    });
  });

  describe("4. Journal edit creates a new version", () => {
    it("creates a new row with incremented version and preserves original row for history", async () => {
      const db = createTestDb();
      const ownerId = "user_test_1";

      // 1. Initial draft (Version 1)
      const v1 = await createOrEditJournalEntry(db, {
        ownerId,
        body: "First draft of reflections on database query execution.",
        mood: 3,
      });

      expect(v1.version).toBe(1);
      expect(v1.entry_id).toBeDefined();

      // 2. Edit (Version 2)
      const v2 = await createOrEditJournalEntry(db, {
        ownerId,
        entryId: v1.entry_id,
        body: "Second revised version: understood hash join vs merge join clearly.",
        mood: 5,
      });

      expect(v2.version).toBe(2);
      expect(v2.entry_id).toBe(v1.entry_id);
      expect(v2.id).not.toBe(v1.id);

      // 3. Inspect timeline: latest version is head, previous version is in history
      const timeline = await listJournalTimeline(db, ownerId);
      expect(timeline.length).toBe(1);
      expect(timeline[0].version).toBe(2);
      expect(timeline[0].body).toContain("Second revised version");
      expect(timeline[0].total_versions).toBe(2);
      expect(timeline[0].history.length).toBe(1);
      expect(timeline[0].history[0].version).toBe(1);
      expect(timeline[0].history[0].body).toContain("First draft");
    });
  });

  describe("5. Offline journal write and saved cards", () => {
    it("queues journal entry into local Dexie outbox when offline", async () => {
      const clientId = `jnl-test-${Date.now()}`;
      const payload = {
        body: "Offline reflections written while in airplane mode.",
        mood: 4,
      };

      const outboxItem = await queueOfflineAction({
        client_id: clientId,
        operation: "journal",
        payload,
      });

      expect(outboxItem.client_id).toBe(clientId);
      expect(outboxItem.operation).toBe("journal");
      expect(outboxItem.status).toBe("pending");

      // Verify entry exists in Dexie local journal store
      const localEntry = await db.journal_entries.get(clientId);
      expect(localEntry).toBeDefined();
      expect(localEntry?.content).toContain("Offline reflections written while in airplane mode");
      expect(localEntry?.synced).toBe(false);
    });

    it("saves a question and answer pair to saved_cards", async () => {
      const db = createTestDb();
      const ownerId = "user_test_1";

      const card = await saveCard(db, {
        ownerId,
        skillId: "sk_flash_1",
        question: "What is write-ahead logging (WAL)?",
        answer: "WAL ensures database changes are written to persistent log storage before data pages are flushed.",
      });

      expect(card.id).toBeDefined();
      expect(card.question).toContain("What is write-ahead logging");
      expect(card.skill_id).toBe("sk_flash_1");

      const cards = await listSavedCards(db, { ownerId, skillId: "sk_flash_1" });
      expect(cards.length).toBe(1);
      expect(cards[0].answer).toContain("persistent log storage");
    });
  });
});
